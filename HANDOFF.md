# Handoff — Inventory Audit App (Commissary + Stock Receipts + Activity Log)

Status: **Steps 1–6 done. Step 7 (Admin History tab) is next and last for
this phase.**
This doc is written so a fresh conversation can pick up with no prior context
beyond what's in this repo's `docs/` folder.

---

## Done (steps 1–5) — unchanged from last handoff, see repo's `docs/changelog.md`
Schema migration, `getNewStock()` → SUM over `stock_receipts`,
`commissaryYieldEngine.js`, Stock Receipts page + route, and Commissary
page + route (balance formula fully re-verified against
`Commi_Audit_Master.xlsx` — M03/M05/M08 all match the sheet's own cached
balances exactly). `new_stock` is fully retired. `commissary_meats` has
all 14 real rows seeded.

## Done (step 6) — Activity log wired in ✅

**Shipped:**
- `server/db/activityLog.js` (new) — two shared helpers:
  - `withTransaction(db, fn)` — hand-rolled `BEGIN`/`COMMIT`/`ROLLBACK`.
    `node:sqlite`'s `DatabaseSync` has no `.transaction()` wrapper
    (confirmed by inspecting its prototype directly - only
    `.exec()`/`.prepare()`/`.close()`/etc exist), so this is the
    transaction primitive rule 9 needs. Any throw inside `fn` rolls back
    before rethrowing - verified with a real test that counts rows
    before/after a simulated mid-transaction failure, not just that the
    error propagated.
  - `logActivity(db, {actor, entityType, entityId, action, before, after, source})`
    — inserts one `activity_log` row, JSON-serializing `before`/`after`
    at this one call site.
- `server/db/activityLog.test.js` (new) — 6/6 green, covering the
  atomicity guarantee above plus CREATE/UPDATE/DELETE snapshot shapes and
  input validation (rejects a garbage `action` or `source` rather than
  silently accepting it).
