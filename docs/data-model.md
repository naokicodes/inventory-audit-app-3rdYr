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

**2026-08-31 note**: section 10 below predates several tables that now exist
in the live `schema.sql` (`commissary_shipments`, `commissary_shipment_lines`,
`commissary_shipment_presets`, `commissary_conversion_standards`) — it was
never updated as those steps shipped. Not fixed in this pass; flagged so a
future session doesn't treat section 10 as exhaustive. The schema decisions
made in this session (multi-Commissary generalization + multi-stage yield/
allocation) are in new section **10b** below, which *is* current — see
`session-status.md`'s "Item 3 design" and "Multi-stage yield + Commissary-side
allocation" entries for the full reasoning behind each call.

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
| restaurant_id | integer, FK, nullable at the DB layer | **RETIRED 2026-08-29 (see below) — always required together with `meat_id` in practice.** The DB column stays nullable (no destructive schema change) and its `CHECK` constraint still technically permits the old shape, but the app-level route rejects it — `POST`/`PATCH /api/stock-receipts` require `restaurant_id`+`meat_id` together, always, and `source` must be `DIRECT`. |
| meat_id | integer, FK, nullable at the DB layer | Same retirement as `restaurant_id` above — required together with it in every real write path today. |
| business_date | date | |
| quantity | decimal | |
| source | text | `DIRECT` or `COMMISSARY` at the DB `CHECK` level, but the app only ever writes `DIRECT` through this table now. A `COMMISSARY`-sourced row is only ever created automatically, as a side effect of `POST /api/commissary/shipments` — never through this route. |
| commissary_meat_id | integer, FK → commissary_meats, nullable | Set on the rows `POST /api/commissary/shipments` creates automatically. Never set by a manual write through this table anymore. |
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

#### Unallocated receipts (resolved 2026-08-28, RETIRED 2026-08-29)
**Historical record only — this entire subsection describes a
workflow that no longer exists in the app.** See
`session-status.md`'s "commissary_meat_map's fate" entry (step 20) for
why: once `POST /api/commissary/shipments` always names the
destination up front, there was no remaining legitimate case for
manually logging a `COMMISSARY`-sourced receipt with the destination
left unset. **Current reality**: `POST /api/stock-receipts` accepts
`DIRECT` only, `restaurant_id`/`meat_id` always required together. See
the `stock_receipts` table entry above for the corrected column notes.
Kept below for context on the original decision, not as current spec.

Previously flagged as an open gap: the real xlsx's `Outbound_Log` allows a
commissary shipment with no restaurant destination yet ("Unallocated"), but
the original schema had `restaurant_id NOT NULL`, so this case wasn't
representable.

**Decision [superseded 2026-08-29]**: `restaurant_id` and `meat_id` are now nullable, with the
constraint above (both null together, only for `source = COMMISSARY`). An
unallocated row is created via the normal `POST /api/stock-receipts` flow but
with restaurant left unset. It is later assigned via
`PATCH /api/stock-receipts/:id` — a genuinely new capability, not just an
edit to existing editable fields — setting `restaurant_id` and `meat_id`
together (`meat_id` must be resolvable via `commissary_meat_map` for the
chosen restaurant, same validation `POST` already applies). Both the create
and the later assignment go through the existing `activity_log` machinery —
assignment is logged as an `UPDATE`, same as any other edit.

**Continuity requirement (added 2026-08-28, moot since 2026-08-29 — the capability it protected no longer exists):** the `commissary_meat_map`
lookup used to resolve `meat_id` on assignment must resolve to the *same*
`commissary_meat_id` already stored on the row being assigned — reject the
assignment otherwise. Without this check, assignment could silently
misattribute which physical commissary pool a shipment was actually drawn
from, undermining the balance/traceability this table exists for. (This
was flagged by a coding session as an ambiguity the docs didn't resolve;
confirmed correct and written in here rather than left implicit.)

**Why this approach over a placeholder "Unallocated" row in `restaurants`
[historical reasoning only]**:
a placeholder restaurant would pollute restaurant-scoped reporting (it would
show up in "restaurants" dropdowns, weekly summaries, etc. as if it were a
real location) for no benefit over a nullable column. Nullable + explicit
assignment-later keeps unallocated stock cleanly invisible to
restaurant-facing screens until it's actually assigned.

