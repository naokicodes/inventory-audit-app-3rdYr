2cb16eeddc30cf766e07ca5bd58c54a7da2168f0

# Run 2-integrity — inventory-audit-app

Question: can any path make a count, a stock figure or a cost wrong without anyone noticing?

Every finding below was reproduced against a running server (or by a script against the engine).

**Answer: yes.** Fifteen findings, nine of them P1. In the order I would fix them:

| ID | Sev | One line |
|---|---|---|
| I-01 | P1 | A second phone's untouched row overwrites a newer count on the landing |
| I-02 | P1 | The commissary count page does the same, wipes notes, and keeps no history |
| I-04 | P1 | Editing a recipe double-counts that day's usage, for good |
| I-05 | P1 | A shipment and its receipt can be changed apart; a shipment cannot be fixed at all |
| I-03 | P1 | A yield on a kg meat with the "input count" filled debits the count, not the kilos |
| I-06 | P1 | A transfer inside one restaurant is accepted (settled guard missing) |
| I-09 | P1 | Any text is accepted as a business date; one bad count breaks the landing |
| I-10 | P1 | An adjustment on an uncounted opening day explains nothing |
| I-11 | P1 | Settings edits (unit, cost, recipe) leave no log; a repeated recipe line doubles usage |
| I-07 | P2 | Negative and blank-ish quantities are accepted |
| I-08 | P2 | One "Save" is many transactions; a failure half-saves |
| I-12 | P2 | "Sync batch stock" goes stale when sales change |
| I-13 | P2 | The activity log's "who" is a typed name or nothing |
| I-15 | P2 | Sheet definitions and slot names never reach a database that is not reseeded |
| I-14 | P3 | Four small ones |

No P0: nothing here destroys stored data beyond a count or a note being overwritten (I-01, I-02).

## Setup

- Fresh clone at `~/fable-review-2/review`, commit above. `npm ci` ok.
- `npm run verify`: 40 files, 748 passed, 0 failed — **SUITE GREEN**, **AUDIT CLEAN**.
- Throwaway database `server/db/dev.db` (`npm run reseed`, `npm run seed:test`), server on port
  3010 with the three Loyverse tokens empty. No `.env`, no `beta.db`.
