# Session Status — read this first after token reset

Last updated: 2026-08-27. This is the authoritative "where we left off" doc.
Read this before re-deriving anything from chat history.

## What's DONE, tested, and pushed to GitHub
- All rules docs (`data-model.md`, `scope.md`, `daily-workflow.md`,
  `loyverse-sync.md`, `tech-stack.md`, `rules-for-claude-code.md`,
  `changelog.md`, `commissary-and-stock-receipts.md`)
- App skeleton — Express + Node's built-in `node:sqlite`
- Real seed data from the xlsx: 11 meats, 39 dishes, 23 recipe rows
  (Restaurant A only — B/C not seeded yet)
- **Audit engine** (`server/engines/auditEngine.js`) — beginning stock,
  usage, expected ending, variance, known-loss vs unexplained variance.
  7/7 tests passing against hand-calculated real numbers.
- A working "Daily Audit" grid (meat-only version) — **still needs the
  mixed meats+dishes rebuild described below, plus the New Stock column
  change described in the next section**

## 2026-08-27 — NEW decision, not yet built: unified stock receipts + commissary yield + activity log
Read `docs/commissary-and-stock-receipts.md` in full before touching any of
this — it has the complete schema and reasoning. Summary of what changes:

- **`new_stock` is being replaced by `stock_receipts`.** No more per-row
  uniqueness per meat/day, no more per-restaurant New Stock screen. One
  flat log, restaurant is a column. `auditEngine.getNewStock()` becomes a
  `SUM(...)` query. Landing's New Stock cell goes read-only.
- **Commissary yield tracking is new**, and separate from stock receipts —
  it's the raw-in/backed-out/leeway-check step that happens *before* meat
  is assigned to any restaurant (`commissary_yield_log`,
  `commissary_meats`, `commissary_meat_map`). A commissary shipment to a
  restaurant is just a `stock_receipts` row with `source = COMMISSARY`.
- **Confirmed data mismatch to handle carefully**: commissary MeatIDs and
  restaurant MeatIDs do not correspond 1:1 (verified against
  `seed-data.json` vs `Commi_Audit_Master.xlsx` — e.g. both have an
  "M01" but they're different meats). `commissary_meat_map` must be
  populated deliberately in Settings, never inferred from matching codes.
- **Activity log is new** (`activity_log` table) — every write to
  `stock_receipts` or `commissary_yield_log` logs a before/after snapshot;
  deletes on those two tables are soft (`deleted_at`), not physical. Scoped
  to just these two tables for now — see `scope.md`'s deferred list for
  the older tables.
- **This is docs-only so far.** No schema/code changes have been made yet;
  they're queued as the next implementation session.

## CORRECTED UNDERSTANDING (from earlier session) — still holds
**"Landing" is not meats-only, and Prep is not a separate tab.** The real
workflow (confirmed via a photo of the actual paper/sheet system, "Silingan
Landing Inventory") is: **one unified grid, mixing BOTH raw meats AND
prepared dishes as rows**, using the same audit cycle for both:

```
NAME/ITEMS | BEG | NEW | POS | INHOUSE | OVER/SHORT | REMARKS | END STOCK
```

Vocabulary correction: **"Over/Short" is the real term for what
docs call "variance"** — use this label in the UI, keep "variance" as the
internal/technical term in code and docs.

## Recipe usage rule — confirmed important, already partly built
The `Recipe_BOM` distinguishes DIRECT usage (meat consumed per sale) vs
BATCH_PREPPED usage (meat consumed per prep batch, not per sale) — this
already exists in the schema (`dishes.prep_type`) and the audit engine
already uses it correctly (see `getUsage()` in `auditEngine.js`).

**Validation rule to add (not yet implemented anywhere)**: for
BATCH_PREPPED dishes, sold quantity (POS) should never exceed available
prepped portions. Should be a WARNING (via the command panel), not a hard
block.

## Finalized architecture — tabs + cross-cutting features

**1. Landing tab** — mixes meats + prepared dishes as rows. New Stock
column is now read-only (see 2026-08-27 decision above), pulled from
`stock_receipts`.

**2. Stock Receipts tab (new, not yet built)** — the unified log described
above: date, restaurant, meat, quantity, source, notes. Filterable list,
not a grid.

**3. Commissary tab (new, not yet built)** — yield log entry (raw in /
backed out per commissary meat) + a live on-hand balance view. Separate
from Stock Receipts; shipping stock out of the commissary to a restaurant
is done by adding a `stock_receipts` row with `source = COMMISSARY`, not
on this tab.

**4. Sales tab** (not yet built) — monthly grid like the xlsx: rows =
dishes, columns = Day 1 through last day of month. Editable, with a
confirmation prompt on manual override.

**5. Command panel** (not yet built, cross-cutting) — reusable notes +
quick-action panel, appears on any tab. First planned command: "Sync batch
stock" (copy sales into prepped for BATCH_PREPPED dishes with no manual
prepped entry yet, logged as a SYSTEM activity_log entry).

**6. Admin History tab (new, not yet built)** — reverse-chronological feed
of `activity_log`, filterable by entity type/date/actor, diff view per
entry. Admin-only.

## Also still queued (diagnosed, not yet fixed)
- **Opening stock bug**: when a meat/dish has never been tracked before,
  `beginning` is null forever, cascading to ending_calculated/variance
  staying null. Fix: make the Beginning cell editable ONLY on a row's
  first-ever appearance; on save, write it once to `opening_stock`.
- **Live recalculation**: Ending(calc)/Over-Short only update after a full
  save+reload round trip currently. Should recalculate live in the browser.

## Order for next session (implementation, once docs are pushed)
1. Schema migration: add `stock_receipts` (replacing `new_stock`),
   `commissary_meats`, `commissary_meat_map`, `commissary_yield_log`,
   `activity_log`. Update `schema.sql`, write a migration note in
   `changelog.md` once done.
2. Update `auditEngine.js`: `getNewStock()` → SUM query against
   `stock_receipts`. Re-run `auditEngine.test.js`, update/add fixtures as
   needed.
3. New `commissaryYieldEngine.js`, tested against real rows from
   `Commi_Audit_Master.xlsx`'s Yield_Log (pass/fail cases already exist
   there to use as fixtures).
4. Stock Receipts entry page + route (replacing New Stock on Landing).
5. Commissary entry page + route (yield log + balance view).
6. Activity log: wire logging into the write routes for the two new
   tables, then build the Admin History tab.
7. `activity_log` + command panel (original plan, still queued).
8. Rebuild Landing as ONE mixed grid (meats + prepared dishes), with the
   opening-stock fix and live recalc built in from the start.
9. Sales tab (monthly grid), including the BATCH_PREPPED over-sold
   validation warning.

## Things NOT to re-litigate (already decided, stable)
- Tech stack: Node.js + Express + `node:sqlite` (not better-sqlite3, not
  Postgres) — see `changelog.md` for why
- Single local machine, one SQLite file, no hosting/multi-user — see
  `scope.md`
- Docs-first workflow: update the relevant `docs/*.md` file whenever a
  real decision changes, before or alongside the code
- Testing approach: build and test in the sandbox environment first (real
  API calls, real database, hand-verified numbers) before handing files
  over
- Stock receipts are unified across restaurants (one log, restaurant
  column) rather than per-restaurant New Stock screens — 2026-08-27
- Activity logging via before/after snapshots + soft deletes, not hard
  locks — 2026-08-27
