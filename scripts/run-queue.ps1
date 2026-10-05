<#
.SYNOPSIS
  Drain the dispatch queue unattended: each step runs in its own fresh Claude
  Code process, so no context carries over between steps.

.DESCRIPTION
  Each iteration runs .claude/commands/run-step.md headless. One iteration does
  ONE unit of work - fixes one PR the architect sent back, or builds the next
  runnable step - and reports a RESULT line. The loop stops on NOTHING, STOPPED,
  a timeout, or anything it cannot read.

  After an iteration that BUILT or FIXED a PR, one more fresh process runs
  .claude/commands/review-draft.md against that PR: an independent review,
  posted as a comment, never an approval. It does not count toward -MaxSteps.

  Before any work: an open issue labelled autopilot-pause (by -Owner) makes the
  run exit at once, and .run-queue-logs/run.lock stops two runs overlapping.
  At the end, one comment summarising the run goes to issue -LogIssue.

  Nothing here can merge: gh pr merge / approve, pushes to main and force-pushes
  are denied, and branch protection on main is the second lock. The guard-db
  hook still runs (never add --bare - it skips hooks).

  Setup and day-to-day use: docs/autopilot-guide.md.

.EXAMPLE
  .\scripts\run-queue.ps1 -MaxSteps 1        # first time: one step, watch it
  .\scripts\run-queue.ps1                    # normal: up to 5 units of work
  .\scripts\run-queue.ps1 -MaxSteps 2 -Trigger schedule   # what the scheduler runs

  Run from the repo root in Windows PowerShell 5.1 or later.
#>
param(
  [int]$MaxSteps = 5,
  [int]$TimeoutMinutes = 180,
  # Who started the run: 'manual', 'schedule' or 'doorbell'. Reported in the run log only.
  [string]$Trigger = 'manual',
  # The Autopilot log issue. 0 = do not post; the comment is printed locally instead.
  [int]$LogIssue = $(if ($env:AUTOPILOT_LOG_ISSUE -match '^\d+$') { [int]$env:AUTOPILOT_LOG_ISSUE } else { 0 }),
  # The only GitHub login whose autopilot-pause issues count.
  [string]$Owner = 'naokicodes'
)

$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 pipes ASCII by default; the prompt has non-ASCII text.
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$utf8 = New-Object System.Text.UTF8Encoding $false

if (-not (Test-Path '.claude/commands/run-step.md')) {
  Write-Host 'Run this from the repo root.' -ForegroundColor Red
  exit 1
}
if (-not (Test-Path '.claude/commands/review-draft.md')) {
  Write-Host '.claude/commands/review-draft.md is missing.' -ForegroundColor Red
  exit 1
}

$claude = Get-Command claude -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $claude) { Write-Host 'claude not found on PATH.' -ForegroundColor Red; exit 1 }
$gh = Get-Command gh -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $gh) { Write-Host 'gh not found on PATH - the runner needs it.' -ForegroundColor Red; exit 1 }

$logDir = Join-Path (Get-Location).Path '.run-queue-logs'   # absolute: Start-Process redirects need it
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$summaryLog = Join-Path $logDir "$stamp-summary.log"
$lockPath = Join-Path $logDir 'run.lock'

function Log($text) {
  $line = "$(Get-Date -Format 'HH:mm:ss')  $text"
  Write-Host $line
  Add-Content -Path $summaryLog -Value $line -Encoding UTF8
}

# Runs gh and returns its exit code and stdout. stderr is dropped: in Windows
# PowerShell 5.1 a redirected native stderr line becomes an error record, which
# 'Stop' would turn into a throw.
function Invoke-Gh([string[]]$GhArgs) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & $gh.Source @GhArgs 2>$null
    return @{ Code = $LASTEXITCODE; Out = (@($out) -join "`n") }
  } catch {
    return @{ Code = -1; Out = '' }
  } finally {
    $ErrorActionPreference = $prev
  }
}

# ---- Pause switch: an open autopilot-pause issue by the owner stops the run. ----
# A missing label or a gh failure counts as NOT paused.
$pause = Invoke-Gh @('issue', 'list', '--state', 'open', '--label', 'autopilot-pause', '--author', $Owner, '--json', 'number')
if ($pause.Code -ne 0) {
  Log "Pause check failed (gh exit $($pause.Code)) - treating as not paused."
} else {
  $pausedBy = @()
  try {
    $pausedBy = @($pause.Out | ConvertFrom-Json | ForEach-Object { $_ } | Where-Object { $_ -and $_.number } | ForEach-Object { $_.number })
  } catch {
    Log 'Pause check returned unreadable output - treating as not paused.'
  }
  if ($pausedBy.Count -gt 0) {
    Log "Paused by #$($pausedBy[0]) - exiting without running anything."
    exit 0
  }
}

# ---- Single-instance lock. ----
function New-RunLock {
  # CreateNew fails if the file exists - that is the lock.
  $fs = [IO.File]::Open($lockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    $bytes = $utf8.GetBytes("$PID`n$((Get-Date).ToString('o'))`n")
    $fs.Write($bytes, 0, $bytes.Length)
  } finally {
    $fs.Close()
  }
}

