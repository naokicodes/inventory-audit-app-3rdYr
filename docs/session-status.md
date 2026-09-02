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

## Current state — 2026-09-02

**Step 23 is fully closed**, and step 24 is five sub-steps in: **24a**
(`output_commissary_meat_id` + the debit/credit ledger), **24a-b** (test
isolation), **24b-i** (`input_quantity`), **24b-ii**
(`commissary_adjustments` schema + engine), and **24b-iii** (adjustment
routes) are all DONE and pushed as of 2026-09-02. Per-step detail is in
`changelog.md`; the archived sub-step entries are in `session-history.md`.

Full suite: **16 files, 298/298 assertions, 0 failures.** Run individually
via `node <file>.test.js` — there is no test runner script. Two files are
easy to miss because they live outside `server/routes`/`server/engines`:
`server/db/activityLog.test.js` and `server/db/migrate.test.js`. The newest
file is `server/routes/commissaryAdjustments.test.js`.

## Known open items (not the next step's problem, just not forgotten)

- **Commissary meats are untagged — `meat_type_id` is NULL on live data.**
  This is a data-entry prerequisite for allocations, not a build task: an
  untagged source has no valid destinations, so
  `GET /commissary/adjustments/destinations` correctly returns `[]` and every
  Allocate dropdown will be empty until the tagging is done. Everything needed
  is already shipped — `GET`/`POST`/`PUT /api/settings/meat-types` and the
  `meat_type_id` field on `POST`/`PUT /api/settings/commissary-meats/:id`,
  both wired into `settings.html`. Tag every commissary meat that could ever
  move or be allocated, on both sides, before soft-launch. Note that a
  destination must match on `unit` as well, so two sides of the same meat type
  tracked in different units still won't pair.

- **A real click-through in an actual browser is still owed** for Stock
  Receipts' Unallocated/Assign flow specifically — the 2026-08-28 session
  had no browser available (no puppeteer/playwright, and the download
  host for one isn't in the sandbox's network allowlist), so it verified
  via live HTTP payload replay instead (see `changelog.md`). Strong
  verification, but not the same as clicking it. Commissary's own
  Edit/Delete UI flows are in the same boat — never fully click-tested.
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

## Step 24 — multi-stage yield + Commissary-side allocation (24a, 24a-b, 24b-i, 24b-ii, 24b-iii DONE; 24c-ii NEXT, then 24b-iv, then 24c-i)