- Repros use the fake accounts by id: 2 Test Admin, 4 Test Head Chef RA, 6 Test Counter RA,
  8 Test Commi. `curl` lines assume `-H 'Content-Type: application/json'` and, where a user is
  named, `-H 'Cookie: user_id=<id>'`. Restaurant 1 = RA, restaurant 2 = FC, commissary 1 = COM-A.
  The month was opened first (each meat's opening = 100 on 2026-11-16).

Severity: P0 = data loss or a security hole; P1 = a wrong number or wrong access; P2 = fragile or
confusing; P3 = polish.

## Findings

### I-01 — P1 — A second phone's untouched row overwrites a newer count (landing)

- **Where:** `server/engines/blindCount.js:111-112` (`saveCount`), called from
  `server/routes/dailyAudit.js:192` and `:340`; the page posts every row on every save
  (`public/daily-audit.html:699-704`).
- **What happens:** `saveCount` skips a row only when it is *unchanged AND untouched*. A row the
  user never touched but whose on-screen value is stale (another phone saved a newer count since
  this phone loaded) counts as "changed", so the old number is written back over the new one. The
  history then shows an EDIT by a person who never touched that item. A recount (ADR-015: "the
  recount becomes the count") is undone the same way by the first counter's phone.
- **Repro (ran):**
  1. `POST /api/daily-audit` as 6: `{"restaurant_id":1,"business_date":"2026-11-16","rows":[{"meat_id":2,"ending_actual":"40","remarks":"","touched":true}]}`
  2. Phone B (user 4) loads `GET /api/daily-audit?restaurant_id=1&date=2026-11-16` — sees 40.
  3. As 6 again, same body with `"ending_actual":"47"` (the correction).
  4. Phone B types one other item and saves; the page sends what is on its screen:
     `{"restaurant_id":1,"business_date":"2026-11-16","rows":[{"meat_id":2,"ending_actual":"40","remarks":"","touched":false},{"meat_id":3,"ending_actual":"12","remarks":"","touched":true}]}`
  5. `GET /api/daily-audit/count-history?restaurant_id=1&date=2026-11-16` →
     `40 COUNT by Test Counter RA`, `47 EDIT by Test Counter RA`, `40 EDIT by Test Head Chef RA`.
     The stored count is 40 again. Phone B shows "Saved".
- **ADR:** ADR-015 (two devices: last save wins, both kept, "changed by") — an untouched repost is
  not a save; the route's own comment says so ("a repost of an untouched row is not a new count").
- **Smallest fix:** in `saveCount`, an untouched row never replaces an existing value:
  `if (!touched && current) return null;` (keep the first-value case so a client that sends no
  `touched` can still create a count). One test: stale untouched repost leaves value and history alone.

### I-02 — P1 — The commissary count page overwrites newer counts and wipes notes, with no history

- **Where:** `server/routes/commissary.js:213-239` (`POST /api/commissary/daily-audit`);
  `public/commissary.html:306-307` and `:324-328`.
- **What happens:** every row with a number is upserted, touched or not. There is no
  `count_entries` row and no `activity_log` row for a commissary count, so a stale phone silently
  replaces a newer count and nothing records that it happened. Separately, the Notes box is never
  filled with the stored note and the page sends `notes: null` for an empty box — so *any* later
  save of the page (even from the same phone) erases every note already saved that day, and
  re-stamps "who counted" on every row to whoever pressed Save last.
- **Repro (ran):**
  1. As 8: `POST /api/commissary/daily-audit` `{"commissary_id":1,"business_date":"2026-11-16","actor":"Test Commi","rows":[{"commissary_meat_id":3,"ending_actual":"60","notes":""}]}`
  2. As 8, corrected: same with `"ending_actual":"66","notes":"recount, 6 kg in the back chiller"`.
  3. As 2 (a phone that loaded after step 1), counting another meat:
     `{"commissary_id":1,"business_date":"2026-11-16","actor":"Test Admin","rows":[{"commissary_meat_id":3,"ending_actual":"60","notes":""},{"commissary_meat_id":4,"ending_actual":"20","notes":""}]}`
  4. `commissary_ending_actual` for meat 3 is now `quantity 60, notes NULL, created_by Test Admin`.
     `activity_log` has 0 rows for it. The 66 and the note are gone for good.
- **ADR:** ADR-015 (history of counts; the commissary is never blind but its counts are still
  counts), ADR-080 (the last saver is stamped — here a non-saver is stamped). The route comment
  calls the missing log deliberate (rule 9); the overwrite is not.
- **Smallest fix:** in the route, skip a row whose posted quantity and note equal the stored ones,
  and only write `notes` when the key is sent non-null; in the page, pre-fill the Notes box
  (`value="${r.notes ?? ''}"`, the GET must return it) and send only rows the user typed in. Better:
  route the commissary save through `saveCount` with a `COMMI` kind so it gets the same history.

### I-03 — P1 — A yield on a kg meat with the "input count" filled debits the count, not the kilos

- **Where:** `server/engines/commissaryAuditEngine.js:207-209` (`COALESCE(input_quantity, raw_weight_in)`);
  `server/routes/commissary.js:774-780` (validation only checks `> 0`);
  `public/commissary.html:214-215` (label "optional for a kg-tracked meat") and `:604` (edit box).
- **What happens:** for a kg-tracked source the form offers an optional input count. If the commi
  fills it (2 slabs, 50 kg), the ledger takes 2 kg off the raw meat instead of 50 and still credits
  the full backed weight to the output. Stock appears from nowhere; it later surfaces as an
  unexplained shortage on the raw meat that looks like loss or theft.
- **Repro (ran):** as 8,
  `POST /api/commissary/yield-log` `{"commissary_meat_id":6,"business_date":"2026-11-16","raw_weight_in":50,"backed_weight_out":42,"output_commissary_meat_id":5,"input_quantity":2,"actor":"Test Commi"}`
  then `GET /api/commissary/daily-audit?date=2026-11-16&commissary_meat_id=6` → JOWL Raw
  `beginning 100, usage 2, endingCalculated 98` (should be usage 50, ending 50); meat 5 JOWL
  `backedUp 42, endingCalculated 142`. Total jowl went 200 → 240 kg after processing that loses 8 kg.
- **ADR:** ADR-051 (yield output is always kg), ADR-049 (kg is weighed at production); settled
  note 2026-09-02 "the count drives the stock balance" applies to *unit-tracked* inputs only.
- **Smallest fix:** in `validateYieldOutputAndInputQty`, refuse an `input_quantity` on a kg source
  unless it equals `raw_weight_in` (or drop it to NULL); hide the box on the form for kg meats.

### I-04 — P1 — Editing a recipe double-counts that day's usage, forever

- **Where:** `server/routes/settings.js:315-326` (`PUT /api/settings/recipes/:id`) against
  `server/engines/auditEngine.js:167-168` (`effective_from <= date AND effective_until >= date`).
- **What happens:** an edit closes the old row with `effective_until = today` and opens the new
  row with `effective_from = today`. Both ends are inclusive, so on the edit day both rows apply
  and usage = sales x (old + new). A second edit the same day adds a third. Expected ending for
  that date is wrong for good (figures are computed on read), and if the day is not counted the
  wrong figure is carried into the next day's beginning. Settings shows both rows that day, with
  no hint that both are live.
- **Repro (ran):** as 2,
  1. `PATCH /api/sales` `{"restaurant_id":1,"dish_id":13,"business_date":"2026-11-16","quantity":10}`
     → `GET /api/daily-audit?restaurant_id=1&date=2026-11-16`: Pork Steak `usage 10`.
  2. `PUT /api/settings/recipes/2` `{"quantity":1.5}` → Pork Steak `usage 25` (should be 15).
  3. `PUT /api/settings/recipes/59` `{"quantity":1}` (the new row) → `usage 35` (should be 10).
- **ADR:** rule 4 / data-model recipe versioning ("don't destroy history"); no ADR allows an overlap.
- **Smallest fix:** close the old row the day before: `effective_until = addDays(today, -1)` in the
  PUT (a row created and edited the same day then never matches, which is right). One test:
  edit, then `getUsage` for the edit day uses the new quantity only.

### I-05 — P1 — A shipment and its receipt are two unlinked rows; one can be changed without the other

- **Where:** `server/routes/commissary.js:362-439` (`POST /api/commissary/shipments` writes
  `commissary_shipments` + one `stock_receipts` row per line, no id linking them);
  `server/routes/stockReceipts.js:158-226` (PATCH and DELETE accept any receipt, COMMISSARY ones too).
  There is no GET, PATCH or DELETE for a shipment at all.
- **What happens:** the restaurant side of a shipment can be edited or soft-deleted on Stock
  Receipts; the commissary side stays as shipped and can never be corrected. Meat leaves the
  commissary's books and never arrives on the restaurant's (or arrives as a different number).
  Both sheets still look normal; the gap only shows up later as a variance on one side.
  The activity log records the receipt change but nothing ties it to the shipment.
- **Repro (ran):**
  1. As 8: `POST /api/commissary/shipments` `{"commissary_meat_id":9,"restaurant_id":1,"business_date":"2026-11-16","total_quantity":30,"actor":"Test Commi","lines":[{"meat_id":6,"quantity":30}]}`
     → commissary Pork Steak `usage 30`; RA Pork Steak `new_stock 30`.
  2. As 4: `DELETE /api/stock-receipts/1` → RA `new_stock 0`; commissary still `usage 30`.
     30 pieces are on nobody's books.
  3. Ship again, then as 4: `PATCH /api/stock-receipts/2` `{"quantity":3}` → RA `new_stock 3`,
     commissary `usage 60`.
  4. `GET|PATCH|PUT|DELETE /api/commissary/shipments/1` → 404 each: a mistyped shipment cannot be fixed.
- **ADR:** settled 2026-09-02 ("two unlinked rows for one physical movement, where deleting one
  makes the meat duplicate or evaporate" — the reason commissary-to-commissary moves are
  allocations); the 2026-09-03 CRUD audit already lists shipments as create-only. ADR-092 (the
  receiver taps Received) will need the link anyway.
- **Smallest fix:** refuse PATCH/DELETE on a receipt whose `source = 'COMMISSARY'` (400: "change
  the shipment at the commissary"), and add a void for a shipment that soft-deletes its receipts
  in the same transaction (needs `deleted_at` on `commissary_shipments` and a `shipment_id` on the
  receipt rows — a schema step, so the refusal alone is the small first half).

### I-06 — P1 — A transfer inside one restaurant is accepted and shows a phantom surplus (settled guard missing)

- **Where:** `server/routes/allocations.js:101-108` (`POST /api/allocations`): the from/to
  locations are only checked for existing and being active.
- **What happens:** "Allocation / Transfer" between two locations of the same restaurant is
  saved as a normal adjustment. `getAdjustmentsTotal` subtracts it from that restaurant's
  expected ending, so a correct count reads as a SURPLUS. Locations can be added in Settings by
  any admin, so the "locations is empty on a fresh seed" safety no longer holds.
- **Repro (ran):** as 2, `POST /api/settings/locations` twice
  (`{"name":"RA - Grill","restaurant_id":1}`, `{"name":"RA - Prep","restaurant_id":1}`). As 6,
  count Shortplate = 100 (`POST /api/daily-audit`, meat 5) → `unexplained 0, OK`. As 4,
  `POST /api/allocations` `{"restaurant_id":1,"meat_id":5,"business_date":"2026-11-16","adjustment_type_id":3,"quantity":3,"from_location_id":1,"to_location_id":2}`
  → 200; the row now reads `adj 3, unexplained -3, SURPLUS` against a correct count.
- **ADR:** settled 2026-09-03, "Things NOT to re-litigate": *"any transfer whose from- and
  to-location resolve to the same restaurant must be refused at the route"*; Step 25e, "The guard
  that IS needed first". Not built.
- **Smallest fix:** in the route, after loading both locations (select `restaurant_id` too):
  `if (fromLoc.restaurant_id === toLoc.restaurant_id) return 400`. One test.
- **Related, known and queued (not a new finding):** a transfer between two restaurants still
  credits the receiver nothing (Step 25e, queued after soft launch).

### I-07 — P2 — Negative and blank-ish quantities are accepted on receipts, adjustments and counts

- **Where:** `server/routes/stockReceipts.js:116,128` and `:167`; `server/routes/allocations.js:87-88,117`;
  `server/routes/dailyAudit.js:185,191` and `:306-307,335-339`; `server/routes/commissary.js:228,233`
  and `:365-366,402,410` (shipment totals and lines). None of the page inputs has `min="0"`.
- **What happens:** every one of these does `Number(x)` and stores it. A receipt of -20 lowers new
  stock; a Wastage of -5 *adds* stock to the expected figure (only a Portion Conversion's second
  row is meant to be negative); an ending count of -7 is stored as the count; a count of `" "`
  (one space) is stored as 0. Openings, sales and commissary adjustments do refuse negatives, so
  the rule exists — it is just not applied to these.
- **Repro (ran):** as 4/6 on 2026-11-16, restaurant 1, meat 8:
  `POST /api/allocations` `{"restaurant_id":1,"meat_id":8,"business_date":"2026-11-16","adjustment_type_id":1,"quantity":-5}` → 200;
  `POST /api/stock-receipts` `{"restaurant_id":1,"meat_id":8,"business_date":"2026-11-16","quantity":-20,"source":"DIRECT"}` → 200;
  `POST /api/daily-audit` rows `[{"meat_id":8,"ending_actual":"-7","touched":true}]` → 200.
  Grid: Pompano `new -20, adj -5, actual -7`. And `[{"meat_id":9,"ending_actual":" ","touched":true}]`
  → Salmon Belly `actual 0, SHORTAGE 100`.
- **ADR:** none allows it; ADR-016 (one unit per meat) and the 26a-ii review rule "an opening
  count is never below zero" point the other way.
- **Smallest fix:** one shared helper `nonNegativeNumber(value)` (finite, >= 0, rejects
  whitespace-only strings) for receipts, counts and shipments, plus `min="0"` on those inputs.
  For `/allocations` only refuse 0 and non-numbers for now: adjustments are append-only, so a
  negative row is today the only way to undo a wrong one, and the staff-meal-log spec posts
  negative rows on purpose. If negatives stay, the Allocations page should label them "reversal".

### I-08 — P2 — "Save" on the landing is many separate transactions; a failure half-saves and answers with a stack trace

- **Where:** `server/routes/dailyAudit.js:184-198` (one transaction per row, inside a loop, no
  try/catch) and `:303-348`; the page then sends a second request for dish rows
  (`public/daily-audit.html:710` and `:734`). Same loop shape in `server/routes/commissary.js:227-236`.
- **What happens:** rows before the failing one are saved, the failing row and everything after
  it are not, and the answer is Express's HTML 500 page with a stack trace and server file paths.
  The page shows "Error saving", so the person assumes nothing was saved; part of it was. If the
  first request succeeds and the dish request fails, meats are saved and dishes are not.
- **Repro (ran):** as 6, `POST /api/daily-audit`
  `{"restaurant_id":1,"business_date":"2026-11-16","rows":[{"meat_id":10,"ending_actual":"55","touched":true},{"meat_id":11,"ending_actual":"abc","touched":true},{"meat_id":4,"ending_actual":"9","touched":true}]}`
  → HTTP 500, body `Error: NOT NULL constraint failed: ending_actual.quantity at ...dailyAudit.js:195`.
  Grid afterwards: Ground Beef `actual 55` (saved), Miscuts and PATA not counted.
- **ADR:** blind-count spec, edge state "failure - a failed save writes no history row (one
  transaction)" — true per row, not per save; rule 9's "same transaction" spirit.
- **Smallest fix:** validate every row first (I-07's helper) and return 400 naming the row, then
  wrap the whole loop in one `withTransaction` (`saveCount` already nests cleanly if it takes an
  "already in a transaction" flag, or move its body into a helper). Add a JSON error handler in
  `server/index.js` so a 500 never prints a stack.

### I-09 — P1 — Write routes accept any text as the business date; the number drops out of every day, and one bad count breaks the landing

- **Where:** no date check in `POST /api/daily-audit` and `/daily-audit/portions`
  (`server/routes/dailyAudit.js:171-174`, `:279-282`), `POST|PATCH /api/stock-receipts`
  (`stockReceipts.js:116`, `:168`), `POST /api/allocations` and `/allocations/conversion`
  (`allocations.js:87`, `:161`), `POST /api/commissary/daily-audit`, `/shipments`, `/yield-log`
  (+PATCH), `/adjustments` (+PATCH) (`commissary.js:215`, `:365`, `:798`, `:871`, `:1031`, `:1098`),
  `PATCH /api/daily-audit/opening-stock` and `/commissary/opening-stock`. `isIsoDate` exists
  (`engines/monthOpening.js:40`) and is used only by the month-opening and recount routes.
- **What happens:** the engines match days by exact text, so a row dated `2026-11-5`,
  `11/16/2026` or `2026-11-16T10:00` is saved with a 200 and then belongs to no day: the receipt
  never becomes new stock, the wastage never explains anything, the yield never debits. Worse, a
  count dated `2026-11-2` sorts as the "latest count before" any date from the 21st on, the
  engine does date maths on it and throws — the landing returns 500 for the whole restaurant for
  those dates. The pages always send proper dates (date inputs), so this needs a hand-made
  request — which, until write-permission, any device on the Wi-Fi may send logged out (ADR-040).
- **Repro (ran):**
  1. `POST /api/stock-receipts` `{"restaurant_id":1,"meat_id":7,"business_date":"2026-11-5","quantity":40,"source":"DIRECT"}` → 200;
     same with `"11/16/2026"` → 200. `POST /api/allocations` with `"2026-11-16T10:00"` → 200.
     `POST /api/commissary/yield-log` with `"16-11-2026"` → 200. French Cut on 2026-11-16 still
     shows `new 0, adj 0`.
  2. `POST /api/daily-audit` `{"restaurant_id":1,"business_date":"2026-11-2","rows":[{"meat_id":7,"ending_actual":"77","touched":true}]}` → 200.
     `GET /api/daily-audit?restaurant_id=1&date=2026-11-21` → **500** `RangeError: Invalid time value`
     (11-17 still 200).
- **ADR:** ADR-036 (one business date everywhere) presumes a real date; ADR-074 already made the
  same call for ids ("a malformed id is refused with 400 before the route runs").
- **Smallest fix:** add the date to the existing guard: in `server/middleware/requireSiteAccess.js`
  (or one tiny middleware beside it) refuse any write whose `business_date` is present and not
  `isIsoDate` with 400. One place, every route above covered.

### I-10 — P1 — An adjustment on an uncounted opening day explains nothing (the covered window is one day short)

- **Where:** `server/engines/auditEngine.js:96-102` (`resolvePriorChain`: `daysCovered:
  anchor.uncountedDates.length + 1`) and the twin in `server/engines/commissaryAuditEngine.js:96-100`.
- **What happens:** when the chain starts from a declared opening (a month-opening recount or
  Copy all), that day's own receipts and usage are carried forward — correctly — but the day is
  not counted in `daysCovered`. `getAdjustmentsTotalForWindow` uses `daysCovered`, so wastage,
  staff meals, conversions and transfers logged on the opening day are left out of the next
  count's "unexplained" figure. The row says `beginning (carried)` with `days_covered 1`, which
  contradicts itself, and shows a shortage that was in fact explained. The spec says the window
  is "the same days as daysCovered" and that "an adjustment dated on an uncounted day" must not
  vanish (session-history, Step 26a, "Adjustments across the covered window").
- **Repro (ran):** as 2, `POST /api/daily-audit/month-opening`
  `{"restaurant_id":2,"meat_id":12,"business_date":"2026-11-17","quantity":50}`; as 5,
  `POST /api/allocations` `{"restaurant_id":2,"meat_id":12,"business_date":"2026-11-17","adjustment_type_id":1,"quantity":4}`;
  nobody counts on the 17th; as 7, `POST /api/daily-audit` for 2026-11-18, meat 12, `"46"`.
  `GET /api/daily-audit?restaurant_id=2&date=2026-11-18` → `beginning 50 (carried), days_covered 1,
  window_adjustments 0, unexplained 4, SHORTAGE` (should be `days 2, window 4, unexplained 0, OK`).
  Control with the 17th counted (meat 13): `OK` both days.
- **ADR:** Step 26a (closed 2026-09-23), rule 12 sign convention unaffected.
- **Smallest fix:** `daysCovered: flowDates.length + 1` in both engines (for a count anchor
  `flowDates` is `uncountedDates`, so nothing else changes). One test per engine: opening day
  uncounted, adjustment on it, next day counted → explained.

### I-11 — P1 — Settings edits change units, costs and recipes with no log; a repeated recipe line doubles usage; a PUT without `active` switches the item off

- **Where:** `server/routes/settings.js:233-239` (`PUT /settings/meats/:id`), `:193-202`
  (commissary meats), `:270-276` (dishes), `:301-311` (`POST /settings/recipes`), `:315-332`
  (recipe edit/delete), `:375-388` (adjustment types). No `logActivity` anywhere in the file
  except the staff-meal engine it calls.
- **What happens (four things, one file):**
  1. **No trace.** A meat's unit (kg <-> unit), cost per unit, name and active flag, a dish's prep
     type and cost per portion, and every recipe quantity can be changed by any admin and nothing
     records the old value or who did it. Costs feed stock value and loss in pesos (ADR-057);
     recipes feed usage. `docs/scope.md` says settings changes are in the activity log today —
     for these tables they are not.
  2. **Unit flip on a meat with history.** `unit` is accepted on every PUT, so one save
     re-labels every past count, receipt and opening of that meat from pieces to kilos.
  3. **Duplicate recipe line.** `POST /settings/recipes` does not look for an open row for the
     same dish + meat, so adding a line that already exists gives two live rows and double usage.
  4. **Missing `active` = off.** `active ? 1 : 0` treats a body without `active` as false; the
     meat or dish silently leaves the landing, the month panel and the audit, with its stock.
- **Repro (ran):** as 2 —
  `PUT /api/settings/meats/9` `{"name":"Salmon Belly","unit":"kg","cost_per_unit":<n>,"active":true}` → 200,
  the meat is now `kg` (was `unit`) with a cost; `activity_log` row count unchanged (10 → 10).
  `PUT /api/settings/meats/10` `{"name":"Ground Beef","unit":"kg"}` → 200, `active` is now 0 and
  Ground Beef (counted today) is gone from `GET /api/daily-audit`.
  `POST /api/settings/recipes` `{"dish_id":14,"meat_id":7,"quantity":1}` (the line already
  exists) → 200; with 10 sold, French Cut `usage 20` (should be 10).
- **ADR:** ADR-042 (settings changes need an admin — holds), ADR-016 (one unit per meat),
  ADR-060 (costs are sensitive), ADR-097 (an admin who does not code changes this data — so it
  needs a trail). scope.md "Changes to stock and settings are kept in an activity log".
- **Smallest fix:** wrap each settings write in `withTransaction` + `logActivity` with the
  before/after row (the staff-meal engine in the same file is the pattern); refuse a `unit`
  change once the meat has any count, receipt or opening (ADR-078 already does this for side
  items); in `POST /settings/recipes` return 400 when an open row exists for the pair; read
  `active` as "keep" when the key is absent (the `recount_required` COALESCE two lines away).

### I-12 — P2 — "Sync batch stock" figures go stale when sales change afterwards

- **Where:** `server/routes/commands.js:124-141` (`POST /api/commands/sync-batch-stock`: inserts
  only where no `prepped` row exists).
- **What happens:** the command writes `prepped = sales` for a batch dish once. If the day's
  sales are corrected later (and with the real Loyverse port, late receipts will do this every
  night), the inferred prepped figure keeps the old number, still stamped as system-inferred.
  Meat usage for batch dishes is prepped x recipe, so usage stays wrong; running the command
  again reports "0 synced" and looks fine.
- **Repro (ran):** as 2, `PATCH /api/sales` dish 3 = 10 → `POST /api/commands/sync-batch-stock`
  (`synced 1`, prepped 10) → `PATCH /api/sales` dish 3 = 4 → sync again (`synced 0`).
  `GET /api/daily-audit/mixed`: Bagnet Sisig `sold 4, prepped 10`; JOWL usage still 10 portions' worth.
- **ADR:** settled note "`created_by` on `prepped` is provenance — SYSTEM means inferred from sales".
- **Smallest fix:** in the same command, also UPDATE rows whose `created_by = 'SYSTEM:sync-batch-stock'`
  and whose `portions_produced` differs from today's `SUM(sales)` (logged as a SYSTEM UPDATE with
  before/after); never touch a row a person typed.

### I-13 — P2 — The activity log's "who" is a typed name (or nothing), not the logged-in person

- **Where:** `server/routes/stockReceipts.js:114,132,160,180,201,212` and
  `server/routes/commissary.js:363,422,796,829,861,899,920,931` (`actor` comes from the request
  body); `server/routes/dailyAudit.js:322` (`actor: null` for a corrected prep number);
  `activity_log` has no user id column (`schema.sql:526-536`).
- **What happens:** on stock receipts and the yield log the log row's actor is whatever the page
  sent — a free-text box on the commissary page, nothing at all on a bare request. The row's
  `created_by_user_id` is the creator and is not changed by an edit, so for an UPDATE or DELETE
  the log cannot say who did it. A person can also type someone else's name.
- **Repro (ran):** as 6 (Test Counter RA), `PATCH /api/stock-receipts/3` `{"quantity":-19,"actor":"Test Admin"}`
  then `{"quantity":-20}`. `activity_log` for that receipt: `UPDATE actor "Test Admin"` and
  `UPDATE actor NULL`; user 6 appears nowhere.
- **ADR:** ADR-080 (the stamp answers "whose number is this", the history "who touched it");
  rule 9 (before/after snapshot — present and correct; only the actor is weak).
- **Smallest fix:** in `logActivity` callers use `req.user?.name ?? actor ?? null` (login wins,
  the typed name is the logged-out fallback until write-permission). Adding `actor_user_id` to
  `activity_log` is the proper version and is a schema step.

### I-14 — P3 — Small ones, each reproduced

- **A conversion from a meat to itself is accepted when the two ids differ in type.**
  `server/routes/allocations.js:166` compares with `===`. As 4: `POST /api/allocations/conversion`
  `{"restaurant_id":1,"business_date":"2026-11-16","from_meat_id":2,"to_meat_id":"2","from_quantity":10,"to_quantity":1}`
  → 200, two rows on the same meat netting 9 "explained". Fix: `Number(from) === Number(to)`.
- **Renaming or switching off the "Portion Conversion" type in Settings breaks conversions.**
  `PUT /api/settings/adjustment-types/7` `{"name":"Conversion","active":1}` → every
  `POST /api/allocations/conversion` answers 500 "setup problem" (`allocations.js:182-183` finds
  the type by name). At the next server start `schema.sql`'s `INSERT OR IGNORE` adds a second
  "Portion Conversion" row, so the list then holds both. The staff-meal-log spec will find
  "Staff Meal / In-House" by name the same way. Fix: refuse a rename or switch-off of the seeded
  types in the PUT (ADR-083 does this for built-in roles).
- **Usage is 0 for any date before the day the seed ran.** `server/db/seed.js:130,148` stamps every
  recipe `effective_from = today`. 10 Pork Bagnet sold on 2026-11-15 → JOWL `usage 0`; the same
  sale on 2026-11-16 → usage counted. Only bites when a day before install is entered or
  re-read. Fix: seed with a fixed early date (e.g. `2000-01-01`).
- **`lookbackDays` and `timezone` in `server/db/loyverse-name-map.json` are not read.** The engine
  uses its own constants (`loyversePreview.js:30`, `businessDay.js:6`). Editing the file changes
  nothing. Fix: delete the two keys or read them.

### I-15 — P2 — Seeds: two seeded things have no server-start path, and a site added in Settings gets neither

`beta.db` is seeded once at install (`scripts/restaurant-pc.bat:174-175`, plain `seed.js`) and
never again. Proof run on the throwaway db: I deleted the rows below, started the server, and
looked at what came back.

| Seeded thing | Where it is seeded | Comes back at server start? |
|---|---|---|
| Adjustment types (7) | `schema.sql:726-733`, run by `connection.js` on every start | Yes |
| `supervisor` role; default role switches (`role-switches`) | `permissions.js:402-430`, called from `server/index.js:23` | **Yes** (8 rows and the `defaults_applied` mark returned) |
| The other five roles; the bootstrap `superadmin` | `seed.js:215-248` only | No — fine, present from the install seed |
| Restaurants, meats, dishes, recipes; commissary, meat types, commissary meats | `seed.js:80-209` only | No — fine for install; later changes are Settings / the workbook |
| **Sheet definitions** ("Landing" per restaurant, "Commi" per commissary) | `seed.js:253-254` -> `ensureDefaultSheets` only | **No** (0 rows after the start) |
| **Staff meal slot names** | `seed.js:259-268` only, and only for codes `RA` and `FC` | **No** (0 rows after the start; the spec says "dev and previews only", so an admin types them in Settings) |
| Test accounts | `npm run seed:test` only | No — by design (ADR-039) |
| Loyverse name map | a JSON file read on each request | Yes (arrives with the code) |

- **What goes wrong:** (a) a restaurant or commissary added in Settings after install
  (`POST /api/settings/restaurants`, ran it with code `T3`) has no sheet definition, no slots and
  no locations — Likod (ADR-030) and any later branch (ADR-085) start with none, and the planned
  steps that read sheet definitions (sheet-close, side-sheets' site list) will not see their meat
  sheet. (b) Any step that later adds a default to `seed.js` (side-waste's `check_kitchen` /
  `check_bar`, cost-guard's `see_costs`) reaches the restaurant PC only if it goes through
  `ensureRoleDefaults`' named sets — the cost-guard and staff-meal-log specs say so; ADR-086's
  text says "seeded", so its step spec should name the set.
  (c) The name map holds dishes D040-D043 that have no `dishes` row in either seed file — harmless
  while the preview writes nothing, a gap the day the real port writes `sales`.
- **Repro (ran):** on `dev.db`: `DELETE FROM sheet_definitions WHERE engine_type='MEAT'; DELETE FROM
  staff_meal_slots; DELETE FROM role_capabilities; DELETE FROM defaults_applied;` then start the
  server → `sheet_definitions 0, staff_meal_slots 0, role_capabilities 8, defaults_applied 1`.
- **ADR:** ADR-007 (Beta pinned to tags, never reseeded), ADR-085, ADR-097 (runs without a coder).
- **Smallest fix:** call `ensureDefaultSheets(db)` next to `ensureRoleDefaults(db)` in
  `server/index.js` (it is already idempotent). Leave slot names to Settings, as specced.

## Notes on the three specced steps (not built — read against the code they will touch)

**side-sheets** (`docs/session-status.md`, "Step side-sheets"; touches `engines/sideItems.js`)

1. **A changed conversion rewrites nothing but skews "Used".** `setUnit` updates `per_main` in
   place (`sideItems.js:145-146`) and the import may call it. The spec stores `ending_main` at save
   time, so yesterday's ending is in the old factor and today's in the new one; Used jumps on that
   day with nothing on the card saying why. Say in the spec: store the factor (or the main-unit
   figure per part) with the count, and tag the first day after a factor change.
2. **A missing conversion costs two days and never heals.** `ending_main` is NULL when a part has
   no conversion, so that day's Used is null and so is the next day's (its "Yesterday" is null).
   ADR-079 says past counts keep their saved numbers, so adding the conversion afterwards leaves
   the stored NULL unless the count is saved again. Say what happens: recompute NULL rows when a
   conversion is added, or show "re-save to convert".
3. **Negative Used is not specified.** An ending above yesterday + received (an untyped delivery)
   gives a negative usage that nets off quietly in any later sum. Show it as "more than expected -
   check Received", and keep null (not known) apart from 0 in every total and in COOKED.
4. **Received on a day with no ending is dropped.** With B3 (no carry) a received quantity saved on
   a skipped day never reaches any Used. Accepted skew for endings; say it covers receipts too.
5. **Save per card is the right call** — it avoids I-01's whole-page overwrite. Keep it: the PUT
   must carry one item, and a restored draft must stay visibly "(unsaved)" as on the landing.
6. **The log's actor** should be the logged-in person, not a passed-in name (I-13), and the past-date
   edit of an item since switched off needs a rule (the spec makes it read-only, so a wrong old
   count on a removed item cannot be fixed).

**side-waste** (ADR-064, ADR-086; no step text yet)

1. **Which day a line belongs to.** "Log waste any time" needs a rule for a line typed the next
   morning for last night: the business date at the time of logging puts it on the wrong day and
   two days' COOKED are off. Staff meals already have "late logs up to 3 days back by the head
   chef"; the same rule would do.
2. **Units.** "Amount in any unit" hits the same missing-conversion and changed-conversion cases as
   endings (notes 1 and 2 above); store the main-unit number at save.
3. **COOKED = Used - waste - in-house** must be null when Used is null, and flagged when waste is
   larger than Used, never shown as a negative.
4. **Fix and charge.** "The checker can fix a line" needs before/after history and a soft delete; a
   line marked charged (ADR-088) must not lose its charge when it is fixed.
5. **Type names.** If the three types reuse `adjustment_types` rows by name, an admin can rename or
   switch them off today (I-14). Pin them.

**cost-guard** (`docs/session-status.md`, "Step cost-guard"; ADR-060: "every read of a unit cost or
price, logged out included")

1. **History is not on the list.** `GET /api/history` is open to everyone and returns the
   `before`/`after` snapshots as stored (`server/routes/history.js:46-66`). Ran it logged out: the
   rice rate snapshot (with its price per kg) and the slot snapshots (fixed budget, per-head rate)
   are in the answer today. Once Settings edits are logged (I-11) every cost change would be
   readable there too. The spec's four reads need a fifth: strip the cost fields from history
   snapshots for a reader without `see_costs`.
2. **Two price reads are left open by the spec.** `GET /api/settings/staff-rice-rates` (price per
   kg) and `GET /api/settings/staff-meal-slots` (budgets) answer logged out (ran both). The spec
   lists budgets as "not touched" (ADR-027), but the rice price is a unit price; `COST_FIELDS`
   holds only `cost_per_unit` and `cost_per_portion`.
3. **Side items:** `siteSideSheets` already takes `withCost` (`sideItems.js:209-226`); the spec's
   "its reads go through withoutCosts" should name that flag so there are not two mechanisms.
4. **The PUT rule is right and wider than costs:** "keep the stored value when the key is absent"
   is also what `active` needs today (I-11, item 4).

## Known and still open (re-confirmed, not new)

- **A blank cannot clear a count** (gap hunt 2026-09-03, finding 5). Ran it: count 999, then save
  the row blank → 200, stored value still 999. A count typed on the wrong row can only be
  overwritten, never removed.
- **Adjustments and conversions are create-only** (CRUD audit 2026-09-03); shipments too (I-05).
- **The commissary has no supplier intake** (`commissary_stock_receipts` has no write path; Step
  25a; on the write-path allowlist). Every commissary balance is short by what arrived until then.
- **A restaurant-to-restaurant transfer credits nobody** (Step 25e, queued).
- **Refunds on the Silingan + Likod side count as sales** (ADR-076: follows at the real port).
  Probe: a sale of 2 plus its refund reads as 4, so the figure is off by twice the refunded amount.
- **A wildcard catches a new item silently** (settled 2026-10-03; the terminal report is the check).
  Probe: `Braised Beef*` took a new "Braised Beef ... NEW ITEM" line with no entry in `unmatched`.
- **Logged-out requests may write** until write-permission (ADR-040) — it widens I-09 and the
  opening edits below.
- **Opening stock and commissary adjustments are not logged, and a cleared opening is a hard
  delete** (rule 9; settled 2026-09-02). Ran it: a blind counter (who gets 403 on *reading* month
  openings) changed an opening 100 → 60, and a logged-out request cleared another; neither left
  any row anywhere. Inside the settled scope — but it is the one number that moves a whole month's
  beginning, so it is the first table I would add when the parked "log on every table" is taken up.

## Checked and found clean

- **Beginning stock chain** (`getBeginningStock`, both engines): declared opening wins on its date;
  otherwise the last count or opening is carried day by day with that day's receipts and usage;
  a recount difference lands on the opening's own day; Copy all uses last month's final real count
  and gives difference 0. Hand-checked against live requests. The one fault is I-10.
- **The month block:** a count for a meat with no opening in the month is refused and named in
  `refused`; blocked rows report no figures; a recount order on a blocked item is refused.
- **Cross-site ids on counts and openings:** a meat id from another restaurant is refused on
  `POST /daily-audit` (blocked) and on `POST /daily-audit/month-opening` (404).
- **Blind counting:** the stripped response carries no beginning, new stock, usage or variance
  (suite + live read as Test Counter RA); COUNT / EDIT / RECOUNT typing is right apart from I-01.
- **Portion conversion:** two linked rows in one transaction, signs right, type resolved on the
  server, both meats must belong to the restaurant.
- **Stock receipts and yield log:** every create / edit / soft delete writes its `activity_log` row
  with before and after in the same transaction; deletes are soft; a deleted row leaves the sums.
- **Yield:** kg-only output, same-commissary output, raw >= backed + miscut, miscut never softens
  the loss %, true loss = raw - backed - miscut; a unit-tracked input debits its count.
- **`commissary_meat_map`:** nothing reads or writes it; no code path matches a commissary meat to
  a restaurant meat by code (rule 15 holds). Shipment lines name the restaurant meat explicitly and
  it must belong to the destination restaurant.
- **Loyverse preview** (stubbed receipts): the 8am Manila boundary (07:59:59 stays on the old day,
  08:00:00 starts the new one), cancelled receipts skipped, FC refunds subtract, exact names beat
  wildcards, names compare ignoring case and spaces, a failed or tokenless account gives null
  totals and never 0. The live name map has no name under two dishes and no overlapping wildcards.
- **Staff-meal settings:** admin-only writes (403 counter, 401 logged out); a past or impossible
  date and a zero value are refused; the latest rate not after the day wins, the newest on a tie,
  null before the first; a slot edit logs before and after; nothing is deleted.
- **Seeds:** no cost or price in any seed file; role defaults reach a never-reseeded database.
- **Backups** (`restaurant-pc.bat:419-435`): taken with the app stopped, and the `-wal` file is
  copied with the database.
- **Page default dates:** the pages use the UTC date, which is exactly the 8am Manila business
  date (ADR-036) — correct, though only because Manila is UTC+8.

## Not got to

- The browser pages themselves were not clicked; every repro is an HTTP request or a script. The
  two page behaviours findings rely on (the landing and the commissary page post every row; the
  commissary Notes box is not pre-filled) were read in the page source, not watched in a browser.
- `scripts/import-settings.js` (the workbook import): not run — whether a re-import can change a
  recipe, unit or cost under existing counts is unchecked.
- Roles, roster and login routes; `public/terminal.html`'s command parser; the migrations in
  `server/db/migrate.js` against an old database.
- The Loyverse engine against the real API (tokens were empty by instruction): variants and
  modifiers of an item are not read by the engine — one item sold in two sizes counts 1 each.
- Kitchen Sales, the dashboard rollup's reverse conversion maths, and the History page.
- Recount orders beyond the stale-overwrite case; portion (dish) counts beyond a read.

## Short design notes (settled — not arguing)

- ADR-015 "last save wins" is safe only when a save means "I typed this"; I-01 and I-02 are where
  it does not. The 2026-09-15 "changed under you - reload" direction would close both for good.
- Rule 9 keeps the log to two tables; the edits that move the most stock with the least trace
  today are openings and Settings.
- ADR-060 lets a cook see a staff meal's running cost; one meat line of quantity 1 shows that
  meat's unit cost.

Status: COMPLETE. The server started for this run was stopped; `dev.db` stays inside the review
clone at `~/fable-review-2/review/server/db/` (delete the `~/fable-review-2` folder when done).