- `server/routes/stockReceipts.js` — `POST` now wraps the insert + a
  `CREATE` activity_log entry in one transaction. Two new endpoints:
  - `PATCH /api/stock-receipts/:id` — editable: `quantity`,
    `business_date`, `source`, `notes`. NOT editable: `restaurant_id`/
    `meat_id` (that's really a different receipt - delete + re-create).
    Switching `source` to `COMMISSARY` re-resolves `commissary_meat_id`
    server-side via `commissary_meat_map`, exactly like `POST` does -
    never trusted from the client, even on edit. 404s on an
    already-soft-deleted row.
  - `DELETE /api/stock-receipts/:id` — soft delete only (`deleted_at`),
    logs `before` = full row snapshot, `after` = null (per the
    `activity_log` schema's convention for deletes). 404s if already
    deleted (no double-logging).
- `server/routes/commissary.js` — same treatment for
  `commissary_yield_log`: `POST` now transaction-wrapped with a `CREATE`
  log, plus new `PATCH /api/commissary/yield-log/:id` (editable:
  `raw_weight_in`, `backed_weight_out`, `business_date`, `notes` - not
  `commissary_meat_id`) and `DELETE /api/commissary/yield-log/:id`
  (soft). Verified an edit to `backed_weight_out` correctly changes what
  `getCommissaryBalance` returns on the next call, and a soft-deleted
  yield row is excluded from the balance the same way a soft-deleted
  `stock_receipts` row already was.
- `public/stock-receipts.html` / `public/commissary.html` — both pages
  now have inline **Edit** (row becomes editable inputs, Save/Cancel
  buttons) and **Delete** (confirm dialog explaining the row isn't gone,
  just excluded from calculations) per row. Both pages also got a
  "Your name" field near the top, persisted in `localStorage`
  (`inventory_actor` key) and sent as `actor` on every create/edit/
  delete, so `activity_log.actor` has something better than null.

**Not built yet, on purpose**: no UI reading `activity_log` back yet -
that's step 7, kept as its own commit since it's a pure read with zero
risk to the write paths this step touched.

**Verification note — still no live `npm run dev` this session.** Same
sandbox limitation as steps 4/5 (no network, `npm install` fails).
Verified instead by:
- `node --check` on every new/changed server file.
- Full `auditEngine.test.js` (9/9) + `commissaryYieldEngine.test.js`
  (22/22) + new `activityLog.test.js` (6/6) - **37/37 total**.
- Two standalone scripts exercising `stockReceipts.js`'s and
  `commissary.js`'s exact new route logic (POST/PATCH/DELETE, transaction
  + logging included) directly against `node:sqlite`, bypassing Express
  (still unavailable): confirmed full `CREATE → UPDATE → UPDATE → DELETE`
  and `CREATE → UPDATE → DELETE` `activity_log` trails in the right
  order, `deleted_at IS NULL` correctly excludes deleted rows from list
  queries, PATCH/DELETE both 404 on an already-deleted row, and (for
  commissary specifically) that `getCommissaryBalance` live-reflects an
  edit or delete to the underlying yield log row.
- A fresh `seed.js` run, unaffected by any of this session's changes.

**→ Next session should run `npm run dev` for real** - same outstanding
item as steps 4 and 5, now covering the new Edit/Delete flows on both
pages too (click Edit, change a value, Save, confirm the row and any
downstream balance/computed field updates; click Delete, confirm it
drops out of the list but the "Your name" you typed shows up correctly
once step 7's history view exists to check it).

---

## Remaining (step 7) — original task text, unedited

### 7. Admin History tab
Reverse-chronological feed reading `activity_log`, filterable by entity
type/date/actor, with a simple before→after diff per row. This is what
actually lets you catch a manipulated number later.

---

## Things the next session should know before starting step 7

1. **`activity_log` schema** (`server/db/schema.sql`): `id`, `timestamp`
   (auto), `actor` (plain text, nullable), `entity_type` (currently only
   `'stock_receipts'` or `'commissary_yield_log'` in practice, but the
   column itself is unconstrained text), `entity_id`, `action` (`CREATE`/
   `UPDATE`/`DELETE`), `before`/`after` (JSON text, nullable), `source`
   (`SYSTEM`/`MANUAL` - everything written so far is `MANUAL`, since
   there's no automated/system-triggered write yet).
2. **There's real data to look at already** - step 6's route-simulation
   scripts (not committed, they lived in `/tmp` during that session) and
   any live `POST`/`PATCH`/`DELETE` calls this session's tests made
   against a real (if ephemeral) `node:sqlite` db all produced correctly
   shaped rows. Trust the schema and the `activityLog.test.js` fixtures
   as the reference for what a row looks like; no need to re-derive the
   shape from scratch.
3. **Route/page pattern to follow** (four working examples now):
   `dailyAudit.js`, `settings.js`, `stockReceipts.js`, `commissary.js` -
   all plain Express routers mounted under `/api` in `server/index.js`,
   `db.prepare(...).all()/.get()/.run()` from `node:sqlite`, JSON in/out.
   Frontend: plain HTML/JS per page, `fetch` calls, shared `style.css`,
   nav links on every page. A new `activity-history.html` should follow
   the same shape - filterable list, this time read-only (no add-form).
4. **The before→after diff** doesn't need to be fancy - the doc's own
   language is "a simple before→after diff per row" and the "Discord
   history" model (a plain readable feed, not a separate audit-per-table
   UI). A straightforward two-column or key-by-key comparison of the
   parsed `before`/`after` JSON is enough; don't over-build this.
5. **The "Unallocated" destination gap** (flagged since step 5, still
   open) may come up again if this session's testing surfaces edits to
   `stock_receipts` rows tied to commissary shipments - not step 7's job
   to fix, just worth having in mind.
6. **`npm run dev` still hasn't been live-tested** - do this before or
   during step 7, covering all three pages now (Stock Receipts,
   Commissary, and the new Admin History).

---

## Suggested order for the next session
1. Run `npm run dev` for real and click through all three pages,
   including the new Edit/Delete flows from step 6 (none of which have
   been live-tested yet - see verification notes above).
2. Add a `GET /api/activity-log?entity_type=&business_date_range=&actor=`
   endpoint (or similar filter set - check `activity_log`'s actual
   columns above) to a new `server/routes/activityLog.js`, mounted the
   same way as the other four routers.
3. Build `public/activity-history.html` - reverse-chronological list,
   filterable, with a simple before→after diff per row. Nav link added
   everywhere, matching the other three pages.
4. Once step 7 is done, this phase's original 7-step plan is complete -
   check `docs/session-status.md`'s "Original remaining scope" section
   for what comes after (Landing rebuild, Sales tab, command panel).
