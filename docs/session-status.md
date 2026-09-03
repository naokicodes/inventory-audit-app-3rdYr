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

## Current state — 2026-09-03

**Steps 1–25c are all closed**, verified against `origin/main` at `2d8a6a8` by
an independent architect clone, full suite run and live server run — not from a
worker's report. Per-step detail is in `changelog.md`; archived narrative is in
`session-history.md`.

**Queue: 25a, then 24b-v, then 25d, then soft launch.** Each has its own
section below and the order is in `dispatch-queue.md`. 25a closes the last
half of the ledger-entry gap (`commissary_stock_receipts` is still unwritten).
24b-v is a data-corruption guard that only matters once balances work. 25d
records who did each physical count, sequenced before soft-launch because
attribution is the one deferred item that cannot be backfilled.

**25d is NOT dispatchable as written.** The 2026-09-03 gap hunt found two
errors in its own scope section — see "Gap hunt 2026-09-03" below. Both must be
folded in before a prompt is drafted, and one of them needs an architect
decision first.

**Step 25e is defined and is queued late, deliberately.** See its section below
and `dispatch-queue.md`.

**Pre-launch plan, revised by NaokiiVT 2026-09-03 — this supersedes "soft
launch against real output".** There is no soft launch against real output yet.
The app will be exercised against **test data** until three pillars are
complete, and only then does a launch (with or without finished UI) follow:

1. **Core** — the audit math and its inputs are correct and correctable.
2. **Terminal Use** — see "Terminal direction" below. Explicitly a big step;
   NaokiiVT: "we should not skimp it."
3. **INPUT / EDIT / DELETE for every piece of data the app accepts** — see the
   CRUD coverage audit under "Gap hunt 2026-09-03".

Steps are still not invented ahead of need, but the three pillars are the frame
that decides what counts as needed. Anything that does not serve one of them
waits.

**Automation, added 2026-09-03.** `npm test` runs all 16 suite files and
prints one aggregate count. `npm run audit:write-paths` flags schema tables and
columns that are read but never written — the bug class that produced 24b-iv
and 25a/25b — and fails on stale allowlist entries so a closed gap cannot sit
in `scripts/write-path-allowlist.json` unnoticed. `npm run verify` runs both,
and GitHub Actions runs `npm run verify` on every push and pull request.
`.claude/commands/step.md` and `verify.md` hold the dispatch and health-check
procedures. `docs/workflow-guide.md` is the cold-start reference for the whole
loop; `docs/decision-authority.md` defines what a worker may decide alone.

**Before soft-launch, one on-site task blocks the new features from doing
anything:** the meat-type tagging pass on the live DB (see Known open items).
25c makes a *fresh seed* correctly tagged, but does not retro-tag existing rows
and deliberately must not.

Full suite: **16 files, 325/325 assertions, 0 failures.** Use `npm test`; the
old per-file ritual and the ExperimentalWarning caveat no longer apply, since
the runner reads the last count line in each file.

## Known open items (not the next step's problem, just not forgotten)

- **Two retired test meat types sit in live `inventory.db`:** id 5
  `Test Meat Type` and id 6 `24d Test Type`, both `active = 0`. Harmless now
  that 24d filters them out of both dropdowns, and `meat_types` has no DELETE
  route by design (soft delete only, and the table is referenced by two FKs).
  Left deliberately rather than hard-deleted. Worth knowing they are there so
  nobody mistakes them for real catalog entries, and worth not adding more —
  a worker verifying meat-type behavior should reuse one of these rather than
  creating a third.

- **Commissary meats are untagged — `meat_type_id` is NULL on live data.**
  This is a data-entry prerequisite for allocations, not a build task: an
  untagged source has no valid destinations, so
  `GET /commissary/adjustments/destinations` correctly returns `[]` and every
  Allocate dropdown will be empty until the tagging is done. Everything needed
  is already shipped — `GET`/`POST`/`PUT /api/settings/meat-types` and the
  `meat_type_id` field on `POST`/`PUT /api/settings/commissary-meats/:id`,
  both wired into `settings.html`. Tag every commissary meat that could ever
  move or be allocated, on both sides, before soft-launch. **Step 25c closes
  this for any freshly seeded DB** — it seeds the eleven meat types and tags
  all fifteen commissary meats, so a wipe-and-reseed comes back fully tagged
  and no hand entry is needed. Note that a
  destination must match on `unit` as well, so two sides of the same meat type
  tracked in different units still won't pair.

- **A real click-through in an actual browser is still owed** for Stock
  Receipts' Unallocated/Assign flow specifically — the 2026-08-28 session
  had no browser available (no puppeteer/playwright, and the download
  host for one isn't in the sandbox's network allowlist), so it verified
  via live HTTP payload replay instead (see `changelog.md`). Strong
  verification, but not the same as clicking it. **Commissary's own
  Edit/Delete UI flows (yield log AND the new adjustments list) were
  click-tested 2026-09-02** during 24c-ii, closing that half of this item —
  see `changelog.md`'s 24c-ii entry for what was clicked.
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

## Step 24 — CLOSED 2026-09-02. See docs/session-history.md.

## Things NOT to re-litigate (already decided, stable)

- **The app records what is physically on hand, not what was invoiced.**
  Confirmed by NaokiiVT 2026-09-02. On a delivery the commissary weigh-checks
  against the supplier's figure; where they disagree, **our own scale wins** and
  the difference is absorbed as a small loss rather than modelled. Do not add an
  invoice-weight column, a supplier-discrepancy field, or a shortage variance to
  the receipts flow. If short deliveries ever become large or frequent this can
  be revisited, but it is deliberately out of scope, and a balance that reflects
  what was billed rather than what arrived would defeat the purpose of the app.
- **Box tare is already netted out by everyone involved and must never be
  modelled.** Meat arrives boxed; the box is weighed, the tare is already
  accounted for by all parties, then the box is opened and the contents counted.
  A future "box weight" or tare field is not a missing feature.
- **`created_by` means two different things and that is deliberate.** On
  `prepped` it is *provenance* — `SYSTEM:sync-batch-stock` means the number was
  inferred from sales, NULL means a human typed it. On `ending_actual` and
  `portion_ending_actual` it is *identity*, the name of whoever did the count.
  Confirmed by NaokiiVT 2026-09-03. Do not "fix" the inconsistency by writing
  auditor names into `prepped.created_by`; that destroys the only signal saying
  a number was never physically counted. A future column rename on one side is
  the acceptable resolution, not unifying the meaning.

