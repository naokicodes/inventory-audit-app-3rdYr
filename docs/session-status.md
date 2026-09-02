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

**Steps 1–24 are all closed.** Step 24's nine sub-steps are done, pushed, and
verified against `origin/main` at `6c57fc5` by an independent architect pull —
not taken from a worker's report. Per-step detail is in `changelog.md`; the
archived sub-step entries and the full step-24 narrative are in
`session-history.md`.

**Step 25b is CLOSED (2026-09-02).** `POST /commissary/daily-audit` writes
`commissary_opening_stock` (INSERT OR IGNORE, write-once) and
`commissary_ending_actual` (real upsert, per-day recount overwrites), plus the
UI section on `commissary.html`. Full detail in `changelog.md`'s 25b entry.

**Next coding step: 25a**, then 24b-v — both written up in their own sections
below. 25a closes the remaining half of the gap found 2026-09-02: the
commissary ledger still has no way to record supplier receipts arriving at
the commissary (`commissary_stock_receipts` is still unwritten). 24b-v is a
data-corruption guard that only matters once balances work - both land before
soft-launch.
The plan after 24b-v is to soft-launch against real output and let actual use
decide what gets built next, rather than guessing at features — the same
reasoning that deferred the per-meat next-stage config. The open architectural
questions are listed at the bottom of this file; they are for an architect
conversation to resolve, not for a worker to pick up.

**Before soft-launch, one on-site task blocks the new features from doing
anything:** the meat-type tagging pass (see Known open items below).

**Workers push their own commits** as of the 2026-09-02 amendment to rule 23,
and must paste raw `git status -sb` and `git log --oneline -1 origin/main`
output verbatim rather than summarising it. The architect still records push
state from `origin/main` and a fresh pull, never from the report — a worker's
claim is a claim until the pull confirms it.

Full suite: **16 files, 325/325 assertions, 0 failures** (up from 314 — 25b
added 11 net, `commissary.test.js` alone rose from 83 to 94). Run individually
via `node <file>.test.js` — there is no test runner script. Two files are
easy to miss because they live outside `server/routes`/`server/engines`:
`server/db/activityLog.test.js` and `server/db/migrate.test.js`. `commands.test.js`
and `sales.test.js` print a SQLite `ExperimentalWarning` after their count
line — read the count, not the last line.

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
  move or be allocated, on both sides, before soft-launch. Note that a
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

## Step 24 — multi-stage yield + Commissary-side allocation (CLOSED 2026-09-02)

**Closed.** All nine sub-steps — 24a, 24a-b, 24b-i, 24b-ii, 24b-iii, 24b-iv,
24c-i, 24c-ii, 24d — are done, pushed, and independently verified at **16
files / 314 assertions / 0 failures**. The full design narrative and every
sub-step entry are archived in `session-history.md`.

The decisions this step produced live in "Things NOT to re-litigate" below.
Read those, not the archive, unless you need the reasoning behind one.

Commissary meats can now be processed into other commissary meats (multi-stage
yield, with the input's count and weight tracked separately), and stock can be
allocated between commissary meats or written off as a declared loss — with the
balance ledger crediting and debiting both sides correctly, and the UI to enter
all of it.

## Things NOT to re-litigate (already decided, stable)

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

### 25b — commissary opening stock + physical count. CLOSED 2026-09-02.
Done: `POST /commissary/daily-audit` (writes `commissary_opening_stock` via
INSERT OR IGNORE, write-once; `commissary_ending_actual` via a real per-date
upsert), plus the "Opening stock & physical count" section on
`commissary.html`. Tests added to `commissary.test.js`. Live-verified against
a real booted server. Full detail in `changelog.md`'s 25b entry - don't
re-derive it here.

### 25a — commissary stock receipts. Raw meat arriving from suppliers.
Bigger than a route-and-UI mirror of `stockReceipts.js`, because
**`commissary_stock_receipts` has a single `quantity` column and cannot record
what is actually measured.** Raw meat arrives directly at the commissary; for a
unit-tracked meat the crew records both the count that arrived and the weight
paid for. One column forces losing one of them (see the count-and-weight rule
above). So 25a needs a nullable weight column alongside `quantity`, mirroring
the `input_quantity`/`raw_weight_in` split — which means an idempotent
migration in `server/db/migrate.js` (follow
`migrateYieldLogInputQuantityColumn`), not just routes and a form.

**Sequence: 25b, then 25a, then 24b-v.** 24b-v is correctly last — it guards a
corruption case that cannot occur until the balances work, and NaokiiVT's
database confirms zero existing bad rows.

**Before soft-launch, wipe and reseed `server/db/inventory.db`.** There is no
real data anywhere (every ledger table is 0 rows), but there is test residue:
5 yield rows and 2 adjustments, likely soft-deleted worker verification rows,
plus two retired test meat types. A reseed gives a clean catalog and an empty
ledger with nothing to mistake for real rows later. Do it before real entry
starts, not after.

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

## Open architectural questions (for an architect conversation, not a worker)

None of these blocks anything. They are listed so a fresh architect
conversation can pick one up without re-deriving it, and so no worker mistakes
one for a dispatched task. Verify each against the current repo before acting —
some may have been resolved since this list was written.

**Carried in from before step 24:**
1. Should `meat_types` gain an authoritative `unit` column, enforced at tag
   time? Today `unit` lives on `commissary_meats`, so two meats of the same
   type can be tracked in different units and will silently never pair as
   allocation source/destination. Bears directly on the tagging pass.
2. Is `computeYieldLogForDate` dead code?
3. Is `commissary_meat_map` vestigial and safe to delete? (Note the standing
   gotcha: commissary and restaurant meat codes are different numbering
   systems — never infer a mapping from matching code strings.)
4. `graphify-out/` undecided paths — cache, `.graphify_labels.json.sig`, the
   date-stamped directory. Pending a check of graphify's own docs.

**Raised 2026-09-02:**
5. **RESOLVED 2026-09-02 — workers now push their own commits.** Option B
   adopted: a worker pushes, and must paste the raw verbatim output of
   `git status -sb` and `git log --oneline -1 origin/main` rather than
   summarising it. No push if the suite is red or if any file outside the
   step's stated scope changed — commit, stop, flag instead. Written into
   `rules-for-claude-code.md` as the 2026-09-02 amendment to rule 23. The
   architect still records push state from `origin/main` and a fresh pull,
   never from the report.
6. **Do cross-commissary allocations need physical paperwork?** An ALLOCATION
   between commissaries is a real van trip but produces no delivery receipt,
   unlike a restaurant shipment. The stock math is correct either way. Worth
   deciding once real movements start, not before.
7. **Does `meat_types` need a proper retirement story?** 24d fixed the dropdown
   leak, but there is still no delete path and test rows are accumulating (two
   retired ones sit in live `inventory.db` today). Soft delete via `active` may
   be sufficient — the question is whether anything else should reference
   retirement.
8. **Should `inventory.db` changes by workers be constrained differently?**
   24c-i's prompt said "change it only through the app's own routes," which was
   impossible to satisfy for the one case being tested: a legacy row with a
   NULL `input_quantity` cannot be created through the routes, because
   rejecting exactly that is what 24b-iv does. The worker used direct SQL,
   disclosed it, and cleaned up. The rule needs an explicit carve-out for
   constructing states the current validation forbids.
