# Changelog / Development Notices

A running, dated log of real fixes, decisions, and environment quirks hit
during development — so they don't have to get rediscovered later, and so
anyone picking this project up (including future-you) has context on *why*
something is built the way it is, not just *what* it does.

Newest entries at the top. Small/routine commits don't need an entry here —
this is for things that took real debugging, changed a decision, or are
worth remembering if they happen again.

---

## 2026-08-29 — Step 20b: Commissary audit engine + read route
Repo cloned directly from GitHub (`https://github.com/naokicodes/inventory-audit-app-3rdYr`),
network access worked fine this session — no zip fallback needed. Followed
rule 18: reviewed step 20a's landed state before starting (confirmed via
`git log`/`schema.sql` inspection, not just trusting the doc), then did
this one step, then pushed.

New `server/engines/commissaryAuditEngine.js` — a
`computeCommissaryMeatAudit`-shaped function mirroring `computeMeatAudit`
(`auditEngine.js`)'s beginning/inflow/usage/ending/variance shape, kept as
its own file rather than folded into `auditEngine.js` (same separation
`commissaryYieldEngine.js` already uses). `addDays` is reused from
`auditEngine.js` rather than duplicated. Two real differences from every
existing usage source, per the step's own spec:
- **Two separate inflows**: `stockIn` (SUM `commissary_stock_receipts
  .quantity`) and `backedUp` (SUM `commissary_yield_log.backed_weight_out`,
  `deleted_at IS NULL` — the existing yield engine, read here unchanged).
  No combined "new stock" field; both are returned separately, matching
  the step's framing that these are genuinely two different things, not
  one number in disguise.
- **Usage = SUM of `commissary_shipments.total_quantity`** across every
  destination restaurant for that commissary meat/date — not sales x
  recipe, not prepped-portions. Commissary doesn't sell to end customers.

Beginning derives from the prior day's `commissary_ending_actual`, falling
back to `commissary_opening_stock` only on the very first tracked day —
step 12's exact pattern, just against the commissary tables. Ending is the
real physical count from `commissary_ending_actual`. Same OK/SHORTAGE/
SURPLUS status logic and `EPSILON = 0.01` tolerance as `computeMeatAudit`.

