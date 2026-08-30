# Commissary, Stock Receipts, and the Activity Log

Read after `scope.md` and `data-model.md`. This doc describes three related
decisions made together on 2026-08-27, replacing the original per-restaurant
`new_stock` design described in earlier drafts of `data-model.md` — plus two
follow-up decisions made 2026-08-28 (Part 2's "Unallocated" note and Part 1's
mapping-screen note) closing gaps that were flagged but left open at the time.

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

Stays seed-only for now (14 real rows already loaded via
`commissary-seed-data.json`) — no CRUD screen needed while there's one
commissary. Revisit only if a second commissary is ever added (explicitly
out of scope for now, see `scope.md`).

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

#### Admin screen (resolved 2026-08-28)
This mapping table had **no admin UI at all** — the only way to create a row
was a developer writing SQL directly (this is literally how
`commissaryYieldEngine.test.js`'s fixtures do it). That's a real blocker: the
"not mapped yet — set this up in Settings" message that `stockReceipts.js`
already shows points at a screen that doesn't exist yet.

**Decision**: add a "Commissary Mapping" tab to `settings.html` (same shape
as the existing Meats/Dishes/Recipes tabs), plus a route in `settings.js` —
list current mappings for the selected restaurant, and a simple add-form
(commissary meat × that restaurant's own meat → one mapping row). No edit
needed for v1; a wrong mapping is delete + re-add. No `activity_log` wiring
needed — this is reference/config data, not one of the two tables scoped
into step 6 (`rules-for-claude-code.md` rule 9 covers `stock_receipts` and
`commissary_yield_log` specifically, not this table).

Tracked as **step 8** in `docs/session-status.md`. See `data-model.md`
section 10a for the schema-doc side of this same decision.

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

**Calculated, not stored**, matching the xlsx formulas exactly:

```
actual_loss_pct(row) = (raw_weight_in - backed_weight_out) / raw_weight_in
status(row) = 'Review' if actual_loss_pct(row) > commissary_meats.allowed_leeway_pct else 'Pass'
excess_loss(row) = max(0, (raw_weight_in - backed_weight_out)
                          - raw_weight_in * allowed_leeway_pct)
```

The `excess_loss` formula above is resolved and verified (was previously
"to be pinned down" here) — confirmed against all real rows in
`Commi_Audit_Master.xlsx`'s `Yield_Log` sheet. See
`server/engines/commissaryYieldEngine.js` and its test file, and
`data-model.md` section 10.

### Commissary on-hand balance (calculated, not stored)
Replaces the xlsx's `Commissary_Stock` sheet.

```
commissary_balance(commissary_meat, date_range) =
  SUM(commissary_yield_log.backed_weight_out WHERE commissary_meat_id = ? AND deleted_at IS NULL)
  - SUM(stock_receipts.quantity WHERE commissary_meat_id = ? AND source = 'COMMISSARY' AND deleted_at IS NULL)
```

This subtraction is **destination-agnostic** — it counts a `COMMISSARY`
shipment as "left the commissary" whether or not it has a `restaurant_id`
yet (see Part 2's Unallocated note below). Verified against the real xlsx's
own `Commissary_Stock` sheet, which does the same thing.

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
| restaurant_id | integer, FK, **nullable** | which restaurant received it. **NULL = "shipped from the commissary, not yet assigned"** — see "Unallocated receipts" below. A `DIRECT` receipt must always have a restaurant. |
| meat_id | integer, FK, **nullable** | the restaurant's own meat item. NULL only alongside a NULL `restaurant_id` (can't know the restaurant's own meat code before the restaurant is known). |
| business_date | date | |
| quantity | decimal | |
| source | text | `DIRECT` or `COMMISSARY` |
| commissary_meat_id | integer, FK, nullable | set only when source = COMMISSARY; traces the receipt back to the commissary pool it was drawn from. For an unallocated row, this is the only meat reference the row has. |
| notes | text, nullable | |
| photo_path | text, nullable | |
| created_by | text | |
| created_at | timestamp | |
| deleted_at | timestamp, nullable | soft delete — see Part 3 |

**No `UNIQUE(restaurant_id, meat_id, business_date)` constraint** — this is
intentionally a flat log, not one-row-per-day. Real deliveries repeat
within a day (the xlsx's own Outbound_Log shows this happening routinely).

`getNewStock()` in `auditEngine.js`:
```
new_stock(meat, date) =
  SUM(stock_receipts.quantity WHERE restaurant_id = ? AND meat_id = ? AND business_date = ? AND deleted_at IS NULL)
```
Landing's New Stock column is read-only, sourced from this sum — same
treatment Beginning/Usage/Variance already get. There is deliberately no
lock flag or per-meat toggle to build; a meat with no commissary mapping
just gets `DIRECT` rows entered the same way, in the same table, on the
same one page.

### Unallocated receipts (resolved 2026-08-28, RETIRED 2026-08-29)
**Historical record only — this entire section describes a workflow
that no longer exists in the app.** Kept below for context on the
decision, not as current documentation. See
`session-status.md`'s "commissary_meat_map's fate" entry (step 20) for
the full retirement reasoning: once `POST /api/commissary/shipments`
always names the destination restaurant up front, there was no
remaining legitimate case for a human manually logging a `COMMISSARY`-
sourced receipt with the destination left unset. **Current reality**:
`POST /api/stock-receipts` accepts `DIRECT` only; `restaurant_id`/
`meat_id` are required together, always. A `COMMISSARY`-sourced
`stock_receipts` row is only ever written automatically, as a side
effect of a real Shipment. `commissary_meat_map` the table still
exists (nothing dropped), but nothing reads or writes it anymore.

**Previously an open gap, now resolved [then retired].** `Outbound_Log`'s Instructions
sheet in the real xlsx allows a shipment with destination "Unallocated" —
meat that's left the commissary but hasn't been assigned to a specific
restaurant yet. The original schema had `restaurant_id NOT NULL`, so this
case couldn't be represented at all; the app's own balance formula
demonstrably diverged from the sheet's cached numbers because of it (see
`commissaryYieldEngine.test.js`'s Belly Slab test: 19.8 in our schema vs.
14.8 in the real sheet, entirely due to one un-representable 5kg
Unallocated row).

**Decision [superseded]**: `restaurant_id` and `meat_id` on `stock_receipts` are now
nullable (both null together, only when `source = COMMISSARY`). Workflow:

1. A commissary shipment can be logged via the normal
   `POST /api/stock-receipts` flow with `source = COMMISSARY` and the
   restaurant field left unset in the UI — this creates a row with
   `restaurant_id = NULL`, `meat_id = NULL`, `commissary_meat_id` set.
2. It's excluded from every restaurant's `new_stock` sum while unallocated
   (the `getNewStock` query already only matches on a specific
   `restaurant_id`, so a NULL row simply never matches any restaurant's
   query — no extra filtering needed there).
3. It still counts against the commissary's on-hand balance immediately
   (the balance formula is destination-agnostic — see Part 1).
4. Later, it's assigned to a restaurant via
   `PATCH /api/stock-receipts/:id`, setting `restaurant_id` and `meat_id`
   together. `meat_id` must resolve via `commissary_meat_map` for the
   chosen restaurant — same validation `POST` already does for a normal
   COMMISSARY receipt. This assignment is logged as a normal `UPDATE` in
   `activity_log`, using the machinery already built in step 6 — no new
   logging path needed, just a new allowed transition on an existing one.

**Why nullable columns over a placeholder "Unallocated" restaurant row
[historical reasoning, decision itself later superseded]**: a
placeholder row in `restaurants` would show up in restaurant-scoped
dropdowns, weekly summaries, and reports as if it were a real location,
which is worse than a receipt that's simply invisible to restaurant-facing
screens until assigned. Nullable + explicit later-assignment keeps this
clean.

**UI implication for step 9 [never fully needed this way — retired
before any dedicated "unassigned" filter UI was built]**: the Stock
Receipts entry form (`stock-receipts.html`) needs a "leave unassigned"
option when Source = Commissary (instead of requiring a restaurant to
be picked), and the receipts list needs a way to filter for/show
unassigned rows with an "Assign to restaurant" action that calls the
PATCH above. Not built as UI, and now never will be — the underlying
capability itself was retired first.

Tracked as **step 9** in `docs/session-status.md`. See `data-model.md`
section 5 for the schema-doc side of this same decision.

### Entry screen
One page, not per-restaurant tabs: date, restaurant (dropdown — optional
when source = Commissary, per the Unallocated note above), meat (dropdown —
filtered to that restaurant's active meats, hidden/disabled when restaurant
is left unassigned), quantity, source, notes. This is the "commi downlist" —
a single running list, filterable by restaurant/date/source, rather than
duplicate screens that are the same form pointed at different restaurants.

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
transaction. This includes an unallocated-receipt assignment (Part 2) —
it's just an `UPDATE` like any other edit, no special case needed.

**Scope boundary for now**: this pattern (soft delete + activity log) is
being introduced on the two new tables only. `commissary_meat_map` (Part 1)
is deliberately NOT included in this — it's admin config data, not a daily
transactional log. Extending soft-delete/activity-log to the older input
tables (`ending_actual`, `adjustments`, `prepped`,
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

1. ~~Exact `excess_loss` formula~~ — resolved, see Part 1.
2. ~~Whether `commissary_meats` needs its own admin screen now~~ — resolved:
   `commissary_meats` stays seed-only; `commissary_meat_map` gets a real
   admin screen (step 8). See Part 1.
3. ~~The "Unallocated" destination gap~~ — resolved: nullable
   `restaurant_id`/`meat_id` + assign-later via PATCH (step 9). See Part 2.
4. Restaurant B/C aren't seeded yet — `commissary_meat_map` rows for them
   don't need to exist until those restaurants come online. Once step 8's
   admin screen exists, this becomes a normal setup task, not a blocker.
