# Changelog / Development Notices

A running, dated log of real fixes, decisions, and environment quirks hit
during development — so they don't have to get rediscovered later, and so
anyone picking this project up (including future-you) has context on *why*
something is built the way it is, not just *what* it does.

Newest entries at the top. Small/routine commits don't need an entry here —
this is for things that took real debugging, changed a decision, or are
worth remembering if they happen again.

---

## 2026-08-28 (even later) — Commissary balance formula fully re-verified against the real xlsx; full M01-M14 seed data

**Context**: `Commi_Audit_Master.xlsx` was re-uploaded after the previous
entry below was written. Re-read `Meats`, `Yield_Log`, `Outbound_Log`, and
`Commissary_Stock` directly (`Instructions` too, for the Outbound_Log
destination note). This entry corrects/completes the previous one, which
had to proceed without the file.

**Balance formula verified exactly**, hand-checked two ways:
- `Commissary_Stock`'s own formulas (`D`=SUMIF Yield_Log backed-out by
  MeatID, `E`=SUMIF Outbound_Log qty-out by MeatID, `F`=D-E) were read
  directly — confirms `E` sums outbound rows **regardless of destination**,
  including "Unallocated" ones. So the earlier-flagged schema gap (can't
  represent an unallocated shipment) doesn't affect the formula's
  correctness against the sheet — it only affects whether *our app* can
  reproduce the sheet's exact number when an Unallocated row exists for a
  meat.
- Manually summed the real per-meat rows and matched the sheet's cached
  numbers exactly: M03 Belly Slab 29.7 backed in − 14.9 out = **14.8**;
  M05 JOWL 103.8 − 87.5 = **16.3**; M08 Shortplate 46.9 − 33.5 = **13.4**.