**Decision flagged for the architect conversation, not assumed**:
`computeMeatAudit` has an `adjustments` layer (`expectedEnding =
endingCalculated - adjustments`, from the restaurant-side `adjustments`
table). None of step 20a's six commissary tables is an
adjustments-equivalent — there's no commissary waste/adjustment log yet.
So in `computeCommissaryMeatAudit`, `expectedEnding` always equals
`endingCalculated`, and `unexplainedVariance` always equals `variance`.
Both fields are still returned (shape parity with `computeMeatAudit`, and
so a future commissary-adjustments concept wouldn't need a field rename),
but right now they're redundant — this is a real gap from "same as every
other actual-vs-calculated comparison in this app," not something quietly
resolved by inventing an adjustments source. If the architect wants a real
commissary adjustments table, that's new scope.

New `GET /api/commissary/daily-audit?date=&commissary_meat_id=` in
`server/routes/commissary.js` (not a new route file — it sits with the
rest of Commissary's routes, already mounted at `/api`). `date` is
required (400 without it). `commissary_meat_id` is an optional filter for
a single meat/date lookup. **Response shape decision, flagged rather than
assumed as the only correct answer**: always returns an array, whether
filtered to one commissary meat or listing every active one for the date
— chosen to mirror the optional-filter/list convention `GET
/api/commissary/yield-log` (this same file) already uses, rather than
switching to a single-object response when an id is given. Session-
status.md left "one meat/date at a time, or a mixed-grid-style list" as an
open call for this session to make; this is the call made, worth a look
before it's load-bearing for a future UI.

**Tests**: new `server/engines/commissaryAuditEngine.test.js`, same style
as `auditEngine.test.js` (plain script, real `node:sqlite`, hand-verified
numbers — 11/11 assertions passing). Scenario: commissary JOWL with
`opening_stock=10`, `stockIn=5` (one `commissary_stock_receipts` row),
`backedUp=3` (via a real `commissary_yield_log` row, `raw_weight_in=4`,
one soft-deleted row confirmed excluded), `usage=3.5` (two
`commissary_shipments` rows to two different destination restaurants, 2.0
+ 1.5), hand-calculated `endingCalculated = 10 + 5 + 3 - 3.5 = 14.5`.
Covers day-2 beginning-carries-forward, shortage, surplus,
missing-actual-count, missing-beginning-stock, the unfiltered
`computeCommissaryDailyAudit` list (excludes inactive meats), and the
single-meat filter.

**Verified live against a real booted server**, not just the mirrored-
logic test file: ran `npm install` (repo had no `node_modules`),
`node server/db/seed.js` for a fresh `inventory.db`, booted
`node server/index.js` (backgrounded with `setsid`/`nohup` so it survives
between tool calls, plain `&` alone didn't persist and got connection-
refused on the next call — noted here in case a future session hits the
same thing). Confirmed:
- `GET /api/commissary/daily-audit` with no `date` → `400 {"error":"date is
  required"}`.
- `GET /api/commissary/daily-audit?date=2026-08-01` with no data yet →
  array of all 14 seeded commissary meats, every one
  `MISSING_BEGINNING_STOCK`, matching the fresh-DB expectation.
- Inserted `commissary_opening_stock`/`commissary_stock_receipts`/
  `commissary_shipments`/`commissary_ending_actual` fixtures directly via
  SQL for JOWL (step 20c's write routes don't exist yet, so this is the
  only way to get data in right now — noted as expected, not a gap in
  this step), plus wrote the `backed_weight_out` row through the **real**
  `POST /api/commissary/yield-log` route (already exists, step 6) rather
  than SQL, to exercise that inflow through actual app code.
- `GET /api/commissary/daily-audit?date=2026-08-01&commissary_meat_id=5`
  returned exactly the hand-calculated numbers: `beginning=10, stockIn=5,
  backedUp=3, usage=3.5, endingCalculated=14.5, actual=14.5, variance=0,
  status=OK` — live server output matches the test file's math exactly.

**Full existing test suite re-run after**, all files individually (this
repo's convention, no shared test runner): **10/10 files green, 121/121
assertions, 0 regressions** (9 pre-existing files unchanged + this step's
new file). `inventory.db`/`-shm`/`-wal` cleaned up before commit (gitignored,
confirmed via `git status`).

## 2026-08-29 — Step 20a: Commissary schema (six new tables + one child)
`server/db/schema.sql` only — no engine, routes, or UI, per step 20a's
own scope. Worked from an uploaded zip (no `.git` in the sandbox, no
network for `git clone`/`npm install`), same limitation noted on several
recent sessions.

Added, appended to the end of section 10 (after `commissary_yield_log`,
before the Loyverse block) — `commissary_meat_map` left completely
untouched, not even reordered around, per step 20's "commissary_meat_map's
fate" note:

- `commissary_ending_actual` — mirrors `ending_actual`.
- `commissary_opening_stock` — mirrors `opening_stock` (step 12's pattern).
- `commissary_stock_receipts` — Commissary's own "Stock In" from an
  outside supplier, distinct from the restaurant-facing `stock_receipts`.
  **Decision flagged for the architect conversation, not assumed**: no
  soft-delete/`activity_log` wiring on this table (schema-level: no
  `deleted_at` column) — rule 9 in `rules-for-claude-code.md` names only
  `stock_receipts` and `commissary_yield_log` for that pattern and warns
  against silently extending it; step 20's draft didn't say this table
  "mirrors `stock_receipts`," just that it's analogous in purpose.
- `commissary_shipments` — one row per outbound batch to a destination
  restaurant, matching the draft's `(id, commissary_meat_id,
  restaurant_id, business_date, total_quantity, notes, ...)` skeleton
  plus `created_by`/`created_at` for consistency with every other input
  table in the schema.
- `commissary_shipment_lines` — the named-portion breakdown per shipment;
  `meat_id` is the *destination* restaurant's own meat row. No
  reconciliation constraint against the parent's `total_quantity` (matches
  the draft: informational only, different units on each side).
- `commissary_shipment_presets` + `commissary_shipment_preset_lines` (the
  "+preset lines child table") — settings-managed autofill for the future
  shipment form. **Flagged, not fully resolved by the docs**: scoped each
  preset to one `(commissary_meat_id, restaurant_id)` pair, inferred from
  Remake V3's "one sub-table per destination kitchen" layout — the step
  20 draft never states this explicitly, worth a second look.

**Verified**:
- Schema loads cleanly in an in-memory `DatabaseSync`, same style the
  existing test files already use — all 7 new tables present, FKs
  resolve correctly (`commissary_ending_actual`/`commissary_opening_stock`/
  `commissary_stock_receipts` → `commissary_meats`;
  `commissary_shipments`/`commissary_shipment_presets` →
  `commissary_meats` + `restaurants`; `commissary_shipment_lines`/
  `commissary_shipment_preset_lines` → their parent + `meats`).
  `commissary_meat_map` confirmed still present, unmodified.
- `node server/db/seed.js` run fresh against a deleted `inventory.db`:
  succeeded unchanged (11/39/23 for Restaurant A, 13/34/35 for FC, 14
  commissary meats), then run a second time confirming idempotency (0
  inserted across the board) — same pattern used to verify step 19.
- Full existing test suite re-run, each file individually (this repo's
  `node:test`/`node:sqlite` incompatibility means every `.test.js` is a
  standalone script, not a `node --test` run — see the auditEngine.test.js
  header comment and the 2026-08-25-adjacent changelog entry on this):
  all 9 files green, 110/110 assertions passing, 0 failures, no
  regressions. This step touches no code any existing test exercises, so
  this was expected, not just hoped for.

Not done (deliberately, per step 20a's own scope): no
`computeCommissaryMeatAudit`-shaped engine function (step 20b), no
shipment-logging write route or page (step 20c), no admin CRUD for
presets. `commissary_meat_map` is now vestigial-in-waiting but not
touched, deleted, or repurposed.

---

## 2026-08-29 — Step 19: Restaurant B (FC) onboarding
New `server/db/seed-data-B.json`, extracted directly from
`FC_MasterAudit.xlsx` via `openpyxl` (not hand-typed, not guessed):

- **13 real meats** — `Meats` sheet rows `M14`-`M16` were blank
  (`MeatID` present, `Name` empty), excluded.
- **34 real dishes** — the `Dishes` sheet actually has 80 rows, but 46
  of them (`D035`-`D080`) are unused template placeholders literally
  named `"New Dish NN (rename me)"`. Confirmed by checking: every one
  of the 34 real dishes has at least one `recipe_bom` row (or, for the
  one `BATCH_PREPPED` dish, correctly has none), while all 46 excluded
  ones have zero — consistent with them being genuinely unused, not a
  data-loss risk from filtering wrong.
- **35 real `recipe_bom` links** — of 200 raw rows in that sheet, only
  36 had any real data; 35 link a meat, 1 (`Chicken Skewers`, `D022`,
  the one `BATCH_PREPPED` dish) correctly has none — matches the
  existing pattern where portions drive Batch-Prepped usage, not a
  direct meat link. `Chicken Skewers` also independently corroborates
  what the project owner described earlier about Whole Chicken's
  fan-out (Skewers being one of the two named outputs) — good
  cross-check between the raw data and the verbal description, found
  without prompting for it.

`server/db/seed.js` refactored: the restaurant-seeding logic (steps
1-4) is now a `seedRestaurant(data)` function, called once per file in
a `restaurantSeedFiles` array (`seed-data.json`, `seed-data-B.json`).
Onboarding a future Restaurant C is a new JSON file + one array entry,
no other code change — which is what step 19's original "no new code
expected" framing turns out to have actually meant, once written
properly instead of copy-pasted. Also fixed a stale comment above the
commissary-meats block that still claimed "only 3 hand-verified
meats," directly contradicted by its own next line's `console.log`
saying 14 (the real, correct count, confirmed back in the step-9
session — the comment just never got updated).

**Deliberately scoped narrow**, per the project owner: FC's own meats
(Bagnet, Sisig, Sinigang, DNG, etc.) are seeded as FC's own local stock
items, exactly as `scope.md`'s step-20-adjacent note already
concluded. No Commissary cross-referencing, no `commissary_meat_map`
changes — none of steps 20-22's still-open design questions block
this, confirmed true in practice, not just claimed in the abstract.

**Verified**: full suite re-run at 9/9 files green (the `seed.js`
refactor touches no schema, no engine, nothing the existing tests
exercise, so this was a real regression check, not a formality).
`seed.js` run twice live, confirming idempotency for both restaurants
(0 inserted on the second run). A live server check: `GET
/api/restaurants` lists both Restaurant A and FC; `GET
/api/daily-audit/mixed?restaurant_id=2` for FC returns exactly the
right shape — 13 `MEAT` rows including `Bagnet` as its own local stock
item (not remapped to anything Commissary-side), 1 `DISH` row for
`Chicken Skewers` correctly tagged `BATCH_PREPPED`.

## 2026-08-29 — Step 18: BATCH_PREPPED over-sold warning
New read-only route `GET /api/commands/oversold-check` in
`server/routes/commands.js` (alongside step 15's sync-batch-stock),
plus a new frontend file `public/commands/oversold-check.js` registered
against the panel on all seven pages.

**Interpretation call made explicitly, not silently**: the roadmap says
"sold quantity should never exceed available prepped portions." Two
readings existed: (a) same-day `sold(dish, date) > prepped(dish,
date)`, or (b) the fuller running portion balance `computeDishAudit`
already computes (`portionBeginning + prepped - sold`). Chose (a).
Reason: (b) depends on `portionBeginning`, which comes from
`portion_ending_actual` — a table with no write path anywhere in the
app yet (per step 11's note, dish rows on Landing are still
display-only). `computeDishAudit` returns `MISSING_BEGINNING_STOCK` for
essentially every dish/date combo in the app's current state, which
would make a warning built on (b) permanently dead code. (a) is
meaningful today and can be widened to (b) later once a portion-count
entry UI actually exists. Written into `session-status.md`'s step-18
entry, not just this changelog note, so it's visible without reading
the diff.

Query: `SUM(sales.quantity)` vs `SUM(prepped.portions_produced)` per
`(restaurant_id, dish_id, business_date)` for `BATCH_PREPPED` dishes
only, flagged when sold exceeds prepped by more than a 0.01 epsilon (no
prepped row at all counts as 0, i.e. fully over-sold). Purely
informational — never writes anything, matching "surface this as a
WARNING... not a hard block."

Small scaffold tweak: added `white-space: pre-wrap` to
`command-panel.js`'s `.cmd-result` CSS, so this command's multi-line
warning list actually breaks onto separate lines instead of collapsing
into one. The no-op command and sync-batch-stock's single-line results
are unaffected.

6 new tests added to `commands.test.js` (13/13 total in that file now):
flagged when over, not flagged at exactly equal or under, no-prepped-row
treated as 0, DIRECT dishes never considered, and confirms the check
itself writes nothing. Full suite re-run: 9/9 files green.

**Verified live**: seeded a real prepped=10/sold=15 pair for a real
dish via a booted server, confirmed the endpoint returns the correct
shortfall (5), confirmed a clean state returns `oversold_count: 0`,
confirmed by direct DB read that the check wrote zero rows anywhere,
and confirmed `oversold-check.js` is actually served on every page.
**Not verified**: an actual browser click on the "Check over-sold"
button in the live panel — same sandbox limitation as every frontend
step this session (no headless browser available here).

## 2026-08-29 — Step 17: Sales frontend (monthly grid)
New page `public/sales.html` on top of step 16's backend. Rows = every
active dish for the selected restaurant (both `DIRECT` and
`BATCH_PREPPED` — sales applies to both, per `data-model.md`), columns
= every day of the selected month (a `type="month"` input), cells =
quantity inputs reading/writing `GET`/`PATCH /api/sales`.

**Confirm-on-override, as specified**: an edit to a cell that already
had a saved value (including clearing it to blank) triggers a
`confirm()` dialog showing the current and new value before saving;
cancelling reverts the input to its last-actually-saved value, not just
whatever was in the DOM pre-edit. A brand-new entry into a previously-
empty cell saves immediately, no prompt — matches the roadmap's "editable
with a confirm prompt on manual override," read as override-of-existing,
not every keystroke.

Added a "Sales" nav link to all six existing pages plus itself (seven
total now), and included `command-panel.js` +
`commands/sync-batch-stock.js` on the new page too, consistent with
step 14's "any tab" scaffold and its Landing precedent.

**No new automated tests** — frontend-only step, no backend/schema/
engine change (same as steps 11/13/14's precedent, rule 6's testing
requirement is scoped to the audit/yield engines). Verified instead by:
`node --check` on the extracted inline script (syntax), and a live
end-to-end check against a real booted server — confirmed `sales.html`
serves with the nav link and both scripts present, confirmed the six
existing pages' nav actually picked up the new link, and replayed the
exact `GET` → `PATCH` → `GET` sequence the page's JS performs, checking
the returned JSON shape matches what `renderGrid()`/`onCellChange()`
expect at each step. **Not verified**: an actual browser click-through
of the grid, the confirm-dialog interaction, or the sticky dish-name
column's rendering — same sandbox limitation as steps 13/14/15's open
items (no headless browser available here).

## 2026-08-29 — Step 16: Sales backend (manual entry, backend + tests only)
New route file `server/routes/sales.js`, mounted in `server/index.js`:
- `GET /api/sales?restaurant_id=&year=&month=` — one row per active dish
  (both `DIRECT` and `BATCH_PREPPED` — sales matters for both, per
  `data-model.md`'s usage/portion formulas), each with a `days` map
  covering every day of the month, keyed by full ISO date. Empty cells
  are `null`; filled cells are `{ quantity, source }`. If more than one
  row exists for a day (only possible for `LOYVERSE`), quantities are
  summed into one cell.
- `PATCH /api/sales` — upserts (or, with `quantity: null`, clears) the
  `MANUAL` row for one `(restaurant_id, dish_id, business_date)` cell.
  Validates the dish belongs to the restaurant and is active, rejects
  negative quantities.

**Schema change**: added a partial unique index,
`idx_sales_manual_unique`, on `(restaurant_id, dish_id, business_date)
WHERE source = 'MANUAL'` — makes the grid's single-cell upsert safe
without constraining a future `LOYVERSE` sync, which may legitimately
post several raw transaction rows per dish per day. Plain
`CREATE-IF-NOT-EXISTS`, no migration helper needed (new index on a
feature with no prior `MANUAL` rows possible before this step, not a
constraint loosened on existing data).

**Two doc conflicts resolved this session, not built around silently**:
1. `data-model.md`'s `sales` section said "Populated by the Loyverse
   sync, not manual entry" — stale, written before the roadmap decided
   (steps 16-17) that manual entry is the interim path while Loyverse
   sync stays a later phase (rule 14). Updated to describe both sources
   coexisting by design, `MANUAL` upsert-safe via the new index.
2. `scope.md`'s deferred-activity-logging list didn't mention `sales`
   at all — an oversight, since manual sales editing wasn't decided as
   in-scope when that list was written. Added `sales` to the list
   explicitly rather than silently deciding either way; step 16 does
   NOT log to `activity_log`, matching `ending_actual`/`adjustments`/
   `portion_ending_actual`'s existing deferral. Worth a real decision
   later, once there's a second table with the same open question, not
   decided under this step's own time budget.

**Interaction bug caught and fixed**: step 15's `commands.test.js` had a
test seeding two `MANUAL` sales rows for the same day (to test summing)
— valid before this step's new unique index, a real constraint
violation after it. Fixed by switching that one test to `LOYVERSE`
rows, matching the design going forward (same-day multiple rows only
ever happens for `LOYVERSE` now). Full suite was 8/8 green before this
fix and 9/9 green after — the regression was caught by re-running the
whole suite, not assumed away.

New test file `server/routes/sales.test.js`, 13/13 passing, mirroring
the two routes' exact logic (mirrored-logic style, same as
`commands.test.js`): create, upsert-replace (not duplicate), clear via
null, negative-quantity rejection, cross-restaurant dish rejection,
inactive-dish rejection, the partial unique index itself (both that it
rejects a second MANUAL row and that it allows multiple LOYVERSE rows),
and the GET matrix's shape/scoping (full month present, empty cells
null, MANUAL cell shape, LOYVERSE summing, no cross-restaurant leak, no
cross-month leak).

**Verified live**, not just mirrored-logic tests: seeded via a real
booted server, `PATCH`'d a cell (create), `PATCH`'d again (confirmed
single row with the new value, not two rows), `PATCH`'d with
`quantity: null` (confirmed the row was deleted), and confirmed a
negative quantity is rejected with a 400 — all via real HTTP against
the real route, then confirmed by direct DB read. Full suite re-run
after: 9/9 files, 0 failures.

## 2026-08-29 — Step 15: "Sync batch stock" command
First real command wired into the step-14 panel scaffold. New backend
route `POST /api/commands/sync-batch-stock` (`server/routes/commands.js`,
mounted in `server/index.js`): for every `(restaurant_id, dish_id,
business_date)` combo with `sales` rows against a `BATCH_PREPPED` dish
and no `prepped` row yet for that combo, inserts one `prepped` row with
`portions_produced = SUM(sales.quantity)`, `created_by =
'SYSTEM:sync-batch-stock'`. Global, not scoped to a restaurant/date -
the floating panel is reachable from every page with no shared date
context to draw from, and re-running it is always safe: already-synced
or already-manually-entered combos are skipped, never overwritten.

New frontend file `public/commands/sync-batch-stock.js` (kept separate
from `command-panel.js` itself, one file per command going forward),
included right after `command-panel.js` on all six pages, registers
itself and calls the new route.

**Decision made this session, not deferred**: the roadmap's own step-15
text says to log a SYSTEM `activity_log` entry, but `scope.md` had an
existing, dated (2026-08-27) decision explicitly deferring
activity-log extension to `prepped`. Resolved as a narrow exception
rather than either silently overriding the deferral or blocking on it:
this ONE write path (the sync command, which is also the only write
path into `prepped` at all right now - there's still no manual edit UI
for it) logs to `activity_log`; general `prepped` CRUD/soft-delete
logging remains deferred, unchanged. Written into both `scope.md` and
`data-model.md` section 11 in this same session, per the standing rule
that a doc decision gets written in by whoever makes it, not deferred
to a future coder session.

New test file `server/routes/commands.test.js`, 7/7 passing, mirroring
the route's exact query/write logic against a real in-memory DB (same
approach as `stockReceipts.test.js`): basic sync, multi-row summing,
DIRECT dishes never touched, existing manual entries never overwritten,
idempotency on a second run, the activity_log row's shape, and
restaurant isolation for the same dish_id/date.

**Verified live**, not just via the mirrored-logic tests: seeded two
real `sales` rows (15 + 3) for a real seeded `BATCH_PREPPED` dish,
booted the actual Express server, `POST`'d the real endpoint over HTTP,
and confirmed by direct DB read that `prepped.portions_produced = 18`,
a matching `activity_log` row (`CREATE`/`SYSTEM`, correct `after` JSON)
was written, and a second `POST` correctly returned `synced: 0`. Full
suite re-run afterward: 8/8 files, 91/91 tests, 0 failures. No browser
click-through of the panel button itself was possible (same sandbox
limitation as steps 13-14) - the backend contract is verified live, the
UI click is not.

## 2026-08-29 — Step 14: Command panel scaffold
New file `public/command-panel.js` + a one-line `<script>` include added
before `</body>` on all six existing pages (`index.html`,
`daily-audit.html`, `stock-receipts.html`, `commissary.html`,
`settings.html`, `history.html`). Pure client-side plumbing - no backend,
schema, or engine change.

**What it is**: an IIFE exposing `window.CommandPanel.register(id,
label, run)` / `.list()`, plus a floating "Commands" toggle button that
opens a small panel listing whatever's registered, each with a Run
button. `register()` throws on a duplicate `id` rather than silently
overwriting. Running a command awaits `run()` and shows whatever it
resolves to as an ephemeral result line in the panel - nothing is
written to the server or any table. One no-op command
(`register('noop', 'No-op (test)', () => 'Ran no-op - no real action
taken, nothing logged.')`) is registered on script load, proving
register -> appear -> run works end to end with no real functionality
behind it yet, per the roadmap's own description of this step.

**Scope note flagged, not decided**: `rules-for-claude-code.md` rule 10
says worker-facing daily screens (`daily-audit.html`/Landing) must stay
minimal - no math, no recipe/admin concepts leaking in. A generic, inert
command panel isn't math or recipe/admin content, so it's included on
Landing same as every other page, matching the roadmap's "can appear on
any tab" - but flagging the rule-10 angle explicitly in case Landing
should actually be excluded once step 15+ add real commands.

**Not done**: no real commands - that's step 15 ("Sync batch stock"),
which the scaffold's own comments point to as the next `register()`
call. No activity_log wiring here either - deliberately out of scope,
rule 9 scopes that logging to `stock_receipts`/`commissary_yield_log`
only, and step 15 is where a real command's SYSTEM log entry gets added.

**Verified**: no engine/schema/backend change, so no new automated tests
per rule 6. `node --check` on the new file. Registry logic (register/
list/duplicate-id-rejection/run() resolution) smoke-tested standalone
via a `node -e` script reproducing the same closure logic, outside the
DOM - all four checks passed. Full existing test suite re-run - still
84 passing / 0 failing across all 7 files, no regression. Same sandbox
constraint as step 13: no `.git`, no network this session either, so no
live browser click-through of the actual injected UI (toggle button
placement, panel open/close, Run button click) - flagging as the same
open item as step 13's.

## 2026-08-29 — Step 13: Live recalculation on Landing
Frontend-only, `public/daily-audit.html`. Ending(calc)/Over-Short/Status
now update live in the browser as a meat row's editable inputs change,
without waiting for save+reload.

**Scope note**: the roadmap line named "New Stock/Usage/Actual" as the
triggers, but New Stock and Usage are read-only calculated cells on this
screen (they come from Stock Receipts / sales, not typed here) - they
can't literally change in the browser. Live recalc is wired to what's
actually editable and actually feeds the two formulas: Beginning (only
on the rare row where it's still the opening-stock input), In-House,
Wastage, Other, and Ending (actual). Same scope-clarification pattern as
step 11's dish-rows-read-only call - documented here rather than silently
assumed.

**Implementation**: `recalcMeatRow()` mirrors
`server/engines/auditEngine.js`'s `computeMeatAudit` math exactly -
`endingCalculated = beginning + newStock - usage`,
`unexplainedVariance = (endingCalculated - adjustments) - actual`, same
`EPSILON = 0.01`, same OK/SHORTAGE/SURPLUS/MISSING_* thresholds - so a
live-recalculated value always matches what Save+reload would produce
for the same inputs. New Stock/Usage/Beginning (when fixed) are stashed
as `data-*` attributes on each `<tr>` at render time; one delegated
`input` listener on `#grid-container` (not re-attached per `loadGrid()`
call) catches changes on `.opening_stock`/`.in_house`/`.wastage`/
`.other`/`.ending_actual` and updates the `.ending-calc`/`.over-short`/
`.row-status` cells in place. Dish rows are untouched (no editable
fields on them, nothing to recalc). Save/reload flow (`save()`) is
untouched - recalc is a pure display overlay, no new network calls, no
change to what gets persisted.

**Not done**: nothing deliberately deferred within this step's own
scope - New Stock/Usage don't need live recalc (see scope note above),
and dish rows have nothing to recalc. Broader gaps (still open, not this
step's job): dish rows are still fully read-only (a separate future
step, per step 11), and Restaurant B/C onboarding is unrelated to this.

**Verified**: no engine/schema/backend change, so no new automated tests
per rule 6. Hand-mirrored `recalcMeatRow`'s formula against the existing
"known adjustment (waste) reduces unexplained variance" fixture in
`auditEngine.test.js` (beginning 20, waste adjustment 1.0, actual 19.0 ->
expect endingCalculated 20, unexplainedVariance ~0, status OK) via a
standalone `node -e` script reproducing the same logic - matched exactly.
Extracted the inline `<script>` and ran `node --check` for syntax. Ran
the full existing test suite (all 7 files) before and after the change -
identical pass counts both times (15/22/6/6/8/10/17 across the seven
files = 84 total, 0 failures), confirming no regression. Note: this is
84, not the "78/78" figure step 12's entry below claims - that number
looks stale/off by count of files, not something this session
introduced or corrected; flagging rather than editing historical
entries. Same sandbox constraint as
steps 11/12: this session worked from an uploaded zip, no `.git`, and
this time no network at all (both `git clone` and `npm install` were
blocked by the egress allowlist, unlike the step-12 session) - so no
live Express server, no browser click-through. A real click-through
(typing into In-House/Wastage/Other/Ending-actual and watching the cells
update) is still owed, same open item as the Stock Receipts/Commissary
UI flows already logged below.

## 2026-08-29 — Step 12: Opening-stock fix
No schema change needed: `opening_stock` (one row per restaurant+meat,
`UNIQUE(restaurant_id, meat_id)`) already existed in `schema.sql`, and
`auditEngine.js`'s `getBeginningStock` already fell back to it correctly
when there's no prior day's `ending_actual`. The gap this step closed was
that nothing ever wrote to it - a meat with no tracking history had
`beginning` null forever, with no way to seed it from the UI.

**Backend**: `POST /api/daily-audit` now accepts an optional
`opening_stock` field per row. When provided, it's written via `INSERT OR
IGNORE INTO opening_stock (...)` - the table's own `UNIQUE(restaurant_id,
meat_id)` constraint makes write-once a DB-level fact, not just a
frontend convention, so a stale client resubmitting an old value is
silently a no-op rather than a second write or an error. Deliberately
NOT run through `activity_log` (rule 9 scopes that logging to
`stock_receipts`/`commissary_yield_log` only, not silently extended to
every input table).

**Frontend**: `daily-audit.html`'s Beginning cell for MEAT rows renders
as an editable input only when `r.beginning === null`; otherwise it's
the same calculated/read-only cell as before. `save()` includes
`opening_stock` in the payload only for rows that had that input. Dish
rows and everything else on Landing untouched, per the step's own scope
("Backend + the minimal frontend change... doesn't touch the rest of
Landing").

One design point worth naming: "editable only on a row's first-ever
appearance" is enforced entirely by `beginning === null`, with no
separate "is this the first day" flag anywhere. Once `opening_stock` is
written, `getBeginningStock` never returns null for that meat again
(the DB-level UNIQUE constraint means it can't be re-written even if it
tried), so the cell naturally and permanently reverts to
calculated/read-only on every later day - the null-check on the read
side already *is* the "first appearance" check, nothing extra needed on
the write side beyond the write-once guarantee.

**Tests**: new `server/routes/dailyAudit.test.js` (6 tests, same
mirrored-logic pattern as `stockReceipts.test.js`/`settings.test.js`) -
null beginning before any write, a write becoming the beginning stock,
a second write attempt being silently ignored (write-once, verified via
both the returned value AND a row-count check), empty/undefined values
writing nothing, per-(restaurant,meat) isolation, and confirming
`opening_stock` is only ever the *fallback* - once a real `ending_actual`
exists for a day, the next day's beginning comes from that, not
`opening_stock`, per `data-model.md`'s formula.

**Verification**: full suite green, 78/78 across all 7 test files (was
72/72 before this step; +6 new). Went beyond the hand-mirrored test this
time since the sandbox had working npm registry access this session:
ran `npm install` (68 packages, clean), then did a genuine live HTTP
smoke test - seeded a real DB (`node server/db/seed.js`), booted the
actual Express server (`node server/index.js`), and POSTed
`opening_stock` for a real meat row (Whole Chicken Raw, previously
`beginning: null`) exactly as the frontend would. Confirmed via
`GET /api/daily-audit/mixed` that `beginning` flipped from `null` to
25.5, then POSTed a second attempt with a different value (999) and
confirmed it was silently ignored - `beginning` stayed 25.5. This is a
real click-through-equivalent for the backend contract (not a literal
browser click, still logged under "Known open items"), stronger than
what steps 10/11 had at handoff time.

Scratch server process and the seeded `inventory.db`/`-shm`/`-wal` files
from the smoke test were cleaned up after verification - nothing from
that DB is part of this commit.

## 2026-08-29 — Steps 10-11: Landing mixed grid (meats + BATCH_PREPPED dishes), backend and frontend
**Step 10 (backend, prior session's work, verified and handed off this
session)**: `computeDishAudit`/`computeMixedDailyAudit` in
`auditEngine.js`, mirroring `computeMeatAudit`'s null-when-missing-data
shape but following `data-model.md` section 6's simpler portion formulas
(no adjustments layer for portions). `GET /api/daily-audit/mixed` added
to `dailyAudit.js`, additive alongside the untouched `GET /api/daily-audit`.
6 new tests (5 dish-audit + 1 mixed-grid) appended to `auditEngine.test.js`.
Verified this session: all 15 tests in that file pass (`node
server/engines/auditEngine.test.js`, exit 0), and `schema.sql`'s
`portion_ending_actual` table already had the exact columns the tests
assumed - no schema gap, no migration needed.

**Step 11 (frontend, this session)**: `daily-audit.html` now reads
`/api/daily-audit/mixed` and renders meats + BATCH_PREPPED dishes as rows
in one table, per the real "Silingan Landing Inventory" paper workflow.

Before writing any frontend code, this session hit a real ambiguity the
docs didn't resolve and stopped to ask (per rule 3) rather than assume:
`daily-workflow.md` describes Prepped/Portion Ending Actual as their own
separate daily screens, but `session-status.md`'s "not to re-litigate"
list says Prep is *not* a separate tab - it's part of Landing. Meanwhile
no write endpoint for `prepped`/`portion_ending_actual` exists anywhere
in the app yet. Asked the project owner: dish rows read-only this step,
or extend scope to add the write path too? **Answer: read-only** - so
dish rows in the new grid show Prepped/Sold/Portion Beginning/Ending
calc/Portion Actual/status, with no inputs. Meat rows are unchanged:
same editable fields, same `POST /api/daily-audit` save flow as before.
User-facing label changed to "Over/Short" (vocabulary note in the
roadmap); `variance` stays the internal/code term everywhere.

One small backend addition came with this, not a separate step: MEAT
rows returned by `/api/daily-audit/mixed` are now decorated with the
same `in_house`/`wastage`/`other`/`remarks` lookups the older
`/api/daily-audit` endpoint already had, via a new shared
`getMeatInputDecoration` helper in `dailyAudit.js`. This wasn't scope
creep - the step-10 session's own comment on that route explicitly
flagged it as "left for step 11 to add if the Landing UI needs it," and
without it the Landing UI couldn't show previously-typed values in the
now-editable meat-row inputs.

**Verification**: `node --check` on both changed files (syntax only -
no live server this session, see below). Re-ran the full
`auditEngine.test.js` suite (still 15/15, unchanged by this step). Hand-
ran an uncommitted `node -e '...'` script that seeded a real test DB via
`node:sqlite`, called `computeMixedDailyAudit` plus the new decoration
helper exactly as the route composes them, and confirmed the JSON shape
(field names and nesting) matches exactly what `daily-audit.html`'s JS
reads for both row types.

**Known gap, same shape as prior sessions' "Known open items"**: this
session worked from an uploaded zip snapshot of the repo, not a live
clone - no `.git` directory, no network access for `npm install`. That
meant no live Express server, so no real HTTP request/response round
trip and no browser click-through - same limitation already logged for
Stock Receipts' Unallocated/Assign flow and Commissary's Edit/Delete UI.
The three step-10 files and two step-11 files were packaged as
downloads for the project owner to drop into their real local clone and
commit/push themselves. **A future session should confirm via `git log`
that steps 10-11 actually landed** before trusting this changelog entry
and `session-status.md` at face value - that hand-off is a new kind of
gap this project hasn't hit before (steps 1-9 were all committed live,
in-session).

---

## 2026-08-28 (later) — Step 9 rebuilt from spec and shipped

Rebuilt the Unallocated-receipts work described in the entry directly
below, from `docs/data-model.md` section 5 and
`docs/commissary-and-stock-receipts.md` Part 2 - not from any memory of
the lost attempt, per `session-status.md`'s instruction.

**Shipped:**
- `server/db/schema.sql` - `stock_receipts.restaurant_id`/`meat_id` now
  nullable, with a CHECK constraint requiring both null together and only
  when `source = 'COMMISSARY'`.
- `server/db/migrate.js` (new) - idempotent rebuild-and-rename for any
  pre-existing local `inventory.db` still on the old NOT NULL definition.
  Wired into `connection.js` to run before `schema.sql` loads.
- `server/routes/stockReceipts.js`:
  - `POST` accepts an Unallocated COMMISSARY receipt (restaurant/meat
    both left unset) - since there's no restaurant+meat pair yet to
    resolve a mapping through, `commissary_meat_id` is required directly
    from the client in that one case, validated against `commissary_meats`
    server-side.
  - `GET` list query switched from `JOIN` to `LEFT JOIN` on
    restaurants/meats, so an Unallocated row (NULL on both) isn't
    silently dropped from every list. Added `?unallocated=true` filter.
  - `PATCH` gains a genuinely new capability: assigning a previously
    Unallocated row's `restaurant_id`+`meat_id` together, one time. Enforces
    the **continuity requirement** flagged by the lost session and
    written into `data-model.md` section 5: the `commissary_meat_map`
    lookup for the chosen restaurant+meat must resolve to the *same*
    `commissary_meat_id` already stored on the row, or the assignment is
    rejected. An already-assigned row still can't have restaurant/meat
    changed (delete + re-create, unchanged from before step 9).
- `server/routes/stockReceipts.test.js` (new, 17/17) - covers both the
  in-app validation and an independent check that the DB-level CHECK
  constraint rejects a bad NULL/NOT-NULL combination even if application
  validation were bypassed.
- `server/engines/commissaryYieldEngine.test.js` - Belly Slab fixture
  updated to include the real 5.0kg Unallocated row from `Outbound_Log`;
  the balance assertion now matches the sheet's actual cached 14.8
  exactly, closing the previously-documented 19.8-vs-14.8 gap. No engine
  code changes were needed - `getCommissaryBalance` was already
  destination-agnostic.
- `public/stock-receipts.html` - "Leave Unassigned" toggle on the add
  form (shown only when Source = Commissary), swapping the restaurant/meat
  pickers for a commissary-meat dropdown; an "Unallocated" badge + Assign
  action per row with inline restaurant→meat pickers; an "Unallocated
  only" list filter.

**Verification - stronger than any prior session on this route file**:
this sandbox had working npm registry access, so `npm install` succeeded
and the real Express server was run live (`npm run dev` equivalent) for
the first time ever on this route. In addition to the full existing
suite (55/55) plus the new 17/17 (72/72 total, 0 failures):
- 12/12 live HTTP requests against the actual running server exercising
  the full Unallocated → list → reject-on-mismatched-mapping →
  assign → re-assign-rejected flow end to end.
- 9/9 requests replaying the *exact* payload shapes the new
  `stock-receipts.html` JS constructs (including the string-vs-number
  quirks of reading straight from DOM inputs), against the live server,
  confirming the frontend and backend actually agree with each other -
  not just that each was individually plausible.
- Every `getElementById` call in the updated page cross-checked
  programmatically against the HTML's actual `id` attributes - no
  browser available in this sandbox to click through visually (no
  puppeteer/playwright, and the Chromium download host isn't in the
  network allowlist), so this plus the live payload replay is the
  strongest verification available here. A real click-through in an
  actual browser is still worth doing before/soon after this ships.

**Not built** (out of scope for step 9 specifically, tracked separately):
the Landing rebuild and Sales tab (steps 10-11) don't yet reflect
Unallocated stock in any UI beyond Stock Receipts itself - that's fine,
per the spec's design ("invisible to restaurant-facing screens until
assigned").

`HANDOFF.md` was deleted this session - see its own commit message. It
had drifted two steps stale (still describing itself as the step-6
handoff) and was actively misleading relative to `session-status.md`,
which is now the sole "where we left off" doc, so keeping both around
was a real risk rather than a harmless redundancy.



**What happened**: a session fully planned and implemented step 9
(Unallocated-receipts support) — schema change, migration helper,
`stockReceipts.js` route changes, 18/18 new tests, an update to
`commissaryYieldEngine.test.js`'s Belly Slab test — then hit its usage
limit partway through the `stock-receipts.html` UI work, before
committing anything or updating `changelog.md`/`session-status.md`.
Confirmed directly against the live repo: none of that code exists here.
The work is gone, not just uncommitted-but-recoverable.

**Two design calls from that lost session are worth preserving even
though the code isn't**, so the next attempt doesn't have to re-derive
them:

1. A migration helper is required, not optional — `schema.sql` uses
   `CREATE TABLE IF NOT EXISTS`, which can't retroactively loosen a
   `NOT NULL` constraint on a table that already exists in someone's
   local `inventory.db`.
2. Assigning an unallocated `stock_receipts` row to a restaurant must
   validate that the resolved `commissary_meat_map` entry points at the
   *same* `commissary_meat_id` already stored on that row — reject the
   assignment otherwise, to prevent silently misattributing which
   physical commissary pool a shipment was drawn from.

Both are now written into `docs/session-status.md`'s step 9 section as
requirements for the redo.

**Also done this session**: the repo was made public (previously private).
No code change — `.env`, `*.db`, and `/uploads/` are and have always been
gitignored, so nothing secret was ever committed. This was done to
simplify tooling/access, not for any functional reason.

**Not done in this entry**: no code. Step 9 needs a full rebuild from
`docs/data-model.md` section 5 and `docs/commissary-and-stock-receipts.md`
Part 2, treated as not-yet-started.

---

## 2026-08-28 — Step 8 shipped: Commissary Mapping admin screen

**What shipped**: a "Commissary Mapping" tab on `settings.html` (same tab
pattern as Meats/Dishes/Recipes), plus three new routes in
`server/routes/settings.js`: `GET /api/settings/commissary-mappings`
(list current mappings for the selected restaurant, joined with
commissary-meat and restaurant-meat code/name for readability), `POST
/api/settings/commissary-mappings` (create one `commissary_meat_map` row),
and `DELETE /api/settings/commissary-mappings/:id`. The add-form is a
commissary-meat dropdown (sourced from the existing `GET
/api/commissary/meats`, reused as-is, no duplicate endpoint) × this
restaurant's own meat dropdown (existing `GET /api/settings/meats`).
Matches `commissary-and-stock-receipts.md` Part 1 and `data-model.md`
section 10a exactly: no edit for v1 (delete + re-add), no `activity_log`
wiring (this table is config/reference data, deliberately outside rule 9's
scope). No schema change - `commissary_meat_map` already existed, just had
no UI. `server/index.js` unchanged - `settings.js` was already mounted at
`/api`.

**Deliberately not built in this step**: step 9 (unallocated-receipts
assignment flow) - untouched, as planned; it depends on this screen
existing first, which it now does.

**How it was verified**: this session had no npm registry access (`npm
install` returned `403 Forbidden`, unlike the step-7 session) - `npm run
dev` could not run, so there was no live-browser click-test this time.
Verification bar used instead (per `session-status.md`'s stated fallback):
a new `server/routes/settings.test.js`, same real-in-memory-`node:sqlite`
approach as `history.test.js` (real schema, real seeded restaurants/meats/
commissary_meats, no Express, no mocking), driving the exact SQL the three
new route handlers run. 10/10 new tests green, covering: empty list before
any mapping, create + list with joined code/name fields, per-restaurant
isolation (restaurant B's mapping doesn't leak into restaurant A's list),
the `UNIQUE (commissary_meat_id, restaurant_id)` constraint rejecting a
duplicate for the *same* restaurant while allowing the *same* commissary
meat to map into a *different* restaurant, delete removing a row (and
reporting zero `changes` on an already-gone id, which the route reads as
404), and the delete+re-add v1 "edit" path actually working after a
delete frees the UNIQUE slot. Full suite re-run after the change: 55/55
green (45 prior + these 10). Still open: an actual browser click-test of
the new tab's add-form/dropdowns/remove-button, and the still-outstanding
step-6-era item (Stock Receipts/Commissary pages' own Edit/Delete UI, not
touched this session) - both blocked on the same thing, npm registry
access, whenever a future session has it.

---
## 2026-08-28 — Step 7 shipped: Admin History tab (read-only feed over `activity_log`)

**What shipped**: `GET /api/history` and `GET /api/history/filters`
(`server/routes/history.js`), plus a new `public/history.html` page - a
reverse-chronological feed over `activity_log`, filterable by entity type,
actor, and date range, with a before→after diff rendered per entry (CREATE
shows all fields as new, DELETE shows all fields as removed, UPDATE shows
only the fields that actually changed). "History" added to the nav on all
five existing pages. Matches the spec in
`commissary-and-stock-receipts.md` Part 3 and `data-model.md` section 11
exactly - no schema change, no new write path. As expected going in, this
was a pure read on data step 6 already produces.

**Deliberately not built in this step**: nothing from steps 8/9
(commissary mapping admin screen, Unallocated-destination support) - those
remain untouched, confirmed via live testing (see below) that
`commissary_meat_map` still has zero rows and `stock_receipts.restaurant_id`
/`meat_id` are still `NOT NULL`, exactly the pre-step-8/9 state the docs
describe.

**How it was verified - and a first for this project**: `npm run dev`
actually ran live this session (network access to the npm registry was
available in this sandbox, unlike every prior session) - `npm install`
succeeded, the real Express server started, and the new routes were
exercised end-to-end: seeded real data, hit the real `POST`/`PATCH`
`stock-receipts` and `POST commissary/yield-log` routes to generate genuine
`activity_log` rows (a CREATE, an UPDATE, and a soft DELETE), then
confirmed `GET /api/history`/`/history.html` against that real data -
entity-type filter, actor filter, and inclusive date-range filtering
(including a range that correctly excluded everything) all matched
expectations, and CREATE/UPDATE/DELETE each rendered with the right
before/after shape. This only click-tested the new History feature plus
the two write routes needed to generate test data - it does NOT fully
resolve the older "`npm run dev` has never been run live" item in
`session-status.md`'s Known Open Items (Stock Receipts/Commissary's own
Edit/Delete UI flows still haven't been click-tested end-to-end in a
browser). Also ran the full existing test suite (37/37) plus 8 new tests
in `server/routes/history.test.js` (same plain-script pattern as
`activityLog.test.js`) - all green. The throwaway dev database created
during this live testing was deleted afterward (it's gitignored regardless).

**Files touched**: `server/routes/history.js` (new), `server/routes/history.test.js`
(new), `public/history.html` (new), `server/index.js` (mounted the new
router), and a "History" nav link added to `public/index.html`,
`public/daily-audit.html`, `public/stock-receipts.html`,
`public/commissary.html`, `public/settings.html`.

---
## 2026-08-28 (architecture review, between step 6 and step 7) — Resolved two open gaps: commissary mapping UI and the Unallocated-destination schema limit

**Context**: before starting step 7, took a step back to review the whole
repo against `HANDOFF.md`/`session-status.md`'s own account of where things
stand (confirmed accurate — steps 1-6 really are done as described, step 7
really is next). Two items that had been *flagged* in earlier sessions but
never turned into an actual planned step were surfaced during that review:
`commissary_meat_map` has no admin UI (only a dev writing SQL can create a
mapping), and the "Unallocated destination" gap noted back on 2026-08-27/28
(a commissary shipment that hasn't been assigned to a restaurant yet isn't
representable, since `stock_receipts.restaurant_id` was `NOT NULL`). Both
are now resolved as concrete decisions, written into the docs, before any
more code gets built on top of the current schema.

**No code changed in this entry** — per `rules-for-claude-code.md` rule 7
and the project's established docs-first workflow, architecture decisions
land in the docs first, get implemented as their own step next.

**Decisions made:**

1. **`commissary_meat_map` gets an admin screen** — new "Commissary
   Mapping" tab on `settings.html` (same pattern as the existing
   Meats/Dishes/Recipes tabs) + a route in `settings.js`. `commissary_meats`
   itself stays seed-only (still just the one commissary). No
   `activity_log` wiring needed — this is config/reference data, not one of
   the two tables `rules-for-claude-code.md` rule 9 scopes activity logging
   to. Scheduled as **step 8**.

2. **`stock_receipts.restaurant_id` and `meat_id` become nullable**, to
   represent a commissary shipment that's left the commissary but hasn't
   been assigned to a restaurant yet (the real xlsx's `Outbound_Log`
   "Unallocated" destination). A NULL-restaurant row is created via the
   existing `POST` flow with the restaurant left unset (only valid for
   `source = COMMISSARY`), stays correctly excluded from every restaurant's
   `new_stock` sum while unassigned, still correctly counts against the
   commissary's on-hand balance (that formula is already destination-
   agnostic), and gets assigned later via a `PATCH` that sets both fields
   together — logged as a normal `UPDATE`, reusing step 6's existing
   `activity_log` machinery rather than adding a new logging path.
   Scheduled as **step 9**, after step 8 (assignment needs mappings to be
   manageable in the UI first, or there's nothing to test it against
   beyond hand-written SQL).

3. **Corrected a docs staleness bug while reviewing**: `data-model.md`'s
   "Still open" section still listed the `excess_loss` formula as
   unresolved ("to be pinned down from real xlsx rows"), but it was
   actually pinned down and verified back on 2026-08-28 per
   `commissaryYieldEngine.js`/`.test.js` (7 real Review rows, 38 Pass, 1
   zero-weight edge case, all matched). The doc was just never updated to
   reflect that at the time. Fixed — not a new decision, just closing a gap
   between what the code already proves and what the doc claimed.

**Docs touched**: `data-model.md` (sections 5, 10, 10a new, "Still open"
list corrected), `commissary-and-stock-receipts.md` (Part 1's mapping note,
Part 2's Unallocated note, "Open items" list resolved), `session-status.md`
(steps renumbered 7 → 7, new 8-9 inserted, old 8-10 renumbered to 10-12;
`session-status.md` formally established as the doc future sessions should
read first, ahead of `HANDOFF.md`, since `HANDOFF.md` is a point-in-time
snapshot that goes stale the moment a new step starts).

**Also formalized**: an explicit end-of-session checklist in
`session-status.md` (update `changelog.md` + `session-status.md` before
ending, every session, even on partial progress) — this project runs across
multiple independent Claude Code sessions with no shared memory between
them, so `docs/` is the only continuity mechanism; worth stating the
discipline explicitly rather than relying on each session to reinvent it.

**Not done in this entry, on purpose**: no schema.sql change, no route
code, no UI code. Step 8 and step 9 are real implementation work for a
future session — this entry only records the decision and the reasoning,
per the docs-first rule.

---


## 2026-08-28 (latest) — Activity log wired in (step 6): edit/delete for both tables, full audit trail

**Shipped:**
- `server/db/activityLog.js` (new) — two shared helpers used by both
  write routes:
  - `withTransaction(db, fn)` — hand-rolled `BEGIN`/`COMMIT`/`ROLLBACK`.
    `node:sqlite`'s `DatabaseSync` has no `.transaction()` wrapper
    (checked directly: only `.exec()`/`.prepare()`/etc. exist), so this
    is the transaction primitive rule 9 needs. A throw inside `fn` rolls
    back before rethrowing.
  - `logActivity(db, {...})` — inserts one `activity_log` row,
    JSON-serializing `before`/`after` consistently at the one call site
    instead of leaving that to each route.
- `server/db/activityLog.test.js` (new) — 6 tests, the important one
  being **atomicity**: an error thrown after both the target write and
  its log entry have run, still inside the same transaction, rolls back
  *both* — verified by counting rows before/after, not just checking the
  error propagated. Also covers CREATE/UPDATE/DELETE snapshot shapes and
  input validation (rejects a garbage `action`/`source`). 6/6 green.
- `stockReceipts.js` — `POST` now wraps the insert + its `CREATE` log
  entry in one transaction (previously just an insert, no log). Two new
  endpoints: `PATCH /api/stock-receipts/:id` (editable fields: quantity,
  business_date, source, notes — not restaurant/meat, which would really
  be a different receipt; switching `source` to `COMMISSARY` re-resolves
  `commissary_meat_id` server-side the same way `POST` does, never
  trusted from the client) and `DELETE /api/stock-receipts/:id` (soft —
  `deleted_at` only, logs `before` = full row, `after` = null). Both 404
  on an already-deleted row rather than silently no-op'ing or
  double-logging.
- `commissary.js` — same treatment for `commissary_yield_log`: `POST`
  now transaction-wrapped with a `CREATE` log, plus new
  `PATCH /api/commissary/yield-log/:id` and
  `DELETE /api/commissary/yield-log/:id`. Confirmed via test that editing
  `backed_weight_out` correctly changes what `getCommissaryBalance`
  returns, and that a soft-deleted yield row is excluded from the
  balance the same way a soft-deleted `stock_receipts` row already was.
- `public/stock-receipts.html` / `public/commissary.html` — both pages
  now have inline Edit (row becomes editable inputs, Save/Cancel) and
  Delete (confirm dialog) per row, plus an "Your name" field
  (persisted in `localStorage`, sent as `actor` on every write) so the
  activity log has something better than null for who made a change.
  Deleting asks for confirmation and explains the row isn't gone, just
  excluded from calculations.

**Not built yet, on purpose**: no Admin History UI reading `activity_log`
back — that's step 7, deliberately kept as its own commit since it's a
pure read with no risk to the write paths this entry touches.

**Verification note — still no live `npm run dev` this session**, same
sandbox limitation as steps 4/5 (no network). Verified instead by:
- `node --check` on every new/changed file.
- Full `auditEngine.test.js` (9/9) + `commissaryYieldEngine.test.js`
  (22/22) + new `activityLog.test.js` (6/6) — 37/37 total.
- Two standalone scripts exercising `stockReceipts.js`'s and
  `commissary.js`'s exact new route logic (POST/PATCH/DELETE, including
  the transaction+log wiring) directly against `node:sqlite`: confirmed
  full CREATE→UPDATE→UPDATE→DELETE and CREATE→UPDATE→DELETE
  `activity_log` trails in order, `deleted_at IS NULL` correctly
  excludes deleted rows from list queries, PATCH/DELETE both 404 on an
  already-deleted row, and (for commissary) that `getCommissaryBalance`
  live-reflects an edit or delete to the underlying yield log row.
- A fresh `seed.js` run, unaffected by any of this session's changes.

**→ Next session should run `npm run dev` for real** — same outstanding
item as steps 4 and 5, now three pages deep (Stock Receipts, Commissary,
and their new edit/delete flows) — before starting step 7.

---

## 2026-08-28 (even later) — Commissary balance formula fully re-verified against the real xlsx; full M01-M14 seed data

**Context**: `Commi_Audit_Master.xlsx` was re-uploaded after the previous
entry below was written. Re-read `Meats`, `Yield_Log`, `Outbound_Log`, and
`Commissary_Stock` directly (`Instructions` too, for the Outbound_Log
destination note). This entry corrects/completes the previous one, which
had to proceed without the file.

**Balance formula verified exactly**, hand-checked two ways:
- `Commissary_Stock`'s own formulas (`D`=SUMIF Yield_Log backed-out by
  MeatID, `E`=SUMIF Outbound_Log qty-out by MeatID, `F`=D-E) were read
  directly — confirms `E` sums outbound rows **regardless of destination**,
  including "Unallocated" ones. So the earlier-flagged schema gap (can't
  represent an unallocated shipment) doesn't affect the formula's
  correctness against the sheet — it only affects whether *our app* can
  reproduce the sheet's exact number when an Unallocated row exists for a
  meat.
- Manually summed the real per-meat rows and matched the sheet's cached
  numbers exactly: M03 Belly Slab 29.7 backed in − 14.9 out = **14.8**;
  M05 JOWL 103.8 − 87.5 = **16.3**; M08 Shortplate 46.9 − 33.5 = **13.4**.

**`commissaryYieldEngine.test.js` rewritten with real fixtures**: the
Belly Slab balance tests now use the actual 3 real Yield_Log rows (backed-in
sums to the sheet's exact 29.7) and the actual 3 restaurant-assigned
Outbound_Log rows (2.2 + 5.7 + 2.0 = 9.9). Balance comes out to **19.8**,
not the sheet's 14.8 — that's not a bug, it's the schema gap made visible:
a 4th real row (2026-07-02, 5.0kg, destination "Unallocated") exists in the
sheet but isn't reproduced, since `stock_receipts.restaurant_id` is
`NOT NULL` and can't represent it yet. Documented in the test itself so the
gap stays visible rather than silently glossed over. 22/22 green.

**`commissary-seed-data.json` filled in completely**: all 14 real rows from
the `Meats` sheet (M01–M14; M15 is blank in the sheet), including
`cost_per_unit` where the sheet has it. `seed.js` updated to insert it.
Fresh `seed.js` run confirmed all 14 load cleanly with the right values.

**Still open, unchanged from before**: the "Unallocated" destination gap
itself — whether/how to let a `stock_receipts` row represent "shipped but
not yet assigned to a restaurant" — is a real design decision, not
resolved here. Flagged for a deliberate conversation, not decided as a
side effect of this session. `npm run dev` still hasn't been run live
(no network in this sandbox either) — do that before step 6.

---

## 2026-08-28 (later) — Commissary page + route (step 5); prior session's balance-verification work recovered/rebuilt

**Context worth recording**: a prior session (same day) read `Commi_Audit_Master.xlsx`'s
`Commissary_Stock`/`Outbound_Log` sheets, hand-verified the balance formula
against the sheet's own cached numbers (e.g. M03 Belly Slab = 14.8), pulled
real per-meat rows as test fixtures, and started wiring `getCommissaryBalance`
into the engine — but that work never landed in the repo (the zip handed to
this session matched the step-4 HANDOFF state exactly, with no balance
function, no `commissary-seed-data.json`, none of it). The xlsx also wasn't
re-uploaded this session, so the real-number verification couldn't be
redone. Rebuilt what could be rebuilt from the documented formula and the
already-committed test fixtures; flagged rather than faked the rest. See
"Still open" below.

**What shipped**:
- `commissaryYieldEngine.js` — added `getCommissaryBalance(db, commissaryMeatId)`
  and `listCommissaryBalances(db)`, implementing the formula from
  `commissary-and-stock-receipts.md` Part 1 exactly (backed-in from
  `commissary_yield_log` minus shipped-out from `stock_receipts` where
  `source = COMMISSARY`, both filtered on `deleted_at IS NULL`). Returns 0
  (not null) for a meat with no activity — "nothing on hand" is a real
  answer.
- `commissaryYieldEngine.test.js` — added tests for the above. **These
  fixtures are constructed, not xlsx-sourced** (unlike the Yield_Log tests
  above them) — the xlsx wasn't available this session. They check the
  SUM-minus-SUM mechanics, the `deleted_at` filter on both sides, and that
  `source = DIRECT` rows are never subtracted. 21/21 green (was 15/15
  before this session's additions).
- `server/db/commissary-seed-data.json` (new) + `seed.js` — seeds only the
  3 commissary meats with real, already-verified values sitting in the
  test fixtures (M03 Belly Slab, M05 JOWL, M08 Shortplate). Did **not**
  fabricate the other ~12 of the real M01–M15 set without the xlsx to
  check them against.
- `server/routes/commissary.js` (new) — `GET /api/commissary/meats`,
  `GET /api/commissary/yield-log` (filterable, computed fields joined in),
  `GET /api/commissary/balances` (live view), `POST /api/commissary/yield-log`
  (create only — see below). Mounted in `server/index.js`.
- `public/commissary.html` (new) — yield-entry form, live balance cards,
  filterable yield log list. Same vanilla-JS/fetch pattern as
  `stock-receipts.html`. Nav link added to every page.

**Deliberately not built** (same reasoning as step 4's stock_receipts):
no edit/soft-delete on `commissary_yield_log` yet — `rules-for-claude-code.md`
rule 9 requires activity_log wiring on every write to this table, and
that's step 6. Create + read only.

**Design gap flagged, not resolved** (per the prior session's notes,
recovered from its summary): `Outbound_Log`'s Instructions sheet allows a
destination of "Unallocated" when a shipment's restaurant split hasn't been
decided yet, but `stock_receipts.restaurant_id` is `NOT NULL` — there's no
way to represent "shipped from commissary but not yet assigned to a
restaurant." Doesn't affect the balance formula (destination-agnostic), but
is a minor workflow tightening vs. the old sheet. Left as an open item, not
decided unilaterally.

**Still open before this can be called fully verified** (✅ both resolved
later the same day — see the entry above this one):
1. ~~Re-verify `getCommissaryBalance` against real `Outbound_Log`/`Commissary_Stock`
   rows once `Commi_Audit_Master.xlsx` is available again~~ — done, see
   above.
2. `commissary_meats` seed data is still only 3 of ~15 real rows — the
   dropdown works but is incomplete until the xlsx's `Meats` sheet is
   re-read.
3. **Could not run `npm run dev` this session either** — same no-network
   sandbox limitation as step 4. Verified via `node --check` on every new/
   changed file, the full `auditEngine.test.js` + `commissaryYieldEngine.test.js`
   suites (9/9, 21/21), a fresh `seed.js` run confirming the 3 commissary
   meats load cleanly, and a standalone script exercising `commissary.js`'s
   exact route logic against `node:sqlite` directly (GET meats, POST
   validation incl. rejecting an unknown meat, GET yield-log with computed
   fields and date filter, GET balances before/after a COMMISSARY receipt).
   A live click-through still hasn't happened — do that before step 6.

---

## 2026-08-28 — Stock Receipts page + route (step 4); `new_stock` retired

**What shipped**: `server/routes/stockReceipts.js` (`GET /api/stock-receipts/meats`,
`GET /api/stock-receipts` filterable list, `POST /api/stock-receipts` create)
and `public/stock-receipts.html` — one page, per `commissary-and-stock-
receipts.md` Part 2: date, restaurant, meat (filtered to that restaurant),
quantity, source, notes, plus a filterable running list.

**`commissary_meat_id` is resolved server-side, never client-supplied.**
When `source = COMMISSARY`, the route looks up `commissary_meat_map` by
`(restaurant_id, meat_id)`; a missing mapping is rejected with the
"not mapped yet - set this up in Settings" message the docs specify,
not a silent failure. The frontend also checks this proactively per-meat
so the warning shows before submit, not just after.

**`new_stock` is now fully retired**, not just superseded: `dailyAudit.js`'s
GET/POST no longer touch the `new_stock` table at all — the New Stock
column on Landing reads `computeMeatAudit(...).newStock` (already a
`SUM(stock_receipts)` since step 2) and is display-only, matching Beginning/
Usage. Dropped the `new_stock` table from `schema.sql` entirely, since
`data-model.md` already didn't list it and nothing references it anymore.

**Deliberately not built yet** (flagged, not forgotten):
- No edit/soft-delete on `stock_receipts` from this page — every write to
  this table must log to `activity_log` per `rules-for-claude-code.md`
  rule 9, and that wiring is step 6. Building delete now would mean either
  violating that rule or hand-rolling a one-off log just for this table.
  Create + read only until step 6 lands, then edit/delete get added
  alongside the logging.
- No `commissary_meats` seed data added. The page works correctly with
  zero commissary meats/mappings — COMMISSARY source just shows "not
  mapped yet" for every meat until Settings has real mappings — but the
  dropdowns will look empty in practice until that seeding happens
  (HANDOFF.md flagged this as still-undecided: step-4 prerequisite vs.
  separate task; left as the latter for now).

**Environment note**: this sandbox has no network access, so `express`
couldn't be installed to run the server end-to-end here. Verified instead
by: `node --check` on every changed/new server file, the full existing
`auditEngine.test.js` + `commissaryYieldEngine.test.js` suites re-run
against the updated schema (24/24 still green), and a standalone script
exercising the new route handlers' exact SQL directly against `node:sqlite`
(mapping enforcement, multi-receipt-per-day summing, soft-delete exclusion,
and `getNewStock` reflecting it all correctly). Run `npm run dev` on a
machine with npm access to confirm the live server/UI before moving on.

---

## 2026-08-27 — Design decision: unified stock receipts log + commissary yield tracking + activity log

**Context**: reviewed `Commi_Audit_Master.xlsx` (the commissary's existing
spreadsheet) alongside the app's docs. That workbook already tracks raw
meat → processed ("backed") yield with a pass/fail leeway check, and ships
processed meat out to restaurants — with its own instructions literally
saying the only manual handoff is retyping the resulting balance into each
restaurant's New Stock cell. That's exactly the gap being closed here.

**Decisions made**:
1. `new_stock` (one row per restaurant/meat/day) is replaced by
   `stock_receipts`, a flat, restaurant-labeled log covering both direct
   deliveries and commissary shipments. One page instead of duplicate
   per-restaurant New Stock screens. `new_stock(meat, date)` becomes a
   `SUM(...)` query, same treatment as the other calculated fields.
2. Commissary yield (raw-in vs. backed-out, checked against an allowed
   leeway %) is tracked separately in `commissary_yield_log`, since it
   happens before any meat is assigned to a restaurant. A shipment out of
   the commissary is just a `stock_receipts` row with `source =
   COMMISSARY` — no separate outbound table needed.
3. **Found a real data mismatch** while checking this: commissary MeatIDs
   (`Commi_Audit_Master.xlsx`) do NOT line up with restaurant MeatIDs
   (`seed-data.json`) — e.g. commissary M01 = processed Whole Chicken,
   Restaurant A's own M01 = Whole Chicken *Raw*. An explicit
   `commissary_meat_map` table is required; matching by code string would
   have silently misfiled stock.
4. Requirement clarified as "detect manipulation, don't block corrections."
   Landed on soft deletes (`deleted_at`) + an `activity_log` table
   (before/after JSON snapshot per change) instead of a hard lock on any
   field. Scoped to `stock_receipts` and `commissary_yield_log` only for
   now — extending this pattern to older input tables is flagged as
   deliberate follow-up work in `scope.md`, not bundled in.

**Docs touched**: `data-model.md` (sections 5, 10, 11), `scope.md`,
`daily-workflow.md`, and a new `commissary-and-stock-receipts.md` with the
full reasoning. No code changed yet — docs land first per
`rules-for-claude-code.md`.

---

## 2026-08-25 — Windows: SQLite test file wouldn't delete (EBUSY)
**Symptom**: `auditEngine.test.js` passed all 7 tests, then crashed during
its own cleanup step with `EBUSY: resource busy or locked, unlink ...test.db`.

**Cause**: Windows keeps a file lock on an open SQLite database until the
connection is explicitly closed. Linux (used during initial development/
testing) releases the lock automatically at process exit, so this didn't
surface until testing on the real Windows machine.

**Fix**: added `db.close()` before attempting to delete the test database
file, wrapped in try/catch as a safety net for edge cases (antivirus/
indexing software briefly holding a file lock on some machines).

**Lesson**: always explicitly close database connections before deleting
their files — don't rely on process exit to release locks, especially
since this project's target machine is Windows.

---

## 2026-08-25 — node:test + node:sqlite don't play well together
**Symptom**: Audit engine tests failed with `attempt to write a readonly
database` partway through a `node --test` run — but the exact same code,
run as a plain script (no test framework), worked perfectly.

**Cause**: both `node:test` (Node's built-in test runner) and `node:sqlite`
are still experimental/newer Node features. Something about how the test
runner isolates/re-enters test blocks conflicts with an open SQLite
connection across those boundaries. Confirmed via isolated repro that the
writes themselves are correct — this is a framework interaction issue, not
an app bug.

**Fix**: switched to plain test scripts (`node server/engines/whatever.test.js`)
instead of `node --test`. Same rigor (real assertions, real pass/fail, real
exit codes) without the framework conflict.

**Lesson**: when combining multiple still-experimental Node features, test
early and don't assume a "should work" combination actually does.

---

## 2026-08-25 — Switched from better-sqlite3 to Node's built-in node:sqlite
**Symptom**: `npm install` failed on Windows with a long `node-gyp` error
ending in "You need to install the latest version of Visual Studio...
including the Desktop development with C++ workload."

**Cause**: `better-sqlite3` is a native module — part of it is C++ code that
needs to be compiled during install. That requires a C++ compiler
(Visual Studio Build Tools on Windows), which isn't installed by default
and is a multi-GB download just for this one dependency.

**Fix**: switched to Node's built-in `node:sqlite` module (`DatabaseSync`),
available without any install since Node 22.13+. Zero compilation, zero
extra setup. Confirmed `docs/tech-stack.md` updated to match.

**Trade-off accepted**: `node:sqlite` is still marked experimental/
release-candidate by Node as of this writing (prints a harmless
`ExperimentalWarning` on every run — expected, not a bug). Acceptable for
a small local single-user tool; revisit only if it causes a real problem.

---

## Known, harmless, recurring notices (not worth re-investigating each time)
These show up regularly and are expected — listed here so they're not
mistaken for new problems:

- **`warning: ... LF will be replaced by CRLF ...`** on `git add` — Windows/
  Git line-ending normalization. Cosmetic, not an error.
- **`(node:####) ExperimentalWarning: SQLite is an experimental feature...`**
  on every `npm run dev` / test run — expected, see the entry above.
- **PowerShell quoting for inline `node -e "..."` commands** is fragile with
  nested quotes — prefer a real `.js` file over inline one-liners when the
  command has any quotes inside it.
- **`git status` showing "upstream is gone"`** right after cloning a fresh
  empty repo — resolves itself after the first `git push`, not an error.

