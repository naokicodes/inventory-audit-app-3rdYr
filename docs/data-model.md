# Data Model — derived from RestaurantA_Audit.xlsx (+ Commi_Audit_Master.xlsx)

This document is the source of truth for the database schema. It reflects the
actual structure of the Excel workbooks that have been validated in production
use, translated into database tables. Claude Code should treat this as
authoritative — do not invent columns or rename fields without checking here
first.

**2026-08-27 update**: the original per-restaurant `new_stock` table (section
5) has been replaced by a unified `stock_receipts` log, and two new areas have
been added — commissary yield tracking and the activity log. See
`docs/commissary-and-stock-receipts.md` for the full reasoning; this file has
the resulting schema only.

**2026-08-28 update (architecture review)**: two items previously listed under
"Still open" are now resolved decisions — see section 5 (`stock_receipts.
restaurant_id` is now nullable, to represent commissary shipments not yet
assigned to a restaurant) and section 10a (commissary meat mapping gets an
admin CRUD screen). The excess-loss formula (previously "still open" item 2)
was actually pinned down and verified back on 2026-08-28 per
`commissaryYieldEngine.js`/`.test.js` — this doc was just never updated to
reflect that; corrected below. See `docs/changelog.md` for the full reasoning
behind this round of decisions.

## Design principle
The Excel workbooks stored some things as raw input and calculated others with
formulas. We preserve that split:
- **Input tables** = things a human types in (blue cells in the old workbook)
- **Derived values** = calculated on read, not stored redundantly (black/green
  formula cells in the old workbook)

---

## 1. restaurants
| column | type | notes |
|---|---|---|
| id | integer, PK | |
| name | text | e.g. "Restaurant A" |
| code | text | short code, e.g. "RA" |
| active | boolean | |

---

## 2. meats
Maps directly from the `Meats` sheet. Scoped per restaurant — a restaurant's
own meat list, distinct from the commissary's global list (section 10).

| column | type | notes |
|---|---|---|
| id | integer, PK | |
| restaurant_id | integer, FK | |
| meat_code | text | e.g. "M01" (was MeatID) — **confirmed NOT guaranteed to match commissary codes of the same text**, see section 10 |
| name | text | e.g. "Whole Chicken Raw" |
| unit | text | `kg` or `unit` — only two units seen in real data, but don't hardcode a restrictive enum, just validate against a short list |
| cost_per_unit | decimal, nullable | optional in the source sheet |
| active | boolean | |

---

## 3. dishes
Maps directly from the `Dishes` sheet.

| column | type | notes |
|---|---|---|
| id | integer, PK | |
| restaurant_id | integer, FK | |
| dish_code | text | e.g. "D001" (was DishID) |
| name | text | |
| prep_type | text | `DIRECT` or `BATCH_PREPPED` — this determines which daily input drives usage (Sales vs Prepped) |
| cost_per_portion | decimal, nullable | |
| active | boolean | |

---

## 4. recipe_bom
Maps directly from the `Recipe_BOM` sheet. This is the link table — the engine
that drives all usage calculations.

| column | type | notes |
|---|---|---|
| id | integer, PK | |
| dish_id | integer, FK | |
| meat_id | integer, FK | |
| quantity | decimal | amount of that meat used per single order/portion of the dish, in the meat's unit |
| effective_from | date | supports recipe versioning — don't destroy history when a recipe changes |
| effective_until | date, nullable | null = current version |

---

## 5. Daily input tables (the only things a human types)

### stock_receipts (replaces `new_stock` — see `commissary-and-stock-receipts.md`)
A flat log of everything received at a restaurant, whether shipped from the
commissary or delivered direct. One page, restaurant labeled per row, not
per-restaurant tabs.