**A handful of other scattered references to "unallocated" remain
elsewhere in this file (sections on activity_log, the audit engine's
`new_stock` query, etc.) — not individually corrected in this pass,
same retirement applies to all of them.** Worth a dedicated pass if
they cause real confusion; not done here given the scope of what's
already being resolved today.

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
Two sources, distinguished by the `source` column: `LOYVERSE` (future
sync, not built yet — see `loyverse-sync.md` and rule 14) and `MANUAL`
(built as of step 16, since Loyverse sync is explicitly a later phase —
this is the interim path, not a stopgap to be removed once sync lands;
both sources coexist by design). One `MANUAL` row per
`(restaurant_id, dish_id, business_date)` — a partial unique index
enforces this (see `schema.sql`), so the Sales grid is upsert-safe
without touching how `LOYVERSE` rows behave, since a POS sync may
legitimately post several raw transaction rows per dish per day.
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
| input_quantity | decimal | step 24b-i: how much of the INPUT meat was consumed, in the input meat's own unit. NULL = same as raw_weight_in (correct for a kg-tracked input). For a unit-tracked input this is the COUNT (40 chickens) while raw_weight_in is the measured weight of that count (32.5 kg) — both are recorded on the real paper process. The audit engine debits COALESCE(input_quantity, raw_weight_in); computeYieldMetrics keeps dividing by raw_weight_in, so loss% stays kg-to-kg. |
| raw_weight_in | decimal | the weighed kg going in — see input_quantity above |
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

### 10b. Multi-Commissary generalization + multi-stage yield/allocation (resolved 2026-08-31, not yet built)

Full reasoning in `session-status.md`; this is the schema only, kept in sync
per rule 7 (architect edits this file directly when a real decision is made,
not deferred to a coder).

