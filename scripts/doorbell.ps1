<#
.SYNOPSIS
  The doorbell: start a 1-step queue run from the phone.

.DESCRIPTION
  Run by Task Scheduler every 15 minutes as the engineer Windows user. It calls
  no Claude itself - it only reads GitHub and, at most once per invocation,
  starts scripts/run-queue.ps1 -MaxSteps 1 -Trigger doorbell.

  In order, stopping at the first that fires:
    1. An open autopilot-pause issue by -Owner -> exit.
    2. .run-queue-logs/run.lock names a live PID, OR the run-queue mutex is held
       (a run is active) -> exit.
    3. run-now label on an open issue or PR. Counts only if the newest
       'labeled' event for it was by -Owner AND the label removal succeeded: a
       removal that fails never starts a run, so a stuck label cannot ring every
       tick (it waits for a tick where removal works). Every owner-labelled
       target in the tick is commented on; one run starts for all of them.
    4. An open architect-docs issue by -Owner not yet in
       .run-queue-logs/doorbell-seen.txt. Each one rings at most once: a failed
       run is retried by the scheduled runs, never by the doorbell.

  -Init seeds doorbell-seen.txt with the architect-docs issues already open and
  exits without ringing (run once at install, per docs/autopilot-guide.md).

  Quiet invocations print and log nothing. Anything that did something (fired,
  removed a stranger's label, or failed) adds one line to
  .run-queue-logs/doorbell.log. Every failure is logged and exits 0.

  Setup: docs/autopilot-guide.md.

.EXAMPLE
  .\scripts\doorbell.ps1

.EXAMPLE
  .\scripts\doorbell.ps1 -Init   # install only: seed the seen-file, ring nothing
#>
param(
  [string]$Owner = 'naokicodes',
  [string]$Repo = 'naokicodes/inventory-audit-app-3rdYr',
  [switch]$Init
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false

Set-Location (Split-Path $PSScriptRoot -Parent)
$logDir = Join-Path (Get-Location).Path '.run-queue-logs'
$logFile = Join-Path $logDir 'doorbell.log'
$seenFile = Join-Path $logDir 'doorbell-seen.txt'
$lockPath = Join-Path $logDir 'run.lock'

# Notes are collected and written by Finish as ONE log line per invocation.
$script:notes = New-Object System.Collections.Generic.List[string]
function Log($text) { $script:notes.Add($text) }

function Finish {
  if ($script:notes.Count -gt 0) {
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    Add-Content -Path $logFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $($script:notes -join ' | ')" -Encoding UTF8
  }
  exit 0
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
    Finish
  }
  return $r.Lines
}

# True unless run-queue.ps1 currently holds its named mutex. Probing it catches
# an active run even when run.lock is stale or missing. An abandoned mutex (the
# holder died) acquires, so it reads as free. If the probe itself errors we do
# not block the doorbell on it.
function Test-RunQueueFree {
  $m = $null
  try {
    $m = New-Object System.Threading.Mutex($false, 'Global\inventory-audit-run-queue')
    $got = $false
    try { $got = $m.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $got = $true }
    if ($got) { $m.ReleaseMutex(); return $true }
    return $false
  } catch {
    return $true
  } finally {
    if ($m) { $m.Dispose() }
  }
}

function Start-Run([string]$Why) {
  Log "Fired: $Why - starting a 1-step run."
  try {
    & .\scripts\run-queue.ps1 -MaxSteps 1 -Trigger doorbell
    Log "Run finished."
  } catch {
    Log "Run failed: $($_.Exception.Message)"
  }
  Finish
}

try {
  $ghCmd = Get-Command gh -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $ghCmd) { Log 'gh not found on PATH - nothing done.'; Finish }
  $script:gh = $ghCmd.Source

  # ---- Install only: seed the seen-file with open architect-docs issues, ring nothing. ----
  if ($Init) {
    $docs = @(Get-GhLines 'architect-docs list (init)' @('issue', 'list', '--repo', $Repo, '--state', 'open', '--label', 'architect-docs', '--author', $Owner, '--json', 'number', '--jq', '.[].number'))
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $content = if ($docs.Count -gt 0) { (($docs -join "`r`n") + "`r`n") } else { '' }
    [IO.File]::WriteAllText($seenFile, $content, $utf8)
    Write-Host "doorbell -Init: seeded $($docs.Count) open architect-docs issue(s) into $seenFile; no run started."
    exit 0
  }

  # ---- 1. Pause. ----
  $paused = @(Get-GhLines 'Pause check' @('issue', 'list', '--repo', $Repo, '--state', 'open', '--label', 'autopilot-pause', '--author', $Owner, '--json', 'number', '--jq', '.[].number'))
  if ($paused.Count -gt 0) { Finish }

  # ---- 2. Busy: run.lock's first line is the holder's PID, or the mutex is held. ----
  if (Test-Path $lockPath) {
    $lockPid = 0
    $first = Get-Content $lockPath -TotalCount 1 -ErrorAction SilentlyContinue
    if ([int]::TryParse("$first".Trim(), [ref]$lockPid) -and (Get-Process -Id $lockPid -ErrorAction SilentlyContinue)) { Finish }
  }
  if (-not (Test-RunQueueFree)) { Finish }

  # ---- 3. run-now on an open issue or PR. ----
  $runNowIssues = @(Get-GhLines 'run-now issue list' @('issue', 'list', '--repo', $Repo, '--state', 'open', '--label', 'run-now', '--json', 'number', '--jq', '.[].number'))
  $runNowPrs = @(Get-GhLines 'run-now PR list' @('pr', 'list', '--repo', $Repo, '--state', 'open', '--label', 'run-now', '--json', 'number', '--jq', '.[].number'))
  $targets = @($runNowIssues | ForEach-Object { @{ N = $_; Kind = 'issue' } }) + @($runNowPrs | ForEach-Object { @{ N = $_; Kind = 'pr' } })

  $counted = New-Object System.Collections.Generic.List[object]
  # Read every target's labeller before removing any label, so an events
  # failure part-way leaves all labels in place for the next tick.
  foreach ($t in $targets) {
    # Every labeled event for run-now, oldest first; the newest decides.
    $actors = @(Get-GhLines "Events for #$($t.N)" @('api', '--paginate', "repos/$Repo/issues/$($t.N)/events", '--jq', '.[] | select(.event == "labeled" and .label.name == "run-now") | .actor.login'))
    $t.Actor = if ($actors.Count -gt 0) { $actors[-1] } else { '' }
  }
  foreach ($t in $targets) {
    $actor = $t.Actor
    $removed = Invoke-Gh @($t.Kind, 'edit', $t.N, '--repo', $Repo, '--remove-label', 'run-now')
    if ($removed.Code -ne 0) {
      # Decision #46 (1): a failed removal must never start a run, or a stuck
      # label would ring every tick. Leave it; a later tick retries removal.
      Log "Could not remove run-now from #$($t.N) (gh exit $($removed.Code)) - leaving it for the next tick."
      continue
    }
    if ($actor -eq $Owner) {
      $counted.Add($t)
    } else {
      Log "Removed run-now from #$($t.N): labelled by '$actor', not $Owner."
    }
  }
  if ($counted.Count -gt 0) {
    # Decision #46 (2): comment on every counted item, then start ONE run.
    foreach ($c in $counted) {
      $r = Invoke-Gh @($c.Kind, 'comment', $c.N, '--repo', $Repo, '--body', 'Doorbell: starting a 1-step run.')
      if ($r.Code -ne 0) { Log "Could not comment on #$($c.N) (gh exit $($r.Code)) - running anyway." }
    }
    Start-Run ('run-now on ' + (($counted | ForEach-Object { "#$($_.N)" }) -join ', '))
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
  Finish
} catch {
  Log "Doorbell error: $($_.Exception.Message)"
  Finish
}
