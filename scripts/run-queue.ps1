<#
.SYNOPSIS
  Drain the dispatch queue unattended: each step runs in its own fresh Claude
  Code process, so no context carries over between steps.

.DESCRIPTION
  Each iteration runs .claude/commands/run-step.md headless. One iteration does
  ONE unit of work - fixes one PR the architect sent back, or builds the next
  runnable step - and reports a RESULT line. The loop stops on NOTHING, STOPPED,
  a timeout, or anything it cannot read.

  Nothing here can merge: gh pr merge / approve, pushes to main and force-pushes
  are denied, and branch protection on main is the second lock. The guard-db
  hook still runs (never add --bare - it skips hooks).

.EXAMPLE
  .\scripts\run-queue.ps1 -MaxSteps 1        # first time: one step, watch it
  .\scripts\run-queue.ps1                    # normal: up to 5 units of work

  Run from the repo root in Windows PowerShell 5.1 or later.
#>
param(
  [int]$MaxSteps = 5,
  [int]$TimeoutMinutes = 180
)

$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 pipes ASCII by default; the prompt has non-ASCII text.
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

if (-not (Test-Path '.claude/commands/run-step.md')) {
  Write-Host 'Run this from the repo root.' -ForegroundColor Red
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

# The prompt is the command file minus its front matter.
$raw = [IO.File]::ReadAllText((Resolve-Path '.claude/commands/run-step.md'))
$prompt = ($raw -replace '(?s)^---.*?---\s*', '')
$promptFile = Join-Path $logDir 'prompt.txt'
[IO.File]::WriteAllText($promptFile, $prompt, (New-Object System.Text.UTF8Encoding $false))

$allowed = 'Read,Grep,Glob,Edit,Write,Bash(git *),Bash(npm *),Bash(node *),Bash(gh *),Bash(curl *),Bash(graphify *),Bash(ls *),Bash(cat *),Bash(grep *),Bash(head *),Bash(tail *),Bash(wc *),Bash(echo *),Bash(sleep *),Bash(kill *),Bash(taskkill *)'
$denied  = 'Bash(git push --force*),Bash(git push -f*),Bash(git push origin main*),Bash(gh pr merge*),Bash(gh pr review*),Bash(gh repo *),Bash(gh api -X DELETE*)'

$argLine = "-p --output-format json --permission-mode acceptEdits --permission-prompts none " +
           "--allowedTools `"$allowed`" --disallowedTools `"$denied`""

function Log($text) {
  $line = "$(Get-Date -Format 'HH:mm:ss')  $text"
  Write-Host $line
  Add-Content -Path $summaryLog -Value $line -Encoding UTF8
}

Log "Queue run started. MaxSteps=$MaxSteps TimeoutMinutes=$TimeoutMinutes"

for ($i = 1; $i -le $MaxSteps; $i++) {
  $out = Join-Path $logDir "$stamp-step$i.json"
  $err = Join-Path $logDir "$stamp-step$i.err.txt"
  Log "[$i/$MaxSteps] starting a fresh Claude Code process..."

  $proc = Start-Process -FilePath $claude.Source -ArgumentList $argLine `
            -RedirectStandardInput $promptFile -RedirectStandardOutput $out `
            -RedirectStandardError $err -NoNewWindow -PassThru

  if (-not $proc.WaitForExit($TimeoutMinutes * 60 * 1000)) {
    $proc.Kill()
    Log "[$i] TIMED OUT after $TimeoutMinutes min - stopped. Check 'git status' before the next run."
    break
  }

  $text = ''
  $cost = ''
  try {
    $json = Get-Content $out -Raw -Encoding UTF8 | ConvertFrom-Json
    $text = [string]$json.result
    if ($json.total_cost_usd) { $cost = " (cost `$$($json.total_cost_usd))" }
  } catch {
    Log "[$i] could not read Claude's output - see $out and $err. Stopping."
    break
  }

  $m = [regex]::Matches($text, '(?m)^RESULT:\s*(\w+)(.*)$')
  if ($m.Count -eq 0) {
    Log "[$i] no RESULT line - see $out. Stopping."
    break
  }
  $kind = $m[$m.Count - 1].Groups[1].Value
  $rest = $m[$m.Count - 1].Groups[2].Value.Trim()
  Log "[$i] RESULT: $kind $rest$cost"

  if ($kind -eq 'NOTHING' -or $kind -eq 'STOPPED') { break }
  if (@('BUILT', 'FIXED', 'ISSUE') -notcontains $kind) {
    Log "[$i] unrecognised RESULT - stopping to be safe."
    break
  }
}

Log 'Queue run finished. Open PRs:'
& $gh.Source pr list --state open | Tee-Object -FilePath $summaryLog -Append
Write-Host ''
Write-Host "Summary log: $summaryLog" -ForegroundColor Cyan
Write-Host 'Next: click through any PR that touched public/, then comment "Click-through: <what you saw>" on it.' -ForegroundColor Cyan