**Step boundary, resequenced 2026-08-31 (see session-status.md's "Item 3
design" for why)**: `commissaries`, `meat_types`, and `commissary_meats`'
new columns below are **23a**. `commissary_conversion_standards`' rekey is
**23b**, bundled with its route/engine consumers — not schema-only, don't
build it as part of 23a. `commissary_yield_log`'s `output_commissary_meat_id`
and `commissary_adjustments` belong to step 24, not 23 at all (see the
"Multi-stage yield" section of session-status.md) — included below because
they're part of the same overall design, not because they're 23a/23b work.

**New tables:**

```
commissaries                        -- 23a
  id            integer, PK
  code          text, unique      -- e.g. "COM-A"
  name          text
  active        boolean

meat_types                          -- 23a
  id            integer, PK
  name          text
  active        boolean           -- admin-managed reference table

commissary_adjustments              -- step 24, not 23
  id                              integer, PK
  commissary_meat_id              integer, FK -> commissary_meats  -- source
  business_date                   date
  kind                            text CHECK IN ('LOSS','ALLOCATION')
  quantity                        decimal
  destination_commissary_meat_id  integer, FK -> commissary_meats, nullable
                                   -- NULL for LOSS, required for ALLOCATION
  notes                           text, nullable
  created_by                      text
  created_at                      timestamp
  deleted_at                      timestamp, nullable  -- soft delete
```

**Changed tables:**

- `commissary_meats` (**23a**) gains `commissary_id` (NOT NULL, FK →
  `commissaries`) and `meat_type_id` (nullable, FK → `meat_types`).
  `UNIQUE(code)` becomes `UNIQUE(commissary_id, code)`.
- `commissary_conversion_standards` (**23b**) swaps its `commissary_meat_id`
  column for `meat_type_id` (NOT NULL, FK → `meat_types`).
  `UNIQUE(commissary_meat_id, restaurant_id, meat_id)` becomes
  `UNIQUE(meat_type_id, restaurant_id, meat_id)`. A commissary meat can only
  get a Standard once it's tagged with a `meat_type` — untagged/raw-dynamic
  meats are unaffected. Left untouched by 23a on purpose — its only
  consumers are a live route handler and 6 test files, both squarely 23b's
  job (a Claude Code session starting 23a flagged this correctly per rule 3
  rather than making a "minimal mechanical" fix that would have bled into
  23b's actual route/engine work).
- `commissary_yield_log` (**step 24a**) gains `output_commissary_meat_id`
  (nullable, FK → `commissary_meats`). `commissary_meat_id` means the
  **input** meat; `output_commissary_meat_id` is the **output** meat, and
  NULL means output = input. Every yield event is a debit/credit ledger
  entry: it **debits `raw_weight_in` from the input** and **credits
  `backed_weight_out` to the output** (`getCommissaryBackedUp` credits
  `output_commissary_meat_id` when set, else `commissary_meat_id`). A
  cross-row event (raw → backed, or one stage feeding the next) debits one
  row and credits another; a NULL/same-meat event hits both sides of the one
  meat and nets to −(raw − backed), i.e. the trim loss — a **change** from
  the pre-24a credit-only behavior, which never debited the raw and so left
  the input balance permanently inflated. No stage-count cap — chain length
  is emergent from how many rows point at each other, not a declared schema
  limit. In real commissary operations every processing step creates an
  explicit next-stage row (raw shortplate → seared → braised → ship), so the
  NULL/same-meat path is a back-compat default, not a normal workflow
  (settled 2026-09-01).

**Not new, but newly load-bearing**: `commissary-seed-data.json` already
seeds three raw/backed pairs (`M01`/`M02` Whole Chicken, `M03`/`M04` Belly
Slab, `M05`/`M06` JOWL) as separate `commissary_meats` rows that no route or
engine has ever referenced — confirmed intentional, not dead data (some
meats genuinely don't get backed up the same day). `output_commissary_meat_id`
is what finally wires these up (e.g. a yield event with `commissary_meat_id
= M02` and `output_commissary_meat_id = M01`), no new seed rows required.

**Also required (step 24a) — the input-side debit**: `getCommissaryUsage`
(`commissaryAuditEngine.js`) must also sum `commissary_yield_log.raw_weight_in`
(excluding soft-deleted rows) for every event where the meat is the input
(`commissary_meat_id`), folded into `usage` — today it only counts
`commissary_shipments`, so a raw/intermediate meat's balance never decreases
when processing consumes it. This debit and the output-side credit-retarget
above are **one coupled change, not two**: the raw-debit alone, applied before
the input/output split exists, double-subtracts on same-meat rows and reds 4 of
the engine's own balance tests (verified 2026-09-01). Confirmed bug, not a new
feature.

**Settled 2026-09-01** (resolves the "output-targeting must be nailed down"
caveat in `session-status.md`): the output linkage IS this one nullable column
— no overload of `commissary_meat_id`, no separate is-chained flag. Cross-unit
(raw chicken `unit` → processed `kg`) needs no engine conversion: `raw_weight_in`
is read in the input row's unit and `backed_weight_out` in the output row's unit
(always `kg`), and the two never reconcile because they land on different rows.
**24a is scoped to exactly this**: the `output_commissary_meat_id` column (idempotent
migration) + the coupled engine debit/credit + rewritten tests.
`commissary_adjustments`, the per-meat default-output config, and the
yield-entry form move to **24b**. Lifecycle stages that share a `meat_type` and
unit stay merged in the Dashboard rollup for now (per-stage rollup visibility
parked to a future architecture session; the per-row balances already exist for
it).

**Migration**: 23a's piece is just `commissaries` (one row for today's
single implicit commissary) + backfilling every `commissary_meats.commissary_id`
to it. The `commissary_conversion_standards` piece — for every existing row,
create/reuse a `meat_types` row for its meat, point that `commissary_meat`'s
`meat_type_id` at it, and rewrite the standard's key column — moves to 23b
along with the rekey itself. Needs an idempotent migration helper (not
just a `schema.sql` edit) per the standing `CREATE TABLE IF NOT EXISTS`
gotcha in `architect-notes-PRIVATE.md`.

### 10c. Dashboard grouped stock rollup (resolved 2026-08-31, not yet built — step 23b-vi)

Concrete response shape for `GET /api/dashboard/stock-rollup` once
multiple commissaries can share a `meat_type_id`. `session-status.md`'s
dispatch-order item 4 has the reasoning and the rejected alternatives;
this is the shape itself, per rule 7.

**Fixes a live correctness bug, not just a display grouping.** Today each
per-commissary-meat row resolves conversion standards by `meat_type_id`,
so two commissary meats sharing a type both count the *same* restaurant
stock — double-counting it. Grouping is what makes that structurally
impossible: restaurant figures are computed once per group, on the
parent, never per commissary.

**Grouping key: `(meat_type_id, unit)`** — not `meat_type_id` alone.
`meat_types` has no `unit` column; `unit` lives per `commissary_meats`
row and the seed data already uses both `kg` and `unit`. A type whose
members disagree on unit yields two internally-correct rows rather than
one meaningless sum.

**Row kinds.** Rows carry an explicit discriminator so the frontend never
infers kind from the presence of a field:
- `kind: "meat_type"` — a group of one or more tagged commissary meats.
- `kind: "untagged"` — a single commissary meat with `meat_type_id IS
  NULL`. Not omitted: real stock must not silently vanish from an audit
  screen, and the row doubles as a visible prompt to tag the meat.

```
{
  date, restaurants,                    -- unchanged
  rows: [
    {
      kind: "meat_type",
      meat_type_id, name, unit,         -- name from meat_types; no code
                                        --   column exists on that table
      commissary_balance,               -- summed across by_commissary
      commissary_has_data,
      by_commissary: [                  -- NEW; drives the inline
        { commissary_id, code, name,    --   expand/collapse drill-down
          commissary_meat_id,           -- the specific catalog row
          balance, has_data }
      ],
      by_restaurant, grand_total,       -- computed ONCE per group, on the
      row_has_any_data                  --   parent - never per commissary
    },
    {
      kind: "untagged",
      commissary_meat_id, code, name, unit,
      commissary_balance, commissary_has_data,
      by_restaurant: {},                -- an untagged meat can have no
      grand_total,                      --   standards, so no restaurant
      row_has_any_data                  --   figures are possible
    }
  ]
}
```

`by_restaurant` keeps its existing object-keyed-by-restaurant-id shape
and per-cell `{ total, hasData, standardCount }` — unchanged, so
`dashboard.html`'s existing cell rendering keeps working. `by_commissary`
is an array, not an object, since it is ordered display data rather than
a lookup.

**Sort order** moves from `ORDER BY code` to meat-type name, since a
grouped row has no single code. Untagged rows sort among them by their
own name.

**Inactive meat types: shown, never hidden, but flagged** (decided
2026-08-31, after 23b-vi-a landed — the implementation had picked a side
by accident rather than by decision). `meat_types` has an `active`
column and 23b's CRUD can deactivate a type, but nothing anywhere reads
it, so deactivating currently has no effect on the Dashboard at all.
Resolved: grouped rows carry a `meat_type_active` boolean, and rows are
**never** filtered out on it. Same reasoning as untagged meats — the
stock physically exists, and an audit screen must not silently drop it;
deactivating a type is a cataloguing statement, not a claim the meat
vanished. The flag is deliberately additive so the UI can mark such rows
(e.g. an "(inactive type)" label, 23b-vi-b's job) without the route
having to decide presentation, and so a future decision to sort or
filter differently has the data already present rather than needing
another route change.

**Robustness note for the same route**: the grouped-row build does
`SELECT name FROM meat_types WHERE id = ?` and reads `.name` with no
null guard. SQLite does not enforce foreign keys unless
`PRAGMA foreign_keys = ON` is set, so a dangling `meat_type_id` would
throw a `TypeError` and 500 the entire Dashboard rather than degrade
gracefully — inconsistent with how every other missing-data case in this
app is handled. Needs a guard; folded into 23b-vi-b rather than
dispatched on its own.

**Open question, deliberately NOT resolved here**: whether `meat_types`
should gain its own authoritative `unit` column, validated when a
commissary meat is tagged, so a mismatch becomes impossible at write time
rather than merely visible at read time. That would be a schema +
migration + backfill step of its own, and it rests on a business
assumption nobody has confirmed — that one meat type is always measured
the same way at every commissary. If two commissaries could legitimately
measure the same meat differently (one weighing, one counting), the
`unit`-in-the-grouping-key approach above is not a stopgap but the
correct permanent answer. Ask the project owner before treating this as
scheduled work. Note the two are not mutually exclusive: if a `unit`
column ever lands, `(meat_type_id, unit)` grouping simply stops ever
splitting a row and remains correct as a redundant read-side guard — it
would not need removing.

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
for now — extending it to `ending_actual`/`adjustments`/`portion_ending_actual`
is real follow-up work, not bundled into this change. **`prepped` is a
narrow exception as of step 15 (2026-08-29, see `scope.md`)**: its sole
write path today is the "Sync batch stock" command, which logs a
`CREATE`/`SYSTEM` row here in the same transaction as the `prepped` insert
— not a general extension of soft-delete/audit logging to that table,
just a trail for the one system-generated write path that exists.

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