The full design narrative, the 2026-08-31 resolution of its open questions,
and the completed sub-step entries (24a, 24a-b, 24b-i, 24b-ii, 24b-iii,
including 24a's blast-radius map) are archived in `session-history.md`. The
load-bearing decisions they produced live in "Things NOT to re-litigate"
below — read those, not the archive, unless you need the reasoning behind one.

**24b-iii landed 2026-09-02**: CRUD routes for `commissary_adjustments` in
`server/routes/commissary.js` (`GET`/`POST`/`PATCH /:id`/`DELETE /:id`), plus
`GET /commissary/adjustments/destinations?commissary_meat_id=` — the
destination filter an ALLOCATION's dropdown needs, returning only commissary
meats sharing the source's `meat_type_id` **and its `unit`**. No live data has
any `meat_type_id` tagged yet, so the live-server check exercised LOSS
create/list/patch/delete and every rejection path, not an accepted ALLOCATION
end to end — that's covered by the mirrored-logic test file instead. See
`changelog.md` for full detail.

**Gap found 2026-09-02 (architect verification pass), before dispatching 24c:**
`output_commissary_meat_id` (24a) and `input_quantity` (24b-i) exist in
`schema.sql`, have idempotent migrations, and are fully consumed by
`commissaryAuditEngine.js` — `getCommissaryBackedUp` credits
`COALESCE(output_commissary_meat_id, commissary_meat_id)` and
`getCommissaryUsage` debits `COALESCE(input_quantity, raw_weight_in)`. But
**nothing writes either column.** `grep` across `server/routes/*.js` returns
zero hits for both. The yield-log `POST` destructures six fields and neither is
among them; `PATCH` likewise, so an existing event can't be corrected either.

This was correct scoping at the time, not a slip — 24b-i's `changelog.md` entry
names the write route as explicitly out of scope. It simply never got
scheduled afterwards, and the sub-step list ran straight from 24b-iii to
"24c — UI" as though the write path existed.

Why this matters: a worker given "24c — UI" as previously worded would add the
output-item and input-count fields, POST them, receive `{ok: true}`, and have
both values silently discarded. The form would look like it worked and the
balance math would never move. The engine reading these columns *correctly* is
what makes the failure silent.

**Remaining sub-steps, re-sequenced:**

- **24c-ii — Allocate / Write-off UI on the commissary balance view. NEXT, and
  dispatchable now.** Fully unblocked: 24b-ii's engine folds ALLOCATION into
  `endingCalculated` and LOSS into `expectedEnding`, and 24b-iii's routes
  (`GET`/`POST`/`PATCH`/`DELETE /commissary/adjustments`, plus
  `GET /commissary/adjustments/destinations`) are in place and tested. Purely
  additive to `public/commissary.html`; touches no engine and no route.
- **24b-iv — yield-log write path.** Extend `POST` and `PATCH
  /commissary/yield-log` to accept `output_commissary_meat_id` and
  `input_quantity`. The output meat must be active and must belong to the
  **same `commissary_id` as the input** (see "Things NOT to re-litigate");
  it is otherwise unconstrained — no `meat_type_id` or `unit` match, because
  the yield log is the one place a unit legitimately changes. Numbered in the
  24b tier because it is route work, not UI. Blocks 24c-i.
- **24c-i — yield-entry form UI.** The output-item field (defaults to the same
  meat, i.e. NULL) and the input-count field alongside the weighed input.
  Requires 24b-iv first.

24c-ii is deliberately dispatched ahead of 24b-iv even though it sorts later:
the two are independent, and running them in this order keeps two workers off
`public/commissary.html` at the same time — that file is the only real
collision risk between them.
## Things NOT to re-litigate (already decided, stable)

- **Commissary-to-commissary movement is an ALLOCATION, not a shipment.**
  Asked and settled 2026-09-02. A shipment cannot express it:
  `commissary_shipments.restaurant_id` is `NOT NULL` with an FK to
  `restaurants`, and more importantly a shipment row only *debits* —
  `getCommissaryUsage` counts it as usage, and the receiving side is credited
  by a separate record entirely (`stock_receipts` for a restaurant,
  `commissary_stock_receipts` for supplier arrivals). Routing a
  commissary-to-commissary move through shipments would therefore need a schema
  change *and* produce two unlinked rows for one physical movement, where
  deleting one makes the meat duplicate or evaporate. ALLOCATION already does
  both halves from a single soft-deletable row. **Allocation destinations are
  therefore deliberately NOT restricted by `commissary_id`** — crossing
  locations is the point. Do not "fix" this.
  Verified numerically 2026-09-02 against a real `node:sqlite` DB with two
  separate commissaries: 100/100 → 70/130 on a single 30 kg ALLOCATION row,
  total conserved at 200, and a soft delete of that one row returned both
  sides to 100/100.
- **Yield output IS restricted to the input's own commissary** (24b-iv). The
  opposite rule from allocations, on purpose: an allocation is a movement, a
  yield event is a conversion, and meat cannot be processed in one building
  into another building's inventory. Without the guard a misclick in the output
  dropdown silently books stock to the wrong location. Crossing locations is
  two events — a yield, then an allocation.
- Tech stack: Node.js + Express + `node:sqlite` (not better-sqlite3, not
  Postgres) — see `changelog.md` for why.- Single local machine, one SQLite file, no hosting/multi-user — see
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
  revive it.) Settled 2026-09-01.
  - **AMENDED 2026-09-02 — a unit-tracked input is weighed as well as
    counted, so yield math is `kg -> kg` everywhere.** The operator records
    BOTH numbers for every unit-tracked input, and has done since before the
    app existed: the count (40 chickens) and the measured total weight of
    that count (32.5 kg). This is a real weigh-in on a real scale, NOT the
    rejected "pre-convert to kg using a standard" idea above — that one
    *estimated* kilos from a count and hid the true ratio behind an
    assumption; this one *measures* them. The distinction is the whole point:
    do not read this amendment as the rejected idea returning. Consequences:
    (a) yield loss% compares kg to kg on every stage, so no cross-unit branch
    is ever needed in `commissaryYieldEngine.js`; (b) the stock deduction
    still needs the COUNT, since Raw Chicken's balance is in `unit` — debiting
    kg from a balance measured in birds would silently corrupt it, which is
    the exact failure 24a existed to close, arriving from the other side;
    (c) the two input numbers together expose kg-per-bird as a supplier
    control, which nothing in the system surfaces today. This is why 24b-i
    adds `input_quantity` rather than treating the weigh-in as free.
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

