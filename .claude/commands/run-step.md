---
description: Unattended queue run — fix one reviewed PR, or build the next runnable step, then report one RESULT line. Started by scripts/run-queue.ps1, not typed.
---

You are running **unattended**, in a fresh process started by
`scripts/run-queue.ps1`. Nobody is watching and nobody can answer a question. Do
ONE unit of work, then end your final message with exactly one line, and
nothing after it:

```
RESULT: FIXED #<n>
RESULT: BUILT #<n>
RESULT: ISSUE #<n>
RESULT: NOTHING
RESULT: STOPPED <one-line reason>
```

Everything the interactive commands require still applies. Read
`.claude/commands/start.md` and `.claude/commands/step.md` now and follow them,
with only the differences below. Where this file and they disagree, this file
wins; everywhere else, they win.

## Differences from the interactive flow

- **Skip `start.md` step 0.** A fresh process is always a clean context.
- **Skip the checkpoint in `start.md` step 6.** Nobody will type `/continue`; go
  from the stated plan straight to building.
- **Never ask a question.** Anything you would ask is Class A (decide it, log it
  in the PR body) or Class B (open an issue and stop). There is no third option.
- **Opening an issue:** `gh issue create --template` needs a terminal, so use
  `gh issue create --title "[needs-architect] Step <step-id> — <what is undecided>" --label needs-architect --body-file <file>`,
  with the body following `.github/ISSUE_TEMPLATE/needs-architect.md`'s
  sections: both readings, evenly, and **no recommendation**.
- **Never** merge, approve, push to `main`, or force-push. The runner script also
  denies these.

## 1. Ground on main

```
git checkout main
git pull
npm run verify
```

If the checkout refuses (uncommitted changes) or `verify` is not `SUITE GREEN`
and `AUDIT CLEAN`: `RESULT: STOPPED <why>`.

## 2. First, fix a PR the architect has sent back

```
gh pr list --state open --json number,title,reviewDecision,mergeable
```

A PR needs fixing if EITHER:

- its `reviewDecision` is `CHANGES_REQUESTED` **and** the newest
  changes-requested review is newer than the PR's newest commit
  (`gh pr view <n> --json reviews,commits`). If the newest commit is newer, the
  request was already addressed and is waiting for re-review — skip it; OR
- its `mergeable` is `CONFLICTING`.

If none qualifies, go to section 3. Otherwise fix only the lowest-numbered one:

- `gh pr checkout <n>`. Read the review and every inline comment
  (`gh pr view <n> --comments` and
  `gh api repos/naokicodes/inventory-audit-app-3rdYr/pulls/<n>/comments`). The
  architect's review is a mini-spec: do what it asks, nothing more.
- **A conflict:** `git merge origin/main`. If any conflicted file is
  `server/db/migrate.js` or `server/db/schema.sql`, do NOT resolve it —
  `git merge --abort`, open an issue, `RESULT: ISSUE #<n>`. Resolving a
  migration inside a conflict is how an old constraint silently survives.
  Otherwise resolve, keeping both sides' intent.
- **A requested change that needs a design call** → issue, `RESULT: ISSUE #<n>`.
- `npm run verify`, both green. If `public/` changed, exercise the page as
  `step.md` step 5 says.
- Commit, `git push` (never force), then
  `gh pr comment <n> --body "<what was addressed, and the verify result>"`. If
  `public/` changed, say it needs a fresh human click-through.
- `RESULT: FIXED #<n>`

## 3. Otherwise, build the next runnable step

Follow `start.md` steps 1–5 — every skip rule applies, including in-flight,
parked, deferred and file-overlap — then `step.md` steps 4–7 for the chosen
step. The PR title carries the step id: `<type>(<step-id>): <subject>`.

- No runnable step → `RESULT: NOTHING`
- A Class B gap → issue → `RESULT: ISSUE #<n>`
- PR opened → `RESULT: BUILT #<n>`
- Anything else that stops you → `RESULT: STOPPED <reason>`

## 4. Leave the checkout clean

Before the RESULT line, `git checkout main`. If uncommitted changes remain that
belong to no branch, do not discard them — report them in `RESULT: STOPPED`.
