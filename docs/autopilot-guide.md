# Autopilot guide — the queue runs itself, you steer from your phone

**Status: NOT ACTIVE.** Everything here is prepared ahead of time. It switches on
at the install on the restaurant server (section 6), after Marble's Claude
subscription ends. Until then, `/start` on Marble's machine is how work gets
built, `docs/workflow-guide.md` is still the routine, and architect doc edits are
pushed from the laptop as before.

The decision: `docs/session-status.md` -> "Things NOT to re-litigate" ->
"Autopilot (solo workflow)". The four build steps: `autopilot-runner`,
`architect-docs-pickup`, `autopilot-doorbell`, `autopilot-preview`.

---

## 1. What it is

The restaurant server PC does the engineer's job. A timer starts
`scripts/run-queue.ps1` three times a day. Each run fixes a PR you sent back, or
builds the next runnable step, opens a PR, posts a **review draft** on it, and
writes what it did in the **Autopilot log** issue. When it hits a design
question it opens a `needs-architect` issue and stops.

It can never merge, approve, or push to `main`. Three locks stop it: the runner
denies those commands, branch protection on `main` rejects them, and the bot
account it uses is not an admin. **You** merge, from the GitHub app.

## 2. Your day

**Morning, once (the only architect time):**

1. In the GitHub app, read the Autopilot log, new PRs (each has a review
   draft), and new issues.
2. Merge what's ready (section 3).
3. Architect chat: paste in the PRs, issues and notes you want to discuss.
   Decide.
4. The chat gives you doc edits. File them as one `architect-docs` issue
   (section 4). Within about 15 minutes autopilot turns it into a docs PR.
5. Merge that docs PR. The 16:00 run builds whatever it unlocked; add `run-now`
   if you want it to start sooner.

**The rest of the day, phone only:** read, leave notes as plain comments, merge
when ready. Add `run-now` to any issue if you want an extra step before the next
scheduled run.

**Scheduled runs:** 16:00, 21:00 and 03:00 (up to 2 steps each): class and sleep
hours, when you can't do architect work anyway, so PRs are waiting when you're
free. They're at least 5 hours apart and usage resets every 5 hours, so each run
starts with a fresh allowance.

## 3. Phone cheat sheet (GitHub app)

| I want to… | Do this |
|---|---|
| Run one step now | Add the label `run-now` to any issue or PR. It starts within ~15 min. Only your labels count. |
| Hand over today's decisions | New issue from the **Architect docs** template, paste the edit blocks (section 4). |
| Merge a PR | Read its "Review draft" comment and check CI is green -> **Approve** -> **Merge**. |
| Merge a `public/` PR | Only after your own `Click-through:` comment on it (next row). |
| Click through a `public/` PR | Add the label `preview` to the PR -> open the link it comments (Tailscale on) -> try it -> comment `Click-through: <what you saw>`. |
| Send a PR back | **Review -> Request changes**, saying exactly what to change. Decide any design question *in the comment*. |
| Leave a note for tomorrow | Any plain comment. Autopilot ignores plain comments. |
| See what it did | The pinned **Autopilot log** issue: one comment per run. |
| Pause everything | Open an issue with the label `autopilot-pause`. Close it to resume. |
| Merge on the laptop instead | `/review <n>` as before. It keeps its automatic refusals (red verify, missing click-through), so prefer it for schema, migration and `public/` PRs. |

**After a merge:** the queue's `CLOSED` stamp no longer happens at merge time.
`/start` already treats a merged PR as done, so nothing gets rebuilt. Ask the
architect chat to include the stamps in your next `architect-docs` issue.

### Laptop or phone?

**Fine on the phone (small and reversible):** reading, notes, `run-now`,
`preview` + your click-through, merging a PR whose review draft ends
`Recommendation: merge`, sending a PR back with a clear fix, and filing
architect-docs blocks you already have.

