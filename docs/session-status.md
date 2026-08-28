# Session Status — read this first after token reset

Last updated: 2026-08-28 (architecture review). This is the authoritative
"where we left off" doc. **Read this before `HANDOFF.md`** — HANDOFF.md is a
point-in-time snapshot written at the end of the step-6 session and is now
one step stale (it still says "step 7 is next and last for this phase,"
which was true when it was written but no longer reflects the full plan —
see "Steps 8-9 added" below). This file is the one that gets updated every
session going forward; treat it as current truth, HANDOFF.md as historical
context only.

## Where things stand: step 6 done, step 7 is next

- **Step 1-3** (schema, audit engine, commissary yield engine core):
  done, tested, unchanged in a while.
- **Step 4** (Stock Receipts page + route): done.
- **Step 5** (Commissary page + route): done, balance formula verified
  against the real xlsx (22/22 tests green with real fixture numbers).
- **Step 6** (activity log wiring): done. `server/db/activityLog.js`
  provides `withTransaction`/`logActivity`, used by both `stockReceipts.js`
  and `commissary.js`'s `POST`/`PATCH`/`DELETE`. Both HTML pages got inline
  Edit/Delete per row plus a persisted "actor" name field. 37/37 tests
  green total. See `docs/changelog.md`'s 2026-08-28 entries for full detail.

**Next up is step 7**: Admin History tab — reverse-chronological feed
reading `activity_log`, filterable by entity type/date/actor, with a
before→after diff per row. Purely a read on data step 6 is now producing;
no new write paths, so it's naturally the safest step to build next. See
`docs/commissary-and-stock-receipts.md` Part 3.

## Steps 8-9 added (2026-08-28 architecture review)

Between step-6's handoff and this update, an architecture review surfaced
two gaps that were already flagged in the docs but not yet scheduled as
their own steps. Both are now **resolved decisions**, written into
`docs/data-model.md` and `docs/commissary-and-stock-receipts.md` — the
docs are the source of truth for *what* to build; this entry just tracks
*when*.

**Step 8 — Commissary meat mapping admin screen.**
`commissary_meat_map` currently has no UI at all; the only way to create a
mapping row is a developer writing SQL directly. This blocks Restaurant
B/C onboarding and is why `stock_receipts`' "not mapped yet — set this up
in Settings" message currently points at a screen that doesn't exist. Add
a "Commissary Mapping" tab to `settings.html` (same pattern as the
existing Meats/Dishes/Recipes tabs) + a route in `settings.js`. No
activity-log wiring needed (out of rule 9's scope — this is config data,
not a daily transactional log). See `commissary-and-stock-receipts.md`
Part 1 and `data-model.md` section 10a for the full spec.

