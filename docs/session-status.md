# Session Status — read this first after token reset

Last updated: 2026-08-28 (post step-9 completion + roadmap re-split).
This is the authoritative "where we left off" doc. `HANDOFF.md` was
deleted this session (see `changelog.md`) — it had drifted stale and was
actively misleading; this file is now the only "where we left off" doc,
so always start here.

## Where things stand: steps 1–9 done and committed.

- **Steps 1–6**: done, committed, unchanged in a while (schema, audit
  engine, commissary yield engine, Stock Receipts page, Commissary page,
  activity log wiring). See `docs/changelog.md` for detail on each.
- **Step 7** (Admin History tab): done, committed, verified live against
  real data. `server/routes/history.js` + `public/history.html` exist and
  are mounted.
- **Step 8** (Commissary meat mapping admin screen): done, committed.
  `settings.html` has a "Commissary Mapping" tab; `settings.js` has
  `GET`/`POST`/`DELETE /api/settings/commissary-mappings`; covered by
  `server/routes/settings.test.js`.
- **Step 9** (Unallocated-receipts support): done, committed. Rebuilt
  from `docs/data-model.md` section 5 and
  `docs/commissary-and-stock-receipts.md` Part 2 after an earlier attempt
  was lost to a usage cutoff before it could commit (see `changelog.md`'s
  two 2026-08-28 entries — one documents the loss, the other the
  successful rebuild). This incident is also why the roadmap below was
  re-split into smaller steps — see rule 16 in `rules-for-claude-code.md`.
  - `schema.sql`/`migrate.js`: `stock_receipts.restaurant_id`/`meat_id`
    nullable, CHECK constraint, idempotent migration for pre-existing
    local databases.
  - `stockReceipts.js`: `POST` accepts an Unallocated COMMISSARY receipt
    (client supplies `commissary_meat_id` directly since there's no
    restaurant+meat pair yet to map through); `GET` uses `LEFT JOIN` so
    Unallocated rows aren't hidden, plus `?unallocated=true`; `PATCH`
    gains one-time assignment of `restaurant_id`+`meat_id`, enforcing the
    `commissary_meat_id` continuity check.
  - `stock-receipts.html`: "Leave Unassigned" toggle on the add form, an
    "Unallocated" badge + Assign action per row, an "Unallocated only"
    filter.
  - Tests: 72/72 total (55 pre-existing + 17 new), plus live HTTP
    verification against the actual running server (the first time this
    route file has ever been exercised that way) and a payload-shape
    replay confirming the new frontend and backend actually agree.
  - `commissaryYieldEngine.test.js`'s Belly Slab test now asserts the
    real 14.8 balance (was 19.8, a documented gap) — closed automatically
    once the Unallocated row became representable, no engine code change
    needed.

**Next up is step 10** — see the roadmap below. It's the first of several
small steps that used to be one big "step 10" before the 2026-08-28
re-split.

## WIP hand-offs are now allowed (experimental — see rule 17)

Until 2026-08-28 the implicit policy was "land a whole tested step or
land nothing," which is exactly what turned step 9's usage cutoff into a
**total** loss instead of partial progress that the next session could
pick up. That's now flipped: **a partial, honestly-labeled commit is
better than no commit**, provided it follows rule 17 in
`rules-for-claude-code.md` — `wip:`-prefixed commit message, nothing
previously-working left broken, full existing test suite still green,
and a precise status update here.

This is marked experimental on purpose — it's a real change from how
step 9 was handled, it hasn't been tested across many sessions yet, and
it should be revisited (tightened or dropped) if broken hand-offs start
costing more time than they save.

**Status legend used below and in the "Where things stand" list**:
- **Not started** — no code exists for this step yet.
- **WIP** — some code exists, doesn't fully satisfy the step yet; the
  step's own list entry says exactly what's done, what's not, and what's
  untested. Read that before touching anything.
- **Done** — implemented, tested, committed, matches its own step text.

**If you're the session that picks up a WIP step**: read its done/not
done/untested breakdown below, verify the existing test suite still
passes at the current commit (rule 17 requires it did when committed,
but confirm), then continue from there — don't re-plan the step or
second-guess decisions already made, per rule 3.

## Known open items (not the next step's problem, just not forgotten)