**Save for the laptop or the architect session:** anything ending
`needs your call`, `needs-architect` issues, PRs touching `schema.sql` or
`migrate.js`, and anything you want to think about properly. To think on the
phone, paste the review draft into the architect Claude Project in the phone app
(it has the project files). Decide there, or postpone it to the next session.

## 4. Filing an architect-docs issue

The architect chat ends by giving you edit blocks in this shape. Paste them
under the template's Summary line:

```
## Summary
Close 24d-iii; add sides tier-1 spec

### EDIT 1
FILE: docs/dispatch-queue.md
OLD:
~~~
### 3f. Step 24d-iii - richer yield: miscut on the commissary UI (Path 1)  [runnable]
~~~
NEW:
~~~
### 3f. Step 24d-iii — CLOSED 2026-10-05, PR #24.
~~~
```

The rules, so an edit never lands half-done:

- **`docs/` only.** Any other path rejects the whole issue.
- **`OLD` must appear exactly once** in the file, character for character.
- **All or nothing.** If any edit fails, nothing is written. The issue gets the
  label `architect-docs-failed` and a comment naming the edit that failed. Get
  corrected blocks from the architect chat and file a **new** issue.
- **Verbatim.** Autopilot copies your text exactly. It doesn't fix typos or
  "improve" anything.
- **Only the EDIT blocks are read.** Other text in the issue, and every comment
  on it, is ignored.
- **`CREATE:` instead of `OLD:`/`NEW:`** makes a new file. It's only allowed if
  that file doesn't exist yet.
- **Size limit.** GitHub issues hold about 65,000 characters. For bigger
  changes, split them into two issues.

If the GitHub app doesn't offer the template, create a plain issue and add the
`architect-docs` label yourself.

## 5. What it can and can't do

**Can:** build runnable steps, fix PRs you sent back, open `needs-architect`
issues, apply your `architect-docs` issues as docs PRs, post review drafts and
the run log, serve a PR preview on port 3100.

**Can't:**

- merge, approve, or push to `main`;
- write to the live app's folder (Windows permissions, section 6.3);
- use port 3000 or the live database;
- act on labels or issues from anyone but you;
- answer design questions.

**Ignores:** plain comments; `architect-docs` issues not opened by you; any text
in an `architect-docs` issue that isn't an edit block.

---

## 6. One-time install on the restaurant server

Do this only after all four autopilot steps are merged on `main`.

### 6.0 Have these ready

- **Admin access** to the server PC.
- **The live app's folder path**, e.g. `C:\inventory-audit-app`.
- **A GitHub machine account (the bot).** Make it with a new email, on the free
  plan. GitHub's terms allow one machine account besides your own. Invite it to
  the repo (Settings -> Collaborators) with the **Write** role, not Admin, and
  accept the invite as the bot. Note its noreply email (bot's Settings ->
  Emails).
- **The bot's Claude account** (same email as the bot's GitHub account),
  upgraded to **Pro**. Claude Code doesn't run on the free plan.
- **Tailscale** running on the server and on your phone, and the server's
  Tailscale name.

### 6.1 Check the machine (admin PowerShell)

```
winver
node -v
```

You need Windows 10 or 11, 64-bit, and Node **v22.13 or newer**. The live app
needs the same Node version, so upgrading is safe. Set sleep to **Never**
(Settings -> System -> Power).

### 6.2 Create the engineer user (admin PowerShell)

```
net user engineer * /add
```

It asks for a password. Leave it a **standard** user, never an admin: a
standard user can't stop the live app or touch other users' files.

### 6.3 Lock the live app away from it (admin PowerShell)

```
$live = 'C:\inventory-audit-app'
icacls $live /deny "engineer:(OI)(CI)W"
icacls $live /deny "engineer:(OI)(CI)D"
```

Use your real path. This denies the engineer write and delete access in that
folder and everything inside it, including the real `inventory.db`. The
guard-db hook is a rule Claude follows; this is a lock it can't get past. You'll
prove it works in 6.5.

