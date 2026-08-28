# Session Status — read this first after token reset

Last updated: 2026-08-28 (post step-8, step-9 recovery note). This is the
authoritative "where we left off" doc. **Read this before `HANDOFF.md`** —
`HANDOFF.md` is a snapshot from the end of the step-6 session and doesn't
know steps 7 or 8 shipped; leave it alone per rule 7 unless explicitly
asked to refresh it.

## Where things stand: steps 1–8 done and committed. Step 9 was attempted and lost — redo from spec.

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

### Step 9 — attempted, not committed, work is gone. Start over from the doc spec, not from memory of a prior attempt.

A session worked through step 9 (Unallocated-receipts support) in full —
planned it, edited `schema.sql`, wrote a migration helper, updated
`stockReceipts.js`'s POST/GET/PATCH, added `stockReceipts.test.js`
(18/18 green), updated `commissaryYieldEngine.test.js`'s Belly Slab test
to assert the real 14.8 instead of the documented 19.8 gap, and was
partway through `stock-receipts.html`'s UI — then hit its usage limit
before committing or writing an end-of-session doc update. **None of that
code exists in the repo**, confirmed directly against the live GitHub repo
on 2026-08-28: `schema.sql`'s `stock_receipts.restaurant_id` is still
`NOT NULL`, and neither `server/routes/stockReceipts.test.js` nor a
migration file exist. Latest commit at time of writing:
`398be2d — docs: session-status — step 8 done, step 9 next`.

This is a real loss, not a formality — don't assume any part of step 9 is
already in place. The next session should treat step 9 as **not started**
and rebuild it from `docs/data-model.md` section 5 and
`docs/commissary-and-stock-receipts.md` Part 2's Unallocated-receipts note,
which fully specify what to build. Two things worth carrying forward from
the lost attempt, since they were sound design calls even though the code
is gone:

1. **A migration helper is genuinely needed**, not optional — `schema.sql`
   uses `CREATE TABLE IF NOT EXISTS`, which cannot retroactively loosen a
   `NOT NULL` constraint on a table that already exists in someone's local
   `inventory.db`. Any session with a pre-existing local database needs an
   idempotent one-time rebuild step (detect the old constraint via
   `PRAGMA table_info`, rebuild the table preserving existing rows) run
   once before `schema.sql`, not just a schema.sql edit alone.
2. **Assignment must validate `commissary_meat_id` continuity**: when
   `PATCH`-assigning an unallocated row to a restaurant, the
   `commissary_meat_map` lookup for the chosen restaurant+meat must resolve
   to the *same* `commissary_meat_id` already stored on that row — reject
   the assignment otherwise. This was flagged by the prior session as an
   ambiguity the docs didn't spell out; confirmed correct: without this
   check, assignment could silently misattribute which physical commissary
   pool a shipment was drawn from, undermining the balance/traceability
   the table exists for. This rule should be written into
   `docs/data-model.md` section 5 as part of implementing step 9, not
   re-litigated.

**Next up is step 9**, rebuilt from scratch per the above.

## Known open items (not the next step's problem, just not forgotten)

- **`npm run dev` has still never been fully click-tested** across Stock
  Receipts' and Commissary's own Edit/Delete UI flows — only History's
  routes and the two write routes needed to generate its test data have
  been verified live. Worth doing if a session gets a natural opening.
- **Opening stock bug** (older, still unfixed): a meat/dish with no prior
  tracking has `beginning` null forever. Fix: make the Beginning cell
  editable only on a row's first-ever appearance, write once to
  `opening_stock`.
- **Live recalculation** (older, still unfixed): Ending(calc)/Over-Short
  only update after a full save+reload, not live in the browser.
- Restaurant B/C still aren't seeded — Restaurant A only. Step 8's admin
  screen removes the main blocker to onboarding them (mapping is now
  reachable in the UI); they'll still need their own
  `meats`/`dishes`/`recipe_bom` seeded via Settings. A verified
  `seed-data-B.json` (from `FC_MasterAudit.xlsx`, Restaurant B's real
  workbook) is expected to be prepared separately, outside a coding
  session — check with the project owner before assuming it's ready.

## Remaining scope after step 9 (steps 10-12)

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
  decisions are made between sessions, in the docs — not decided
  unilaterally mid-session. If a session hits a genuine ambiguity the
  docs don't resolve, it should flag it and stop, per rule 3.
- Testing approach: build and test in the sandbox environment first (real
  code paths, real database, hand-verified numbers) before handing files
  over.
- Stock receipts are unified across restaurants (one log, restaurant
  column) rather than per-restaurant New Stock screens; `restaurant_id`
  will become nullable as part of step 9, per `data-model.md` section 5.
- Activity logging via before/after snapshots + soft deletes, not hard
  locks. Scoped to `stock_receipts` and `commissary_yield_log` only —
  `commissary_meat_map` is deliberately excluded, being config data
  rather than a daily transactional log.
- "Landing" mixes meats + prepared dishes as rows; Prep is not a separate
  tab (confirmed via the real paper workflow, "Silingan Landing
  Inventory").
- The repo is now **public** (no secrets committed — `.env`, `*.db`, and
  `/uploads/` are gitignored and always have been). This was a deliberate
  choice to simplify tooling access; it doesn't change any of the above.

## End-of-session checklist (every session, no exceptions)

Since each session starts with zero memory of prior conversations and
relies entirely on `docs/` for continuity, every session — whether or not
the step it was working on is fully finished — should, before ending:

1. Update `docs/changelog.md` with a dated entry (what shipped, what's
   deliberately not built yet, how it was verified).
2. Update **this file** (`session-status.md`) — even a one-line "step 9 is
   half done, X works, Y doesn't yet" beats leaving it saying the prior
   step is current. **This step was skipped once already** (the lost
   step-9 attempt) — do this even if you're cut off mid-task; commit
   whatever code exists plus an honest status note, rather than losing
   the whole session's work silently.
3. Leave `HANDOFF.md` alone unless explicitly asked to refresh it.