- **A real click-through in an actual browser is still owed** for Stock
  Receipts' Unallocated/Assign flow specifically — the 2026-08-28 session
  had no browser available (no puppeteer/playwright, and the download
  host for one isn't in the sandbox's network allowlist), so it verified
  via live HTTP payload replay instead (see `changelog.md`). Strong
  verification, but not the same as clicking it. Commissary's own
  Edit/Delete UI flows are in the same boat — never fully click-tested.
- **Opening stock bug** (older, still unfixed): a meat/dish with no prior
  tracking has `beginning` null forever. This is step 12 below.
- **Live recalculation** (older, still unfixed): Ending(calc)/Over-Short
  only update after a full save+reload, not live in the browser. This is
  step 13 below.
- Restaurant B/C still aren't seeded — Restaurant A only. Step 8's admin
  screen removes the main blocker to onboarding them (mapping is now
  reachable in the UI); they'll still need their own
  `meats`/`dishes`/`recipe_bom` seeded via Settings. A verified
  `seed-data-B.json` (from `FC_MasterAudit.xlsx`, Restaurant B's real
  workbook) is expected to be prepared separately, outside a coding
  session — check with the project owner before assuming it's ready.

## Remaining scope (steps 10–19)

Re-split on 2026-08-28 from the old 3-item "steps 10–12" list, per rule
16 in `rules-for-claude-code.md`. Two things changed from how this list
used to work, both worth reading before starting any step below:

1. **Each step's own text is the whole task, not a pointer to a design
   doc.** Step 9 had a fully-written spec across two docs and still took
   a session to a total loss before it landed — a complete blueprint
   doesn't make "build the whole feature" the right size for one
   session. Where a step below references a doc, that's background, not
   the assignment; the assignment is the sentence describing the step.
2. **A step doesn't have to fully succeed to be worth committing** — see
   "WIP hand-offs" above. Each step below is still sized to comfortably
   fit one session with margin, same as before; WIP is the fallback for
   when that estimate is wrong, not the new target.

Status tags below: **Not started** (default for everything not yet
begun), **WIP**, **Done**. Only step 10 onward is listed here — steps
1–9 are already covered in "Where things stand" above.

Notice the command panel (old step 12) moved earlier, to before Sales —
Sales' over-sold warning (step 18 below) needs somewhere to surface
through, so building the command panel after it would've meant either
building Sales twice or quietly growing step 11 back into a multi-part
step. Sequencing steps so each one's dependencies already exist is part
of sizing them correctly, not a separate concern.

10. **[Not started] Landing backend: unify the read endpoint into one
    mixed grid.**
    Rework/extend the audit engine's Landing-read endpoint to return one
    array of rows — meats and prepared dishes together, each tagged with
    its type — instead of separate meats-only data. No UI changes yet.
    Backend + tests only. Per the real "Silingan Landing Inventory" paper
    workflow (not meats-only) — see `daily-workflow.md` for background,
    not as extra scope to also implement.
11. **[Not started] Landing frontend: render the mixed grid.** Build the
    actual Landing page UI on top of step 10's endpoint — meats and
    dishes as rows in one grid, matching the paper layout. Still using
    the existing full save-and-reload flow (no live recalc yet — that's
    step 13). Vocabulary: the real term is "Over/Short," not "variance"
    (keep "variance" as the internal/technical term in code and docs).
12. **[Not started] Opening-stock fix.** A meat/dish with no prior
    tracking currently has `beginning` null forever. Make the Beginning
    cell editable only on a row's first-ever appearance, writing once to
    `opening_stock`. Backend + the minimal frontend change to make that
    cell editable — doesn't touch the rest of Landing.
13. **[Not started] Live recalculation on Landing.** Ending(calc)/
    Over-Short update live in the browser as New Stock/Usage/Actual
    change, instead of only after a full save+reload. Frontend-only,
    built on top of steps 10–12 once they're stable.
14. **[Not started] Command panel scaffold.** A UI element that can
    appear on any tab, with a small pluggable command registry — no real
    commands yet beyond a no-op proving the plumbing works end to end
    (registers, appears, runs, logs nothing meaningful). This exists on
    its own so step 18 (the over-sold warning) has something to plug
    into without needing to build panel infrastructure and a Sales
    feature in the same sitting.
15. **[Not started] First real command: "Sync batch stock."** Copies
    sales into `prepped` for BATCH_PREPPED dishes with no manual entry
    yet, logged as a SYSTEM `activity_log` entry. Exercises the step-14
    scaffold with a real, useful command before Sales needs it.
