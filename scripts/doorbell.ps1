<#
.SYNOPSIS
  The doorbell: start a 1-step queue run from the phone.

.DESCRIPTION
  Run by Task Scheduler every 15 minutes as the engineer Windows user. It calls
  no Claude itself - it only reads GitHub and, at most once per invocation,
  starts scripts/run-queue.ps1 -MaxSteps 1 -Trigger doorbell.

  In order, stopping at the first that fires:
    1. An open autopilot-pause issue by -Owner -> exit.
    2. .run-queue-logs/run.lock names a live PID (a run is active) -> exit.
    3. run-now label on an open issue or PR. Counts only if the newest
       'labeled' event for it was by -Owner. The label is removed either way.
    4. An open architect-docs issue by -Owner not yet in
       .run-queue-logs/doorbell-seen.txt. Each one rings at most once: a failed
       run is retried by the scheduled runs, never by the doorbell.

  Quiet invocations print and log nothing. Anything that did something (fired,
  removed a stranger's label, or failed) adds one line to
  .run-queue-logs/doorbell.log. Every failure is logged and exits 0.

  Setup: docs/autopilot-guide.md.

.EXAMPLE
  .\scripts\doorbell.ps1
#>
param(
  [string]$Owner = 'naokicodes',
  [string]$Repo = 'naokicodes/inventory-audit-app-3rdYr'
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false

Set-Location (Split-Path $PSScriptRoot -Parent)
$logDir = Join-Path (Get-Location).Path '.run-queue-logs'
$logFile = Join-Path $logDir 'doorbell.log'
$seenFile = Join-Path $logDir 'doorbell-seen.txt'
$lockPath = Join-Path $logDir 'run.lock'

function Log($text) {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  Add-Content -Path $logFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $text" -Encoding UTF8
}

# Runs gh and returns its exit code and stdout lines. stderr is dropped: in
# Windows PowerShell 5.1 a redirected native stderr line becomes an error record.
function Invoke-Gh([string[]]$GhArgs) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & $script:gh @GhArgs 2>$null
    return @{ Code = $LASTEXITCODE; Lines = @(@($out) | Where-Object { "$_".Trim() } | ForEach-Object { "$_".Trim() }) }
  } catch {
    return @{ Code = -1; Lines = @() }
  } finally {
    $ErrorActionPreference = $prev
  }
}

# A gh call that must succeed; on failure it logs and ends the invocation.
function Get-GhLines([string]$What, [string[]]$GhArgs) {
  $r = Invoke-Gh $GhArgs
  if ($r.Code -ne 0) {
    Log "$What failed (gh exit $($r.Code)) - nothing done."
    exit 0
  }
  return $r.Lines
}

function Start-Run([string]$Why) {
  Log "Fired: $Why - starting a 1-step run."
  try {
    & .\scripts\run-queue.ps1 -MaxSteps 1 -Trigger doorbell -Owner $Owner
    Log "Run finished (exit $LASTEXITCODE)."
  } catch {
    Log "Run failed: $($_.Exception.Message)"
  }
  exit 0
}

try {
  $ghCmd = Get-Command gh -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $ghCmd) { Log 'gh not found on PATH - nothing done.'; exit 0 }
  $script:gh = $ghCmd.Source

  # ---- 1. Pause. ----
  $paused = @(Get-GhLines 'Pause check' @('issue', 'list', '--repo', $Repo, '--state', 'open', '--label', 'autopilot-pause', '--author', $Owner, '--json', 'number', '--jq', '.[].number'))
  if ($paused.Count -gt 0) { exit 0 }

  # ---- 2. Busy: run.lock's first line is the holder's PID. ----
  if (Test-Path $lockPath) {
    $lockPid = 0
    $first = Get-Content $lockPath -TotalCount 1 -ErrorAction SilentlyContinue
    if ([int]::TryParse("$first".Trim(), [ref]$lockPid) -and (Get-Process -Id $lockPid -ErrorAction SilentlyContinue)) { exit 0 }
  }

  # ---- 3. run-now on an open issue or PR. ----
  $runNowIssues = @(Get-GhLines 'run-now issue list' @('issue', 'list', '--repo', $Repo, '--state', 'open', '--label', 'run-now', '--json', 'number', '--jq', '.[].number'))
  $runNowPrs = @(Get-GhLines 'run-now PR list' @('pr', 'list', '--repo', $Repo, '--state', 'open', '--label', 'run-now', '--json', 'number', '--jq', '.[].number'))
  $targets = @($runNowIssues | ForEach-Object { @{ N = $_; Kind = 'issue' } }) + @($runNowPrs | ForEach-Object { @{ N = $_; Kind = 'pr' } })

  $counted = $null
  foreach ($t in $targets) {
    # Every labeled event for run-now, oldest first; the newest decides.
    $actors = @(Get-GhLines "Events for #$($t.N)" @('api', '--paginate', "repos/$Repo/issues/$($t.N)/events", '--jq', '.[] | select(.event == "labeled" and .label.name == "run-now") | .actor.login'))
    $actor = if ($actors.Count -gt 0) { $actors[-1] } else { '' }

    $removed = Invoke-Gh @($t.Kind, 'edit', $t.N, '--repo', $Repo, '--remove-label', 'run-now')
    if ($removed.Code -ne 0) { Log "Could not remove run-now from #$($t.N) (gh exit $($removed.Code))." }

    if ($actor -eq $Owner) {
      if (-not $counted) { $counted = $t }
    } else {
      Log "Removed run-now from #$($t.N): labelled by '$actor', not $Owner."
    }
  }
  if ($counted) {
    $c = Invoke-Gh @($counted.Kind, 'comment', $counted.N, '--repo', $Repo, '--body', 'Doorbell: starting a 1-step run.')
    if ($c.Code -ne 0) { Log "Could not comment on #$($counted.N) (gh exit $($c.Code)) - running anyway." }
    Start-Run "run-now on #$($counted.N)"
  }

  # ---- 4. New architect-docs issues. ----
  $docs = @(Get-GhLines 'architect-docs list' @('issue', 'list', '--repo', $Repo, '--state', 'open', '--label', 'architect-docs', '--author', $Owner, '--json', 'number', '--jq', '.[].number'))
  $seen = @()
  if (Test-Path $seenFile) { $seen = @(Get-Content $seenFile | ForEach-Object { "$_".Trim() }) }
  $new = @($docs | Where-Object { $seen -notcontains $_ })
  if ($new.Count -gt 0) {
    # Written before the run, so a crash can never ring for the same issue again.
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    [IO.File]::AppendAllText($seenFile, (($new -join "`r`n") + "`r`n"), $utf8)
    Start-Run "architect-docs $(($new | ForEach-Object { "#$_" }) -join ', ')"
  }

  # ---- 5. Nothing to do. ----
  exit 0
} catch {
  Log "Doorbell error: $($_.Exception.Message)"
  exit 0
}
