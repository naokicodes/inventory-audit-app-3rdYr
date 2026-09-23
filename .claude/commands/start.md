---
description: Begin the next runnable step from the queue — ground on main, select, plan, then pause for /continue.
---

Pick up the next runnable step from the queue and take it up to the point of
implementation, then stop for a checkpoint. **Do NOT write code in this
command** — that is `/continue`.

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

## 3. Select the next runnable step — do NOT guess

Read `docs/dispatch-queue.md`. The next runnable step is the first one in queue
order that is ALL of:

- **DISPATCH lane, design settled** — its `session-status.md` section reads as an
  execution-ready spec, not an open question;
- **not flagged** HOLD, RECONCILE, or "needs an architect-written prompt";
- **not in the "Planned" section** — that surface is architect-gated and never
  auto-startable;
- **dependencies satisfied** — if a step says "must not run concurrently with X"
  or "merge X first," confirm X is already on `origin/main` before choosing it.

Announce, in a few lines: the step you chose, one line on why, and one line each
on any earlier steps you skipped and why (held, planned, blocked). If NO step is
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