16. **[Not started] Sales backend.** CRUD for manual sales entry shaped
    for a monthly grid — `GET` a month's matrix for a restaurant/dish
    set, `PATCH` a single day's cell. Backend + tests only.
17. **[Not started] Sales frontend.** The monthly grid UI (rows =
    dishes, columns = Day 1..last day) on top of step 16, editable with
    a confirm prompt on manual override.
18. **[Not started] BATCH_PREPPED over-sold warning.** Sold quantity
    should never exceed available prepped portions for a BATCH_PREPPED
    dish — surface this as a WARNING through the step 14/15 command
    panel, not a hard block. Small and self-contained now that steps
    14–17 exist under it.
19. **[Not started] Restaurant B onboarding** (once `seed-data-B.json`
    is confirmed ready by the project owner — see "Known open items"
    above): seed `meats`/`dishes`/`recipe_bom` for Restaurant B via the
    Settings screens step 8 already built. No new code expected — this
    is a data/verification step, not a feature step; worth keeping as
    its own numbered item anyway so it isn't silently skipped or bundled
    into something else.

## Things NOT to re-litigate (already decided, stable)

- Tech stack: Node.js + Express + `node:sqlite` (not better-sqlite3, not
  Postgres) — see `changelog.md` for why.
- Single local machine, one SQLite file, no hosting/multi-user — see
  `scope.md`.
- Docs-first workflow: update the relevant `docs/*.md` file whenever a
  real decision changes, before or alongside the code. Architecture
  decisions are made between sessions, in the docs — not decided
  unilaterally mid-session. If a session hits a genuine ambiguity the
  docs don't resolve, it should flag it and stop, per rule 3.
- Testing approach: build and test in the sandbox environment first (real
  code paths, real database, hand-verified numbers) before handing files
  over. As of the step-9 session, this sandbox has had working npm
  registry access, so "build and test" can mean a real `npm install` +
  live Express server + live HTTP requests, not just hand-mirrored SQL —
  worth doing whenever the sandbox allows it, not just schema-level
  tests.
- Stock receipts are unified across restaurants (one log, restaurant
  column) rather than per-restaurant New Stock screens; `restaurant_id`
  is nullable as of step 9, per `data-model.md` section 5.
- Activity logging via before/after snapshots + soft deletes, not hard
  locks. Scoped to `stock_receipts` and `commissary_yield_log` only —
  `commissary_meat_map` is deliberately excluded, being config data
  rather than a daily transactional log.
- "Landing" mixes meats + prepared dishes as rows; Prep is not a separate
  tab (confirmed via the real paper workflow, "Silingan Landing
  Inventory").
- The repo is public (no secrets committed — `.env`, `*.db`, and
  `/uploads/` are gitignored and always have been). This was a deliberate
  choice to simplify tooling access; it doesn't change any of the above.

## End-of-session checklist (every session, no exceptions)

Since each session starts with zero memory of prior conversations and
relies entirely on `docs/` for continuity, every session — whether or not
the step it was working on is fully finished — should, before ending:

1. Update `docs/changelog.md` with a dated entry (what shipped, what's
   deliberately not built yet, how it was verified).
2. Update **this file** — change the step's status tag and, if it's not
   **Done**, replace the step's one-line description with a precise
   done/not done/untested breakdown. Something like:

   > 12. **[WIP] Opening-stock fix.** Done: the `opening_stock` write
   > path and its test. Not done: the Beginning cell isn't wired to be
   > conditionally editable in `daily-audit.html` yet — still always
   > editable. Untested: haven't confirmed the write path against a
   > real multi-day sequence, only a single day in isolation.

   This is the difference between step 9's total loss and a WIP hand-off
   actually being useful — vague ("still in progress") forces the next
   session to re-derive what happened by reading the diff; precise lets
   it just continue.
3. If the step isn't fully done, commit it anyway per rule 17 (`wip:`
   prefix, nothing previously-working left broken, full test suite still
   green) rather than leaving it uncommitted. Per rule 16, still prefer
   not needing this at all — a step running long is a signal to stop at
   the nearest clean boundary, not to power through the original scope.
4. There is no `HANDOFF.md` — it was deleted 2026-08-28. Don't create a
   new parallel "handoff" doc; extend this file instead, so there's never
   again a second doc that can silently drift out of sync with the real
   one.