- **`graphify-out/` commit policy — settled 2026-09-02.** `graphify-out/` IS
  committed (it's how a worker gets the graph without regenerating it), but
  only the parts that are *content*. Committed: `graph.json`, `manifest.json`,
  `GRAPH_REPORT.md`, `.graphify_labels.json` + its `.sig`, `.graphify_root`,
  and `cache/ast/` + `cache/semantic/` (content-hashed extraction results —
  append-only, never rewritten, and the expensive part to regenerate).
  Gitignored: `cost.json` and `cache/last_query_stamp` (per-run usage
  metadata), `cache/stat-index.json` (machine-local file-stat cache),
  `.graphify_python` (an absolute Windows path to the local interpreter — this
  repo is public), `graph.html` (~390KB rendered viewer, fully rewritten every
  run, derived entirely from `graph.json`, regenerates locally via the
  post-commit hook), and the dated snapshot directories
  `graphify-out/YYYY-MM-DD/` (a near-duplicate of the top-level output written
  on every run — git already versions those files, so the snapshots are
  redundant history at ~490KB per session). This closes the three previously
  undecided `graphify-out/` paths. **Why it mattered**: before this, a single
  session's commit swept in ~17,000 lines of graphify churn, and `.git` was
  growing by roughly 1.3MB per session against a 1.8MB baseline — a real cost
  on the standard flow, where every worker clones fresh. Don't re-add the
  ignored paths thinking they're missing output; they regenerate locally.

- **`commissary_adjustments` is NOT activity-logged — settled 2026-09-02 by
  precedent, not by preference.** Rule 9 scopes the before/after-snapshot
  pattern to `stock_receipts` and `commissary_yield_log`, and explicitly names
  the restaurant-side `adjustments` table as deliberate future work rather than
  something to extend into silently. `commissary_adjustments` is that table's
  direct commissary counterpart, so it follows the same treatment: soft delete
  via `deleted_at` (as the §10b schema already specifies), no `activity_log`
  writes. If adjustment logging is ever wanted, it should land for both tables
  together as its own deliberate step — don't add it to one side only.

- **Per-meat "next stage" config is DEFERRED pending soft-launch — settled
  2026-09-02.** It was originally scoped into 24b so the yield form could
  pre-select the right output meat. It isn't needed for correctness: 24c's form
  can default the output to the same meat and let the operator pick, which is
  exactly what a NULL `output_commissary_meat_id` already means. The project
  owner's stated plan is a soft launch against real output to see what actually
  needs improving, and pre-selection is precisely the kind of convenience that
  should be justified by real use rather than guessed at. If picking the output
  proves annoying in practice, add the config then — no schema rework is
  required to do so later.

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
