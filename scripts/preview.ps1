<#
.SYNOPSIS
  Serve one PR's code on the preview port for a phone click-through.

.DESCRIPTION
  Checks the PR out into ..\preview-worktree (beside the repo, never the repo
  itself), reseeds a throwaway preview.db there, and starts that code on -Port
  (default 3100) in the background. Never port 3000, never the live
  inventory.db. One preview at a time: starting one stops the previous one,
  and it stays up until the next preview or a reboot.

  Comments the address on the PR when it answers, or the failure if it does not.
  Calls no Claude. Started by scripts/doorbell.ps1 when the PR gets the
  `preview` label, or by hand.

  Setup: docs/autopilot-guide.md.

.EXAMPLE
  .\scripts\preview.ps1 -Pr 52
#>
param(
  [Parameter(Mandatory = $true)][int]$Pr,
  [int]$Port = 3100,
  [string]$Repo = 'naokicodes/inventory-audit-app-3rdYr'
)

$ErrorActionPreference = 'Stop'

Set-Location (Split-Path $PSScriptRoot -Parent)
$repoRoot = (Get-Location).Path
$logDir = Join-Path $repoRoot '.run-queue-logs'
$pidFile = Join-Path $logDir 'preview.pid'
$logFile = Join-Path $logDir 'preview.log'
$errFile = Join-Path $logDir 'preview.err.log'   # Start-Process cannot send both streams to one file
$worktree = [IO.Path]::GetFullPath((Join-Path $repoRoot '..\preview-worktree'))
$dbPath = Join-Path $worktree 'server\db\preview.db'

# ---- Guards first: refuse on any. ----
if ($Port -eq 3000) { Write-Error 'preview refused: port 3000 is the live app. Use another -Port (default 3100).' }
if ($dbPath -match 'inventory\.db$') { Write-Error "preview refused: the preview database ($dbPath) must not be inventory.db." }
if ($worktree.TrimEnd('\') -eq $repoRoot.TrimEnd('\')) { Write-Error "preview refused: the worktree ($worktree) is the repo itself." }

function Invoke-Native([string]$What, [scriptblock]$Cmd) {
  & $Cmd
  if ($LASTEXITCODE -ne 0) { throw "$What failed (exit $LASTEXITCODE)" }
}

function Send-PrComment([string]$Body) {
  & gh pr comment $Pr --repo $Repo --body $Body
  if ($LASTEXITCODE -ne 0) { Write-Warning "Could not comment on PR #$Pr (gh exit $LASTEXITCODE)." }
}

try {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null

  # ---- Stop the previous preview: only that PID, and only if it is node.exe. ----
  if (Test-Path $pidFile) {
    $oldPid = 0
    if ([int]::TryParse("$(Get-Content $pidFile -TotalCount 1)".Trim(), [ref]$oldPid)) {
      $old = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
      if ($old -and $old.ProcessName -eq 'node') {
        Stop-Process -Id $oldPid -Force
        $old.WaitForExit(10000) | Out-Null   # it holds preview.db and node_modules open
      }
    }
    Remove-Item $pidFile -Force
  }

  # ---- Check out the PR into the worktree. ----
  Invoke-Native 'git fetch' { git fetch origin "+pull/$Pr/head:preview-$Pr" }
  if (Test-Path $worktree) {
    Invoke-Native 'git checkout' { git -C $worktree checkout --detach "preview-$Pr" }
  } else {
    Invoke-Native 'git worktree prune' { git worktree prune }   # a deleted folder stays registered otherwise
    Invoke-Native 'git worktree add' { git worktree add --detach $worktree "preview-$Pr" }
  }

  Push-Location $worktree
  $prevPort = $env:PORT
  $prevDb = $env:DB_PATH
  try {
    Invoke-Native 'npm ci' { npm ci }

    # Set for the reseed and the server only, restored below. The reseed refusal
    # in server/db/dbPath.js still blocks the live file on its own.
    $env:DB_PATH = $dbPath
    $env:PORT = "$Port"
    Invoke-Native 'npm run reseed' { npm run reseed }

    $proc = Start-Process -FilePath 'node' -ArgumentList 'server/index.js' -WorkingDirectory $worktree `
              -RedirectStandardOutput $logFile -RedirectStandardError $errFile -WindowStyle Hidden -PassThru
  } finally {
    $env:PORT = $prevPort
    $env:DB_PATH = $prevDb
    Pop-Location
  }
  Set-Content -Path $pidFile -Value $proc.Id -Encoding ASCII

  # ---- Wait until it answers, 60 s max. ----
  $up = $false
  $deadline = (Get-Date).AddSeconds(60)
  while (-not $up -and (Get-Date) -lt $deadline -and -not $proc.HasExited) {
    try {
      Invoke-WebRequest -Uri "http://localhost:$Port/" -UseBasicParsing -TimeoutSec 3 | Out-Null
      $up = $true
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  if (-not $up) { throw "the server did not answer on port $Port within 60 s (see .run-queue-logs/preview.log)" }

  $where = if ($env:AUTOPILOT_PREVIEW_URL) { "up at $($env:AUTOPILOT_PREVIEW_URL)" } else { "up on port $Port" }
  Send-PrComment "Preview of PR #$Pr is $where (reseeded sample data). After clicking through, comment `"Click-through: <what you saw>`"."
  Write-Host "Preview of PR #$Pr is $where (PID $($proc.Id))."
} catch {
  Send-PrComment "Preview of PR #$Pr failed: $($_.Exception.Message)"
  Write-Error "Preview of PR #$Pr failed: $($_.Exception.Message)" -ErrorAction Continue
  exit 1
}
