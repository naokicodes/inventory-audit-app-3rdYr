# Session Status — read this first after token reset

This file is **what to do next**. It is deliberately kept short: every
worker session reads it cold, so length here is a recurring cost paid on
every single dispatch (`rules-for-claude-code.md` rule 22).

Resolved history lives in `docs/session-history.md` — steps 1–22, the
steps 10–19 scope list, Round 2, item 3's design, and all of step 23.
Dated fix/decision detail lives in `docs/changelog.md`. Don't move
finished work back into this file; archive it.

`HANDOFF.md` was deleted (see `changelog.md`) — it had drifted stale and
was actively misleading. This file is the only "where we left off" doc.
If you are a fresh session with no memory of prior work, also read rules
18, 19 and 22 in `rules-for-claude-code.md` — they describe how work moves
between coder workers and the architect conversation, when to re-run the
suite, and how to keep context costs down.

## Current state — 2026-09-01

**Step 23 is fully closed.** All of 23a, 23b's six items, and 23c
(23c-i, 23c-i-b, 23c-ii-a through 23c-ii-d) are done and pushed. Full
suite (as of this session's dashboard fix): **15 files, 276/276
assertions, 0 failures** (`node <file>.test.js` run individually — no
test runner script exists yet; includes `server/db/activityLog.test.js`
and `server/db/migrate.test.js`, easy to miss since they live outside
`server/routes`/`server/engines`).

**Step 24a is designed and dispatchable** (re-scoped 2026-09-01 — see the
"Sub-step plan" and "24b output-targeting — RESOLVED" notes below, and
`data-model.md` §10b). It's the next step: add `output_commissary_meat_id`
to `commissary_yield_log` + make the audit engine a debit/credit ledger +
rewrite the affected tests. 24b/24c follow. The cheap contained fixes remain
in "Known open items."

The most recent landings, newest first — full detail for each is in
`changelog.md`:

| Step | What landed |
|---|---|
| — | Fixed dashboard.js's dangling-`commissary_id` INNER JOIN silently dropping stock |
| — | Fixed 23c-ii-d follow-on: qualified-branch silent-first-match in `resolveCommissaryMeat` |
| 23c-ii-d | Terminal qualified-token grammar (`com-a/m05`); closed a silent-first-match bug |
| 23c-ii-c | Commissary identity on `GET /api/commissary/meats` (LEFT JOIN) + label fixes on two pages |
| 23c-ii-b | Commissary selector on `commissary-shipments.html` |
| 23c-ii-a | Commissary selector on `commissary.html` |
| 23b-vi-a/b | Grouped stock rollup + inline drill-down; closed a live double-count bug |
| — | Rules 21 (stop your server) and 22 (context economy) |

## Known open items (not the next step's problem, just not forgotten)

- ~~**`dashboard.js`'s INNER JOIN to `commissaries`**~~ — fixed
  2026-09-01, see `changelog.md`. Changed to `LEFT JOIN` (matching
  23c-ii-c) with a `(unknown commissary #N)` fallback label on the
  `by_commissary` entries, mirroring the existing `meat_type_id` guard.

- **A real click-through in an actual browser is still owed** for Stock
  Receipts' Unallocated/Assign flow specifically — the 2026-08-28 session
  had no browser available (no puppeteer/playwright, and the download
  host for one isn't in the sandbox's network allowlist), so it verified
  via live HTTP payload replay instead (see `changelog.md`). Strong
  verification, but not the same as clicking it. Commissary's own
  Edit/Delete UI flows are in the same boat — never fully click-tested.
- ~~**Live recalculation**~~ — done, step 13 above.
- ~~**Restaurant B/C still aren't seeded**~~ — Restaurant B (FC) done as
  of step 19, 2026-08-29. Restaurant C (Likod) is still unseeded — no
  workbook for it exists yet, unlike FC's real `FC_MasterAudit.xlsx`.
- ~~**`resolveCommissaryMeat`'s qualified branch takes the first of a
  multi-match**~~ — fixed 2026-09-01, see `changelog.md`.

- **A preset-*authoring* admin UI is still deferred, not forgotten.**
  Shipment presets can be created and edited via
  `GET`/`POST`/`PUT /api/commissary/shipment-presets` today, but there is
  no browser form for authoring them — `commissary-shipments.html` only
  *consumes* presets via its "Load preset" control. Deferred out of step
  20c deliberately and re-confirmed as deferred several times since;
  lifted here on 2026-09-01 so it survives the archive split.

- **Latent, NOT a live bug — restaurant-side INNER JOINs.**
  `commands.js`/`settings.js`/`allocations.js`/`auditEngine.js` INNER JOIN
  sales/recipe/allocations to `dishes`/`meats`/`restaurants`/`adjustment_types`,
  which would silently drop rows if a parent were ever deleted. Confirmed
  2026-09-01 that none of those parents are ever hard- or soft-deleted, so
  nothing can drop today — dormant, not broken. The commissary-side family
  (`commissary_id`, `meat_type_id`) is already fully closed (LEFT JOIN +
  guards). If a delete feature is ever added for dishes/meats/restaurants,
  revisit these joins first.

## Step 24 — multi-stage yield + Commissary-side allocation (designed, NOT started)


Raised by the project owner working through two real Commissary
scenarios that didn't fit the existing single-input/single-output yield
model. Settled through the same real back-and-forth as item 3's design
— every fork below was an actual question asked and answered:

- **A real, confirmed bug found and must be fixed as a prerequisite,
  not a nice-to-have**: `getCommissaryUsage`
  (`commissaryAuditEngine.js`) only ever sums `commissary_shipments` as
  usage for a commissary meat. It never counts
  `commissary_yield_log.raw_weight_in` as an outflow for whichever
  meat was the *input* to a yield event. Concretely: 20kg raw Jowl
  received, a yield event consumes 15kg of it — the raw item's
  calculated balance stays at 20kg forever, since nothing ever
  subtracts the 15kg that got processed. A real physical count would
  show a permanent, false SHORTAGE variance. This has been silently
  wrong since step 20b; harmless so far only because nothing yet
  depended on a raw/intermediate meat's balance being accurate (every
  existing commissary meat either doesn't get further processed, or
  ships out directly, so the bug never had a chance to matter until
  now). **Fix**: `getCommissaryUsage` also sums `raw_weight_in` for
  every yield event where the meat in question was the input side.
  Applies uniformly to a genuinely raw meat *and* to an intermediate
  stage (below) being consumed by a later stage — same mechanism, no
  special-casing needed.