- **Every intake records BOTH a count and a weight when the meat is
  unit-tracked.** Confirmed by NaokiiVT 2026-09-02 for purchasing, and it is
  the same measurement pattern already settled for processing. This has now
  surfaced three times in three different places, so treat it as a general rule
  rather than a yield-log quirk: **the count drives the stock balance, the
  weight drives the money and the yield percentage, and both are real
  measurements of one event.** Any table recording meat entering or being
  consumed needs somewhere to put both numbers. Where only one column exists,
  that is a bug waiting to happen — either the purchase weight is lost, or kg
  get debited against a count, which is the 24b-v corruption arriving through a
  different door. `commissary_yield_log` has this (`input_quantity` /
  `raw_weight_in`); `commissary_stock_receipts` does NOT, and step 25a fixes
  that.

- **FC does not need its own commissary.** Considered and rejected 2026-09-02.
  A commissary exists to *convert* meat — that is what yield events are. FC only
  ever receives and sells, and meat reaching a restaurant without passing
  through a commissary is already fully modelled by
  `stock_receipts.source = 'DIRECT'`. A second commissary there would add a
  catalog to maintain and buy nothing `DIRECT` receipts don't already give.
  Note this is a decision about FC specifically, not about multi-commissary
  support, which is built, working, and verified. Adding a commissary later is a
  data operation — `POST /api/settings/commissaries` plus tagging its catalog —
  not a code change. Revisit only if FC ever starts converting meat rather than
  just receiving it.

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

- **Seven unit-tracked meats have no kg output, and that is correct — settled
  2026-09-03.** M07 PATA, M09 Pork Steak, M10 French Cut, M11 Pompano and M12
  Salmon Belly are **received and shipped only**. They are never yield sources,
  so 24b-v rejects nothing for them and they need no kg counterpart. Confirmed
  by NaokiiVT.

  These meats *are* prepped — searing, for example — but searing is a
  unit-to-unit operation that changes no quantity: a seared PATA is still one
  PATA, and it ships as one. Prep that does not change the count is **not a
  yield event and must never be recorded as one**, because a unit-to-unit yield
  is precisely the corruption 24b-v exists to reject.

  If searing ever *costs* stock — burnt, dropped, damaged — that is a **LOSS
  declaration** on the commissary page (built in 24b-ii/24b-iii, currently
  unused), not a yield with a smaller output. Anyone looking at seven
  unit-tracked meats and no kg outputs will read it as the 24b-v gap and try to
  add counterparts. It is not. Do not add them.

- **Pork Belly and Jowl already satisfy 24b-v and need no new rows — settled
  2026-09-03.** M04 Belly Slab Raw -> M03 Belly Slab, and M06 JOWL Raw -> M05
  JOWL, are both kg-to-kg, which 24b-v leaves accepted and unchanged. An
  architect pass nearly added duplicate "Processed Belly" and "Processed Jowl"
  rows on the assumption that every Raw meat needed a processed counterpart;
  the duplicates would have split each meat's stock across two competing rows.
  **Whole Chicken was the only real gap.**

- **The `Whole Chicken` meat type includes a kg member, deliberately — settled
  2026-09-03.** M15 Processed Chicken (kg) is tagged `Whole Chicken` even though
  it is not a whole chicken. The type is a grouping key, not a display name —
  each meat keeps its own `name`. M15 is the only kg member, so the
  same-type-same-unit destination filter never pairs it with M01/M02 today; it
  is tagged so a future kg-tracked chicken in a second commissary can pair with
  it. Naming chosen by NaokiiVT. Do not "correct" it to a separate type.

- **Station-to-station transfer is out of scope — settled 2026-09-03.** The
  `locations` table supports two granularities: site-level (Silingan, FC,
  Commissary) and station-level ("Silingan - Grill Station"). NaokiiVT ruled
  the station tier out entirely: a restaurant's cycle is beginning, new stock,
  usage/sales, allocations, ending, and meat moving between stations inside one
  building is not an event anyone records. The substitution case that *does*
  happen — one dish's meat used for another — is item-to-item, and
  `POST /api/allocations/conversion` already implements it with a linked +/-
  adjustment pair. Consequences: `locations.is_restaurant_level` is
  permanently inert, and the internal-transfer defect below is out of scope
  rather than a bug to fix. Do not build station-level features.

- **An internal transfer would produce a phantom surplus, and is guarded, not
  fixed — settled 2026-09-03.** Reproduced live: `getAdjustmentsTotal` in
  `auditEngine.js` sums every adjustment for a restaurant/meat/date with no
  filter on type or location, so a 3-unit Grill-to-Prep move inside one
  restaurant subtracted 3 from that restaurant's expected ending and reported
  a SURPLUS of 1 against a physically correct count. Because station-level is
  out of scope, the fix is **rejection, not accounting**: any transfer whose
  from- and to-location resolve to the same restaurant must be refused at the
  route. Do not "fix" the engine to net internal moves to zero — that would be
  building the station feature by the back door.

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

## Gap hunt 2026-09-03 — findings

Method: independent clone at `2d8a6a8`, `npm ci`, `npm run verify`, then a
seeded scratch DB with the server booted and real payloads POSTed, reading the
tables back. `SUITE GREEN` (16 files, 325) and `AUDIT CLEAN` both pass with
every finding below live. None of these were visible in the test suite.

### Finding 1 — `prepped.created_by` lies after a manual correction

**Live bug today. Restaurant-side, not commissary. Not caught by the
write-path audit and not catchable by it. Needs an architect decision before
25d can absorb it.**

`POST /daily-audit/portions` upserts `prepped` with `ON CONFLICT ... DO UPDATE
SET portions_produced = excluded.portions_produced`. `created_by` is named in
neither the INSERT nor the UPDATE. The only writer of `prepped.created_by`
anywhere is `commands.js`'s sync-batch-stock, which stamps
`'SYSTEM:sync-batch-stock'`.

Reproduced live:

```
POST /api/commands/sync-batch-stock       -> prepped row created, 30 portions,
                                             created_by 'SYSTEM:sync-batch-stock'
POST /api/daily-audit/portions {prepped:42}
                                          -> {"ok":true,"saved":1}
prepped row now: portions_produced 42, created_by 'SYSTEM:sync-batch-stock'
```

