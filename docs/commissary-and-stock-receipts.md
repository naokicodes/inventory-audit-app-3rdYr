# Commissary, Stock Receipts, and the Activity Log

Read after `scope.md` and `data-model.md`. This doc describes three related
decisions made together on 2026-08-27, replacing the original per-restaurant
`new_stock` design described in earlier drafts of `data-model.md`.

## Why this changed

The original plan had each restaurant's "New Stock" entered directly on its
own Daily Audit ("Landing") screen, one row per meat per day. Two real-world
facts broke that:

1. Some meat is centrally received and processed at a commissary (raw
   delivery → backed/trimmed output, tracked against an expected loss %)
   before being split across restaurants — not delivered restaurant-by-
   restaurant. See `Commi_Audit_Master.xlsx` for the existing (spreadsheet)
   version of this process.
2. Not all meat goes through the commissary — some is still delivered
   straight to a restaurant. Both cases need to end up as "new stock" on
   that restaurant's audit, without needing two different entry screens
   that do the same thing.

Rather than building a per-meat "locked vs manual" toggle on the existing
`new_stock` table, the decision was to replace it with a single flat log,
described below.

---

## Part 1 — Commissary yield tracking (production side, commissary-only)

This is the "did today's raw meat yield a normal amount after processing"
question — see the `Yield_Log` sheet in `Commi_Audit_Master.xlsx` for the
real, already-proven version of this. It happens *before* any meat is
assigned to a restaurant, so it does not reference `restaurants` at all.

### commissary_meats
Global list, independent of any restaurant's own `meats` table.

| column | type | notes |
|---|---|---|
| id | integer, PK | |
| code | text, unique | e.g. "M01" — commissary's own numbering, confirmed NOT the same numbering as any restaurant's `meat_code` (checked against `seed-data.json` — M01–M05 mean different things in each). Never assume these match; see `commissary_meat_map` below. |
| name | text | |
| unit | text | `kg` or `unit` |
| allowed_leeway_pct | decimal | normal trim/processing loss for this meat, e.g. 0.20 = 20% |
| cost_per_unit | decimal, nullable | |
| active | boolean | |

### commissary_meat_map
Explicit, admin-managed mapping — required because commissary and
restaurant meat numbering do not line up automatically. One mapping per
commissary meat per restaurant.

| column | type | notes |
|---|---|---|
| id | integer, PK | |
| commissary_meat_id | integer, FK → commissary_meats | |
| restaurant_id | integer, FK → restaurants | |
| meat_id | integer, FK → meats | which of that restaurant's own meat rows this corresponds to |

`UNIQUE (commissary_meat_id, restaurant_id)` — a commissary meat maps to at
most one meat item per restaurant.

A commissary meat with no mapping row for a given restaurant simply can't
be selected as a receipt source for that restaurant yet — surface this as a
clear message in the UI ("not mapped yet — set this up in Settings"), not a
silent failure.

### commissary_yield_log
One row per raw delivery/processing event. Flat log, no fixed daily grid —
deliveries are irregular, matching the real workbook's own note on this.

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
| deleted_at | timestamp, nullable | soft delete — see Part 3 |

**Calculated, not stored** (mirrors the xlsx formulas exactly, and matches
`rules-for-claude-code.md` rule 4 — never store what can be computed):

```
actual_loss_pct(row) = (raw_weight_in - backed_weight_out) / raw_weight_in
status(row) = 'Review' if actual_loss_pct(row) > commissary_meats.allowed_leeway_pct else 'Pass'
excess_loss(row) = max(0, (raw_weight_in * allowed_leeway_pct) - ... )
  -- exact formula to be pinned down by comparing against the real
     Excess Loss column values already in Commi_Audit_Master.xlsx during
     implementation; use those rows as the test fixtures (Yield_Log has
     ~45 real rows with known Pass/Review outcomes)
```

A small `commissaryYieldEngine.js`, pure functions, tested the same way
`auditEngine.js` is (`server/engines/auditEngine.test.js` as the template) —
hand-verified against real rows from the xlsx before trusting it.

### Commissary on-hand balance (calculated, not stored)
Replaces the xlsx's `Commissary_Stock` sheet.

```
commissary_balance(commissary_meat, date_range) =
  SUM(commissary_yield_log.backed_weight_out WHERE commissary_meat_id = ? AND deleted_at IS NULL)
  - SUM(stock_receipts.quantity WHERE commissary_meat_id = ? AND source = 'COMMISSARY' AND deleted_at IS NULL)
```