### 6.4 Install the tools

As admin (machine-wide):

```
winget install --id Git.Git -e
winget install --id GitHub.cli -e
```

Then sign in to Windows **as engineer** and install Claude Code for that user.
The Windows install is one PowerShell line on the official setup page
(code.claude.com/docs). Close and reopen PowerShell afterwards.

### 6.5 Set up as engineer (normal PowerShell, signed in as engineer)

```
# 1. Prove the lock. This MUST fail with "Access is denied".
New-Item "C:\inventory-audit-app\autopilot-test.txt"

# 2. Allow local scripts for this user
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

# 3. GitHub as the BOT (GitHub.com, HTTPS, browser login as the bot account)
gh auth login
gh auth setup-git
gh auth status
git config --global user.name  "<bot-login>"
git config --global user.email "<bot-noreply-email>"

# 4. The engineer's own copy of the repo
mkdir $HOME\autopilot
cd $HOME\autopilot
git clone https://github.com/naokicodes/inventory-audit-app-3rdYr.git repo
cd repo
npm ci
npm run verify

# 5. Claude: log in with the engineer's Claude account, then type /exit
claude

# 6. Keep it off the live app's port
[Environment]::SetEnvironmentVariable('PORT', '3100', 'User')
```

Two results to check: `gh auth status` must show the **bot's** login, and
`verify` must say SUITE GREEN and AUDIT CLEAN.

### 6.6 Labels and the log issue (as engineer, in the repo folder)

```
gh label create run-now --color 0E8A16 --description "Start one autopilot step now"
gh label create architect-docs --color 5319E7 --description "Architect doc edits for autopilot to apply"
gh label create architect-docs-applied --color C5DEF5
gh label create architect-docs-failed --color D93F0B
gh label create preview --color FBCA04 --description "Serve this PR on the preview port"
gh label create autopilot-pause --color 000000 --description "Open issue with this label = autopilot does nothing"
gh issue create --title "Autopilot log" --body "Autopilot posts one comment here per run."
```

Note the log issue's number, then:

```
[Environment]::SetEnvironmentVariable('AUTOPILOT_LOG_ISSUE', '<number>', 'User')
[Environment]::SetEnvironmentVariable('AUTOPILOT_PREVIEW_URL', 'http://<server-tailscale-name>:3100', 'User')
```

Sign out and back in so these take effect. On your phone: pin the log issue, and
**Watch** the repo so you get notifications.

### 6.7 The supervised first run (as engineer)

```
cd $HOME\autopilot\repo
.\scripts\run-queue.ps1 -MaxSteps 1 -Trigger manual
```

Watch it finish, then check four things:

- it printed a `RESULT:` line;
- a comment appeared on the Autopilot log;
- `.run-queue-logs\run.lock` is gone;
- if it built a PR, that PR has a review draft.

**This is the first time the runner has run end to end on real work.** Expect to
fix something. Don't schedule anything until this run is clean.

### 6.8 Schedule it (admin PowerShell)

