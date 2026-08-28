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
16 in `rules-for-claude-code.md` — each item below is meant to be
comfortably doable, tested, documented, and **committed** within one
focused session, including a session that gets cut off by a usage limit
partway through the *next* step rather than this one. A step that turns
out bigger than it looked should still stop and commit at its own clean
boundary rather than pushing into the next item's scope.

Notice the command panel (old step 12) moved earlier, to before Sales —
Sales' over-sold warning (step 18 below) needs somewhere to surface
through, so building the command panel after it would've meant either
building Sales twice or quietly growing step 11 back into a multi-part
step. Sequencing steps so each one's dependencies already exist is part
of sizing them correctly, not a separate concern.

10. **Landing backend: unify the read endpoint into one mixed grid.**
    Rework/extend the audit engine's Landing-read endpoint to return one
    array of rows — meats and prepared dishes together, each tagged with
    its type — instead of separate meats-only data. No UI changes yet.
    Backend + tests only. Per the real "Silingan Landing Inventory" paper
    workflow (not meats-only) — see `daily-workflow.md`.
11. **Landing frontend: render the mixed grid.** Build the actual
    Landing page UI on top of step 10's endpoint — meats and dishes as
    rows in one grid, matching the paper layout. Still using the
    existing full save-and-reload flow (no live recalc yet — that's step
    13). Vocabulary: the real term is "Over/Short," not "variance" (keep
    "variance" as the internal/technical term in code and docs).
12. **Opening-stock fix.** A meat/dish with no prior tracking currently
    has `beginning` null forever. Make the Beginning cell editable only
    on a row's first-ever appearance, writing once to `opening_stock`.
    Backend + the minimal frontend change to make that cell editable —
    doesn't touch the rest of Landing.
13. **Live recalculation on Landing.** Ending(calc)/Over-Short update
    live in the browser as New Stock/Usage/Actual change, instead of
    only after a full save+reload. Frontend-only, built on top of steps
    10–12 once they're stable.
14. **Command panel scaffold.** A UI element that can appear on any tab,
    with a small pluggable command registry — no real commands yet
    beyond a no-op proving the plumbing works end to end (registers,
    appears, runs, logs nothing meaningful). This exists on its own so
    step 18 (the over-sold warning) has something to plug into without
    needing to build panel infrastructure and a Sales feature in the
    same sitting.
15. **First real command: "Sync batch stock."** Copies sales into
    `prepped` for BATCH_PREPPED dishes with no manual entry yet, logged
    as a SYSTEM `activity_log` entry. Exercises the step-14 scaffold
    with a real, useful command before Sales needs it.
16. **Sales backend.** CRUD for manual sales entry shaped for a monthly
    grid — `GET` a month's matrix for a restaurant/dish set, `PATCH` a
    single day's cell. Backend + tests only.
17. **Sales frontend.** The monthly grid UI (rows = dishes, columns =
    Day 1..last day) on top of step 16, editable with a confirm prompt
    on manual override.
18. **BATCH_PREPPED over-sold warning.** Sold quantity should never
    exceed available prepped portions for a BATCH_PREPPED dish — surface
    this as a WARNING through the step 14/15 command panel, not a hard
    block. Small and self-contained now that steps 14–17 exist under it.
19. **Restaurant B onboarding** (once `seed-data-B.json` is confirmed
    ready by the project owner — see "Known open items" above): seed
    `meats`/`dishes`/`recipe_bom` for Restaurant B via the Settings
    screens step 8 already built. No new code expected — this is a data
    / verification step, not a feature step; worth keeping as its own
    numbered item anyway so it isn't silently skipped or bundled into
    something else.

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
2. Update **this file** (`session-status.md`) — even a one-line "step 10
   is half done, X works, Y doesn't yet" beats leaving it saying the
   prior step is current. **This step was skipped once already** (the
   step-9 loss) — do this even if you're cut off mid-task; commit
   whatever code exists plus an honest status note, rather than losing
   the whole session's work silently.
3. Per rule 16, prefer not needing step 2 to say "half done" at all —
   if a step is running long, stop and commit at the nearest clean
   boundary instead of pushing to finish the original scope in one
   sitting.
4. There is no `HANDOFF.md` to leave alone anymore — it was deleted
   2026-08-28. If a future session is tempted to create a new
   parallel "handoff" doc, don't — extend this file instead, so there's
   never again a second doc that can silently drift out of sync with the
   real one.