try {
  New-RunLock
} catch {
  if (-not (Test-Path $lockPath)) { throw }
  $holderPid = 0
  $lockedAt = $null
  try {
    $lines = [IO.File]::ReadAllText($lockPath) -split "`n"
    if ($lines[0].Trim() -match '^\d+$') { $holderPid = [int]$lines[0].Trim() }
    if ($lines.Count -gt 1 -and $lines[1].Trim()) { $lockedAt = [DateTime]::Parse($lines[1].Trim()) }
  } catch {}
  $alive = $false
  if ($holderPid -gt 0) {
    $p = Get-Process -Id $holderPid -ErrorAction SilentlyContinue
    if ($p) {
      $alive = $true
      # A process that started after the lock was written is a reused PID, not the holder.
      try { if ($lockedAt -and $p.StartTime -gt $lockedAt.AddSeconds(5)) { $alive = $false } } catch {}
    }
  }
  if ($alive) {
    Log "Another run is active (PID $holderPid) - exiting."
    exit 0
  }
  Log "Stale lock (PID $holderPid not running, or the lock was unreadable) - replacing it."
  Remove-Item $lockPath -Force
  New-RunLock
}

# ---- Everything after the lock: the finally block always releases it. ----
$startedAt = Get-Date
$runLines = New-Object System.Collections.Generic.List[string]

