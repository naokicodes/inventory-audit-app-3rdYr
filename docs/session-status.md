# Session Status — read this first after token reset

Last updated: 2026-08-28. This is the authoritative "where we left off" doc.
Read this before re-deriving anything from chat history.

## Where things stand: step 6 done, step 7 is next

- **Step 1-3** (schema, audit engine, commissary yield engine core):
  done, tested, unchanged in a while.
- **Step 4** (Stock Receipts page + route): done.
- **Step 5** (Commissary page + route): done, balance formula verified
  against the real xlsx (22/22 tests green with real fixture numbers).
  See `docs/changelog.md`'s 2026-08-28 entries for the full detail,
  including a worth-knowing wrinkle: an earlier same-day session did this
  verification but ran out of context before it landed in the repo, so
  it had to be redone from scratch once.
- **Step 6** (activity log wiring): done. `server/db/activityLog.js`
  provides `withTransaction`/`logActivity`, used by both `stockReceipts.js`
  and `commissary.js`'s `POST` (now logs `CREATE`) and new `PATCH`/`DELETE`
  endpoints (log `UPDATE`/`DELETE`; soft-delete only, via `deleted_at`,
  never a hard `DELETE`). Both HTML pages got inline Edit/Delete per row
  plus a persisted "actor" name field. 37/37 tests green total (9 audit +
  22 commissary + 6 activity log, including an atomicity test proving a
  mid-transaction failure rolls back both the target write and its log
  entry together).

**Next up is step 7**: Admin History tab — reverse-chronological feed
reading `activity_log`, filterable by entity type/date/actor, with a
before→after diff per row. Purely a read on data step 6 is now producing;
no new write paths, so it's naturally the safest step to build next. See
`docs/commissary-and-stock-receipts.md` Part 3.

## Known open items (not step 7's problem, just not forgotten)

- **"Unallocated" destination gap**: the real xlsx's `Outbound_Log`
  allows a shipment with no restaurant assigned yet ("Unallocated"), but
  `stock_receipts.restaurant_id` is `NOT NULL` in this schema, so it
  can't be represented. Doesn't block anything currently built (the
  balance formula is destination-agnostic), but is a real gap vs. the
  old sheet. Needs a deliberate decision (nullable column? a
  placeholder row? something else?) — not to be silently worked around.
- **`npm run dev` has still never been run live** across steps 4, 5, or
  6 — every sandbox session so far has had no network access, so
  verification has been `node --check` + real test suites + standalone
  scripts hitting the actual route logic against `node:sqlite` directly.
  Do a real click-through (Stock Receipts AND Commissary pages,
  including the new Edit/Delete flows) before or during step 7.
- **Opening stock bug** (older, still unfixed): a meat/dish with no
  prior tracking has `beginning` null forever. Fix: make the Beginning
  cell editable only on a row's first-ever appearance, write once to
  `opening_stock`.
- **Live recalculation** (older, still unfixed): Ending(calc)/Over-Short
  only update after a full save+reload, not live in the browser.
- Restaurant B/C still aren't seeded — Restaurant A only.

## Original remaining scope (steps 7-9, unchanged)

7. `activity_log` finished off with the Admin History tab (reverse-
   chronological feed, filterable, before→after diff per row).
8. Rebuild Landing as ONE mixed grid (meats + prepared dishes together,
   per the real "Silingan Landing Inventory" paper workflow — NOT
   meats-only), with the opening-stock fix and live recalc built in from
   the start. Vocabulary: the real term is "Over/Short", not "variance"
   (keep "variance" as the internal/technical term in code and docs).
9. Sales tab: monthly grid (rows = dishes, columns = Day 1..last day),
   editable with a confirm prompt on manual override, plus the
   BATCH_PREPPED over-sold validation warning (sold qty should never
   exceed available prepped portions — WARNING via the command panel,
   not a hard block).
10. Command panel (cross-cutting, appears on any tab) — first planned
    command: "Sync batch stock" (copy sales into prepped for
    BATCH_PREPPED dishes with no manual entry yet, logged as a SYSTEM
    `activity_log` entry).

## Things NOT to re-litigate (already decided, stable)

- Tech stack: Node.js + Express + `node:sqlite` (not better-sqlite3, not
  Postgres) — see `changelog.md` for why.
- Single local machine, one SQLite file, no hosting/multi-user — see
  `scope.md`.
- Docs-first workflow: update the relevant `docs/*.md` file whenever a
  real decision changes, before or alongside the code.
- Testing approach: build and test in the sandbox environment first
  (real code paths, real database, hand-verified numbers) before
  handing files over — `npm run dev` access has been unreliable
  (no network in these sandboxes), so this is the actual verification
  bar, not a fallback.
- Stock receipts are unified across restaurants (one log, restaurant
  column) rather than per-restaurant New Stock screens.
- Activity logging via before/after snapshots + soft deletes, not hard
  locks.
- "Landing" mixes meats + prepared dishes as rows; Prep is not a
  separate tab (confirmed via the real paper workflow, "Silingan
  Landing Inventory").
