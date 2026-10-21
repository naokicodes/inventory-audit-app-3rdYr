> **ARCHIVED 2026-10-20 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/`. Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - §1 state and queue are stale.
> - §3 decisions (26a, 26a-ii, 26a-iii, on-site practice) still stand.
> - The dispatcher routine was later replaced by the autopilot plan (10-05).

# Architecture Handoff — 2026-09-24

Paste this alongside `architect-notes-PRIVATE.md` and
`architecture-decisions-DRAFT-2026-09-24.md` at the start of a new architect
conversation. **Where this contradicts `architect-notes-PRIVATE.md`, this wins.**
That file's queue and "where things stand" sections are stale.

**Treat this as a lead, not a source.** Verified against `origin/main` at
`769a110` (PR #8 merged), plus the doc push that follows this handoff. Clone,
run `npm run verify`, and re-check before building on anything here.

---

## 1. State of main

- **Suite:** 17 files, 396/396 green, audit clean.
- **Merged since the 2026-09-15 handoff:** 25d-ii (PR #5), 26a (PR #7), 26a-ii
  (PR #8, with review fixes `eb49d30`).
- **Runnable now:** 26a-iii and ui-viewport, which are parallel-safe.
- **Not runnable:** 25a (spec stale — see §4), 24b-v (needs an architect prompt),
  25d (HOLD — superseded by the users table), 25e (after soft launch).
- **Planned but unspecified:** roles/users, sheets, sides, PO,
  finalization, backups, indexes, `busy_timeout`, CSV export, mobile layout.

## 2. The workflow changed — read `docs/workflow-guide.md`, "The daily rhythm"

- **Morning (Naoki):**
  - `/review <n>` in a fresh Claude Code session.
  - Read the summary, then answer **merge**, **request changes**, or **leave it**.
  - `/review` merges only on that answer. It refuses a `public/` PR that has no
    `Click-through:` comment.
  - On merge, it marks the step CLOSED in the queue.
- **Later (Marble):**
  - `git checkout main`, then `git pull`, then `claude`.
  - `/start`, read what it picked, then `/continue`. After the PR is open, run
    `/clear`, then `/start` again. Stop when nothing is runnable.
  - `/start` first offers any PR sent back with a formal **Request changes**
    review. A plain PR comment is not picked up.
  - He then clicks through `public/` PRs and comments `Click-through: ...`.
- **Parallel safety:**
  - Every PR branches from `main`; PRs are never stacked.
  - A step is skipped while it has an open or merged PR, an open
    `needs-architect` issue, an unmerged dependency, or files overlapping an
    open PR (its `Touches:` line).
  - Only one migration is in flight at a time.
- **Architect duty:** every runnable queue step needs a `Touches:` line. PR
  titles carry the step id in parentheses, e.g. `fix(26a-iii): ...`.
- **`scripts/run-queue.ps1` is not in use.** It was tried on 2026-09-24. It
  runs silently, which looked frozen to Marble, so it was too complex for a
  beginner. It stays in the repo for later; the slash commands are the routine.

## 3. Decisions reached 2026-09-23/24 — do not re-litigate

**On-site practice (NaokiiVT):**
- **Governing principle:** the app replaces the papers and does the same job,
  but it **assists the workflow, it is not the workflow**. Tags that help people
  read a number are welcome; enforcing process is not.
- **"Shrinkage"** in restaurant vocabulary means the commissary back-up (yield)
  loss. Unexplained loss is "variance".
- **Month-end count** of every meat is mandatory. On the first day(s) of a
  month, required meats are recounted and the rest are copied.
- **Allocation reports** are dated on the count day that showed the shortage.
- **Frozen-meat weighing leeway** (500 g – 1 kg) is the users' judgment, never
  an app rule.

**26a:**
- **Carry-forward:** a missed day's beginning is carried from the previous
  calculated ending. The carry is a field, not a status: `status` stays
  OK/SHORTAGE/SURPLUS.
- **Adjustments** are summed over the whole covered window, so a backdated
  explanation never vanishes.
- **Recount difference, option A:** a declared opening's difference from the
  prior chain is folded into that day's Over/Short and tagged. The old month is
  never reopened.
- **Tags** go on the number: `(N days)`, `incl. X recount difference`, and
  `(carried)` on Beginning.

**26a-ii:**
- **Month-start block:** the only hard block in the app.
- **Must-count:** a meat must be recounted if it has the admin's "Recount at
  month start" flag, if its last ending was not a real count, or if it's new.
- **Copy:** everything else is copied. A recount is dated the day it happens,
  and any opening in the month unblocks the whole month.
- **Enforcement:** the server enforces the block, refusing only rows that carry
  a count.
- **Panel:** on the landing and commissary pages, with no new page.

**26a-iii:**
- **Recount is an act:** it's an upsert. A recount on the same date updates the
  opening and stamps RECOUNT; on another date it inserts a new opening.
- **Correct stays separate:** it keeps the source. Copy all first, then recount
  in any order.

**Go-live and beta:**
- After the wipe, declare month-1 openings, including for the friends beta on
  sample data.
- No backfill.

## 4. Open — carry these forward

- **The architecture draft (`architecture-decisions-DRAFT-2026-09-24.md`)** is
  still a draft. Nothing in it is a queue step yet. When confirmed, it drives:
  - the users table (first);
  - the 25a rewrite, since the intake weigh-in is cancelled and 25a becomes
    quantity-only (a warning is on 25a in the queue);
  - 25d replaced by forward-clean `user_id` authorship;
  - the sheets overlay;
  - the PO model.
- **Mobile layout step:**
  - The draft's Review card mockup predates 26a/26a-ii. The card must carry the
    tags (`(carried)`, `(N days)`, the recount difference) and the blocked
    "needs month opening" state.
  - The Month opening panel must work on a phone, because beta testers hit it on
    day 1.
  - ui-viewport's click-through findings are this step's input.
- **Small parallel candidates** that still need a spec:
  - `busy_timeout` (touches `connection.js`);
  - the snapshot backup script (`scripts/`);
  - a `session-status.md` archive pass (it's past 1,300 lines, which costs
    tokens on every step).
- **Definition-of-done** is still Naoki's to draft.
- **Marble's web-project file** still describes the `/start` → `/continue` loop,
  and should be updated to the runner.

## 5. Lessons from these two days

- **Split big steps.** 26a ran at about 3× the usual tokens. Part of that was
  real scope; part was an uncleared context. The runner removes the second
  cause; the first is on the architect.
- **Context lives in the repo, not the chat.** A second architect conversation
  correctly distrusted `fe27921`, because no handoff mentioned it. End each
  architect conversation with a handoff like this one.
- **Resolving a Class B issue surfaced two real holes** that weren't asked
  about: backdated adjustments vanishing, and the month-boundary gap vanishing.
  Read the spec against the code, not just the question.
