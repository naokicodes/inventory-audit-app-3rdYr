# Changelog / Development Notices

A running, dated log of real fixes, decisions, and environment quirks hit
during development — so they don't have to get rediscovered later, and so
anyone picking this project up (including future-you) has context on *why*
something is built the way it is, not just *what* it does.

Newest entries at the top. Small/routine commits don't need an entry here —
this is for things that took real debugging, changed a decision, or are
worth remembering if they happen again.

---

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