**`commissaryYieldEngine.test.js` rewritten with real fixtures**: the
Belly Slab balance tests now use the actual 3 real Yield_Log rows (backed-in
sums to the sheet's exact 29.7) and the actual 3 restaurant-assigned
Outbound_Log rows (2.2 + 5.7 + 2.0 = 9.9). Balance comes out to **19.8**,
not the sheet's 14.8 — that's not a bug, it's the schema gap made visible:
a 4th real row (2026-07-02, 5.0kg, destination "Unallocated") exists in the
sheet but isn't reproduced, since `stock_receipts.restaurant_id` is
`NOT NULL` and can't represent it yet. Documented in the test itself so the
gap stays visible rather than silently glossed over. 22/22 green.

**`commissary-seed-data.json` filled in completely**: all 14 real rows from
the `Meats` sheet (M01–M14; M15 is blank in the sheet), including
`cost_per_unit` where the sheet has it. `seed.js` updated to insert it.
Fresh `seed.js` run confirmed all 14 load cleanly with the right values.

**Still open, unchanged from before**: the "Unallocated" destination gap
itself — whether/how to let a `stock_receipts` row represent "shipped but
not yet assigned to a restaurant" — is a real design decision, not
resolved here. Flagged for a deliberate conversation, not decided as a
side effect of this session. `npm run dev` still hasn't been run live
(no network in this sandbox either) — do that before step 6.

---

## 2026-08-28 (later) — Commissary page + route (step 5); prior session's balance-verification work recovered/rebuilt

**Context worth recording**: a prior session (same day) read `Commi_Audit_Master.xlsx`'s
`Commissary_Stock`/`Outbound_Log` sheets, hand-verified the balance formula
against the sheet's own cached numbers (e.g. M03 Belly Slab = 14.8), pulled
real per-meat rows as test fixtures, and started wiring `getCommissaryBalance`
into the engine — but that work never landed in the repo (the zip handed to
this session matched the step-4 HANDOFF state exactly, with no balance
function, no `commissary-seed-data.json`, none of it). The xlsx also wasn't
re-uploaded this session, so the real-number verification couldn't be
redone. Rebuilt what could be rebuilt from the documented formula and the
already-committed test fixtures; flagged rather than faked the rest. See
"Still open" below.

**What shipped**:
- `commissaryYieldEngine.js` — added `getCommissaryBalance(db, commissaryMeatId)`
  and `listCommissaryBalances(db)`, implementing the formula from
  `commissary-and-stock-receipts.md` Part 1 exactly (backed-in from
  `commissary_yield_log` minus shipped-out from `stock_receipts` where
  `source = COMMISSARY`, both filtered on `deleted_at IS NULL`). Returns 0
  (not null) for a meat with no activity — "nothing on hand" is a real
  answer.
- `commissaryYieldEngine.test.js` — added tests for the above. **These
  fixtures are constructed, not xlsx-sourced** (unlike the Yield_Log tests
  above them) — the xlsx wasn't available this session. They check the
  SUM-minus-SUM mechanics, the `deleted_at` filter on both sides, and that
  `source = DIRECT` rows are never subtracted. 21/21 green (was 15/15
  before this session's additions).
- `server/db/commissary-seed-data.json` (new) + `seed.js` — seeds only the
  3 commissary meats with real, already-verified values sitting in the
  test fixtures (M03 Belly Slab, M05 JOWL, M08 Shortplate). Did **not**
  fabricate the other ~12 of the real M01–M15 set without the xlsx to
  check them against.
- `server/routes/commissary.js` (new) — `GET /api/commissary/meats`,
  `GET /api/commissary/yield-log` (filterable, computed fields joined in),
  `GET /api/commissary/balances` (live view), `POST /api/commissary/yield-log`
  (create only — see below). Mounted in `server/index.js`.
- `public/commissary.html` (new) — yield-entry form, live balance cards,
  filterable yield log list. Same vanilla-JS/fetch pattern as
  `stock-receipts.html`. Nav link added to every page.

**Deliberately not built** (same reasoning as step 4's stock_receipts):
no edit/soft-delete on `commissary_yield_log` yet — `rules-for-claude-code.md`
rule 9 requires activity_log wiring on every write to this table, and
that's step 6. Create + read only.

**Design gap flagged, not resolved** (per the prior session's notes,
recovered from its summary): `Outbound_Log`'s Instructions sheet allows a
destination of "Unallocated" when a shipment's restaurant split hasn't been
decided yet, but `stock_receipts.restaurant_id` is `NOT NULL` — there's no
way to represent "shipped from commissary but not yet assigned to a
restaurant." Doesn't affect the balance formula (destination-agnostic), but
is a minor workflow tightening vs. the old sheet. Left as an open item, not
decided unilaterally.

**Still open before this can be called fully verified** (✅ both resolved
later the same day — see the entry above this one):
1. ~~Re-verify `getCommissaryBalance` against real `Outbound_Log`/`Commissary_Stock`
   rows once `Commi_Audit_Master.xlsx` is available again~~ — done, see
   above.
2. `commissary_meats` seed data is still only 3 of ~15 real rows — the
   dropdown works but is incomplete until the xlsx's `Meats` sheet is
   re-read.
3. **Could not run `npm run dev` this session either** — same no-network
   sandbox limitation as step 4. Verified via `node --check` on every new/
   changed file, the full `auditEngine.test.js` + `commissaryYieldEngine.test.js`
   suites (9/9, 21/21), a fresh `seed.js` run confirming the 3 commissary
   meats load cleanly, and a standalone script exercising `commissary.js`'s
   exact route logic against `node:sqlite` directly (GET meats, POST
   validation incl. rejecting an unknown meat, GET yield-log with computed
   fields and date filter, GET balances before/after a COMMISSARY receipt).
   A live click-through still hasn't happened — do that before step 6.

---

## 2026-08-28 — Stock Receipts page + route (step 4); `new_stock` retired

**What shipped**: `server/routes/stockReceipts.js` (`GET /api/stock-receipts/meats`,
`GET /api/stock-receipts` filterable list, `POST /api/stock-receipts` create)
and `public/stock-receipts.html` — one page, per `commissary-and-stock-
receipts.md` Part 2: date, restaurant, meat (filtered to that restaurant),
quantity, source, notes, plus a filterable running list.

**`commissary_meat_id` is resolved server-side, never client-supplied.**
When `source = COMMISSARY`, the route looks up `commissary_meat_map` by
`(restaurant_id, meat_id)`; a missing mapping is rejected with the
"not mapped yet - set this up in Settings" message the docs specify,
not a silent failure. The frontend also checks this proactively per-meat
so the warning shows before submit, not just after.

**`new_stock` is now fully retired**, not just superseded: `dailyAudit.js`'s
GET/POST no longer touch the `new_stock` table at all — the New Stock
column on Landing reads `computeMeatAudit(...).newStock` (already a
`SUM(stock_receipts)` since step 2) and is display-only, matching Beginning/
Usage. Dropped the `new_stock` table from `schema.sql` entirely, since
`data-model.md` already didn't list it and nothing references it anymore.

**Deliberately not built yet** (flagged, not forgotten):
- No edit/soft-delete on `stock_receipts` from this page — every write to
  this table must log to `activity_log` per `rules-for-claude-code.md`
  rule 9, and that wiring is step 6. Building delete now would mean either
  violating that rule or hand-rolling a one-off log just for this table.
  Create + read only until step 6 lands, then edit/delete get added
  alongside the logging.
- No `commissary_meats` seed data added. The page works correctly with
  zero commissary meats/mappings — COMMISSARY source just shows "not
  mapped yet" for every meat until Settings has real mappings — but the
  dropdowns will look empty in practice until that seeding happens
  (HANDOFF.md flagged this as still-undecided: step-4 prerequisite vs.
  separate task; left as the latter for now).

**Environment note**: this sandbox has no network access, so `express`
couldn't be installed to run the server end-to-end here. Verified instead
by: `node --check` on every changed/new server file, the full existing
`auditEngine.test.js` + `commissaryYieldEngine.test.js` suites re-run
against the updated schema (24/24 still green), and a standalone script
exercising the new route handlers' exact SQL directly against `node:sqlite`
(mapping enforcement, multi-receipt-per-day summing, soft-delete exclusion,
and `getNewStock` reflecting it all correctly). Run `npm run dev` on a
machine with npm access to confirm the live server/UI before moving on.

---

## 2026-08-27 — Design decision: unified stock receipts log + commissary yield tracking + activity log

**Context**: reviewed `Commi_Audit_Master.xlsx` (the commissary's existing
spreadsheet) alongside the app's docs. That workbook already tracks raw
meat → processed ("backed") yield with a pass/fail leeway check, and ships
processed meat out to restaurants — with its own instructions literally
saying the only manual handoff is retyping the resulting balance into each
restaurant's New Stock cell. That's exactly the gap being closed here.

**Decisions made**:
1. `new_stock` (one row per restaurant/meat/day) is replaced by
   `stock_receipts`, a flat, restaurant-labeled log covering both direct
   deliveries and commissary shipments. One page instead of duplicate
   per-restaurant New Stock screens. `new_stock(meat, date)` becomes a
   `SUM(...)` query, same treatment as the other calculated fields.
2. Commissary yield (raw-in vs. backed-out, checked against an allowed
   leeway %) is tracked separately in `commissary_yield_log`, since it
   happens before any meat is assigned to a restaurant. A shipment out of
   the commissary is just a `stock_receipts` row with `source =
   COMMISSARY` — no separate outbound table needed.
3. **Found a real data mismatch** while checking this: commissary MeatIDs
   (`Commi_Audit_Master.xlsx`) do NOT line up with restaurant MeatIDs
   (`seed-data.json`) — e.g. commissary M01 = processed Whole Chicken,
   Restaurant A's own M01 = Whole Chicken *Raw*. An explicit
   `commissary_meat_map` table is required; matching by code string would
   have silently misfiled stock.
4. Requirement clarified as "detect manipulation, don't block corrections."
   Landed on soft deletes (`deleted_at`) + an `activity_log` table
   (before/after JSON snapshot per change) instead of a hard lock on any
   field. Scoped to `stock_receipts` and `commissary_yield_log` only for
   now — extending this pattern to older input tables is flagged as
   deliberate follow-up work in `scope.md`, not bundled in.

**Docs touched**: `data-model.md` (sections 5, 10, 11), `scope.md`,
`daily-workflow.md`, and a new `commissary-and-stock-receipts.md` with the
full reasoning. No code changed yet — docs land first per
`rules-for-claude-code.md`.

---

## 2026-08-25 — Windows: SQLite test file wouldn't delete (EBUSY)
**Symptom**: `auditEngine.test.js` passed all 7 tests, then crashed during
its own cleanup step with `EBUSY: resource busy or locked, unlink ...test.db`.

**Cause**: Windows keeps a file lock on an open SQLite database until the
connection is explicitly closed. Linux (used during initial development/
testing) releases the lock automatically at process exit, so this didn't
surface until testing on the real Windows machine.

**Fix**: added `db.close()` before attempting to delete the test database
file, wrapped in try/catch as a safety net for edge cases (antivirus/
indexing software briefly holding a file lock on some machines).

**Lesson**: always explicitly close database connections before deleting
their files — don't rely on process exit to release locks, especially
since this project's target machine is Windows.

---

## 2026-08-25 — node:test + node:sqlite don't play well together
**Symptom**: Audit engine tests failed with `attempt to write a readonly
database` partway through a `node --test` run — but the exact same code,
run as a plain script (no test framework), worked perfectly.

**Cause**: both `node:test` (Node's built-in test runner) and `node:sqlite`
are still experimental/newer Node features. Something about how the test
runner isolates/re-enters test blocks conflicts with an open SQLite
connection across those boundaries. Confirmed via isolated repro that the
writes themselves are correct — this is a framework interaction issue, not
an app bug.

**Fix**: switched to plain test scripts (`node server/engines/whatever.test.js`)
instead of `node --test`. Same rigor (real assertions, real pass/fail, real
exit codes) without the framework conflict.

**Lesson**: when combining multiple still-experimental Node features, test
early and don't assume a "should work" combination actually does.

---

## 2026-08-25 — Switched from better-sqlite3 to Node's built-in node:sqlite
**Symptom**: `npm install` failed on Windows with a long `node-gyp` error
ending in "You need to install the latest version of Visual Studio...
including the Desktop development with C++ workload."

**Cause**: `better-sqlite3` is a native module — part of it is C++ code that
needs to be compiled during install. That requires a C++ compiler
(Visual Studio Build Tools on Windows), which isn't installed by default
and is a multi-GB download just for this one dependency.

**Fix**: switched to Node's built-in `node:sqlite` module (`DatabaseSync`),
available without any install since Node 22.13+. Zero compilation, zero
extra setup. Confirmed `docs/tech-stack.md` updated to match.

**Trade-off accepted**: `node:sqlite` is still marked experimental/
release-candidate by Node as of this writing (prints a harmless
`ExperimentalWarning` on every run — expected, not a bug). Acceptable for
a small local single-user tool; revisit only if it causes a real problem.

---

## Known, harmless, recurring notices (not worth re-investigating each time)
These show up regularly and are expected — listed here so they're not
mistaken for new problems:

- **`warning: ... LF will be replaced by CRLF ...`** on `git add` — Windows/
  Git line-ending normalization. Cosmetic, not an error.
- **`(node:####) ExperimentalWarning: SQLite is an experimental feature...`**
  on every `npm run dev` / test run — expected, see the entry above.
- **PowerShell quoting for inline `node -e "..."` commands** is fragile with
  nested quotes — prefer a real `.js` file over inline one-liners when the
  command has any quotes inside it.
- **`git status` showing "upstream is gone"`** right after cloning a fresh
  empty repo — resolves itself after the first `git push`, not an error.
