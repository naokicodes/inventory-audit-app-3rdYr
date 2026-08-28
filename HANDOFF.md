# Handoff — Inventory Audit App (Commissary + Stock Receipts + Activity Log)

Status: **Steps 1–5 done. Steps 4 and 5's edit/delete both deferred to
step 6 (deliberate, same reason both times). Steps 6–7 remain.**
This doc is written so a fresh conversation can pick up with no prior context
beyond what's in this repo's `docs/` folder.

---

## Done (steps 1–4) — unchanged from last handoff, see repo's `docs/changelog.md`
Schema migration, `getNewStock()` → SUM over `stock_receipts`,
`commissaryYieldEngine.js`'s core (loss %/status/excess loss), and the
Stock Receipts page + route — all tested green. `new_stock` is fully
retired (table dropped from `schema.sql`, nothing references it).

## Done (step 5) — Commissary page + route ✅

**Shipped:**
- `commissaryYieldEngine.js` — added `getCommissaryBalance(db, commissaryMeatId)`
  and `listCommissaryBalances(db)`. Formula (from
  `commissary-and-stock-receipts.md` Part 1, unchanged):
  ```
  commissary_balance(commissary_meat) =
    SUM(commissary_yield_log.backed_weight_out WHERE commissary_meat_id = ? AND deleted_at IS NULL)
    - SUM(stock_receipts.quantity WHERE commissary_meat_id = ? AND source = 'COMMISSARY' AND deleted_at IS NULL)
  ```
  Returns 0 (not null) for a meat with no activity yet.
- `server/routes/commissary.js` — four endpoints:
  - `GET /api/commissary/meats` — active commissary meats for the
    yield-entry dropdown.
  - `GET /api/commissary/yield-log?business_date=&commissary_meat_id=` —
    filterable list, computed loss%/status/excess-loss joined in per row,
    newest first, excludes soft-deleted.
  - `GET /api/commissary/balances` — live on-hand balance per active
    commissary meat.
  - `POST /api/commissary/yield-log` — creates a yield event. Validates
    `commissary_meat_id` exists.
- `public/commissary.html` — yield-entry form + live balance cards +
  filterable yield log list. Same vanilla-JS/fetch pattern as
  `stock-receipts.html`. Nav link added to every page.
- `server/index.js` — mounted the new router.
- `server/db/commissary-seed-data.json` (new) + `seed.js` — **all 14 real
  commissary meats** from `Commi_Audit_Master.xlsx`'s `Meats` sheet
  (M01–M14, `M15` is blank in the sheet and skipped), including
  `cost_per_unit` where present.

**Deliberately not built in step 5** (same reasoning as step 4, flagged
not forgotten): no edit/soft-delete on `commissary_yield_log`.
`rules-for-claude-code.md` rule 9 requires activity_log wiring on every
write to this table, and that's step 6. Create + read only for now.

**Balance formula fully verified against the real xlsx** (worth reading —
this was almost lost): an earlier same-day session already did this
verification, but ran out of context before it landed in the repo, so it
had to be redone from scratch once `Commi_Audit_Master.xlsx` was
re-uploaded. Redone properly this time:
- Read `Commissary_Stock`'s actual formulas — confirmed `E` (Total Out)
  sums Outbound_Log rows by MeatID **regardless of destination**,
  including "Unallocated" ones.
- Hand-summed the real per-meat rows from `Yield_Log`/`Outbound_Log` and
  matched `Commissary_Stock`'s cached numbers exactly: M03 Belly Slab
  29.7 − 14.9 = **14.8**; M05 JOWL 103.8 − 87.5 = **16.3**; M08 Shortplate
  46.9 − 33.5 = **13.4**.
- `commissaryYieldEngine.test.js`'s balance tests use the real Belly Slab
  rows as fixtures. One deliberate, documented exception: the test's own
  balance comes out to 19.8, not the sheet's 14.8 — a real 5.0kg
  "Unallocated"-destination row exists in the sheet but isn't
  reproduced, since `stock_receipts.restaurant_id` is `NOT NULL` and this
  schema can't represent it yet (see "Open design gap" below). This is
  flagged in the test itself, not hidden. 22/22 tests green.

