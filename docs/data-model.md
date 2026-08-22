# Data Model — derived from RestaurantA_Audit.xlsx

This document is the source of truth for the database schema. It reflects the
actual structure of the Excel workbook that's been validated in production use,
translated into database tables. Claude Code should treat this as authoritative
— do not invent columns or rename fields without checking here first.

## Design principle
The Excel workbook stored some things as raw input and calculated others with
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
Maps directly from the `Meats` sheet.

| column | type | notes |
|---|---|---|
| id | integer, PK | |
| restaurant_id | integer, FK | |
| meat_code | text | e.g. "M01" (was MeatID) |
| name | text | e.g. "Whole Chicken Raw" |
| unit | text | `kg` or `unit` — only two units seen in real data, but don't hardcode a restrictive enum, just validate against a short list |
| cost_per_unit | decimal, nullable | optional in the source sheet |
| active | boolean | |

Real example rows from the workbook (for seeding/testing, not final data):
```
M01 | Whole Chicken Raw | unit
M02 | Belly Slab         | kg
M03 | JOWL                | kg
M04 | PATA                | unit
M05 | Shortplate          | kg
```

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

Real example rows:
```
D001 | Mozarella Sticks | Batch-Prepped
D003 | Bagnet Sisig      | Batch-Prepped
D013 | Pan Fry Pork Steak | Direct
```

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

**Important**: a dish can have 0, 1, or many rows here (one per meat it uses). Not
every dish needs a BOM row (e.g. a dish with no meat, or not yet configured).
The real workbook currently has most dishes WITHOUT quantities filled in —
this table starts mostly empty and gets filled in through the admin UI over time,
not from the xlsx import.

---

## 5. Daily input tables (the only things a human types)

### new_stock
| column | type | notes |
|---|---|---|
| id | integer, PK | |
| restaurant_id | integer, FK | |
| meat_id | integer, FK | |
| business_date | date | |
| quantity | decimal | |
| photo_path | text, nullable | local file path to the reference photo, if attached |
| created_by | text | who entered it |
| created_at | timestamp | |

### ending_actual
Same shape as `new_stock`, but represents the physical count at close of day.
| column | type | notes |
|---|---|---|
| id | integer, PK | |
| restaurant_id | integer, FK | |
| meat_id | integer, FK | |
| business_date | date | |
| quantity | decimal | |
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
real physical count entered by a human. This mirrors how every station already
does physical end-of-day counts in the existing (non-app) process — this app
is the meat-focused audit layer on top of that, not a replacement for it.

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

Allocations can move meat in two directions that both need to be representable:
restaurant-to-restaurant/commissary, and station-to-station within one
restaurant (e.g. grill station transfers raw meat to the prep station).
A single flexible `locations` table covers both without needing two schemas.

### locations
| column | type | notes |
|---|---|---|
| id | integer, PK | |
| restaurant_id | integer, FK, nullable | which restaurant this location belongs to; null = a shared/central location like a commissary that isn't tied to one restaurant |
| name | text | e.g. "Silingan - Grill Station", "Silingan - Prep Station", "Commissary", or just "Restaurant B" if you don't need station-level granularity for that restaurant |
| is_restaurant_level | boolean | true if this location represents the whole restaurant (the common case); false if it's a specific station within one |

Keeping this generic means you don't need to define every station up front —
add locations as needed, and most restaurants can just have one "whole
restaurant" location if station-level tracking isn't needed there.

---

## 8. adjustment_types (admin-managed, flexible — not hardcoded)

You asked for this to be extensible without code changes. So instead of a
fixed enum, adjustment categories live in their own table, editable from an
admin screen (add/rename/deactivate a category any time).

### adjustment_types
| column | type | notes |
|---|---|---|
| id | integer, PK | |
| name | text | e.g. "Wastage", "Staff Meal / In-House", "Allocation / Transfer", "Spoilage", "Damaged" |
| requires_transfer_locations | boolean | true only for types like "Allocation/Transfer" that need a from/to location; false for simple loss types like wastage |
| active | boolean | lets you retire a category without deleting its history |

Seed with a reasonable starting set (Wastage, Staff Meal / In-House,
Allocation / Transfer, Spoilage, Damaged) but the admin screen lets you add
more any time — no code change needed, this is pure data.

---

## 9. adjustments
References `adjustment_types` instead of a hardcoded type column. For
transfer-type adjustments, also references two `locations` rows (from/to).

| column | type | notes |
|---|---|---|
| id | integer, PK | |
| restaurant_id | integer, FK | |
| meat_id | integer, FK | |
| business_date | date | |
| quantity | decimal | |
| adjustment_type_id | integer, FK → adjustment_types | |
| from_location_id | integer, FK → locations, nullable | only used when adjustment_type.requires_transfer_locations = true |
| to_location_id | integer, FK → locations, nullable | only used when adjustment_type.requires_transfer_locations = true |
| notes | text | |
| created_by | text | |

```
expected_ending(meat, date) = ending_calculated(meat, date) - adjustments(meat, date)
unexplained_variance(meat, date) = expected_ending(meat, date) - ending_actual(meat, date)
```

This is now confirmed in scope for MVP — not deferred.

---

## Confirmed scope (resolved)
- This app audits **meat only** — it sits alongside the existing full
  station-by-station daily inventory process (which continues as-is, unchanged)
  rather than replacing it. Meat gets special treatment here because of cost.
- Both `ending_actual` (raw meat) and `portion_ending_actual` (finished
  portions) are real physical counts a human enters — always, alongside the
  calculated expected values. Nothing here removes the physical count step.
- Adjustment categories are flexible and admin-managed (`adjustment_types`
  table), not a hardcoded list — new categories can be added without touching
  code.
- Allocations/transfers support both restaurant-to-restaurant/commissary AND
  station-to-station within a single restaurant, via a generic `locations`
  table.

## Still open
1. Recipe_BOM quantities are NOT filled in for most dishes in the real
   workbook — confirmed this gets finished via the admin UI over time, not
   from the xlsx import. The xlsx import only seeds `meats`, `dishes`, and
   whatever partial `recipe_bom` rows already exist.
