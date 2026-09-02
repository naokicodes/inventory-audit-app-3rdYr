---
description: Read-only health check — pull, run the suite and audit, report state.
---

Report the true current state of this repo. **Change nothing.** No edits,
no commits, no branches. If you find a problem, describe it and stop.

## Run

```
git pull
git status -sb
git log --oneline -5
npm run verify
```

## Report

Paste the raw output, then summarise in a few lines:

- **Commit** — the HEAD hash and subject, and whether `git status -sb`
  reads clean and up to date with `origin/main`
- **Suite** — file count and aggregate assertions, or which files failed
- **Audit** — clean, or which tables and columns were flagged
- **Queue** — the next entry in `docs/dispatch-queue.md`, and whether
  `docs/session-status.md` agrees with it
- **Open flags** — `gh issue list --label needs-architect`
- **Drift** — anything where a doc claims something the repo contradicts

That last line is the point of this command. On 2026-09-03 a private
notes file still listed a step as "next" that had landed two commits
earlier, and listed three tables as having no writer when one of them had
gained a write path in that very step. Docs drift faster than code.

If everything agrees, say so plainly and stop. A short green report is the
expected outcome most of the time.