```
$cred = Get-Credential "$env:COMPUTERNAME\engineer"
$repo = "C:\Users\engineer\autopilot\repo"
$set  = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
          -ExecutionTimeLimit (New-TimeSpan -Hours 12)

# The runs: 16:00, 21:00, 03:00, up to 2 steps each
$runAct  = New-ScheduledTaskAction -Execute "powershell.exe" -WorkingDirectory $repo `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File scripts\run-queue.ps1 -MaxSteps 2 -Trigger schedule"
$runTrig = @('16:00','21:00','03:00') | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }
Register-ScheduledTask -TaskName "Autopilot runs" -Action $runAct -Trigger $runTrig -Settings $set `
  -User $cred.UserName -Password $cred.GetNetworkCredential().Password

# The doorbell: every 15 minutes, all day
$bellAct  = New-ScheduledTaskAction -Execute "powershell.exe" -WorkingDirectory $repo `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File scripts\doorbell.ps1"
$bellTrig = New-ScheduledTaskTrigger -Daily -At 00:00
$bellTrig.Repetition = (New-ScheduledTaskTrigger -Once -At 00:00 `
  -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 1)).Repetition
Register-ScheduledTask -TaskName "Autopilot doorbell" -Action $bellAct -Trigger $bellTrig -Settings $set `
  -User $cred.UserName -Password $cred.GetNetworkCredential().Password
```

What the settings do:

- `IgnoreNew` stops a task from starting twice. The runner's own lock stops the
  runs and the doorbell from overlapping each other.
- `StartWhenAvailable` catches up on a run missed while the PC was off.

To test, open Task Scheduler, right-click **Autopilot doorbell** -> **Run**, and
check `.run-queue-logs\doorbell.log`.

### 6.9 Preview access (admin PowerShell)

```
New-NetFirewallRule -DisplayName "Autopilot preview (Tailscale only)" -Direction Inbound `
  -Protocol TCP -LocalPort 3100 -RemoteAddress 100.64.0.0/10 -Action Allow
```

`100.64.0.0/10` is Tailscale's address range. To test, add `preview` to any open
PR and open the link it comments on your phone, with Tailscale on.

### 6.10 Cut-over day

- Leave Marble's last PRs to merge normally first.
- File an `architect-docs` issue (or push it directly) that updates three docs:
  - `workflow-guide.md` "The daily rhythm": point it here;
  - `engineer-role.md`'s branch prefix (`marble/` -> `engineer/`);
  - this guide's Status line: ACTIVE.
- Remove Marble's collaborator access when he's done. The repo is public and his
  machine still has a login. Your call.

---

## 7. Checking on it

Day to day, everything is in the GitHub app: the Autopilot log, the PR list, and
issues. Use Tailscale + spacedesk only when the log says `STOPPED` or
`TIMED OUT`, or when there's been no log comment for a whole day.

On the server, the logs are in `C:\Users\engineer\autopilot\repo\.run-queue-logs\`:

- `*-summary.log`: one per run;
- `doorbell.log`: only when the doorbell did something;
- the per-step `.json` files.

## 8. When something goes wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| No log comment all day | PC off or asleep, task disabled, or a logon failure | Task Scheduler -> the task -> History / Last Run Result. If the engineer's password changed, re-enter it on both tasks. |
| `STOPPED … checkout refuses` | Half-finished work after a timeout or usage limit | As engineer: `git status`. Commit it to its branch or `git stash`, then `git checkout main`. |
| `STOPPED … verify` | `main` itself is red | Not autopilot's to fix. Check CI on `main`. |
| Claude "not logged in", only when scheduled | The scheduled task doesn't see the saved login | As engineer: `claude setup-token`, then save the token as a User environment variable `CLAUDE_CODE_OAUTH_TOKEN`. |
| `gh` errors | The bot's login expired or was revoked | As engineer: `gh auth login` again, as the bot. |
| `architect-docs-failed` | An `OLD` block didn't match exactly once | Read the issue comment, get corrected blocks from the architect chat, file a new issue. |
| Runs stop with a usage-limit error | The Pro allowance is spent | Wait for the reset. Lower `-MaxSteps` or drop one run time. |
| "another run is active" forever | A killed run left its lock | The runner clears a lock whose process is gone. If not, delete `.run-queue-logs\run.lock`. |
| Task logon failure on Windows Home | Missing batch-logon right | Re-register the task with the password, or run it only when engineer is signed in. |

## 9. Turning it off

- **Pause, from your phone:** open an issue with the label `autopilot-pause`.
  Every run and doorbell exits immediately. Close it to resume.
- **Stop for good:** Task Scheduler -> disable **Autopilot runs** and
  **Autopilot doorbell**.

## 10. What still needs you

Decisions, merges, click-throughs, the live database, and anything on-site.
Autopilot removes the typing, not the judgment.
