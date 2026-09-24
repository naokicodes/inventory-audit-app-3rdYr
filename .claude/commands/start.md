---
description: Begin the next runnable step from the queue — ground on main, select, plan, then pause for /continue.
---

Pick up the next runnable step from the queue and take it up to the point of
implementation, then stop for a checkpoint. **Do NOT write code in this
command** — that is `/continue`.

## 0. Start from a clean context — check this before anything else

This command must run in a fresh conversation. Before running any command
below, look back over this conversation. If it already holds a previous step's
work — another `/start`, `/continue` or `/step` run, a PR opened, an issue
parked, code edits, or long test output — **stop** and say only:

> This conversation still holds a previous step's work. Run `/clear`, then
> `/start` again. If you just pulled changes to `.claude/commands/`, quit and
> reopen Claude Code instead — `/clear` does not reload commands.

Do not run git, read docs, or select a step first. A previous step's context is
re-sent on every turn of this one: it multiplies the cost of the step and brings
context compaction sooner, which is how spec details get lost mid-build.
Everything a step needs is in the repo, so clearing loses nothing.

A conversation holding only a greeting or a short question is fine — proceed.

## 1. Ground yourself on a current main

Start every run from `main`, not wherever the last one left you:

```
git checkout main
git pull
git status -sb
git log --oneline -3
```

Confirm `git status -sb` reads "On branch main" and up to date with
`origin/main`. If `git checkout main` refuses because of uncommitted changes,
**stop and report** — a previous step wasn't finished, and that must be resolved
before a new one starts. An architect's commits are invisible to a local
checkout until you pull.

## 2. Baseline

```
npm run verify
```

Must print `SUITE GREEN` and `AUDIT CLEAN`. If it does not, **stop and report** —
you have inherited a problem, and anything built on it will be blamed on you.
(If `verify` is reported missing, you are not on `main` — return to step 1.)

## 2b. First: a PR the architect sent back?

Before choosing new work, check whether the architect sent a PR back:

```
gh pr list --state open --json number,title,reviewDecision,mergeable
```

A PR needs fixing if EITHER its `reviewDecision` is `CHANGES_REQUESTED` and the
newest changes-requested review is newer than the PR's newest commit
(`gh pr view <n> --json reviews,commits` — if the newest commit is newer, it was
already fixed and is waiting for re-review), OR its `mergeable` is `CONFLICTING`.

If one qualifies, the lowest-numbered one is today's work instead of a new step:
read the review and every inline comment (`gh pr view <n> --comments`), state
what you will change, and skip steps 3–4. If the request leaves a design choice
open, that is Class B — step 5 applies. Otherwise go to step 6 and end with:

> Ready to fix **PR #<n>** as the architect asked. Type `/continue` to apply it.

## 3. Select the next runnable step — do NOT guess

Read `docs/dispatch-queue.md`. The next runnable step is the first one in queue
order that is ALL of:

- **DISPATCH lane, design settled** — its `session-status.md` section reads as an
  execution-ready spec, not an open question;
- **not flagged** HOLD, RECONCILE, or "needs an architect-written prompt";
- **not in the "Planned" section** — that surface is architect-gated and never
  auto-startable;
- **dependencies satisfied** — if a step says "must not run concurrently with X",
  "merge X first" or "starts only after X is merged," confirm X is already on
  `origin/main` before choosing it;
- **not already in flight or done** — no open or merged PR whose title contains
  `(<step-id>)`, the exact id: `(26a)` is not `(26a-ii)`. Check with
  `gh pr list --state open --json number,title` and
  `gh pr list --state merged --search "<step-id> in:title" --json number,title`.
  Open means built and waiting for review; merged means done, even if the queue
  has not been marked CLOSED yet — say so in the announcement. Starting either
  again duplicates the whole build. A PR closed *without* merging does not
  count: that step was abandoned and may be reissued;
- **not parked** — no open `needs-architect` issue naming this exact step (title
  contains `Step <step-id>` followed by a space). Check with
  `gh issue list --state open --label needs-architect --json number,title`;
- **not deferred** — anything marked "after soft launch", "not before soft
  launch" or otherwise not yet due is skipped exactly like HOLD;
- **no file overlap with an open PR** — compare the step's `Touches:` line in
  `dispatch-queue.md` with the changed files of every open PR
  (`gh pr diff <n> --name-only`). Any shared file means the step waits behind
  that PR. **One migration in flight at a time:** a step that changes the schema
  always overlaps an open PR that touches `server/db/migrate.js` or
  `server/db/schema.sql`. If the step has no `Touches:` line, derive its file
  list from the spec before planning, and check again once the plan in step 6
  is known — if the plan overlaps, stop and name the PR it waits behind.

Announce, in a few lines: the step you chose, one line on why, and one line each
on any earlier steps you skipped and why (held, planned, blocked, in flight,
parked, deferred, or waiting behind PR #n). If NO step is
runnable, say so plainly and **stop** — do not invent one, and never start a
Planned or flagged step to have something to do.

## 4. Read the spec and check it against the code

- Read the chosen step's own section in `docs/session-status.md` (the spec), plus
  `docs/decision-authority.md`, `docs/engineer-role.md`,
  `docs/rules-for-claude-code.md`.
- Check the step's stated prerequisites against the **actual code** (grep the
  write path), not against the step text.

## 5. If checking the spec surfaces a Class B question — escalate, do NOT ask the dispatcher

If the spec does not fully settle the step — a gap you would have to fill with a
design choice, or anything Class B (operator-visible, changes a
balance/variance/yield number, a new column or constraint, anything in "Things
NOT to re-litigate") — then the step is **not design-settled after all.** Do NOT
proceed to the checkpoint, and do NOT present the dispatcher a menu, a choice, or
a "recommended" option: the dispatcher cannot resolve a Class B question, and a
recommendation is exactly what a hurried person treats as permission.

Instead, open an issue and stop:

```
gh issue create --template needs-architect.md
```

State **both readings evenly with NO recommendation**, name what is undecided and
what you did not change, then STOP. Resolving it is the architect's, through the
issue → `session-status.md` → re-dispatch. (This is `/step` phase 7, applied at
planning time.)

## 6. Otherwise, state the plan and stop for the checkpoint

If the spec fully settles the step, state the plan briefly: which files change,
the approach, and what you are explicitly NOT touching. Then do NOT implement, and
end with exactly:

> Ready to implement **<step>**. Type `/continue` to build it. If this isn't the
> step you meant, tell me instead.

Verify, don't assert — paste real output, never a description of it.