**Verification note — could not run the live server this session either.**
Same sandbox limitation as step 4 (no network, `npm install` fails).
Verified instead by:
- `node --check` on every new/changed server file.
- Full `auditEngine.test.js` (9/9) + `commissaryYieldEngine.test.js`
  (22/22) suites green.
- A fresh `seed.js` run confirming all 14 real commissary meats load with
  correct code/name/unit/leeway/cost values.
- A standalone script exercising `commissary.js`'s exact route logic
  directly against `node:sqlite` (bypassing Express, unavailable):
  confirmed GET meats returns the seeded list, POST validation (missing
  fields, unknown `commissary_meat_id`), GET yield-log's computed fields
  and date filter, and GET balances reflecting a real before/after change
  when a COMMISSARY-sourced `stock_receipts` row is added.

**→ Next session should run `npm run dev` for real** (commissary meat
dropdown populates, log a yield event, confirm the balance card updates,
confirm it also shows up correctly filtered on the yield log list) before
starting step 6 — same as step 4's outstanding item, now for two pages
instead of one.

**Open design gap, flagged not resolved**: `Outbound_Log`'s Instructions
sheet allows a destination of "Unallocated" when a shipment's restaurant
split hasn't been decided yet. `stock_receipts.restaurant_id` is
`NOT NULL`, so there's currently no way to represent this. Doesn't affect
the balance formula (it's destination-agnostic), but means our app can't
fully reproduce the sheet's exact balance for a meat that has an
Unallocated row outstanding. Options for whoever makes this call: allow
`restaurant_id` to be nullable with an "unallocated" state, or something
else — not decided here on purpose.

---

## Remaining (steps 6–7) — original task text, unedited

### 6. Wire in the activity log
Every create/update/soft-delete on `stock_receipts` and
`commissary_yield_log` writes a matching `activity_log` row (before/after
JSON) in the same transaction. No hard DELETE on either table — `deleted_at`
only. **This is also where steps 4 and 5's edit/delete endpoints get
built** (see "deliberately not built" notes above) — both were
intentionally left out to avoid writing without logging.

### 7. Admin History tab
Reverse-chronological feed reading `activity_log`, filterable by entity
type/date/actor, with a simple before→after diff per row. This is what
actually lets you catch a manipulated number later.

---

## Things the next session should know before starting step 6

1. **Transaction pattern still needs to be worked out.** Check whether
   `node:sqlite`'s `DatabaseSync` exposes `.exec('BEGIN')/.exec('COMMIT')`
   or a `db.transaction(...)` wrapper before hand-rolling one. This
   touches the write paths in both `stockReceipts.js` and `commissary.js`
   (their existing `POST` handlers, unchanged since steps 4/5, plus new
   `PATCH`/`DELETE`-equivalent endpoints for both).
2. **Soft delete convention already in schema**: both `stock_receipts`
   and `commissary_yield_log` have `deleted_at TEXT` (nullable). "Delete"
   in the UI = `UPDATE ... SET deleted_at = ?`, never `DELETE FROM`.
3. **Route/page pattern to follow** (four working examples now):
   `dailyAudit.js`, `settings.js`, `stockReceipts.js`, `commissary.js` —
   all plain Express routers mounted under `/api` in `server/index.js`,
   `db.prepare(...).all()/.get()/.run()` from `node:sqlite`, JSON in/out.
   Frontend: plain HTML/JS per page, `fetch` calls, shared `style.css`,
   nav links on every page.
4. **The "Unallocated" destination gap** (see above) will likely surface
   again once edit/delete exists for `stock_receipts` — not step 6's job
   to fix, but worth having in mind since it's the same table.
5. **`npm run dev` still hasn't been live-tested** — do this for both
   Stock Receipts and Commissary before or during step 6, not after.

---

## Suggested order for the next session
1. Run `npm run dev` for real and click through both Stock Receipts and
   Commissary pages (neither has been live-tested yet — see verification
   notes above).
2. Work out the `node:sqlite` transaction pattern (item 1 above) in
   isolation first — a small standalone script, before touching the real
   routes.
3. Step 6: add `activity_log` writes to the existing `POST` handlers on
   both tables, then build the edit/soft-delete endpoints for both
   (deferred from steps 4 and 5), each logging before/after JSON in the
   same transaction as the write.
4. Step 7 (Admin History tab) — purely reads `activity_log`, so it's
   naturally last; nothing to show until step 6 is producing rows.