- **Multi-stage yield chaining, configured per meat, not a new
  mechanism.** Most commissary meats have zero extra stages; some have
  one; a few (Shortplate: sear, then braise) have two. No new schema
  concept — each stage is a completely normal, existing single-input/
  single-output `commissary_yield_log` entry. The only difference:
  stage two's `commissary_meat_id` *input* is stage one's own output
  meat (e.g. "Seared Shortplate," a real catalog row with its own real
  balance — confirmed this needs to be real, not transient: it's
  common to sear a full day's new stock but not finish braising all of
  it the same day, so intermediate stock genuinely sits around and
  needs an accurate count). Depends entirely on the usage-formula fix
  above — without it, a chained intermediate stage's balance would be
  meaningless.

- **The Chicken → Yaki-portions + Miscuts case turned out not to need
  a new "multi-output yield" concept at all** — it decomposes into two
  *already-designed* patterns:
  1. A normal single-stage yield: Raw Chicken → "Processed Chicken,"
     one output, real trackable inventory, same as any other yield
     event (cutting/portioning can legitimately be lossless — 0%
     `allowed_leeway_pct` for these events, no schema change needed;
     confirmed searing/braising *do* have real loss, cutting doesn't
     necessarily).
  2. A **new Commissary-side allocation mechanism** — a parallel table
     to the existing restaurant-scoped `adjustments`, not a shared or
     merged one (keeps Commissary and restaurants structurally
     separate, consistent with item 3's own "option B" decision, not a
     new precedent). Two distinct kinds of entry, confirmed as
     genuinely different, not two names for the same thing: **loss**
     (no trackable destination — pure shrinkage, conceptually the same
     as a yield event's own leeway loss) and **allocation** (a
     trackable destination elsewhere, e.g. redirecting part of
     Processed Chicken's balance to Miscuts-Chicken).
  Shipping stays completely untouched either way — once "Processed
  Chicken" exists as inventory, it ships via the exact same
  Shipments + Conversion Standards mechanism every other commissary
  meat already uses, regardless of which stage or allocation path
  produced it.

- **Miscuts are separate catalog rows per meat** (Miscuts-Chicken,
  Miscuts-Jowl, Miscuts-Belly, etc. — matches the real xlsx's
  intent, which the app had been treating as one shared `M14` row
  without actually tagging them; confirmed this needs fixing, not
  preserving). Tagged via the same meat-type reference table item 3
  already designed, not a new tagging mechanism — lets reporting roll
  up "total Miscuts across everything" while keeping each one tracked
  separately for real operational use (e.g. staff-meal planning per
  meat).

**RESOLVED 2026-08-31 — the remaining open questions above, settled in
the same architecture session as item 3's rekey:**

- **A real, previously-unflagged gap found while checking this against
  actual code**: `commissary-seed-data.json` already has three raw/
  backed pairs seeded as *separate catalog rows* — `M01 Whole
  Chicken`/`M02 Whole Chicken Raw`, `M03 Belly Slab`/`M04 Belly Slab
  Raw`, `M05 JOWL`/`M06 JOWL Raw` — but `commissary_yield_log` has only
  one `commissary_meat_id` column, and no route or engine function ever
  references the "Raw" rows. They're vestigial — seeded for a
  raw-vs-backed split that was never wired up. **Confirmed by the
  project owner (2026-08-31): this was intentional, not accidental —
  "not every meat could be backed up" is a real case, these rows were
  meant to be tracked, the app just never got that far.** This isn't
  scoped to Shortplate/Chicken alone — it's the same fix, retroactively
  covering three existing meats.
- **`commissary_yield_log` gets one new column**: `output_commissary_meat_id`,
  nullable FK → `commissary_meats`, **defaulting to "same as input"
  when NULL** — this is what keeps every existing single-row event
  (e.g. Belly Slab in, Belly Slab out, just lighter from trim loss)
  working completely unchanged. Only an event that genuinely produces a
  *different* catalog row (Raw Shortplate → Seared Shortplate, Raw
  Chicken → Processed Chicken, and now `M02→M01`/`M04→M03`/`M06→M05`)
  sets it explicitly. No separate "is this chained" marker needed — the
  column's presence/absence on a given row already tells you which
  case it is.
- **The existing `commissary_meat_id` column stays as-is and means
  "input"** — no rename. `getCommissaryBackedUp`'s credit target
  changes from always crediting `commissary_meat_id` to crediting
  `output_commissary_meat_id` when set, `commissary_meat_id` otherwise.
- **No stage-count cap in the schema.** Chain length is emergent from
  however many yield-log rows point at each other, not a declared
  number — a real 2-stage case (Shortplate) doesn't need the schema to
  know it's 2 stages, and nothing breaks if a future case needs more.
- **`commissary_adjustments` — new table, parallel to the existing
  restaurant-scoped `adjustments`, not shared/merged** (matches item
  3's "option B" precedent of keeping Commissary structurally
  separate):
  ```
  commissary_adjustments
    id
    commissary_meat_id               -- source being drawn down
    business_date
    kind                              -- 'LOSS' | 'ALLOCATION' — this
                                       -- column's value IS the
                                       -- classifier, no separate flag
    quantity
    destination_commissary_meat_id    -- NULL for LOSS, required for
                                       -- ALLOCATION (e.g. Miscuts-Chicken)
    notes
    created_by / created_at
    deleted_at                        -- soft delete, same pattern as
                                       -- commissary_yield_log
  ```
  `destination_commissary_meat_id` self-references `commissary_meats`
  (both sides are commissary items, never a restaurant's `meats` row).
- **Miscuts stay separate catalog rows** (Miscuts-Chicken,
  Miscuts-Jowl, Miscuts-Belly, ...) **tagged via `meat_types`** — same
  table item 3's schema (23a) introduces, not a new tagging mechanism.
  An allocation's destination dropdown should be restricted to
  `meat_type`-compatible siblings of the source (so Processed Chicken
  can't accidentally allocate into a Jowl-tagged bucket) — a UI/route
  concern for 24c, not a schema constraint.
- **Depends on 23a** (needs `meat_types` to exist for Miscuts tagging) —
  sequenced after it, not before.

**Sub-step plan, confirmed:**
- **24a (schema + coupled engine change + tests) — re-scoped 2026-09-01**:
  add `output_commissary_meat_id` to `commissary_yield_log` (nullable FK,
  NULL ⇒ output = input) via an idempotent migration, and make the audit
  engine a debit/credit ledger — **debit** `raw_weight_in` from the input
  (`commissary_meat_id`, into `usage`, excluding soft-deleted rows) **and**
  **credit** `backed_weight_out` to the output (`output_commissary_meat_id`
  when set, else `commissary_meat_id`). These two are ONE coupled change:
  the raw-debit alone, before the output split exists, double-subtracts on
  same-meat rows and reds 4 existing engine tests (verified 2026-09-01), so
  the earlier "24a = standalone usage fix, no schema dependency" framing was
  wrong. Rewrite the affected engine tests to the corrected debit/credit
  numbers; add cross-row, cross-unit, and soft-delete cases. **Carved OUT of
  24a into 24b** (rule 16): `commissary_adjustments`, the per-meat
  default-output config, and the `M02→M01`/`M04→M03`/`M06→M05` pairing — the
  engine handles whatever input/output a row names, so no pairs need
  pre-wiring, and there is no historical data to backfill.
  **Blast radius (mapped 2026-09-01, so the prompt is airtight):** 24a
  touches only `commissaryAuditEngine.js` (the debit/credit change),
  `commissaryAuditEngine.test.js` (rewrite the 4 balance tests + add
  cross-row/cross-unit/soft-delete cases — the ONLY test file that breaks),
  and `schema.sql` + the idempotent migration for the column. Verified
  unaffected: `dashboard.test.js` (no yield fixtures);
  `commissary.test.js`/`history.test.js` (their yield inserts feed
  loss%/activity-log/CRUD, never a balance); `commissaryYieldEngine.*`
  (loss%, not balance); `dailyAudit.*`/`history.js` (no balance from yield).
  Leave the yield-log write route (`commissary.js` INSERT/UPDATE) untouched —
  new rows default `output_commissary_meat_id` to NULL (same-meat), and 24a's
  cross-row cases are exercised by direct test inserts, exactly as the
  existing engine tests already insert yield rows. Creating cross-row events
  through the UI is 24b (the form).
- **24b (engine/routes)**: per-meat "next stage" config so the yield form
  can default the output dropdown, `commissary_adjustments` CRUD + balance
  effects, Miscuts destination filtering via `meat_type_id`. (The
  output-credit retarget itself moved into 24a — see above.)
- **24c (UI)**: output-item field on the yield-entry form (defaults to
  same meat when no next-stage is configured), an Allocate/Write-off
  action on the commissary balance view.

**Next up, after 23a/23b/23c: 24a.** None of the three sub-steps are
started.

**24b output-targeting — RESOLVED 2026-09-01.** The earlier concern (a yield
row reusing the single `commissary_meat_id` for both input and output, and
the cross-unit `unit in → kg out` case needing the output on a different row
in a different unit) is settled by the debit/credit ledger:
`output_commissary_meat_id` (nullable, NULL ⇒ input) IS the explicit output
linkage, and cross-unit needs no engine conversion because `raw_weight_in`
and `backed_weight_out` are each read in their own row's unit and never
reconcile. This landed in the **24a** design (the column + coupled engine
change), so 24b no longer carries any unsettled schema question — see
`data-model.md` §10b. NOTE the earlier framing that "24a is the standalone
`raw_weight_in`-as-outflow fix, unaffected" was WRONG: the raw-debit is not
safe without the output split (it reds 4 engine tests on its own), which is
exactly why the column + credit-retarget were pulled into 24a with it.

## Things NOT to re-litigate (already decided, stable)

- Tech stack: Node.js + Express + `node:sqlite` (not better-sqlite3, not
  Postgres) — see `changelog.md` for why.
- Single local machine, one SQLite file, no hosting/multi-user — see
  `scope.md`.
- Docs-first workflow: update the relevant `docs/*.md` file whenever a
  real decision changes, before or alongside the code. Architecture
  decisions are made between sessions, in the docs — not decided
  unilaterally mid-session. If a session hits a genuine ambiguity the
  docs don't resolve, it should flag it and stop, per rule 3.
- Testing approach: build and test in the sandbox environment first (real
  code paths, real database, hand-verified numbers) before handing files
  over. As of the step-9 session, this sandbox has had working npm
  registry access, so "build and test" can mean a real `npm install` +
  live Express server + live HTTP requests, not just hand-mirrored SQL —
  worth doing whenever the sandbox allows it, not just schema-level
  tests.
- Stock receipts are unified across restaurants (one log, restaurant
  column) rather than per-restaurant New Stock screens; `restaurant_id`
  is nullable as of step 9, per `data-model.md` section 5.
- Activity logging via before/after snapshots + soft deletes, not hard
  locks. Scoped to `stock_receipts` and `commissary_yield_log` only —
  `commissary_meat_map` is deliberately excluded, being config data
  rather than a daily transactional log.
- "Landing" mixes meats + prepared dishes as rows; Prep is not a separate
  tab (confirmed via the real paper workflow, "Silingan Landing
  Inventory").
- The repo is public (no secrets committed — `.env`, `*.db`, and
  `/uploads/` are gitignored and always have been). This was a deliberate
  choice to simplify tooling access; it doesn't change any of the above.
- **Unit lives on the `commissary_meats` row (per meat, per lifecycle
  stage), never on `meat_types`.** One meat type legitimately spans units
  across its stages — raw Chicken is counted in `unit`, Processed Chicken
  is `kg` — so there is no single authoritative unit for a meat type and
  no `meat_types.unit` column should be added. The Dashboard's
  `(meat_type_id, unit)` composite grouping is correct *permanently* for
  this reason: it keeps incompatible units (counts vs kilos of the same
  meat type) in separate rollup rows instead of summing them. Unit varies
  along the *stage* axis, never the *commissary* axis — catalogs are
  independent and never share a meat identity, so no unit ever reconciles
  across commissaries. Every unit change happens on a standard-governed
  edge (a yield stage, or a shipment's Conversion Standard), never by
  relabeling a shared meat. Closes the "authoritative unit column" open
  item as unnecessary. Settled 2026-09-01.
- **Two commissary meats sharing a name under one commissary are allowed
  by design; the ambiguity is guarded at point-of-use, not prevented at
  creation.** `commissary_meats` enforces `UNIQUE(commissary_id, code)` on
  code only, not name, and the settings create/edit routes deliberately do
  not validate name uniqueness. Real catalogs distinguish meats by name in
  practice (e.g. "Chicken Raw" vs "Chicken Processed"), so a true
  same-name collision is a rare data-entry slip, not a normal case. The
  Terminal's `resolveCommissaryMeat` handles it where it matters — an
  ambiguous token is reported `ambiguous` and refused, forcing the
  operator to qualify by code (fixed 2026-09-01) — rather than the
  creation form blocking it. Do not later add name-uniqueness validation
  to the settings form thinking it's a missing guard; it's an intentional
  omission. Settled 2026-09-01.
- **Balance unit is per `commissary_meats` row and is independent of the
  arrival weigh-in.** The Commissary weighs everything on arrival as a
  supplier control (don't lose paid-for weight), but that does NOT set the
  tracking unit. Meats stocked and shipped by count stay `unit` rows (raw
  chicken, whole items); others are `kg`. Weighing ≠ kg-tracking — do not
  "simplify" a `unit` meat to `kg` just because it's weighed at intake.
  This is why the unit-per-stage example above (raw chicken `unit`,
  processed chicken `kg`) is real, and why the `(meat_type_id, unit)`
  Dashboard grouping is load-bearing: one meat type (chicken) legitimately
  owns both a `unit` row and a `kg` row, assuming raw and processed chicken
  share a `meat_type_id` (the natural tagging). Settled 2026-09-01.
- **Yield output is always `kg`; yield input may be `unit` or `kg`;
  unit→unit yield does not occur.** The only cross-unit event in the system
  is `unit in → kg out` (raw chicken → processed chicken); everything else
  is `kg → kg` (belly; Shortplate sear→braise). Raw meats are deliberately
  NOT pre-converted to a kg-equivalent at input — keeping the input in its
  own unit is what makes the realized ratio (kg out per unit in) visible
  and checkable against the standard. (An earlier "pre-convert to kg at
  input" idea was considered and rejected for exactly this reason; do not
  revive it.) Step 24 therefore KEEPS its cross-unit output mechanism (24b)
  — it does not collapse to same-unit-only. Settled 2026-09-01.
- **Commissary shrinkage that isn't a yield is a distinct loss
  declaration, not forced through the yield log.** A direct-ship unit-meat
  (e.g. 45 stocked in, 44 shipped, 1 lost to the portioning/wastage
  process) has real shrinkage that is not a processing yield, and today
  there is nowhere to declare it — so it silently becomes a variance. It is
  the "loss" kind of step 24's already-designed Commissary-side allocation
  mechanism, surfaced as a loss input on the Commissary page and accepting
  unit-denominated losses (not only kg). Settled 2026-09-01.

- **Commissary yield is a debit/credit ledger; `commissary_meat_id` is the
  INPUT (settled 2026-09-01).** Every yield event debits `raw_weight_in` from
  the input meat and credits `backed_weight_out` to the output
  (`output_commissary_meat_id`, NULL ⇒ input). Real processing is always a
  chain of explicit rows (raw shortplate → seared → braised → ship), so the
  NULL/same-meat path is a back-compat default, not a normal workflow. A
  same-meat event correctly nets to −loss (it debits its own raw and credits
  its own backed) — do NOT restore the pre-24a credit-only behavior thinking
  the debit is a double-count; it IS the fix. See `data-model.md` §10b.
- **Lifecycle stages that share a `meat_type` + unit stay MERGED in the
  Dashboard rollup (settled 2026-09-01).** Raw/seared/braised of one meat sum
  into one total-on-hand row. Per-stage rollup visibility was considered and
  parked to a future architecture session — the per-row balances already exist
  (commissary audit + drill-down), so switching the grouping later needs no
  rework and no schema change. Don't build per-stage rollup granularity
  speculatively.
- **On-the-fly output-row creation and cycle-guarding are deferred (settled
  2026-09-01).** The yield form prompting "create a place for Seared" is a
  configuration convenience for onboarding a new chain owner, not needed for
  the core ledger — deferred to that hand-over phase. No operational yield
  chain forms a cycle, so a cycle-guard is defensive-only and also deferred.

## End-of-session checklist (every session, no exceptions)

Since each session starts with zero memory of prior conversations and
relies entirely on `docs/` for continuity, every session — whether or not
the step it was working on is fully finished — should, before ending:

1. Update `docs/changelog.md` with a dated entry (what shipped, what's
   deliberately not built yet, how it was verified).
2. Update **this file** — change the step's status tag and, if it's not
   **Done**, replace the step's one-line description with a precise
   done/not done/untested breakdown. Something like:

   > 12. **[WIP] Opening-stock fix.** Done: the `opening_stock` write
   > path and its test. Not done: the Beginning cell isn't wired to be
   > conditionally editable in `daily-audit.html` yet — still always
   > editable. Untested: haven't confirmed the write path against a
   > real multi-day sequence, only a single day in isolation.

   This is the difference between step 9's total loss and a WIP hand-off
   actually being useful — vague ("still in progress") forces the next
   session to re-derive what happened by reading the diff; precise lets
   it just continue.
3. If the step isn't fully done, commit it anyway per rule 17 (`wip:`
   prefix, nothing previously-working left broken, full test suite still
   green) rather than leaving it uncommitted. Per rule 16, still prefer
   not needing this at all — a step running long is a signal to stop at
   the nearest clean boundary, not to power through the original scope.
4. There is no `HANDOFF.md` — it was deleted 2026-08-28. Don't create a
   new parallel "handoff" doc; extend this file instead, so there's never
   again a second doc that can silently drift out of sync with the real
   one.