---

## Part 2 — Stock Receipts (unified, replaces `new_stock`)

One flat log for **all** meat arriving at any restaurant, whether it came
from the commissary or direct delivery. Replaces per-restaurant New Stock
entry on the Landing screen entirely — Landing no longer has an editable
New Stock cell; it displays a sum pulled from this log.

### stock_receipts (replaces `new_stock`)
| column | type | notes |
|---|---|---|
| id | integer, PK | |
| restaurant_id | integer, FK | which restaurant received it — this is the "restaurant label column" instead of separate per-restaurant tabs |
| meat_id | integer, FK | the restaurant's own meat item |
| business_date | date | |
| quantity | decimal | |
| source | text | `DIRECT` or `COMMISSARY` |
| commissary_meat_id | integer, FK, nullable | set only when source = COMMISSARY; traces the receipt back to the commissary pool it was drawn from |
| notes | text, nullable | |
| photo_path | text, nullable | |
| created_by | text | |
| created_at | timestamp | |
| deleted_at | timestamp, nullable | soft delete — see Part 3 |

**No `UNIQUE(restaurant_id, meat_id, business_date)` constraint** — this is
intentionally a flat log, not one-row-per-day. Real deliveries repeat
within a day (the xlsx's own Outbound_Log shows this happening routinely).

`getNewStock()` in `auditEngine.js` changes from a single-row lookup to:
```
new_stock(meat, date) =
  SUM(stock_receipts.quantity WHERE restaurant_id = ? AND meat_id = ? AND business_date = ? AND deleted_at IS NULL)
```
Landing's New Stock column becomes read-only, sourced from this sum — same
treatment Beginning/Usage/Variance already get. There is deliberately no
lock flag or per-meat toggle to build; a meat with no commissary mapping
just gets `DIRECT` rows entered the same way, in the same table, on the
same one page.

### Entry screen
One page, not per-restaurant tabs: date, restaurant (dropdown), meat
(dropdown — filtered to that restaurant's active meats), quantity, source,
notes. This is the "commi downlist" — a single running list, filterable by
restaurant/date/source, rather than duplicate screens that are the same
form pointed at different restaurants.

---

## Part 3 — Activity log (audit trail, admin-only)

The requirement isn't "prevent edits" — it's "detect manipulation, without
blocking legitimate corrections." That means: allow edits and deletes,
never physically destroy data, log every change with a before/after
snapshot.

### activity_log
| column | type | notes |
|---|---|---|
| id | integer, PK | |
| timestamp | timestamp | |
| actor | text | who made the change (plain text for now — no auth system yet, see `scope.md`) |
| entity_type | text | e.g. "stock_receipts", "commissary_yield_log", "ending_actual", "recipe_bom" |
| entity_id | integer | |
| action | text | `CREATE`, `UPDATE`, or `DELETE` |
| before | text, nullable | JSON snapshot of the row before the change; null for CREATE |
| after | text, nullable | JSON snapshot after the change; null for DELETE |
| source | text | `SYSTEM` (automated) or `MANUAL` (typed/edited by the auditor) |

### Soft deletes
`stock_receipts` and `commissary_yield_log` get a `deleted_at` column
(above) instead of a hard `DELETE`. A "deleted" row stays in the table,
excluded from all calculations via `deleted_at IS NULL`, but remains
visible in the admin history view. Every write to either table — create,
edit, or soft-delete — writes a matching `activity_log` row in the same
transaction.

**Scope boundary for now**: this pattern (soft delete + activity log) is
being introduced on the two new tables only. Extending it to the older
input tables (`ending_actual`, `adjustments`, `prepped`,
`portion_ending_actual`) is real, valuable, follow-up work — not bundled
into this change, to keep this commit reviewable. Flagged here so it isn't
forgotten.

### Admin History tab
Reverse-chronological feed of `activity_log`, filterable by entity type,
date range, and actor. Each entry shows a diff (before → after) inline —
this is the "Discord history" model: a plain, readable feed of who changed
what and when, not a separate audit-per-table UI.

---

## Open items to confirm before implementation

1. Exact `excess_loss` formula — pin down from the real xlsx rows during
   implementation, not guessed here.
2. Whether `commissary_meats` needs its own admin screen now, or whether
   seeding it once (from the xlsx's Meats sheet, like `seed-data.json`
   already does for restaurant meats) is enough for the current single-
   commissary setup.
3. Restaurant B/C aren't seeded yet — `commissary_meat_map` rows for them
   don't need to exist until those restaurants come online.