**Step 9 — Unallocated-destination support for stock_receipts.**
The real xlsx's `Outbound_Log` allows a commissary shipment with no
restaurant assigned yet; the schema couldn't represent this
(`restaurant_id NOT NULL`), which is a real, test-proven gap (see
`commissaryYieldEngine.test.js`'s Belly Slab balance test: 19.8 vs. the
sheet's real 14.8, entirely due to one un-representable row). Resolved by
making `restaurant_id`/`meat_id` nullable on `stock_receipts`, plus a new
`PATCH`-based "assign to restaurant" flow for a previously-unallocated row
(logged as a normal `UPDATE`, reusing step 6's existing machinery). Needs
a schema change, a route change, and a small UI change to
`stock-receipts.html` (an "assign later" option + a way to find/assign
unassigned rows). Full spec in `commissary-and-stock-receipts.md` Part 2
and `data-model.md` section 5.

**Do step 8 before step 9** — step 9's assignment flow depends on
`commissary_meat_map` being reachable/manageable in the UI in the first
place (right now that only exists via hand-written SQL), so building step 9
first would mean testing it against data nobody but a developer can create.

## Known open items (not the next step's problem, just not forgotten)

- **`npm run dev` has still never been run live** across steps 4, 5, or
  6 — every sandbox session so far has had no network access, so
  verification has been `node --check` + real test suites + standalone
  scripts hitting the actual route logic against `node:sqlite` directly.
  Do a real click-through (Stock Receipts AND Commissary pages,
  including the Edit/Delete flows) before or during step 7.
- **Opening stock bug** (older, still unfixed): a meat/dish with no
  prior tracking has `beginning` null forever. Fix: make the Beginning
  cell editable only on a row's first-ever appearance, write once to
  `opening_stock`.
- **Live recalculation** (older, still unfixed): Ending(calc)/Over-Short
  only update after a full save+reload, not live in the browser.
- Restaurant B/C still aren't seeded — Restaurant A only. Step 8's admin
  screen removes the main blocker to onboarding them (mapping); they'll
  still need their own `meats`/`dishes`/`recipe_bom` seeded via Settings.

## Original remaining scope (renumbered — steps 10-12, was 8-10)

10. Rebuild Landing as ONE mixed grid (meats + prepared dishes together,
    per the real "Silingan Landing Inventory" paper workflow — NOT
    meats-only), with the opening-stock fix and live recalc built in from
    the start. Vocabulary: the real term is "Over/Short", not "variance"
    (keep "variance" as the internal/technical term in code and docs).
11. Sales tab: monthly grid (rows = dishes, columns = Day 1..last day),
    editable with a confirm prompt on manual override, plus the
    BATCH_PREPPED over-sold validation warning (sold qty should never
    exceed available prepped portions — WARNING via the command panel,
    not a hard block).
12. Command panel (cross-cutting, appears on any tab) — first planned
    command: "Sync batch stock" (copy sales into prepped for
    BATCH_PREPPED dishes with no manual entry yet, logged as a SYSTEM
    `activity_log` entry).

## Things NOT to re-litigate (already decided, stable)

- Tech stack: Node.js + Express + `node:sqlite` (not better-sqlite3, not
  Postgres) — see `changelog.md` for why.
- Single local machine, one SQLite file, no hosting/multi-user — see
  `scope.md`.
- Docs-first workflow: update the relevant `docs/*.md` file whenever a
  real decision changes, before or alongside the code. Architecture
  decisions (schema/design changes, not implementation details) are made
  between sessions, in the docs — not decided unilaterally mid-session by
  whichever Claude Code instance happens to be running. If a session hits
  a genuine ambiguity the docs don't resolve, it should flag it and stop,
  the same way `rules-for-claude-code.md` rule 3 already asks for.
- Testing approach: build and test in the sandbox environment first
  (real code paths, real database, hand-verified numbers) before
  handing files over — `npm run dev` access has been unreliable
  (no network in these sandboxes), so this is the actual verification
  bar, not a fallback.
- Stock receipts are unified across restaurants (one log, restaurant
  column, nullable as of 2026-08-28 for the unallocated case) rather than
  per-restaurant New Stock screens.
- Activity logging via before/after snapshots + soft deletes, not hard
  locks. Scoped to `stock_receipts` and `commissary_yield_log` only —
  `commissary_meat_map` (step 8) is deliberately excluded, being config
  data rather than a daily transactional log.
- "Landing" mixes meats + prepared dishes as rows; Prep is not a
  separate tab (confirmed via the real paper workflow, "Silingan
  Landing Inventory").

## End-of-session checklist (every session, no exceptions)

Since each Claude Code session starts with zero memory of prior
conversations and relies entirely on `docs/` for continuity, every session
— whether or not the step it was working on is fully finished — should,
before ending:

1. Update `docs/changelog.md` with a dated entry (what shipped, what's
   deliberately not built yet, how it was verified).
2. Update **this file** (`session-status.md`) — even a one-line "step 8 is
   half done, X works, Y doesn't yet" beats leaving it saying the prior
   step is current.
3. Leave `HANDOFF.md` alone unless explicitly asked to refresh it — it's
   now a secondary/historical doc, not the one future sessions should
   trust first.