| column | type | notes |
|---|---|---|
| id | integer, PK | |
| restaurant_id | integer, FK, **nullable (2026-08-28)** | **NULL means "shipped from the commissary, not yet assigned to a restaurant"** — the "Unallocated" case from the real xlsx's `Outbound_Log`. Only valid when `source = COMMISSARY`; a `DIRECT` receipt must always have a restaurant, since a direct delivery is by definition addressed to one. See "Unallocated receipts" note below. |
| meat_id | integer, FK, **nullable (2026-08-28)** | **NULL only when `restaurant_id` is also NULL** (an unallocated row hasn't been assigned to a restaurant yet, so it can't reference that restaurant's own meat item — only `commissary_meat_id` is known at that point). Non-null in every other case. |
| business_date | date | |
| quantity | decimal | |
| source | text | `DIRECT` or `COMMISSARY` |
| commissary_meat_id | integer, FK → commissary_meats, nullable | set only when source = COMMISSARY. For an unallocated row this is the ONLY meat reference present. |
| notes | text, nullable | |
| photo_path | text, nullable | |
| created_by | text | |
| created_at | timestamp | |
| deleted_at | timestamp, nullable | soft delete — see section 11 |

**No unique constraint on (restaurant_id, meat_id, business_date)** —
deliveries are irregular and can repeat within a day. `new_stock(meat, date)`
is now `SUM(quantity)` over matching, non-deleted rows for that date —
calculated, same treatment as beginning/usage/variance below, not a
single-row lookup. **A row with `restaurant_id IS NULL` is never counted
toward any restaurant's `new_stock`** — it isn't attributable to one yet by
definition.

#### Unallocated receipts (resolved 2026-08-28)
Previously flagged as an open gap: the real xlsx's `Outbound_Log` allows a
commissary shipment with no restaurant destination yet ("Unallocated"), but
the original schema had `restaurant_id NOT NULL`, so this case wasn't
representable.

**Decision**: `restaurant_id` and `meat_id` are now nullable, with the
constraint above (both null together, only for `source = COMMISSARY`). An
unallocated row is created via the normal `POST /api/stock-receipts` flow but
with restaurant left unset. It is later assigned via
`PATCH /api/stock-receipts/:id` — a genuinely new capability, not just an
edit to existing editable fields — setting `restaurant_id` and `meat_id`
together (`meat_id` must be resolvable via `commissary_meat_map` for the
chosen restaurant, same validation `POST` already applies). Both the create
and the later assignment go through the existing `activity_log` machinery —
assignment is logged as an `UPDATE`, same as any other edit.

**Why this approach over a placeholder "Unallocated" row in `restaurants`**:
a placeholder restaurant would pollute restaurant-scoped reporting (it would
show up in "restaurants" dropdowns, weekly summaries, etc. as if it were a
real location) for no benefit over a nullable column. Nullable + explicit
assignment-later keeps unallocated stock cleanly invisible to
restaurant-facing screens until it's actually assigned.

Tracked as **step 9** in `docs/session-status.md`.

### ending_actual
Unchanged.
| column | type | notes |
|---|---|---|
| id | integer, PK | |
| restaurant_id | integer, FK | |
| meat_id | integer, FK | |
| business_date | date | |
| quantity | decimal | |
| notes | text | |
| photo_path | text, nullable | |
| created_by | text | |
| created_at | timestamp | |

### sales
Populated by the Loyverse sync, not manual entry — see `loyverse-sync.md`.
| column | type | notes |
|---|---|---|
| id | integer, PK | |
| restaurant_id | integer, FK | |
| dish_id | integer, FK | |
| business_date | date | |
| quantity | decimal | |
| source | text | `LOYVERSE` or `MANUAL` |

### prepped
For Batch-Prepped dishes only — portions actually cooked that day, not sold.
This, not `sales`, drives meat usage for these dishes.
| column | type | notes |
|---|---|---|
| id | integer, PK | |
| restaurant_id | integer, FK | |
| dish_id | integer, FK | |
| business_date | date | |
| portions_produced | decimal | |
| created_by | text | |

---

## 6. Everything else is CALCULATED, not stored as a separate input table

These map to formula-driven sheets in the old workbook (`Beginning_Stock`,
`Usage_Summary`, `Ending_Calculated`, `Variance`, `Weekly_Summary`, `Dashboard`,
`Portion_*`). Do not create input tables for these — compute them in the audit
engine when a report or the daily audit screen is requested.

### beginning_stock (calculated, not stored)
```
beginning_stock(meat, date) =
  ending_actual(meat, date - 1)
  -- except day 1 / first-ever entry, which needs a one-time manual
     opening count (store this ONE value per meat as an `opening_stock` table)
```

### new_stock (calculated, not stored — see section 5)
```
new_stock(meat, date) =
  SUM(stock_receipts.quantity WHERE meat = ? AND date = ? AND deleted_at IS NULL
      AND restaurant_id IS NOT NULL)
  -- the restaurant_id IS NOT NULL clause excludes unallocated commissary
     shipments that haven't been assigned to a restaurant yet (2026-08-28)
```

### usage (calculated, not stored)
```
usage(meat, date) =
  SUM over all DIRECT dishes:  sales(dish, date) * recipe_bom(dish, meat).quantity
  + SUM over all BATCH_PREPPED dishes: prepped(dish, date) * recipe_bom(dish, meat).quantity
```

### ending_calculated (calculated, not stored)
```
ending_calculated(meat, date) =
  beginning_stock(meat, date) + new_stock(meat, date) - usage(meat, date)
```

### variance (calculated, not stored)
```
variance(meat, date) = ending_calculated(meat, date) - ending_actual(meat, date)

sign convention:
  positive = shortage (meat missing)
  negative = surplus (more on hand than expected)
```

### portion_ending_actual (CONFIRMED — this is a real stored input table, not calculated)
Same treatment as raw meat: there is always a calculated expected value AND a
real physical count entered by a human.

| column | type | notes |
|---|---|---|
| id | integer, PK | |
| restaurant_id | integer, FK | |
| dish_id | integer, FK | (Batch-Prepped dishes only) |
| business_date | date | |
| portions_counted | decimal | physical count of ready-to-serve portions |
| photo_path | text, nullable | |
| created_by | text | |

```
portion_beginning(dish, date) = portion_ending_actual(dish, date - 1).portions_counted
portion_ending_calculated(dish, date) =
  portion_beginning(dish, date) + prepped(dish, date) - sales(dish, date)
portion_variance(dish, date) =
  portion_ending_calculated(dish, date) - portion_ending_actual(dish, date).portions_counted
```

---

## 7. Locations (for transfers/allocations between restaurants AND stations)

### locations
| column | type | notes |
|---|---|---|
| id | integer, PK | |
| restaurant_id | integer, FK, nullable | null = a shared/central location like a commissary that isn't tied to one restaurant |
| name | text | e.g. "Silingan - Grill Station", "Commissary" |
| is_restaurant_level | boolean | true if this location represents the whole restaurant |

---

## 8. adjustment_types (admin-managed, flexible — not hardcoded)

### adjustment_types
| column | type | notes |
|---|---|---|
| id | integer, PK | |
| name | text | e.g. "Wastage", "Staff Meal / In-House", "Allocation / Transfer", "Spoilage", "Damaged" |
| requires_transfer_locations | boolean | true only for types like "Allocation/Transfer" |
| active | boolean | |

---

## 9. adjustments

| column | type | notes |
|---|---|---|
| id | integer, PK | |
| restaurant_id | integer, FK | |
| meat_id | integer, FK | |
| business_date | date | |
| quantity | decimal | |
| adjustment_type_id | integer, FK → adjustment_types | |
| from_location_id | integer, FK → locations, nullable | |
| to_location_id | integer, FK → locations, nullable | |
| notes | text | |
| created_by | text | |

```
expected_ending(meat, date) = ending_calculated(meat, date) - adjustments(meat, date)
unexplained_variance(meat, date) = expected_ending(meat, date) - ending_actual(meat, date)
```

---

## 10. Commissary tables (new — see `commissary-and-stock-receipts.md` for full reasoning)

### commissary_meats
Global list, independent of any restaurant's `meats` table.

| column | type | notes |
|---|---|---|
| id | integer, PK | |
| code | text, unique | e.g. "M01" — commissary's own numbering |
| name | text | |
| unit | text | `kg` or `unit` |
| allowed_leeway_pct | decimal | normal trim/processing loss |
| cost_per_unit | decimal, nullable | |
| active | boolean | |

### commissary_meat_map
Explicit mapping — commissary and restaurant meat codes are **confirmed not
aligned** (checked against real seed data: e.g. commissary M01 = "Whole
Chicken" backed/processed, Restaurant A's own M01 = "Whole Chicken Raw" —
different items entirely). Never infer this mapping from matching code
strings.

| column | type | notes |
|---|---|---|
| id | integer, PK | |
| commissary_meat_id | integer, FK → commissary_meats | |
| restaurant_id | integer, FK → restaurants | |
| meat_id | integer, FK → meats | |

`UNIQUE (commissary_meat_id, restaurant_id)`.

### 10a. commissary_meat_map admin screen (resolved 2026-08-28)
Previously "still open" (item 3, old list): whether `commissary_meats`/
`commissary_meat_map` need their own admin CRUD screen, or a one-time seed is
enough.

**Decision**: yes, build an admin screen now. `commissary_meats` itself can
stay seed-only for the current single-commissary setup (still just the 14
real rows from `commissary-seed-data.json` — no CRUD needed there yet), but
`commissary_meat_map` **needs a real admin screen**, because right now the
only way to create a mapping row is a developer hand-writing SQL (this is
literally how the test fixtures in `commissaryYieldEngine.test.js` do it).
That's a hard blocker the moment Restaurant B/C come online, and it already
means `stock_receipts`' "not mapped yet — set this up in Settings" error
message points at a Settings screen that doesn't exist.

Add a "Commissary Mapping" tab to `settings.html` (same tab pattern as
Meats/Dishes/Recipes) plus a route in `settings.js`: list existing mappings
for the selected restaurant, and a simple add-form (commissary meat dropdown
× that restaurant's meat dropdown → creates one `commissary_meat_map` row).
No edit needed for v1 (a wrong mapping is delete + re-add); no activity-log
wiring needed (this table isn't in the step-6 scope per
`rules-for-claude-code.md` rule 9 — it's reference/config data, not a daily
transactional log).

Tracked as **step 8** in `docs/session-status.md`.

### commissary_yield_log
One row per raw delivery/processing event at the commissary. Not tied to any
restaurant — this happens before allocation.

| column | type | notes |
|---|---|---|
| id | integer, PK | |
| commissary_meat_id | integer, FK | |
| business_date | date | |
| raw_weight_in | decimal | |
| backed_weight_out | decimal | |
| notes | text, nullable | |
| created_by | text | |
| created_at | timestamp | |
| deleted_at | timestamp, nullable | |

```
actual_loss_pct(row) = (raw_weight_in - backed_weight_out) / raw_weight_in
status(row) = 'Review' if actual_loss_pct(row) > commissary_meats.allowed_leeway_pct else 'Pass'
```
(Both calculated, not stored.)

**Excess-loss formula (resolved, was previously listed as "still open"):**
```
excess_loss(row) = max(0, (raw_weight_in - backed_weight_out)
                          - raw_weight_in * allowed_leeway_pct)
```
Pinned down and verified against all real rows in `Commi_Audit_Master.xlsx`'s
`Yield_Log` sheet (7 Review + 38 Pass + 1 zero-weight edge case) back on
2026-08-28 — see `server/engines/commissaryYieldEngine.js` and its test file.
This doc previously still listed the formula as open; that was a docs lag,
not an unresolved formula. Corrected here.

### commissary_balance (calculated, not stored)
```
commissary_balance(commissary_meat) =
  SUM(commissary_yield_log.backed_weight_out WHERE deleted_at IS NULL)
  - SUM(stock_receipts.quantity WHERE commissary_meat_id = ? AND source = 'COMMISSARY' AND deleted_at IS NULL)
```
Note: this SUM is destination-agnostic — it subtracts a `COMMISSARY`-source
`stock_receipts` row whether or not `restaurant_id` is set, so an unallocated
shipment (section 5) still correctly leaves the commissary's on-hand balance
once shipped, even before it's assigned to a restaurant. Matches the real
xlsx's own `Commissary_Stock` formula, which the 2026-08-28 changelog entry
confirmed sums `Outbound_Log` "regardless of destination."

---

## 11. activity_log (new — audit trail)

| column | type | notes |
|---|---|---|
| id | integer, PK | |
| timestamp | timestamp | |
| actor | text | plain text — no auth system yet, see `scope.md` |
| entity_type | text | e.g. "stock_receipts" |
| entity_id | integer | |
| action | text | `CREATE`, `UPDATE`, `DELETE` |
| before | text, nullable | JSON snapshot |
| after | text, nullable | JSON snapshot |
| source | text | `SYSTEM` or `MANUAL` |

Every write to `stock_receipts` or `commissary_yield_log` writes a matching
row here in the same transaction. Deletes on those two tables are soft
(`deleted_at`), never physical. This pattern is scoped to these two tables
for now — extending it to `ending_actual`/`adjustments`/`prepped`/
`portion_ending_actual` is real follow-up work, not bundled into this change.

An unallocated-receipt assignment (section 5) is logged as a normal `UPDATE`
row here — no special-casing needed, since it goes through the same
`PATCH /api/stock-receipts/:id` path as any other edit.

---

## Confirmed scope (resolved)
- This app audits **meat only** — it sits alongside the existing full
  station-by-station daily inventory process (which continues as-is,
  unchanged) rather than replacing it.
- Both `ending_actual` (raw meat) and `portion_ending_actual` (finished
  portions) are real physical counts a human enters, alongside calculated
  expected values.
- Adjustment categories are flexible and admin-managed, not hardcoded.
- Allocations/transfers support restaurant-to-restaurant/commissary AND
  station-to-station via the generic `locations` table.
- Stock receipts (new stock, from any source) are a single unified log
  across all restaurants, not per-restaurant tables — see section 5.
- Commissary yield tracking is in scope as of 2026-08-27 — see section 10.
- `stock_receipts.restaurant_id`/`meat_id` are nullable, to represent an
  unallocated commissary shipment — resolved 2026-08-28, see section 5.
- `commissary_meat_map` gets its own admin screen — resolved 2026-08-28,
  see section 10a.

## Still open
1. Recipe_BOM quantities are NOT filled in for most dishes in the real
   workbook — finished via the admin UI over time, not from the xlsx import.
2. ~~Exact excess-loss formula~~ — resolved, see section 10.
3. ~~Whether `commissary_meats` needs its own admin CRUD screen~~ — resolved,
   see section 10a (`commissary_meats` itself stays seed-only;
   `commissary_meat_map` gets a real screen).