The number is hand-entered by an auditor. The attribution says SYSTEM. This is
the exact sequence the route's own header comment describes as intended and
expected ("the auditor correcting an inferred default with the real physical
number"), so it is the normal path, not an edge case.

**Why the write-path audit cannot see it.** The audit asks whether a column has
a writer. `prepped.created_by` has one. The gap is a *second* route that upserts
the same row and silently leaves the column at its old value. Any column written
by one path and skipped by another upsert path on the same row is invisible to
this audit. Worth deciding whether that class gets its own check.

**Why it collides with 25d specifically.** `prepped` and `portion_ending_actual`
are written by the same route, from the same dish row, on the same screen, from
one submit. 25d gives `portion_ending_actual.created_by` the auditor's name and
leaves `prepped.created_by` on that same row reading SYSTEM. 25d already states
the correct rule for this shape ("Include it in the `DO UPDATE SET` clause, not
only the INSERT, or a corrected count keeps the original auditor's name") and
simply does not apply it to the third table its own route writes.

**Open decision — what does `prepped.created_by` mean?** Today it is provenance
(SYSTEM vs NULL-meaning-manual), not identity. Folding it into 25d means either
overwriting SYSTEM with the auditor's name on correction, or keeping two
meanings in one column, or adding a second column. That is a semantics call, not
a worker call. **Do not dispatch 25d until this is answered.**

`opening_stock` was checked and has no `created_by` at all, so 25d correctly
omits it. No gap there.

### Finding 2 — 25d as written splits the two audit pages' contracts

25d requires a blank `actor` to be a 400 on the restaurant side, and said of the
commissary side that no server change was needed. That was wrong. Reproduced
live:

```
POST /api/commissary/daily-audit  {"actor":""}   -> HTTP 200, created_by NULL
```

`POST /commissary/daily-audit` writes `actor || null` with no validation. A
worker following 25d exactly would ship a restaurant sheet that rejects a blank
name and a commissary sheet that accepts one — same operator, same shift, two
contracts, with the commissary side still producing the unattributed rows 25d
exists to eliminate. 25d's scope section has been corrected; the fix is small
and belongs inside 25d.

### Premises re-verified — all four queued steps still stand

- **25a** — `commissary_stock_receipts` has no writer. Holds. Read by
  `commissaryAuditEngine.js` for Stock In; every other mention in `server/` is a
  comment.
- **24b-v** — a unit-tracked yield output is still accepted. Holds, live. Source
  M01 Whole Chicken (`unit`), blank output, `input_quantity` 40 /
  `backed_weight_out` 28 returned HTTP 200 and wrote the row.
- **25d** — `POST /daily-audit` silently drops `actor`. Holds. `{"actor":"Naoki"}`
  returned `{"ok":true,"saved":1}` with `ending_actual.created_by` NULL.
- **25e** — `stock_receipts.source` CHECK blocks a third value. Holds:
  `CHECK (source IN ('DIRECT','COMMISSARY'))`, so a table rebuild is genuinely
  required.

### Route/fetch diff — clean in the direction that matters

67 registered routes, 84 `fetch()` calls in `public/`. **Zero fetch calls with
no matching route.** The reverse direction produced six apparent orphans, all
six confirmed false positives of the matcher (URLs assigned to a variable before
the call, multi-line option objects) — not findings. The previously recorded
"45 for 45" figure matches neither count in today's repo; treat it as stale
rather than as evidence of a regression.

### Finding 3 — a skipped count silently rewinds beginning stock to the bootstrap number

**SEVERE. Core (pillar 1). Restaurant side. Not a UI bug — it is in
`auditEngine.js` and it corrupts every downstream number.**

`getBeginningStock` resolves in this order: yesterday's `ending_actual`, else
`opening_stock`, else null. The `opening_stock` query has **no date filter** —
it takes the single row for (restaurant, meat) whatever its `business_date`.

Reproduced live:

```
2026-10-01  opening_stock 100, ending_actual counted at 90
2026-10-02  auditor skips the count entirely
2026-10-02  beginning: 90    <- correct, yesterday's ending
2026-10-03  beginning: 100   <- the BOOTSTRAP number, not 90
```

One missed count does not produce a gap; it rewinds beginning stock to the
number the app was first seeded with, which may be months old. Then
`ending_calculated = beginning + newStock - usage` is computed from it and
reported as if normal. `status` returns `MISSING_ACTUAL_COUNT`, which describes
today's missing count and says nothing about the beginning having come from a
stale fallback. Every subsequent day chains off the wrong figure.

Missed counts are the expected case, not the exotic one — that is the whole
reason sync-batch-stock exists on the dish side.

**Decision, 2026-09-03 — resolved into Step 26a below.** Carry forward and lock
are not alternatives; they answer different questions and the app needs both.
The fallback to `opening_stock` regardless of date is fixed unconditionally.
Beyond that: carry forward the prior day's `ending_calculated`, never silently,
and flag the row rather than hard-blocking it.

### Finding 4 — `opening_stock` is write-once and cannot be corrected

**Pillar 3. Same shape on `commissary_opening_stock`.**

`INSERT OR IGNORE` against `UNIQUE (restaurant_id, meat_id)` — note the
constraint has **no `business_date`**. The schema comment calls the date "the
first date this app tracks this meat", so the table is a one-time bootstrap, not
a periodic opening balance. Reproduced live:

```
enter 50  -> {"ok":true,"saved":1}   stored: 50
correct to 75 -> {"ok":true,"saved":1}   stored: 50
```

The correction reports success and does nothing. There is no PATCH, PUT or
DELETE for either opening-stock table anywhere in the app. Combined with
finding 3, a typo in the bootstrap figure is both permanent and periodically
re-read as live data.

**This is the one to fix before test data is entered**, because entering test
data is exactly how it gets discovered, and by then the number is stuck.

**It also collides with the stated landing-page plan.** "Beginning of the month
should always be terminal-based" presumes a monthly opening balance. No such
concept exists: beginning is always the prior day's ending, with `opening_stock`
as a single lifetime seed. Supporting a monthly opening is a schema change plus
an `auditEngine` change, not a terminal command. See "Landing input model"
below — flagged, not decided.

### Finding 5 — a value entered by mistake cannot be un-entered

**Pillar 3.** `POST /daily-audit` and `POST /daily-audit/portions` write only
fields that are non-empty (`!== null && !== undefined && !== ''`). Blanking a
cell and saving is a silent no-op that returns success. Reproduced live:

```
enter 999 -> saved.  clear the cell, save -> {"ok":true,"saved":1}
stored: still 999
```

`PATCH /sales` already handles this correctly — an empty `quantity` is treated
as `isClearing` and the row is deleted — so the same auditor gets two different
behaviours on two screens. `PATCH /sales` is the model to copy.

### CRUD coverage audit (pillar 3) — 2026-09-03

Complete (create, edit, delete): `stock_receipts`, `commissary_yield_log`,
`commissary_adjustments`, and `sales` (via `PATCH /sales`, which handles
clearing).

**Create only — no edit, no delete:**
- `allocations` (`POST /allocations`)
- conversion allocations (`POST /allocations/conversion`)
- `commissary_shipments` (`POST /commissary/shipments`)

All three are stock movements. A mis-keyed movement currently cannot be
corrected or voided by any route.

**Upsert only — no delete, and no way to clear a value (finding 5):**
`ending_actual`, `portion_ending_actual`, `prepped`, `commissary_ending_actual`.

**No write path at all:** `commissary_stock_receipts` (step 25a).

**Write-once, uncorrectable (finding 4):** `opening_stock`,
`commissary_opening_stock`.

Catalog tables under `/settings/*` all have create and edit; deletion is by
`active = 0` soft delete by design, except `recipes`, which has a real DELETE.
That asymmetry is deliberate and is not a pillar-3 gap.

### Finding 6 — the Terminal has no server route and its tests mirror a copy

**Pillar 2.** There is no `server/routes/terminal.js`. `public/terminal.html` is
entirely inline script. `server/routes/terminal.test.js` states in its own
header that it mirrors only the resolver logic copied out of that inline script,
with no DB involved — so its 15 green assertions prove a copy behaves, not that
the Terminal does. The copy can drift from the original silently and the suite
will stay green.

Relevant because pillar 2 makes the Terminal a first-class surface and the
quick-command panel is planned for removal. Whether the Terminal grows a real
server route is the first scoping question of that pillar.

## Landing input model and Terminal direction — stated 2026-09-03

Recorded as NaokiiVT's stated direction. **Not yet scoped into steps**, and
several parts have open questions that must be answered before any of it is
dispatched. Written here so the direction survives; do not treat it as a spec.

### Landing page — which columns are manual

- **Ending** — always manual input. The only column on the landing sheet
  intended to stay hand-entered permanently.
- **Notes** — manual. (Terminal has its own separate notes concept.)
- **New stock** — comes from Stock Receipts, which has its own page.
- **Usage** — to be driven by a Loyverse API call that parses items. **Not
  implemented, and there are no settings for it yet.** See `docs/loyverse-sync.md`
  and rule 14 — the sync is deliberately unbuilt.
- **Allocations** — has its own page.
- **Beginning of month** — intended to be Terminal-driven, "or unless its
  possible to have it manually open on the first day of any month."

**Resolved 2026-09-03 — see Step 26a.** "Beginning of the month" becomes a
*declared opening balance on a date*, via `opening_stock`'s unique key gaining
`business_date`. It is not a separate concept and not a Terminal-only path: the
Terminal gets a command to *propose* the values, but the balance itself is
ordinary declared data. The monthly declaration is also what bounds the
carry-forward fallback in finding 3 — the two answers depend on each other.

**Second open question.** Usage today is derived as `sales × recipe_bom` for
DIRECT dishes plus `prepped × recipe_bom` for BATCH_PREPPED ones. Loyverse would
supply *sales*, not usage directly. Confirm that reading before scoping, because
"usage is the API call" and "sales is the API call" produce different designs.

### Terminal direction

NaokiiVT: Terminal is one of the big steps for this project and should not be
skimped.

Intent: landing-related commands that accept **today or a specific date** and
then act — call sales, input or edit a value on new stock, allocations, and
anything else that is not manual, including the manual ones (with the caveat
that entering Ending through the Terminal wastes the auditor's time, so the
page keeps that job).

Also planned: **removal of the quick-command panel** at the bottom of every
page, with commands living in the Terminal instead, possibly as a mobile-usable
portable prompt.

**Dependency to resolve first.** `POST /commands/sync-batch-stock` is reachable
only from that panel, and its own comment says it is global precisely because
the panel has no restaurant/date context. If the panel is removed, the command
needs a home or SYSTEM-inferred `prepped` rows stop being generated — which
quietly changes what the dish math sees on days nobody logged production.

**Structural precondition.** See finding 6: the Terminal has no server route and
its tests mirror a copy of its inline script. Deciding whether it gets a real
route is the first scoping question of pillar 2.

## Step archive-pass — trim session-status.md

**Lane: DISPATCH only. Docs only — no code, no schema, no test changes.**

This file is ~1,300 lines. Rule 22 keeps it short because every worker session
reads it cold, so its length is a cost paid on every dispatch. Move resolved
history to `docs/session-history.md` and leave current state behind.

Sequenced as the first dispatch through the new `/step` machinery deliberately:
it is doc-only, fully reversible, and cannot corrupt data, so if the workflow
snags it snags on something harmless. The PR path has been used once in this
repo's history.

### What MOVES to docs/session-history.md

Only these three, appended in this order under a dated heading
`## Archived 2026-09-03 (pass 2)`:

- `## Step 24 — multi-stage yield + Commissary-side allocation (CLOSED 2026-09-02)`
- `### 25b — commissary opening stock + physical count. CLOSED 2026-09-02.`
- `## Step 25c — seed and tag the meat-type catalog (CLOSED 2026-09-03, ...)`

Move each whole, heading included, byte for byte. Do not summarise, reword,
reformat or tidy them in transit. Leave a one-line stub where each was:

```
## Step 24 — CLOSED 2026-09-02. See docs/session-history.md.
```

### What STAYS — do not move any of it

This is the part most likely to go wrong. The following read like a finished
session's output. **They are open work.**

- `## Gap hunt 2026-09-03 — findings`, all six findings and the CRUD audit
- `## Landing input model and Terminal direction — stated 2026-09-03`
- `## Step 26a`, `## Steps 25a / 25b` (the 25a half), `## Step 24b-v`,
  `## Step 25d` and all three sub-steps, `## Step 25e`
- `## Current state`, `## Known open items`, `## Things NOT to re-litigate`,
  `## End-of-session checklist`, `## Open architectural questions`
- **This section.** The architect removes it when the step closes.

If a section is not in the MOVES list, it stays. Do not apply judgement about
what looks resolved — the list is the rule.

### Verify before pushing

`npm run verify`, then confirm by reading, not by assuming:

- `git diff --stat` shows exactly two files changed
- every line removed from `session-status.md` appears in `session-history.md`;
  a line count that does not reconcile means content was lost — stop and report
- `grep -c "Gap hunt 2026-09-03" docs/session-status.md` returns 1
- `grep -c "Step 26a" docs/session-status.md` returns at least 1

### Class B

This step should raise none. If something the list above does not resolve comes
up, stop and open a `needs-architect` issue rather than deciding what moves.

## Step 26a — beginning stock: date-scoped openings and an honest fallback

**Pillar 1 (Core). Lane: DISPATCH only. Schema rebuild — red by default.
Resolves gap-hunt findings 3 and 4 and the "beginning of the month" question in
one change, because they are the same code path.**

**Do this before test data is entered.** It is a table rebuild, and the data is
test-only today. This is the cheapest it will ever be.

### The shape

`opening_stock`'s unique key changes from `(restaurant_id, meat_id)` to
`(restaurant_id, meat_id, business_date)`. A row then means **"an authoritative
declared balance on this date"** rather than a lifetime seed. That one concept
covers month start, new-restaurant onboarding, and a post-recount reset — no new
table and no new vocabulary. `commissary_opening_stock` gets the identical
treatment.

`getBeginningStock` resolves in this order:

```
1. declared opening for THIS date
2. yesterday's ending_actual
3. yesterday's ending_calculated   -> status BEGINNING_CARRIED_FORWARD
4. null                            -> status MISSING_BEGINNING_STOCK
```

Step 1 winning over step 2 is deliberate: a declared opening is the operator
overriding the chain on purpose.

### What carry-forward costs, stated so nobody rediscovers it

`ending_calculated` is `beginning + newStock - usage` — the theoretical number,
with the missed day's variance already baked out. Carrying it forward makes
shrinkage on that day permanently invisible. This is acceptable **only because
the monthly declared opening bounds it**: theory can never chain more than one
month before a real count forces reconciliation. If the monthly opening
discipline is ever dropped, this fallback must be revisited, because without it
the carry chains forever.

Carry-forward is therefore never silent. The row reports
`BEGINNING_CARRIED_FORWARD`, and the variance must be labelled as covering N
days rather than presented as one day's.

### Not a hard lock — deliberately

A hard block on the row would prevent recording *today's* count, discarding data
that does exist. `ending_actual` is keyed by date, so a missed day stays
writable and the auditor backfills it from the filed paper sheet. Flag the row
unreconciled; do not refuse it. **This one is operational policy, not a
technical constraint — reversible if it does not match how the counts actually
run.**

A month with no declared opening is different: that is a real block, status
`MISSING_PERIOD_OPENING`, and the page refuses until the opening is written.

### Also required

`opening_stock` and `commissary_opening_stock` currently have no PATCH, PUT or
DELETE anywhere. Correcting a declared opening must be possible (finding 4).
Follow `PATCH /sales`, which is the project's correct model for edit-and-clear.

### Depends on this, do not build first

The Terminal command that reads the prior month's final `ending_actual` per meat
and proposes them as the new month's opening (NaokiiVT 2026-09-03, for
onboarding and monthly discipline) is pillar 2 work and cannot be built until
this schema change lands.

## Steps 25a / 25b — the commissary ledger has no way in

**Found 2026-09-02 by an architect audit of every write path into the
commissary ledger. Confirmed against NaokiiVT's live database: all three tables
below are empty, and nothing in the codebase can write them.**

`commissary_opening_stock`, `commissary_ending_actual`, and
`commissary_stock_receipts` are defined in `schema.sql`, read correctly by
`commissaryAuditEngine.js`, and referenced in comments — but **no route, no
seed, and no script inserts into any of them.** Verified by grep across the
whole repo and by running the engine on a realistic fresh install:

```
status:           MISSING_BEGINNING_STOCK
beginning:        null
endingCalculated: null
actual:           null
variance:         null
```

So today every commissary balance card renders `-`, and variance and
`unexplainedVariance` can never compute — the audit half of an audit app. The
debit/credit ledger built across all of step 24 is correct and unreachable, and
24c-ii's Allocate/Write-off buttons sit on cards that cannot show a number.

**The restaurant side is NOT affected and is not missing anything.**
`dailyAudit.js` writes `opening_stock` and `ending_actual`, `stockReceipts.js`
writes `stock_receipts`, `sales.js` writes `sales`. Those tables read as empty
only because no day has been entered yet. The gap is commissary-only, and each
piece has a working restaurant-side equivalent to mirror.

### 25b — CLOSED 2026-09-02. See docs/session-history.md.

### 25a — commissary stock receipts. Raw meat arriving from suppliers. NEXT.
Bigger than a route-and-UI mirror of `stockReceipts.js`, because
**`commissary_stock_receipts` has a single `quantity` column and cannot record
what is actually measured.**

How a delivery really works, confirmed by NaokiiVT 2026-09-02: meat arrives
boxed and is paid for on total kg. The commissary weighs the box (tare already
netted out by all parties — never model it), then opens it and counts the
contents. So a countable meat always yields **both** numbers, every time; there
is no weight-only delivery for a meat that is normally counted.

**Schema change:** add a nullable `weight_kg REAL` to
`commissary_stock_receipts` via an idempotent migration in
`server/db/migrate.js` (follow `migrateYieldLogInputQuantityColumn`).
`schema.sql` uses `CREATE TABLE IF NOT EXISTS` and cannot alter an existing
local `inventory.db`.

**Which column means what.** `getCommissaryStockIn` sums `quantity` and credits
it straight to the balance, so `quantity` must stay in the meat's **own unit** —
a count for a counted meat, kg for a weighed one. `weight_kg` is the total
delivered weight for the whole delivery, and it is the *additional* number. This
is the mirror image of the yield log: there kg was already present and the count
was added; here the count is the balance figure and the weight is added. Same
count-and-weight rule, opposite column.

- 40 chickens arriving: `quantity = 40`, `weight_kg = 32.5`
- 18 kg of belly arriving: `quantity = 18`, `weight_kg` 18 or NULL — for a
  kg-tracked meat the two are the same number

**`weight_kg` is REQUIRED when the meat's unit is `unit`**, for the same reason
`input_quantity` is required on yield events: both numbers genuinely exist at
every intake, so requiring it matches reality rather than imposing on it. It
stays optional for a `kg` meat.

Do **not** add an invoice-weight or discrepancy column — see "Things NOT to
re-litigate".

**Sequence: 25b, then 25a, then 24b-v.** 24b-v is correctly last — it guards a
corruption case that cannot occur until the balances work, and NaokiiVT's
database confirms zero existing bad rows.

**Before soft-launch, wipe and reseed `server/db/inventory.db`.** There is no
real data anywhere (every ledger table is 0 rows), but there is test residue:
5 yield rows and 2 adjustments, likely soft-deleted worker verification rows,
plus two retired test meat types. A reseed gives a clean catalog and an empty
ledger with nothing to mistake for real rows later. Do it before real entry
starts, not after.

## Step 25c — CLOSED 2026-09-03, `1790463`. See docs/session-history.md.

## Step 24b-v — REQUIRED: the effective yield output must be kg-tracked

**Found 2026-09-02 by an architect trace, after step 24 was closed. This is a
live data-corruption bug, not a nicety, and it should be fixed before
soft-launch.**

24b-iv requires `input_quantity` when the source meat's unit is `unit`, but
never requires an **output meat**. A blank output means "output is the same
meat", so a yield event on a unit-tracked source credits its kg output straight
back onto the count balance. Reproduced against a real DB:

```
Raw Chicken, unit-tracked, 100 birds on hand
  yield event: input_quantity 40, raw_weight_in 32.5, backed_weight_out 28,
               output_commissary_meat_id NULL
  usage (debit):     40    <- birds
  backedUp (credit): 28    <- KILOS
  endingCalculated:  88    <- 100 - 40 + 28, mixing birds and kilos
```

Nothing rejects it and nothing flags it downstream.

**The rule to add** derives from an already-settled decision ("yield output is
always kg"; unit-to-unit yield does not occur): the **effective output** —
`COALESCE(output_commissary_meat_id, commissary_meat_id)` — must be a
`kg`-tracked meat. That single check covers every case:

- kg source, blank output — credits itself, kg to kg, accepted (unchanged)
- unit source, blank output — **rejected**; this is the bug
- unit source, kg output — accepted, the real unit-in/kg-out case
- unit source, unit output — rejected (unit-to-unit yield does not occur)

Scope: `server/routes/commissary.js` POST and PATCH, extending
`validateYieldOutputAndInputQty`, which already receives the source meat. Both
paths call it, so neither can drift. Plus tests. `commissaryYieldEngine.js` and
`commissaryAuditEngine.js` stay untouched. The error text must name the real
problem — that the output has to be a kg-tracked meat and one may need creating
in the catalog first — not just report a rejection.

**Check for existing bad rows before or alongside this.** Any yield row whose
effective output is unit-tracked has already corrupted that meat's balance.
Query for them; they are not necessarily repairable by validation alone.

**Related, and the reason this surfaced:** the output meat must exist in the
catalog as its own `commissary_meats` row. A commissary holding only "Raw
Chicken" has nothing to select, and today that silently degrades to the broken
same-meat case instead of saying so. Catalog work belongs in the tagging pass.

## Step 25d — record who did the count

**Lane: DISPATCH only. Operator-visible, so not engineer-lane. No schema
change — every column already exists.**

**Decision, NaokiiVT 2026-09-03: restaurant-side naming is IN.** Blank names are
never accepted, on either sheet. Q3 resolved the same day: one person handles a
whole area (Landing, and Commissary), so **one name per sheet covers both POSTs
that page makes** — there is no need to attribute portions or cooking
separately from the inventory as a whole.

**25d is now split three ways.** As originally written it was one step; the read
path below turns it into a design question, so it no longer is.

- **25d-i — the write half.** `actor` into `ending_actual` and
  `portion_ending_actual`, blank rejected with a 400 on *both* sheets
  (see gap-hunt finding 2), one field at the top of each page sent with both
  POSTs. Fully specified, no open questions, dispatchable.
- **25d-ii — the `prepped` provenance fix.** One line, no naming, independent of
  everything else; may ride along with any step that touches
  `dailyAudit.js`. See below.
- **25d-iii — the read path.** Blocked on an architect decision. See below.

### 25d-ii — `prepped.created_by` is provenance, not identity

**Decision, NaokiiVT 2026-09-03: do NOT write auditor names to `prepped`.**

On `prepped`, `created_by` means *this number was inferred from sales by
sync-batch-stock*, and NULL means *a human typed it*. Writing an auditor's name
there would destroy that signal. The bug in gap-hunt finding 1 is narrower than
first described: when a human corrects an inferred number, the SYSTEM stamp must
be **cleared**, not replaced.

```sql
DO UPDATE SET portions_produced = excluded.portions_produced,
              created_by = NULL
```

**Same column name, two meanings across tables** — provenance on `prepped`,
identity on `ending_actual` / `portion_ending_actual`. Recorded here so nobody
later "fixes" the inconsistency.

**Second half, decided 2026-09-03.** sync-batch-stock writes an `activity_log`
entry; the manual correction in `dailyAudit.js` writes none, so History shows
"SYSTEM created this, 30 portions" and never shows a human changing it to 42.
`prepped` is the only logged entity with an unlogged write path. **The
correction gets logged.** This is not an extension of rule 9 to a new table —
`prepped` is already a logged entity, and leaving one of its two write paths
silent is the inconsistency, not the fix.

**Third half, added 2026-09-04 — the part the first dispatch got wrong.**

The two decisions above both say "when a human corrects an inferred number."
**`POST /api/daily-audit/portions` cannot currently observe such an event**, and
neither of the decisions above is implementable until it can.

`public/daily-audit.html` (the route's only caller) maps every
`tr[data-dish-id]` on screen and posts each one's current `.prepped` input value
on every save, touched or not. The inputs are pre-filled from the loaded row. So
the route receives the entire grid, unchanged values included, and cannot tell a
correction from a re-save.

Attempt one (branch `marble/25d-ii-prepped-provenance`, commit `c9f082a`)
implemented both decisions faithfully against that route and was verified
end-to-end on 2026-09-04. Seeding three SYSTEM-stamped rows and posting one save
in which only dish 1 changed produced:

```
prepped after ONE save:
  (1, 1, 12.0, None)   <- corrected, stamp cleared: correct
  (2, 2, 20.0, None)   <- untouched, stamp cleared anyway
  (3, 3, 30.0, None)   <- untouched, stamp cleared anyway
```

and three `UPDATE`/`MANUAL` log entries, two of which had no changed field other
than `created_by` — which `public/history.html` filters out of its diff
(`SKIP_FIELDS`, see 25d-iii), so they render as "No field-level changes to show
for this entry." Two further no-op saves brought the table to twelve rows, eight
of them content-free. The suite was green throughout.

Note what this trades: on `main` today the `DO UPDATE` sets only
`portions_produced`, so a correction *keeps* a stale SYSTEM stamp — wrong, but
cosmetic. Attempt one replaced that with provenance destroyed on rows nobody
edited, plus log noise that buries the one entry that matters. **It is strictly
worse than the current behaviour and must not be merged as written.**

**Decision, NaokiiVT 2026-09-04: the route detects the change itself.**

Read the existing row first. If a row exists and its `portions_produced` equals
the submitted value, **do nothing at all** — no upsert, no clearing of
`created_by`, no `activity_log` entry. Do the full write only when the value
actually differs, or when no row exists yet.

Fix it server-side, not by making the page send only dirty rows. Server-side
keeps this step's "no `public/` change" scope, and a route that is idempotent
under a repeated identical payload is the more defensible contract regardless of
what any future caller does.

Consequences a worker should expect and not treat as bugs:
- A save where nothing changed writes nothing and logs nothing.
- `saved` in the response counts rows actually written, so it will be lower than
  `rows.length`. That is correct; do not pad it back up.
- `portion_actual` keeps its existing unconditional per-statement upsert. This
  step does not touch it.
- The transaction still wraps only the `prepped` write, as attempt one had it.

Attempt one's other choices were sound and should be carried forward: the
plain-SELECT before/after lookups (node:sqlite's `DatabaseSync` exposes no
`RETURNING`), `withTransaction` around the prepped branch only, `actor: null`
until 25d-i, and the `CREATE`-vs-`UPDATE` action split.

Tests must cover: a no-op save writes nothing and logs nothing; a real
correction clears the stamp and logs one `UPDATE` with the SYSTEM value visible
in `before`; a fresh write logs `CREATE` with `before: null`; and a
multi-row payload where only one row changed touches only that row.

### 25d-iii — the name is currently unreadable, which 25d does not fix

Found 2026-09-03. Nothing in `server/` reads `created_by` in any WHERE, JOIN or
branch — every occurrence is a column definition, an INSERT list, a projection,
or a pass-through into `activity_log.actor`. And `public/history.html` filters
it out explicitly: `SKIP_FIELDS = new Set(['id', 'created_at', 'created_by'])`.

`ending_actual` and `portion_ending_actual` are also not written to
`activity_log` at all (rule 9, re-confirmed by this step), so there is no log
entry carrying the name in a header either.

**So after 25d-i the name is stored and there is no way to get it back out.**
25d's justification is that you cannot reconstruct who counted the walk-in on a
given Tuesday later — as scoped, you still cannot.

**Decision, 2026-09-03.** One field at the top of the page, beside the
restaurant and date pickers, mirroring the paper sheet's name-and-date header.
The same control does both jobs: **blank on a date not yet counted, prefilled
with the stored name when a counted date is loaded.** That makes the read path
nearly free rather than a separate feature.

`GET /daily-audit/mixed` returns a flat array of rows and carries no
`created_by`. A per-sheet name has no home in that shape, so **the response
becomes `{ rows, actor }`** and `daily-audit.html` is updated to parse it. The
alternative — repeating the name on every row — was rejected: it is redundant
and it invites someone later to "support" the per-row names Q3 explicitly ruled
out. Same treatment on the commissary page.

`ending_actual` and `portion_ending_actual`'s `created_by` are in the schema and
written by nothing. Found 2026-09-03 by the write-path audit
(`npm run audit:write-paths`). The commissary side is half-built: `POST
/commissary/daily-audit` already accepts a top-level `actor` and writes it to
`commissary_ending_actual.created_by`, but `commissary.html` never sends one,
so the column is supported by the route and fed by nothing.

**Decision, NaokiiVT 2026-09-03: the auditor's name is recorded per sheet, not
per row.** The auditors already write their names on the physical inventory
sheet they transcribe from, so the value is known once per submission and is
the same for every line on it. A per-row field would be re-keying the same
string twenty times and would invite disagreement between rows on a single
sheet.

**Why before soft-launch and not after.** This is the one item in the backlog
that cannot be backfilled. A month of physical counts entered without
attribution stays unattributed forever — you cannot reconstruct who counted
the walk-in on a given Tuesday. Everything else deferred to soft-launch can be
added later against the same data; this cannot.

### The route already accepts `actor` and throws it away
Reproduced live 2026-09-03: `POST /daily-audit` with `{"actor":"Naoki"}` in the
body returns `{"ok":true,"saved":1}` and writes the row with `created_by` NULL,
because the INSERT never names the column. The commissary twin, same payload,
stores it correctly.

This is the 24b-i failure shape — a client posts a field, gets a success
response, and the value vanishes. **25d is not "add a field", it is "close a
silent-discard path that already exists."** A UI worker could wire the field
today, see a 200, and never learn it does nothing.

### Shape
One text field at the top of each audit page, sent as a top-level `actor` in
the request body and applied to every row in the batch. This is not a new
concept — it is the contract `POST /commissary/daily-audit` already
implements. Mirror it exactly rather than inventing a second convention.

### Scope
- `server/routes/dailyAudit.js` — add `created_by` to the `ending_actual`
  upsert in `POST /daily-audit` and to the `portion_ending_actual` upsert in
  `POST /daily-audit/portions`. Both take `actor` from the top level of the
  body, the same way the commissary route does. Include it in the `DO UPDATE
  SET` clause, not only the INSERT, or a corrected count keeps the original
  auditor's name.
- `public/daily-audit.html` — one field, sent with both POSTs.
- `public/commissary.html` — one field, sent with the existing POST.
- `server/routes/commissary.js` — **`POST /commissary/daily-audit` DOES need a
  change**, contrary to what this section said before 2026-09-03. It stores
  `actor` correctly but validates nothing: a blank `actor` returns 200 and
  writes `created_by` NULL. See "Gap hunt 2026-09-03", finding 2. Add the same
  blank-`actor` 400 here, or the two audit sheets ship with different contracts.

`actor` is free text. There is no auth system and this step does not
introduce one.

### Required, not optional
Reject a submission with a blank `actor` with a 400. The name genuinely
exists at entry time — it is already on the sheet being transcribed — so an
optional field would simply produce blank rows and leave the column as useless
as it is today. This does change what the code rejects, which is why the step
is DISPATCH-lane.

**If a sheet carries no name, the auditor enters `Unknown`** — convention set
by NaokiiVT 2026-09-03. This is what makes a required field workable rather
than an obstacle: entry is never blocked, and a blank is always a mistake
rather than an ambiguous case. Do not build validation that rejects `Unknown`,
and do not add it as a default — it must be typed, so that it records a real
absence rather than an unfilled form.

Legacy rows already in `ending_actual` with a NULL `created_by` are not
affected and must not be backfilled with a guess.

### Not in scope
- No `activity_log` entries. Rule 9 scopes that to `stock_receipts` and
  `commissary_yield_log`, and 25b already declined it for the physical-count
  twins on the same reasoning.
- No dropdown of known auditors, no staff table, no auth. Free text only.
- `photo_path` stays untouched on all three tables — rule 13, nothing in the
  app writes it, and this step does not introduce that.

### Allowlist
`scripts/write-path-allowlist.json` carries `ending_actual.created_by` and
`portion_ending_actual.created_by` as UNVERIFIED. **Delete both entries as
part of this step.** The audit now fails on a stale entry, so leaving them
will turn CI red.

## Step 25e — a restaurant-to-restaurant transfer must credit the receiver

**Lane: DISPATCH only. Schema change: a table rebuild. Defined 2026-09-03,
deliberately queued AFTER soft launch — see sequencing.**

`POST /api/allocations` writes exactly **one** row. A transfer from Silingan to
FC subtracts from Silingan and credits FC nothing. The auditor is expected to
record the transfer at one restaurant and a separate new-stock entry at the
other — two entries for one physical movement, which can disagree and
eventually will. This is the same untracked-mismatch shape that retired
`commissary_meat_map`: the fix there was that one real event writes both sides,
and the same reasoning applies here.

**Decision, NaokiiVT 2026-09-03: the receiving end is credited automatically,
as a `stock_receipts` row (option B).** The alternative — a linked negative
`adjustment` on the receiver, reusing `linked_adjustment_id` and needing no
schema change — was considered and rejected: arriving meat belongs in the
receiving restaurant's *new stock*, where an auditor looks for it, not in its
adjustments column. This also matches the precedent already set by commissary
shipments, where a receipt row is written as a side effect of a real movement
and never typed by hand.

### The schema cost, stated plainly
`stock_receipts.source` is `CHECK (source IN ('DIRECT', 'COMMISSARY'))`. SQLite
cannot widen a CHECK constraint with `ALTER TABLE`, so admitting a third source
requires a **full table rebuild** — create the new table, copy rows, drop,
rename — inside an idempotent migration, on a table that holds real receipts by
then. This is the most invasive migration in the project so far and is the
whole reason for the sequencing below.

### Sequencing — after soft launch, on purpose
Nothing is broken today: `locations` is empty on a fresh seed, so the transfer
type cannot be used at all and no wrong data can be recorded. Building 25e
before launch would spend the riskiest migration in the project on a feature
with zero usage evidence. Let soft launch establish whether
restaurant-to-restaurant movement actually happens and how often, then build it.
If it turns out to be frequent, moving this earlier is a queue decision and
costs nothing but the reordering.

### The guard that IS needed first
Independently of 25e, and cheap: reject any transfer whose from- and
to-location resolve to the same restaurant. See "Things NOT to re-litigate".
Without it, the moment site-level `locations` rows exist, an auditor can pick
two locations of one restaurant and silently corrupt that restaurant's
variance.

### Not in scope
- No station-level anything. Settled and closed.
- Do not collapse `locations` into a `to_restaurant_id` column on
  `adjustments`, even though it would be the more honest model now that the
  station tier is gone. Parked deliberately — it is tidiness, not correctness,
  and it is a schema change.

## Open architectural questions (for an architect conversation, not a worker)

None of these blocks anything. They are listed so a fresh architect
conversation can pick one up without re-deriving it, and so no worker mistakes
one for a dispatched task. Verify each against the current repo before acting.

**Resolved 2026-09-03 — kept here briefly so they are not re-raised:**

- **Should `meat_types` gain an authoritative `unit` column, enforced at tag
  time? NO.** M15 Processed Chicken (kg) is deliberately tagged `Whole Chicken`
  alongside M01/M02 (`unit`), so a meat type spans units on purpose — it is a
  grouping key across an item's stages, and it is what `dashboard.js` rolls up.
  An authoritative unit would reject 25c's own seed data. The
  `AND unit = ?` clause in `GET /commissary/adjustments/destinations` is
  therefore correct and must stay: it is what stops kg being allocated into a
  count balance. **The real defect is silence, not the model** — see the UX
  item below.
- **Is `computeYieldLogForDate` dead code? Yes, and it stays.** Defined and
  exported in `commissaryYieldEngine.js`, called by its own test file and
  nothing else — no route, no command, no terminal path. Retained
  deliberately: it is tested, costs nothing to carry, and deleting working
  tested code to tidy up is a change that occasionally takes something with
  it. Reclassified from open question to intentionally-retained.
- **Is `commissary_meat_map` vestigial? Yes, and it was already retired.**
  Resolved and executed 2026-08-29 — routes, admin CRUD, Settings section and
  the whole "Unallocated" concept are gone; the table stays in `schema.sql`
  because destructive schema changes are not made. The write-path audit flags
  it, which is that decision showing up as expected; it is allowlisted with
  that reason. Nothing further to decide.
- **Workers pushing their own commits.** Resolved 2026-09-02 and since layered
  over by `engineer-role.md` and `decision-authority.md`. Archived to
  `session-history.md`.

**Open:**

1. **The Allocate dropdown does not explain why it is short.** Raised
   2026-09-03 as the real content of the closed `meat_types` question above.
   `destinations` correctly filters on type **and** unit, so a same-type
   different-unit meat is silently omitted, and an untagged source returns `[]`
   with no message at all. From the auditor's chair both look like tagging
   failed, and there is no path from that screen to the actual reason. The
   model is right; the screen says nothing. Fix is UI-only — no schema, no
   filter change. **Deferred to soft-launch** so real mis-tags shape the
   wording rather than guesswork.
2. **`is_restaurant_level` is a live control that changes nothing.** Fully
   CRUD-able through Settings — checkbox, written on create and update,
   returned on read — and read by no query, no validation, no filter. An
   operator can toggle it and the app behaves identically. Not urgent now that
   station-level is out of scope, but it is a control surface that lies.
   **Note the blind spot it exposes:** `npm run audit:write-paths` cannot catch
   this class. It checks whether a column is ever *written*; this one is
   written enthusiastically. "Declared but never consulted" needs a different
   check, and the audit should not be trusted to find it.
3. **`GET` and `POST` on `/commissary/daily-audit` take different parameter
   names** — GET wants `date`, POST wants `business_date`. The UI gets both
   right so nothing is broken, but it is a trap for anyone writing tests or a
   new caller. Recorded as a wart; renaming a working API for tidiness is not
   worth the churn.
4. **`graphify-out/` undecided paths** — cache, `.graphify_labels.json.sig`,
   the date-stamped directory. Pending a check of graphify's own docs. Partly
   answered already by the reasoning now written into `.gitignore`.
5. **Do cross-commissary allocations need physical paperwork?** An ALLOCATION
   between commissaries is a real van trip but produces no delivery receipt,
   unlike a restaurant shipment. The stock math is correct either way. Decide
   once real movements start, not before.
6. **Does `meat_types` need a proper retirement story?** 24d fixed the dropdown
   leak, but there is no delete path and test rows accumulate (two retired ones
   sit in live `inventory.db`). Soft delete via `active` may be sufficient —
   the question is whether anything else should reference retirement.
7. **Should `inventory.db` changes by workers be constrained differently?**
   24c-i's prompt said "change it only through the app's own routes," which was
   impossible for the case being tested: a legacy row with a NULL
   `input_quantity` cannot be created through the routes, because rejecting
   exactly that is what 24b-iv does. The worker used direct SQL, disclosed it,
   and cleaned up. The rule needs an explicit carve-out for constructing states
   the current validation forbids.