try {
  # The prompts are the command files minus their front matter.
  $raw = [IO.File]::ReadAllText((Resolve-Path '.claude/commands/run-step.md'))
  $prompt = ($raw -replace '(?s)^---.*?---\s*', '')
  $promptFile = Join-Path $logDir 'prompt.txt'
  [IO.File]::WriteAllText($promptFile, $prompt, $utf8)

  $rawReview = [IO.File]::ReadAllText((Resolve-Path '.claude/commands/review-draft.md'))
  $reviewTemplate = ($rawReview -replace '(?s)^---.*?---\s*', '')
  $reviewPromptFile = Join-Path $logDir 'review-prompt.txt'

  $allowed = 'Read,Grep,Glob,Edit,Write,Bash(git *),Bash(npm *),Bash(node *),Bash(gh *),Bash(curl *),Bash(graphify *),Bash(ls *),Bash(cat *),Bash(grep *),Bash(head *),Bash(tail *),Bash(wc *),Bash(echo *),Bash(sleep *),Bash(kill *),Bash(taskkill *)'
  $denied  = 'Bash(git push --force*),Bash(git push -f*),Bash(git push origin main*),Bash(gh pr merge*),Bash(gh pr review*),Bash(gh repo *),Bash(gh api -X DELETE*)'

  $argLine = "-p --output-format json --permission-mode acceptEdits --permission-prompts none " +
             "--allowedTools `"$allowed`" --disallowedTools `"$denied`""

  # One fresh Claude process. Status: ok | timeout | unreadable. On ok, Kind/Rest
  # are the last RESULT line ('' if there was none).
  function Invoke-ClaudeRun($inputFile, $outFile, $errFile) {
    $proc = Start-Process -FilePath $claude.Source -ArgumentList $argLine `
              -RedirectStandardInput $inputFile -RedirectStandardOutput $outFile `
              -RedirectStandardError $errFile -NoNewWindow -PassThru
    if (-not $proc.WaitForExit($TimeoutMinutes * 60 * 1000)) {
      $proc.Kill()
      return @{ Status = 'timeout' }
    }
    $r = @{ Status = 'ok'; Kind = ''; Rest = ''; Cost = '' }
    try {
      $json = Get-Content $outFile -Raw -Encoding UTF8 | ConvertFrom-Json
      $text = [string]$json.result
      if ($json.total_cost_usd) { $r.Cost = " (cost `$$($json.total_cost_usd))" }
    } catch {
      return @{ Status = 'unreadable' }
    }
    $m = [regex]::Matches($text, '(?m)^RESULT:\s*(\w+)(.*)$')
    if ($m.Count -gt 0) {
      $r.Kind = $m[$m.Count - 1].Groups[1].Value
      $r.Rest = $m[$m.Count - 1].Groups[2].Value.Trim()
    }
    return $r
  }

  Log "Queue run started. Trigger=$Trigger MaxSteps=$MaxSteps TimeoutMinutes=$TimeoutMinutes"

  for ($i = 1; $i -le $MaxSteps; $i++) {
    $out = Join-Path $logDir "$stamp-step$i.json"
    $err = Join-Path $logDir "$stamp-step$i.err.txt"
    Log "[$i/$MaxSteps] starting a fresh Claude Code process..."

    $r = Invoke-ClaudeRun $promptFile $out $err

    if ($r.Status -eq 'timeout') {
      Log "[$i] TIMED OUT after $TimeoutMinutes min - stopped. Check 'git status' before the next run."
      $runLines.Add("Step $i - TIMED OUT after $TimeoutMinutes min")
      break
    }
    if ($r.Status -eq 'unreadable') {
      Log "[$i] could not read Claude's output - see $out and $err. Stopping."
      $runLines.Add("Step $i - unreadable output")
      break
    }
    if (-not $r.Kind) {
      Log "[$i] no RESULT line - see $out. Stopping."
      $runLines.Add("Step $i - no RESULT line")
      break
    }

    $kind = $r.Kind
    $resultLine = "RESULT: $kind $($r.Rest)".Trim() + $r.Cost
    Log "[$i] $resultLine"
    $runLines.Add("Step $i - $resultLine")

    if ($kind -eq 'NOTHING' -or $kind -eq 'STOPPED') { break }
    if (@('BUILT', 'FIXED', 'ISSUE') -notcontains $kind) {
      Log "[$i] unrecognised RESULT - stopping to be safe."
      break
    }

    # ---- Review draft: an independent process, never stops the loop. ----
    if ($kind -eq 'BUILT' -or $kind -eq 'FIXED') {
      if ($r.Rest -notmatch '^#(\d+)') {
        Log "[$i] no PR number in the RESULT line - no review draft."
        $runLines.Add("Review draft for step $i - skipped, no PR number")
        continue
      }
      $prNumber = $Matches[1]
      [IO.File]::WriteAllText($reviewPromptFile, $reviewTemplate.Replace('$ARGUMENTS', $prNumber), $utf8)
      $rOut = Join-Path $logDir "$stamp-review$i.json"
      $rErr = Join-Path $logDir "$stamp-review$i.err.txt"
      Log "[$i] starting a review draft for PR #$prNumber..."

      $rv = Invoke-ClaudeRun $reviewPromptFile $rOut $rErr

      if ($rv.Status -eq 'timeout') {
        Log "[$i] review draft for #$prNumber TIMED OUT after $TimeoutMinutes min - killed, continuing."
        $runLines.Add("Review draft #$prNumber - TIMED OUT")
      } elseif ($rv.Status -eq 'unreadable') {
        Log "[$i] could not read the review draft's output - see $rOut and $rErr. Continuing."
        $runLines.Add("Review draft #$prNumber - unreadable output")
      } elseif (-not $rv.Kind) {
        Log "[$i] review draft gave no RESULT line - see $rOut. Continuing."
        $runLines.Add("Review draft #$prNumber - no RESULT line")
      } else {
        $reviewLine = "RESULT: $($rv.Kind) $($rv.Rest)".Trim() + $rv.Cost
        Log "[$i] review draft $reviewLine"
        $runLines.Add("Review draft #$prNumber - $reviewLine")
      }
    }
  }
} catch {
  Log "Runner error: $($_.Exception.Message)"
  $runLines.Add('Runner error - see the local summary log')
  throw
} finally {
  try {
    Log 'Queue run finished. Open PRs:'
    $prs = Invoke-Gh @('pr', 'list', '--state', 'open')
    $prText = $prs.Out
    if ($prs.Code -ne 0) { $prText = "(gh pr list failed, exit $($prs.Code))" }
    elseif (-not $prText) { $prText = '(none)' }
    Write-Host $prText
    Add-Content -Path $summaryLog -Value $prText -Encoding UTF8

    # The repo is PUBLIC: RESULT lines and PR/issue numbers only - no file
    # contents, .err.txt text, environment values or machine paths.
    $body = New-Object System.Collections.Generic.List[string]
    $body.Add("**Autopilot run** - trigger: $Trigger")
    $body.Add('')
    $body.Add("Started $($startedAt.ToString('yyyy-MM-dd HH:mm')), ended $((Get-Date).ToString('yyyy-MM-dd HH:mm')).")
    $body.Add('')
    if ($runLines.Count -eq 0) { $body.Add('- (no iterations ran)') }
    foreach ($l in $runLines) { $body.Add("- $l") }
    $body.Add('')
    $body.Add('Open PRs:')
    $body.Add('```')
    $body.Add($prText)
    $body.Add('```')
    $bodyText = ($body -join "`n") + "`n"

    if ($LogIssue -gt 0) {
      $bodyFile = Join-Path $logDir "$stamp-comment.md"
      [IO.File]::WriteAllText($bodyFile, $bodyText, $utf8)
      $post = Invoke-Gh @('issue', 'comment', "$LogIssue", '--body-file', $bodyFile)
      if ($post.Code -eq 0) { Log "Run log posted to #$LogIssue." }
      else { Log "Could not post the run log to #$LogIssue (gh exit $($post.Code)) - not fatal." }
    } else {
      Log 'Run log not posted (-LogIssue 0). It would read:'
      Write-Host $bodyText
      Add-Content -Path $summaryLog -Value $bodyText -Encoding UTF8
    }
  } catch {
    Log "Could not write the run log: $($_.Exception.Message)"
  } finally {
    Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
  }
}

Write-Host ''
Write-Host "Summary log: $summaryLog" -ForegroundColor Cyan
Write-Host 'Next: see docs/autopilot-guide.md - read the run log, review drafts and click-throughs from there.' -ForegroundColor Cyan
