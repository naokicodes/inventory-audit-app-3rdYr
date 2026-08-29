# Session Status — read this first after token reset

Last updated: 2026-08-29 (step 22 — Landing Allocations merge — Done.
Built and verified live by the architect session: minimal admin CRUD
for both `adjustment_types` and `locations` (the latter had zero rows
and no admin path — flagged and resolved with the project owner before
building, not assumed), a new append-only Allocations page/route
replacing Landing's old three-box adjustment entry, and Landing's meat
row now shows one read-only `Adjustments` cell. A real bug (a dead
helper referencing an undefined variable in settings.html) was caught
and fixed before the live verification pass, not shipped. Full backend
suite: 165/165, 0 regressions, including a new allocations.test.js.
Only a real browser click-through remains genuinely open. Steps 1–21
remain fully done — see each step's own entry for its own verification
detail).
This is the authoritative "where we left off" doc. `HANDOFF.md` was
deleted this session (see `changelog.md`) — it had drifted stale and was
actively misleading; this file is now the only "where we left off" doc,
so always start here. **If you're a fresh conversation with no memory of
prior sessions, also read rules 18 and 19 in `rules-for-claude-code.md`**
— they describe exactly how work moves between coder workers and the
architect conversation, and the current worker network-access reality
(rule 18) and testing scope (rule 19), which this file assumes you
already know.

**If you're specifically a fresh *architecture* conversation** (the
project owner talking through design, not dispatching a scoped coder
task) — two behavioral rules, not just reading assignments, matter more
than anything else here:
- **Don't search past chat history to reconstruct context.** This file
  and `rules-for-claude-code.md` are written to be self-sufficient on
  purpose — that's the entire point of rule 18. If something seems
  missing, ask the project owner directly; spending tool calls mining
  old conversations for context that should already be written down
  here is exactly the waste this file exists to prevent.
- **Hold the discussion before writing any code — even though the
  tools to just build something are sitting right there.** Steps 21 and
  22 are mid-discussion, not finished designs, and "you're an
  architecture conversation" is not license to resolve their open
  questions yourself and start coding. Read both entries in full first
  (each is self-contained, grounded in real code/data checks, not just
  claims, and states its own open question plainly) — then ask the
  project owner about the open question, the way earlier architecture
  turns in this project's history actually worked: several rounds of
  back-and-forth before anything got built, not one read-through
  followed by a build. If in doubt, ask one more clarifying question
  before touching any code, not after.

Broader context worth knowing before jumping in: this app covers
Commissary plus three restaurant outlets (Restaurant A / "Silingan", FC
/ "Restaurant B", and "Likod" — not yet onboarded, no workbook for it
exists yet); Commissary is treated as the architectural root ("just
another kitchen, one that serves other kitchens" — the project owner's
own framing) that the restaurants build onto, not the other way around;
and the stated direction for admin/config-level features is toward
settings-driven flexibility (the auditor's daily screens stay
dead-simple per `daily-workflow.md`, but the admin side should let the
project owner define new things — conversions, categories, presets —
without a developer, a theme running through steps 20-22 alike).

## Where things stand: steps 1–22 done, everything confirmed pushed to
`main` and verified (step 22 verified live by the architect session
directly, not yet pushed at the time of writing — see its own entry
below for the exact commit boundary). An AutoCAD-style docked-bar
layout for the terminal was discussed and deliberately deferred (see
step 21's entry) — not started. **No step is currently queued next** —
project owner's call on what comes after step 22.

**Step 20 is now fully closed out, including the
`commissary_shipment_presets` piece 20c deferred.** New this session:
`GET`/`POST`/`PUT /api/commissary/shipment-presets` in
`server/routes/commissary.js`, and a "Load preset" autofill control on
`public/commissary-shipments.html`. Verified live this session (network
+ git access were available, no zip fallback needed) — booted a real
server, exercised create/list/edit/deactivate/reject-bad-line over
real HTTP, confirmed the page serves and the preset JSON shape matches
what the frontend reads. Full suite: **11/11 files, 154/154 assertions,
0 regressions** (was 138). Pushed to `main`. See this session's
`changelog.md` entry for the full breakdown, including what's still
explicitly deferred (a preset-*authoring* admin UI — presets can be
created via the API today, just not yet through a browser form).

**20c's hand-off is fully closed out.** The step-20c coder session had
no network access (403s on `git clone`/`npm install`, same zip-fallback
situation steps 12–19 hit) and could only hand back files + git
commands for the project owner to apply manually — that happened, it's
pushed (`f9b61cf`/`8fd71c3`/`b4d0411`), and the architect conversation
independently re-verified it afterward rather than trusting the commit
messages alone: pulled fresh, re-ran the full suite (**11/11 files,
138/138 assertions, confirmed clean**, matching the coder session's own
number), then did the live-server check that session couldn't — booted
a real server, `POST`'d a real shipment (Jowl → FC's Bagnet + Sisig),
confirmed usage moved 0→9 via `GET /api/commissary/daily-audit`,
confirmed both destination `stock_receipts` rows landed with the
correct `source`/`commissary_meat_id`, confirmed `activity_log` entries
use `source: 'MANUAL'` correctly (human-triggered write, not a
`SYSTEM` background job like `sync-batch-stock`'s). No gaps found.

- **Steps 1–6**: done, committed, unchanged in a while (schema, audit
  engine, commissary yield engine, Stock Receipts page, Commissary page,
  activity log wiring). See `docs/changelog.md` for detail on each.
- **Step 7** (Admin History tab): done, committed, verified live against
  real data. `server/routes/history.js` + `public/history.html` exist and
  are mounted.
- **Step 8** (Commissary meat mapping admin screen): done, committed.
  `settings.html` has a "Commissary Mapping" tab; `settings.js` has
  `GET`/`POST`/`DELETE /api/settings/commissary-mappings`; covered by
  `server/routes/settings.test.js`.
- **Step 9** (Unallocated-receipts support): done, committed. Rebuilt
  from `docs/data-model.md` section 5 and
  `docs/commissary-and-stock-receipts.md` Part 2 after an earlier attempt
  was lost to a usage cutoff before it could commit (see `changelog.md`'s
  two 2026-08-28 entries — one documents the loss, the other the
  successful rebuild). This incident is also why the roadmap below was
  re-split into smaller steps — see rule 16 in `rules-for-claude-code.md`.
  - `schema.sql`/`migrate.js`: `stock_receipts.restaurant_id`/`meat_id`
    nullable, CHECK constraint, idempotent migration for pre-existing
    local databases.
  - `stockReceipts.js`: `POST` accepts an Unallocated COMMISSARY receipt
    (client supplies `commissary_meat_id` directly since there's no
    restaurant+meat pair yet to map through); `GET` uses `LEFT JOIN` so
    Unallocated rows aren't hidden, plus `?unallocated=true`; `PATCH`
    gains one-time assignment of `restaurant_id`+`meat_id`, enforcing the
    `commissary_meat_id` continuity check.
  - `stock-receipts.html`: "Leave Unassigned" toggle on the add form, an
    "Unallocated" badge + Assign action per row, an "Unallocated only"
    filter.
  - Tests: 72/72 total (55 pre-existing + 17 new), plus live HTTP
    verification against the actual running server (the first time this
    route file has ever been exercised that way) and a payload-shape
    replay confirming the new frontend and backend actually agree.
  - `commissaryYieldEngine.test.js`'s Belly Slab test now asserts the
    real 14.8 balance (was 19.8, a documented gap) — closed automatically
    once the Unallocated row became representable, no engine code change
    needed.

- **Step 10** (Landing backend: unify the read endpoint into one mixed
  grid): done. `computeDishAudit`/`computeMixedDailyAudit` added to
  `auditEngine.js`, `GET /api/daily-audit/mixed` added to
  `dailyAudit.js` (additive, `GET /api/daily-audit` untouched), 6 new
  tests in `auditEngine.test.js` (5 dish-audit + 1 mixed-grid; 9
  pre-existing + 6 new = 15/15 in that file). Verified `portion_ending_
  actual`'s columns (`restaurant_id`, `dish_id`, `business_date`,
  `portions_counted`) already matched what the tests assumed — no schema
  gap.
- **Step 11** (Landing frontend: render the mixed grid): done, with one
  scope decision made explicitly this session (see below) rather than
  assumed. `daily-audit.html` now reads from `/api/daily-audit/mixed`
  instead of `/api/daily-audit` and renders meats + BATCH_PREPPED dishes
  as rows in one table. Meat rows: unchanged editable fields/save flow
  (still posts to the untouched `POST /api/daily-audit`). Dish rows:
  **display-only** (Prepped, Sold, Portion Beginning/Ending calc,
  Portion Actual, status) — there is still no write path for
  `prepped`/`portion_ending_actual` anywhere in the app, so editing dish
  rows is explicitly deferred to its own future step, not silently
  assumed in-scope here. User-facing label is "Over/Short"; `variance`
  stays the internal/code term, per the roadmap's vocabulary note.
  `GET /api/daily-audit/mixed` gained a small, doc-anticipated addition
  (`dailyAudit.js`'s own step-10 comment flagged this as step 11's job):
  MEAT rows are now decorated with the same `in_house`/`wastage`/
  `other`/`remarks` lookups the old endpoint already had, via a shared
  `getMeatInputDecoration` helper — needed so the Landing UI shows
  previously-entered values, not just calculated columns.
  - **Verification caveat**: this session worked from an uploaded zip of
    the repo (no `.git` present, no network for `npm install`), so there
    was no live Express server to click-test against — same gap already
    logged under "Known open items" for stock receipts/commissary. What
    *was* done: `node --check` on both changed files (syntax), the full
    `auditEngine.test.js` suite re-run (still 15/15 green — this session
    didn't touch the engine), and a hand-run script (`node -e '...'`,
    not committed) that seeded a real test DB, called
    `computeMixedDailyAudit` + the new decoration helper exactly as the
    route does, and confirmed the JSON shape matches what
    `daily-audit.html`'s JS reads (`newStock`/`endingCalculated`/
    `unexplainedVariance`/`actual` for meat rows; `portionBeginning`/
    `prepped`/`sold`/`portionEndingCalculated`/`portionActual`/
    `portionVariance` for dish rows). A real click-through is still owed,
    same as the existing open item below.
  - **Pushed and verified** (2026-08-29): a fresh session cloned `main`
    independently, confirmed the step-10/11 commits are present
    (`7b0c541`, `2ff3032`, `5b31717`), ran the full test suite from a
    clean `npm install` (6/6 suites, 0 failures), and did a live smoke
    test — seeded a real DB, booted the actual Express server, and hit
    `GET /api/daily-audit/mixed` for real, confirming the response shape
    matches what `daily-audit.html` reads. The earlier "not yet pushed /
    check with the project owner" caveat is resolved; no need to verify
    this again. A true browser click-through is still not done (see
    "Known open items" below) — the live smoke test confirms the backend
    contract, not the UI interaction.

- **Step 12** (Opening-stock fix): done. No schema change needed -
  `opening_stock` and `getBeginningStock`'s fallback to it already
  existed; the gap was that nothing ever wrote to it. `POST
  /api/daily-audit` now accepts an optional `opening_stock` field per
  row, written via `INSERT OR IGNORE` - the table's existing
  `UNIQUE(restaurant_id, meat_id)` constraint makes write-once a DB-level
  fact. `daily-audit.html`'s Beginning cell is editable only when
  `r.beginning === null`; `save()` includes `opening_stock` only for
  those rows. Nothing else on Landing touched. Not run through
  `activity_log` (rule 9 scopes that to `stock_receipts`/
  `commissary_yield_log` only). 6 new tests in a new
  `dailyAudit.test.js`; full suite 78/78 (was 72/72). Verified beyond the
  usual hand-mirrored test: `npm install` succeeded this session, so this
  was checked with a real live HTTP smoke test against a booted Express
  server (seeded DB, POST `opening_stock` for a real meat, confirmed
  `beginning` flipped from null to the written value via `GET
  /api/daily-audit/mixed`, then confirmed a second POST with a different
  value was silently ignored). See `changelog.md`'s 2026-08-29 step-12
  entry for full detail.
  - **Not yet committed**: this session, like the step-11 session before
    it, worked from an uploaded zip with no `.git` present - there's
    nothing to commit *to*. Unlike step 11, `npm install` did work this
    time (network allowlist covered the registry), which is what made
    the live HTTP smoke test above possible even without git. The actual
    commit (`wip:`-free, this step is fully done and tested) still needs
    to happen wherever the real git history lives - next session with
    git access should commit this exactly as-is, no re-verification
    needed, same as step 10/11's "Pushed and verified" entry above once
    resolved that same way.

- **Step 13** (Live recalculation on Landing): done. `public/daily-audit.html`
  only — Ending(calc)/Over-Short/Status now update live as a meat row's
  editable inputs change, no save+reload needed. Scope note made
  explicitly this session (see `changelog.md`'s step-13 entry): the
  roadmap line said "New Stock/Usage/Actual" but New Stock and Usage
  aren't editable on this screen, so live recalc is wired to what
  actually feeds the formula and is actually editable — Beginning (only
  when it's still the opening-stock input), In-House, Wastage, Other,
  Ending (actual). `recalcMeatRow()` mirrors `auditEngine.js`'s
  `computeMeatAudit` formula and thresholds exactly, via one delegated
  `input` listener on `#grid-container`. Dish rows untouched (nothing
  editable to recalc). Save/reload flow untouched — this is a pure
  display overlay, no new network calls.
  - **Verified**: no engine/backend change, so no new automated tests
    (rule 6 scopes those to the audit/yield engines). Hand-mirrored the
    recalc formula against the existing waste-adjustment fixture in
    `auditEngine.test.js` via a standalone script — matched exactly.
    `node --check` on the extracted inline script. Full existing test
    suite re-run before and after — identical 84 passing / 0 failing
    across all 7 test files both times, no regression. (Note: 84, not
    the "78/78" figure step 12's entry claims — see `changelog.md`'s
    step-13 entry; flagged, not corrected retroactively.)
  - **Not yet committed**: same as step 12 — this session worked from an
    uploaded zip, no `.git` present. Unlike step 12's session, this one
    also had **no network at all** (`git clone` and `npm install` were
    both blocked), so there was no `npm install`/live Express
    server/browser this time — no live HTTP smoke test, no click-through.
    Next session with git access should commit this as-is, no
    re-verification needed, same as step 10/11/12's pattern.
  - **Known gap carried forward**: a real browser click-through (typing
    into an input, watching Ending(calc)/Over-Short/Status update) is
    still owed — same open item as Stock Receipts' Unallocated/Assign
    flow and Commissary's Edit/Delete flows below.

- **Step 14** (Command panel scaffold): done. New `public/command-panel.js`
  + one-line `<script>` include on all six pages. `window.CommandPanel`
  exposes `register(id, label, run)`/`list()`; a floating "Commands"
  button opens a panel listing registered commands with a Run button per
  row. One no-op command registered on load — proves register → appear →
  run end to end with no real functionality yet, per the roadmap. Running
  never touches the server; the result is an ephemeral on-screen line
  only. See `changelog.md`'s step-14 entry for the rule-10 scope note
  (Landing gets the panel too, same as every page — flagged, not
  resolved, since it's currently inert).
  - **Verified**: no backend/schema/engine change, so no new automated
    tests (rule 6 scope). `node --check` on the new file; registry logic
    (register/list/duplicate-id-rejection/run() resolution) smoke-tested
    standalone outside the DOM — all passed. Full existing suite re-run —
    still 84/0, no regression.
  - **Not yet committed**: same as steps 12–13 — no `.git`, no network
    this session either.
  - **Known gap carried forward**: no live browser click-through of the
    actual injected UI (button placement, panel open/close, Run click) —
    same bucket as step 13's open item.
- **Step 15** ("Sync batch stock" command): done. New backend route
  `POST /api/commands/sync-batch-stock` (`server/routes/commands.js`) +
  new frontend file `public/commands/sync-batch-stock.js`, registered
  against the step-14 panel on all six pages. Copies `sales` into
  `prepped` for `BATCH_PREPPED` dish/date/restaurant combos with no
  `prepped` row yet, summing multiple sales rows per combo; always safe
  to re-run (existing rows, manual or synced, are never overwritten).
  See `changelog.md`'s step-15 entry for full detail, including a scope
  decision made this session: a narrow, documented exception lets this
  one SYSTEM write path log to `activity_log` for `prepped`, despite
  `scope.md`'s standing deferral of that pattern — written into
  `scope.md` and `data-model.md` section 11 directly, not left implicit.
  - **Verified**: 7/7 new tests in `commands.test.js` (mirrored-logic
    style, same approach as `stockReceipts.test.js`), full suite re-run
    at 8/8 files green, AND a live end-to-end check — real seeded sales
    rows, real booted server, real `POST`, confirmed by direct DB read
    that `prepped` and `activity_log` both got the right rows, and a
    second `POST` correctly synced 0. Not verified: clicking the actual
    "Sync batch stock" button in a real browser — same sandbox
    limitation as steps 13–14's open item.
- **Step 16** (Sales backend): done. New route `server/routes/sales.js`,
  mounted in `server/index.js`: `GET /api/sales` returns a month's
  matrix (one row per active dish, a `days` map for every day of the
  month), `PATCH /api/sales` upserts or clears one cell's `MANUAL` row.
  New schema addition: a partial unique index scoping "one row per
  cell" to `MANUAL` only, so a future `LOYVERSE` sync isn't constrained.
  See `changelog.md`'s step-16 entry for full detail, including two doc
  conflicts resolved this session (a stale `data-model.md` line, and
  `sales` missing from `scope.md`'s deferred-logging list) and an
  interaction bug the full-suite re-run caught and fixed (step 15's own
  test had assumed something step 16's new index now forbids).
  - **Verified**: 13/13 new tests in `sales.test.js` (mirrored-logic
    style), full suite re-run at 9/9 files green, AND a live end-to-end
    check against a real booted server — create, upsert-replace (single
    row confirmed, not a duplicate), clear via `quantity: null`, and
    negative-quantity rejection, each confirmed by direct DB read after
    the real HTTP call. Not verified: the step-17 grid UI doesn't exist
    yet (this step is backend + tests only, per its own scope), so
    there's nothing to click-test yet.
- **Step 17** (Sales frontend): done. New page `public/sales.html` —
  monthly grid, rows = active dishes, columns = days of the selected
  month, on top of step 16's `GET`/`PATCH /api/sales`. Confirm-on-
  override: editing an already-filled cell (including clearing it)
  prompts before saving; a fresh entry into an empty cell doesn't.
  "Sales" added to nav on all seven pages; the new page also gets
  `command-panel.js` + `commands/sync-batch-stock.js`, matching step
  14's "any tab" scaffold.
  - **Verified**: `node --check` on the extracted inline script, plus a
    live end-to-end check against a real booted server — confirmed the
    page serves with the right nav/scripts, confirmed the six existing
    pages' nav picked up the new link, and replayed the exact
    `GET`→`PATCH`→`GET` sequence the page's own JS performs, checking
    the response shape at each step matches what `renderGrid()`/
    `onCellChange()` expect. No new automated tests — frontend-only,
    same precedent as steps 11/13/14. **Not verified**: an actual
    browser click-through of the grid or the confirm-dialog interaction
    — no headless browser available in this sandbox, same open item as
    steps 13–15's.
- **Step 18** (BATCH_PREPPED over-sold warning): done. New route
  `GET /api/commands/oversold-check` (read-only) + new frontend file
  `public/commands/oversold-check.js`, registered on all seven pages.
  Flags `(restaurant, dish, date)` combos where a `BATCH_PREPPED` dish's
  same-day sold exceeds same-day prepped. **Interpretation call made
  explicitly** (see `changelog.md`'s step-18 entry): reads "available
  prepped portions" as same-day only, not the fuller running portion
  balance `computeDishAudit` computes, since the latter depends on
  `portion_ending_actual` having real data — which it never does yet
  (step 11), so a check built on it would never fire. Small scaffold
  tweak: added `white-space: pre-wrap` to `command-panel.js`'s
  `.cmd-result` CSS so a multi-line warning list actually shows as
  multiple lines.
  - **Verified**: 6 new tests in `commands.test.js` (13/13 total in
    that file), full suite re-run at 9/9 files green, AND a live
    end-to-end check — seeded a real prepped/sold mismatch via a booted
    server, confirmed the correct shortfall came back, confirmed a
    clean state returns zero, confirmed by direct DB read that the
    check itself writes nothing, and confirmed the script is served on
    every page. Not verified: an actual browser click on the button —
    same sandbox limitation as every frontend step this session.
- **Step 19** (Restaurant B/FC onboarding): done. New
  `server/db/seed-data-B.json` extracted directly from
  `FC_MasterAudit.xlsx` (13 real meats, 34 real dishes, 35
  `recipe_bom` links — 46 unused placeholder dish rows in the source
  correctly excluded, not silently included). `seed.js` refactored to
  loop over any number of restaurant seed files, not hand-duplicated.
  Deliberately scoped narrow, per the project owner: FC's own local
  catalog only, no Commissary cross-referencing — steps 20-22's open
  design questions don't block this.
  - **Verified**: full suite 9/9 files green, `seed.js` re-run twice
    live confirming idempotency, and a live server check — both
    restaurants list correctly, FC's mixed Landing grid returns the
    right shape (13 MEAT rows including Bagnet as FC's own stock item,
    1 DISH row for the Batch-Prepped Chicken Skewers).

**Everything through step 20b is on real `main`, pulled and confirmed
2026-08-29** — steps 10 through 19, all the architecture-discussion docs
commits (steps 20-22's ongoing design conversation), step 20a's schema
addition, and step 20b's Commissary audit engine + read route. No
local-only or uncommitted work remains anywhere. The two decisions worker
1 flagged from step 20a (no activity-log wiring on
`commissary_stock_receipts`; preset scoping to one
`(commissary_meat_id, restaurant_id)` pair) were both reviewed and
confirmed correct — see the step-20 entry below for detail. **Two more
decisions flagged from step 20b were also reviewed and confirmed
correct** (no `commissary_adjustments` table exists yet, so
`expectedEnding` always equals `endingCalculated` for now — correct,
that's new scope, not something to infer; the GET route's
always-an-array shape genuinely mirrors the existing
`/commissary/yield-log` convention, not an arbitrary choice) — see the
step-20b entry below for detail.

**Step 20 is fully closed out** (including the `commissary_shipment_presets`
piece 20c deferred, closed 2026-08-29) — see the top of this file and
its roadmap entry below for the full breakdown. Still explicitly
deferred as its own follow-up: a preset-*authoring* admin UI (see the
20c roadmap entry). **Next up: step 21 or 22** (both still drafts under
discussion, not committed designs) — or the preset-authoring UI
follow-up, if the project owner wants that picked up before 21/22.
Distribution follows rule 18: pull from `main` directly, review, resolve
any flags, write the *single next* worker prompt, hand off a fresh repo
— not a batch of prompts for several steps at once. If you're a fresh
session with no memory of how this worked in practice, rules 18 and 19
in `rules-for-claude-code.md` are the complete description; this
paragraph is just the current pointer into that flow.

## WIP hand-offs are now allowed (experimental — see rule 17)

Until 2026-08-28 the implicit policy was "land a whole tested step or
land nothing," which is exactly what turned step 9's usage cutoff into a
**total** loss instead of partial progress that the next session could
pick up. That's now flipped: **a partial, honestly-labeled commit is
better than no commit**, provided it follows rule 17 in
`rules-for-claude-code.md` — `wip:`-prefixed commit message, nothing
previously-working left broken, full existing test suite still green,
and a precise status update here.

This is marked experimental on purpose — it's a real change from how
step 9 was handled, it hasn't been tested across many sessions yet, and
it should be revisited (tightened or dropped) if broken hand-offs start
costing more time than they save.

**Status legend used below and in the "Where things stand" list**:
- **Not started** — no code exists for this step yet.
- **WIP** — some code exists, doesn't fully satisfy the step yet; the
  step's own list entry says exactly what's done, what's not, and what's
  untested. Read that before touching anything.
- **Done** — implemented, tested, committed, matches its own step text.

**If you're the session that picks up a WIP step**: read its done/not
done/untested breakdown below, verify the existing test suite still
passes at the current commit (rule 17 requires it did when committed,
but confirm), then continue from there — don't re-plan the step or
second-guess decisions already made, per rule 3.

## Known open items (not the next step's problem, just not forgotten)

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

## Remaining scope (steps 10–19)

Re-split on 2026-08-28 from the old 3-item "steps 10–12" list, per rule
16 in `rules-for-claude-code.md`. Two things changed from how this list
used to work, both worth reading before starting any step below:

1. **Each step's own text is the whole task, not a pointer to a design
   doc.** Step 9 had a fully-written spec across two docs and still took
   a session to a total loss before it landed — a complete blueprint
   doesn't make "build the whole feature" the right size for one
   session. Where a step below references a doc, that's background, not
   the assignment; the assignment is the sentence describing the step.
2. **A step doesn't have to fully succeed to be worth committing** — see
   "WIP hand-offs" above. Each step below is still sized to comfortably
   fit one session with margin, same as before; WIP is the fallback for
   when that estimate is wrong, not the new target.

Status tags below: **Not started** (default for everything not yet
begun), **WIP**, **Done**. Only step 10 onward is listed here — steps
1–9 are already covered in "Where things stand" above.

Notice the command panel (old step 12) moved earlier, to before Sales —
Sales' over-sold warning (step 18 below) needs somewhere to surface
through, so building the command panel after it would've meant either
building Sales twice or quietly growing step 11 back into a multi-part
step. Sequencing steps so each one's dependencies already exist is part
of sizing them correctly, not a separate concern.

10. **[Done] Landing backend: unify the read endpoint into one
    mixed grid.** See "Where things stand" above for detail.
11. **[Done] Landing frontend: render the mixed grid.** See "Where things
    stand" above for detail, including the dish-rows-are-read-only
    decision and the not-yet-pushed caveat.
12. **[Done] Opening-stock fix.** See "Where things stand" above for
    detail.
13. **[Done] Live recalculation on Landing.** See "Where things stand"
    above for detail, including the New-Stock/Usage scope note.
14. **[Done] Command panel scaffold.** See "Where things stand" above
    for detail, including the rule-10 scope note.
15. **[Done] First real command: "Sync batch stock."** See the
    2026-08-29 changelog entry for full detail, including a scope
    decision made this session (narrow `activity_log` exception for
    `prepped`, written into `scope.md` and `data-model.md` section 11).
16. **[Done] Sales backend.** See the 2026-08-29 changelog entry for
    full detail, including two doc conflicts resolved this session (the
    stale "Loyverse only" line in `data-model.md`, and `sales` missing
    from `scope.md`'s deferred-activity-logging list) and an interaction
    bug the full-suite re-run caught between this step and step 15.
17. **[Done] Sales frontend.** See the 2026-08-29 changelog entry for
    full detail — new `public/sales.html`, confirm-on-override behavior,
    "Sales" added to nav on all seven pages.
18. **[Done] BATCH_PREPPED over-sold warning.** See the 2026-08-29
    changelog entry for full detail, including an interpretation call
    made explicitly: reads "available prepped portions" as same-day
    prepped only, not the fuller running portion balance, since the
    latter depends on `portion_ending_actual`, which has no write path
    anywhere in the app yet — a check built on it would be dead code
    today. Worth revisiting once a portion-count entry UI exists.
19. **[Done] Restaurant B (FC) onboarding.** Scoped deliberately narrow
    per the project owner 2026-08-29: seed FC's own local catalog only,
    no cross-referencing to Commissary — steps 20-22's design questions
    don't block this, confirmed independently true.

    New `server/db/seed-data-B.json`, extracted directly from
    `FC_MasterAudit.xlsx` (not hand-typed): 13 real meats (`M14`-`M16`
    were blank rows in the source, excluded), 34 real dishes (46
    "New Dish NN (rename me)" placeholder template rows in the source
    sheet excluded — not a data error, just an unfinished part of FC's
    own workbook, worth knowing about), 35 real `recipe_bom` links.
    `Chicken Skewers` (`D022`) is the one `BATCH_PREPPED` dish, correctly
    has no `recipe_bom` row (matches the pattern — portions drive it,
    not a direct meat link) — and matches exactly what the project owner
    described earlier about Whole Chicken's fan-out, good independent
    corroboration from the raw data.

    `server/db/seed.js` refactored into a reusable `seedRestaurant()`
    function, looped over both `seed-data.json` (Restaurant A) and the
    new `seed-data-B.json` — adding a third restaurant later is a new
    JSON file plus one line in the filenames array, no other code
    change, which is what "no new code expected" in this step's
    original description turned out to actually mean. Also fixed a
    stale comment (claimed "only 3 hand-verified commissary meats,"
    contradicted its own very next `console.log` line saying 14 — the
    real count, confirmed correct back in the step-9 session).

    **Verified**: full suite re-run at 9/9 files green (no regressions
    from the seed.js refactor), a live re-run of `seed.js` twice
    confirming idempotency (0 inserted the second time, for both
    restaurants), and a live server check — `GET /api/restaurants` shows
    both restaurants, `GET /api/daily-audit/mixed?restaurant_id=2` for
    FC returns 13 MEAT rows + 1 DISH row with the right shape, Bagnet
    correctly appears as FC's own local stock item (not remapped to
    Commissary), matching step 20's onboarding decision exactly.
20. **[Done, 2026-08-29 — core work complete across all of
    20a/20b/20c plus the presets follow-up; one small piece (a
    preset-authoring admin UI) still explicitly deferred, see the 20c
    bullet below] Give
    Commissary its own Landing-style audit, and replace the too-rigid
    `commissary_meat_map` with a real shipment/allocation event.**
    Grounded in three real sources checked 2026-08-29, not guessed:
    `Commi_Audit_Master.xlsx`'s `Commissary_Stock`/`Yield_Log`/
    `Outbound_Log` sheets, the project owner's description of the real
    process, and `UPDATED_PARDZ_INV_Commi.xlsx`'s "Remake V3" sheet — an
    auditor-run paper version of exactly this that's already in use.

    **What Remake V3 actually shows**: a top table per Commissary meat
    (Beginning / Stock In / Backed Up / [destination]-Out, one column
    per kitchen: FC, Silingan, and presumably Likod / not yet a column
    here / Ending — **a real physical count**, not the always-computed
    balance `Commissary_Stock` has today). Below it, one sub-table per
    destination kitchen, breaking that kitchen's shipment into named
    portions (Jowl → Bagnet/Sisig/Sinigang/Dinuguan for FC, etc.). This
    resolves the open question from the prior session: **portioning
    happens at shipping/allocation time, not at the raw→processed
    Backed-Up step** — Backed Up stays a plain 1:1 yield (unchanged
    engine), and only the outbound side needs new modeling. FC's own
    sub-table still lists plain "JOWL" as one of its own rows too — raw
    and portioned shipments of the same underlying meat coexist, matches
    "dynamic, not a fixed formula."

    **Concrete schema gap, confirmed by reading `schema.sql` directly,
    not assumed**: `commissary_meat_map` has
    `UNIQUE (commissary_meat_id, restaurant_id)` — it hard-assumes one
    commissary meat maps to exactly one destination meat per restaurant.
    That's precisely what Jowl→four-FC-items breaks. This table's job
    needs to change from an enforced mapping to, at most, a loose
    autofill reference — or be replaced outright by the shipment
    concept below.

    **Draft table shapes (react-to, not final)**:
    - `commissary_ending_actual` (mirrors `ending_actual`) — the real
      physical count Remake V3 already collects on paper but the app
      has nowhere to put today. Closes the "trusted, never audited" gap
      directly.
    - `commissary_opening_stock` (mirrors `opening_stock`, step 12's
      pattern) — first-ever beginning value per commissary meat; every
      day after derives from the prior day's `commissary_ending_actual`,
      same as restaurants.
    - `commissary_stock_receipts` — raw meat arriving at Commissary from
      an outside supplier ("Stock In"). Distinct from the existing
      `stock_receipts` table, which is restaurant-facing; this is
      Commissary receiving, not a restaurant receiving.
    - `commissary_shipments` (id, commissary_meat_id, restaurant_id
      destination, business_date, total_quantity, notes, ...) — one row
      per outbound batch, `total_quantity` feeding the top table's
      matching "[Kitchen]-Out" column and thus Commissary's own usage.
    - `commissary_shipment_lines` (shipment_id, meat_id — the
      *destination restaurant's own* meat row, e.g. FC's "Bagnet" —
      quantity) — the named-portion breakdown. **Each line, on save,
      also writes a normal `stock_receipts` row for the destination**
      (source='COMMISSARY', `commissary_meat_id` set) — reuses existing,
      already-tested destination-side mechanics unchanged; nothing new
      needed there.
    - Reconciliation between a shipment's `total_quantity` and the sum
      of its lines is informational only, not enforced — different
      units on each side (kg of Jowl vs. portion-units of Bagnet) make a
      strict equality check not generally meaningful anyway, and an
      enforced check would contradict "dynamic, no static formula."
    - Settings-managed `commissary_shipment_presets` (+ preset lines) —
      the "quick formulas" the project owner asked for, pure autofill
      for the entry form, never authoritative; the auditor can always
      change every number before saving.
    - Auto-computed output-percentages for a future management
      dashboard — derived on read from `commissary_shipment_lines` vs.
      `total_quantity`, never feeding back into any audit-engine
      calculation. Not urgent, no new table needed yet.

    **Migrate-vs-extend — RESOLVED 2026-08-29**: extend, not migrate.
    "Commissary is the root" was the project owner's own framing —
    Commissary's own tables get built out first-class, restaurants build
    onto that, rather than folding Commissary into `restaurants` to
    inherit machinery that (per the analysis above) wasn't going to be
    free anyway.

    **Shipment-logging UI — RESOLVED 2026-08-29**: its own dedicated
    page, like Stock Receipts. Not the Command Panel widget. See step 21
    below for how the Command Panel itself is evolving instead.

    **`commissary_meat_map`'s fate — RESOLVED 2026-08-29, then FULLY
    RETIRED 2026-08-29 (later same day, next architecture session)**:
    originally "leave it alone, vestigial but untouched" (below) — that
    stance is now superseded. On review, the project owner identified a
    cleaner resolution than partial retirement: once Commissary always
    names the destination restaurant at shipment time (a required field
    on `POST /api/commissary/shipments`), there is no remaining
    legitimate scenario where a human manually types "this is a
    COMMISSARY receipt" into the restaurant Stock Receipts form — that
    manual path only ever existed *before* Shipments could do it
    properly. This includes the "Unallocated → assign later" feature
    (`stockReceipts.js`'s `PATCH` assignment flow, `commissary_meat_map`
    lookup in 3 places: initial `POST`, `PATCH`-assign, `PATCH`-edit) —
    not just the simpler duplicate case. Even the "what if Commissary
    forgets to log a shipment" edge case argues for full retirement, not
    a partial keep: the correct fix for a missed shipment is a
    *retroactive Shipment entry* (dated appropriately), which updates
    both Commissary's own usage record and the destination's stock
    together — a manually backfilled `COMMISSARY` stock_receipts row
    would update only the restaurant's side, recreating exactly the
    untracked mismatch this whole redesign exists to eliminate.

    **Decision**: the manual Stock Receipts form should only ever mean
    `DIRECT` (an outside-supplier purchase). `COMMISSARY`-sourced
    `stock_receipts` rows should only ever be written as a side effect
    of a real Shipment (`POST /api/commissary/shipments`'s per-line
    write, already built in 20c) — never typed by a human directly.

    **Not yet built — this is a design decision, not a completed
    step.** What a coder session should do once picked up: remove the
    `commissary_meat_map` lookup/rejection logic from all three call
    sites in `server/routes/stockReceipts.js` (initial `POST` with
    `source=COMMISSARY`+restaurant+meat; `PATCH` assignment of a
    previously-Unallocated row; `PATCH` edit of an already-allocated
    row's source to `COMMISSARY`) — restaurant-scoped manual entry
    should simply no longer accept `source=COMMISSARY` at all, only
    `DIRECT`; remove the whole "Unallocated" receipt concept alongside
    it, since it only ever existed to support this now-retired manual
    path; remove `commissary_meat_map`'s admin CRUD from
    `server/routes/settings.js` and its "Commissary Mappings" section
    from `public/settings.html`; update `stockReceipts.test.js` and
    `settings.test.js` to match (several existing tests assert the
    *old* behavior and will need rewriting, not just deleting); leave
    the `commissary_meat_map` **table itself** in `schema.sql` untouched
    (don't `DROP TABLE` — no destructive schema changes, matches this
    project's existing caution about schema.sql edits) even though
    nothing will read or write it anymore. Update
    `commissary-and-stock-receipts.md` and `data-model.md`'s
    `commissary_meat_map` sections to describe this as retired, not
    active. Full suite must stay green throughout — this touches
    validation logic multiple existing tests depend on, exactly the
    kind of change that needs the regression-catching discipline rule
    19 describes, not a quick unverified edit.

    **Split into three sequential sub-steps for handoff — too large for
    one session, per rule 16's step-sizing philosophy**:
    - **20a [Done, 2026-08-29] (schema only)**: added the six new tables
      (+ one preset-lines child table = 7 total) to `schema.sql`. No
      engine, no routes, no UI. Verified: schema creates cleanly in an
      in-memory DB, all FKs resolve, `commissary_meat_map` confirmed
      untouched, a fresh `seed.js` run (twice, confirming idempotency)
      works unchanged, and the full existing test suite re-run at 9/9
      files green (110/110 assertions, 0 regressions) — expected, since
      nothing existing references these new tables yet. Two decisions
      flagged for the architect conversation rather than assumed
      unilaterally, see `changelog.md`'s step-20a entry: (1)
      `commissary_stock_receipts` deliberately has no `deleted_at`/
      activity-log wiring, since rule 9 scopes that pattern to
      `stock_receipts`/`commissary_yield_log` only; (2)
      `commissary_shipment_presets` was scoped to one
      `(commissary_meat_id, restaurant_id)` pair, inferred from Remake
      V3's layout — the draft below never states this explicitly. Not
      committed to git this session — worked from an uploaded zip, no
      `.git` present, same limitation as steps 12-19's sessions; whoever
      has git access should commit this as-is (it's a complete, tested,
      non-WIP change) before starting 20b.
      **Both flagged decisions resolved 2026-08-29**: (1) confirmed
      correct — `commissary_stock_receipts` added to `scope.md`'s
      deferred-logging list, same treatment as `sales` got in step 16.
      (2) confirmed correct — the preset scoping matches Remake V3's
      real layout exactly (one sub-table per destination kitchen, each
      with several named output lines for that meat→kitchen
      combination). No schema change needed either way, just wasn't
      written down explicitly before — now it is.
    - **20b [Done, 2026-08-29] (Commissary audit engine + read route)**:
      new `server/engines/commissaryAuditEngine.js` —
      `computeCommissaryMeatAudit` mirroring `computeMeatAudit`'s
      beginning/inflow/usage/ending/variance shape, with Stock In
      (`commissary_stock_receipts`) and Backed Up
      (`commissary_yield_log.backed_weight_out`) as two separate inflow
      fields (not merged into one "new stock"), and usage summed across
      every destination restaurant's shipments for that meat/date
      (`commissary_shipments.total_quantity`, not sales×recipe). Beginning
      derives from prior-day `commissary_ending_actual`, falling back to
      `commissary_opening_stock` only on the meat's first tracked day
      (step 12's pattern). New `GET /api/commissary/daily-audit?date=&
      commissary_meat_id=` in `server/routes/commissary.js`, always
      returning an array (all active commissary meats for the date, or
      one if `commissary_meat_id` is given) — mirrors
      `GET /api/commissary/yield-log`'s existing optional-filter
      convention in that same file.
      **Two decisions flagged for the architect conversation, not
      assumed unilaterally** (full detail in `changelog.md`'s step-20b
      entry): (1) no commissary-side adjustments table exists among
      step 20a's six tables, so `expectedEnding` always equals
      `endingCalculated` and `unexplainedVariance` always equals
      `variance` right now — both fields are still returned for shape
      parity with `computeMeatAudit`, but they're currently redundant,
      a real gap from "same as every other actual-vs-calculated
      comparison in this app," not a silently-invented adjustments
      source. (2) the GET route's always-an-array shape was this
      session's call on the "one meat/date at a time, or a mixed-grid
      -style list" open question — chosen to match
      `/commissary/yield-log`'s existing convention rather than
      switching to a single object when `commissary_meat_id` is given;
      worth a second look before a future UI depends on it.
      **Verified**: `server/engines/commissaryAuditEngine.test.js`,
      11/11 assertions, real hand-calculated numbers (JOWL:
      beginning=10, stockIn=5, backedUp=3, usage=3.5 →
      endingCalculated=14.5, matches actual → OK; plus day-2
      carry-forward, shortage, surplus, missing-actual,
      missing-beginning, unfiltered list excluding inactive meats, and
      the single-meat filter). Also verified live against a real booted
      server (fresh seeded `inventory.db`, `node server/index.js`,
      curl) — the live route returned the exact same hand-calculated
      numbers as the test file, and the `backed_weight_out` fixture was
      written through the real `POST /api/commissary/yield-log` route
      (not raw SQL) to exercise that inflow through actual app code, not
      just the mirrored engine. Full existing suite re-run after:
      **10/10 files green, 121/121 assertions, 0 regressions.** Repo was
      reachable via `git clone` this session (no zip fallback needed);
      pushed straight to `main` per rule 18.
    - **20c [Done, 2026-08-29 — pushed to `main` and independently
      verified live by the architect conversation] (shipment logging:
      write route + page)**: new `POST /api/commissary/shipments` in
      `server/routes/commissary.js` — one `commissary_shipments` row + N
      `commissary_shipment_lines` rows in one transaction, each line ALSO
      writing a normal `stock_receipts` row for the destination
      (`source='COMMISSARY'`, `commissary_meat_id` set) via the exact
      same table/columns `POST /api/stock-receipts` already uses — reused
      unchanged, not reinvented, per the step's own instruction. Each
      `stock_receipts` write gets its own `activity_log` CREATE in the
      same transaction (rule 9); `commissary_shipments`/
      `commissary_shipment_lines` themselves get none (not in rule 9's
      scope, same treatment `commissary_stock_receipts` got in 20a). All
      validation (active commissary meat, active restaurant, every
      line's meat belongs to that restaurant and is active) happens
      up-front, before the transaction opens, so a bad line fails clean
      with nothing written — confirmed by a dedicated test. No
      `commissary_meat_map` lookup anywhere in this route — matches
      "commissary_meat_map's fate" above: the auditor picks the
      destination meat live in the form. No reconciliation enforced
      between `total_quantity` and the line sum (informational only, per
      the step's own instruction — different units on each side).

      New dedicated page `public/commissary-shipments.html` (own page,
      not the Command Panel — per the already-resolved "Shipment-logging
      UI" note above). Form: date, source commissary meat, total
      quantity, a read-only context block (beginning/stockIn/backedUp/
      "shipped out so far", pulled from step 20b's `GET
      /api/commissary/daily-audit` on meat/date change — so the auditor
      isn't typing blind, re-fetched after save so it reflects the new
      shipment immediately), destination restaurant, 1+ output lines
      (destination meat from the *existing* `GET /api/stock-receipts/
      meats?restaurant_id=` route — no new GET route needed — plus
      quantity, add/remove), an informational "Lines total: X (shipment
      total: Y)" hint that never blocks Save, notes. "Shipments" added to
      nav on all seven existing pages + the new page itself.

      **`commissary_shipment_presets` / `commissary_shipment_preset_lines`
      (the "quick formulas" autofill) — closed out 2026-08-29, see this
      session's `changelog.md` entry.** Originally deferred out of 20c
      (already the largest of the three 20a/20b/20c sub-steps) as a
      follow-up, not silently dropped — then built in a dedicated
      follow-up session. **Done**: `GET`/`POST`/`PUT /api/commissary/shipment-presets` in
      `commissary.js`, and the "Load preset" control on
      `commissary-shipments.html`. **Still explicitly deferred as its
      own (smaller) follow-up**: a preset-*authoring* admin UI (a settings page
      or section to create new presets through the browser, not just
      consume existing ones) — presets can be created via the API
      today (see the new tests and the live curl verification in this
      session's changelog entry), but there's no in-app form for it
      yet. Smallest reasonable shape for that follow-up is likely a
      small section on `settings.html`, since presets are
      settings-managed data — the CRUD routes it would need already
      exist.

      **Verified**: new `server/routes/commissary.test.js`, 17/17
      assertions, mirrored-logic style (same convention as
      `commands.test.js`/`stockReceipts.test.js`) — covers missing/
      invalid fields, no lines, unknown/inactive commissary meat,
      unknown/inactive restaurant, a line's meat belonging to a
      different restaurant or being inactive, a valid two-line shipment
      landing both the shipment+lines and both destination
      `stock_receipts` rows correctly, sum-of-lines allowed to differ
      from `total_quantity` with no rejection, each `stock_receipts`
      write getting its own `activity_log` CREATE,
      `commissary_shipments`/`commissary_shipment_lines` correctly
      getting zero `activity_log` entries, the new receipts feeding a
      `getNewStock`-style sum for the destination, and a rejected line
      rolling back cleanly with nothing written. **Environment
      limitation, flagged rather than hidden**: no network this session
      (`git clone`/`npm install` both 403'd, zip fallback used, same as
      steps 12–19's sessions), so **no live Express server was possible**
      — beyond the mirrored-logic test file, verification is a hand-run
      script that exercises the REAL `commissaryAuditEngine.js` and the
      EXACT transaction code copied from the actual route (not
      re-derived) against a real in-memory DB, confirming `usage` moved
      from 0 to 9 after a two-line shipment and the destination's
      `stock_receipts` landed correctly — real production code, just
      without an HTTP layer. Full suite re-run: **11/11 files green,
      138/138 assertions, 0 regressions** (was 121). **The live-HTTP
      smoke test this session couldn't do was completed afterward by
      the architect conversation**: booted a real server, `POST`'d a
      real two-line shipment (Jowl → FC's Bagnet + Sisig), confirmed
      usage moved 0→9 via `GET /api/commissary/daily-audit`, confirmed
      both destination `stock_receipts` rows landed with the correct
      `source`/`commissary_meat_id`, confirmed `activity_log` uses
      `source: 'MANUAL'` correctly for this human-triggered write (not
      `SYSTEM`, which is reserved for background jobs like
      `sync-batch-stock`'s). Only a browser click-through of the new
      page's actual UI remains unverified — same open item every
      frontend step in this project has carried, no headless browser
      available in any sandbox used so far.

    **Scope relative to step 19**: still doesn't block Restaurant B
    onboarding. FC's Bagnet/Sisig/Sinigang/DNG/etc. get onboarded as
    FC's own local stock items regardless of how this design lands —
    additive on top, not a prerequisite. Sequencing is the project
    owner's call.

21. **[Done, 2026-08-29 — built as 21a+21b] A second, bigger
    Command surface: a dedicated console/terminal page, separate from
    the step-14 floating widget.** Requested 2026-08-29. The floating
    panel (steps 14/15/18) stays exactly as it is — quick, single-click,
    "any tab" micro-actions. This is a *different*, full-page surface
    for people who'd rather type than click through forms, aimed
    specifically at Commissary's shipment logging first (Commissary is
    "more dynamic" than the restaurants, which are "more on the static
    side" — project owner's framing) — not a general command line for
    every screen on day one.

    **Standing constraint, unchanged**: the terminal must call the
    *same* backend endpoint the GUI form does — the real
    `POST /api/commissary/shipments` route (`server/routes/commissary.js`)
    added in step 20c — so it's a second input surface on one data path,
    never a parallel system that could drift out of sync with what the
    form writes. No new backend route is expected for this step; if a
    session finds it genuinely needs one, flag it rather than adding it
    unilaterally.

    **Command style — RESOLVED 2026-08-29**: Discord-slash-command style,
    not strict CLI-flag syntax and not a separate multi-screen wizard.
    One input line; a hint bar above it and a filtering dropdown update
    live as the user types, based on which "slot" the cursor is
    currently in. This is a small state machine keyed on token position,
    not a natural-language parser — no grammar/synonym handling needed.

    **Slot sequence for the `ship` command** (the only command this step
    builds):
    1. `ship` — literal keyword, typing it opens the command.
    2. `<commissary-meat>` — dropdown of active commissary meats (Jowl,
       Whole Chicken, ...), filtered as the user types.
    3. `<restaurant>` — dropdown of destination restaurants (FC,
       Silingan, Likod once onboarded), filtered as the user types.
    4. `<total-qty>` — free-numeric entry, no dropdown.
    5. One or more `<line-name>:<qty>` pairs — **prefilled from
       `commissary_shipment_presets`** for the
       `(commissary_meat_id, restaurant_id)` pair already chosen in
       slots 2–3 (e.g. once Jowl+FC are picked, the hint bar already
       shows `bagnet:_ sisig:_ sinigang:_ dng:_` as fillable slots
       instead of the user having to know or type the names). The
       auditor can still add a line name the preset doesn't have, or
       drop one it does — presets are autofill, never enforced, same
       principle as the GUI form.
    6. Enter submits the finished line to
       `POST /api/commissary/shipments`, exactly the payload shape the
       GUI form already sends. A malformed or unmatched token at any
       slot keeps the hint bar showing that slot's expected type/options
       rather than silently guessing — the user corrects that token and
       continues, they don't restart the line.

    **Scope for v1 — RESOLVED 2026-08-29**: `ship` only. The existing
    step-15/18 floating-panel commands (sync-batch-stock, oversold-check)
    are **not** ported into the terminal — the floating panel already
    serves those well as single-click actions, and folding them in now
    would mean a second, differently-shaped slot sequence per command
    for no real UX gain. Revisit only if real usage shows people
    actually want more command coverage here.

    **History — RESOLVED 2026-08-29**: in scope for v1, not deferred.
    Up-arrow recalls recent submitted commands (in-memory or
    localStorage, no backend storage) — cheap enough that there's no
    reason to split it out as its own follow-up.

    **Autocomplete/hint-bar — RESOLVED 2026-08-29**: this is not a
    separate polish item to defer; it *is* the feature that makes the
    Discord-style approach work instead of being a bare text box. Ships
    with the first build, not after.

    **Split into two sequential sub-steps for handoff, same pattern as
    step 20**:
    - **21a [Done, 2026-08-29 — verified live by the architect session
      after the worker handoff, see breakdown below] (terminal shell +
      slot state machine, no live submission yet)**: new
      `public/terminal.html` with the input line, hint bar, dropdown,
      and slot-position tracking wired for the `ship` command's five
      slot types above, plus up-arrow history. Submitting a complete
      line `console.log`s the assembled payload for now rather than
      actually calling the API — mirrors step 14's "prove the plumbing
      works before the real command" pattern. No backend changes.

      **Built by the worker**: input line, hint bar, filtering dropdown,
      and a state machine keyed on committed-token count for all five
      slots (`ship` literal, `<commissary-meat>`, `<restaurant>`,
      `<total-qty>`, one-or-more `<name:qty>` pairs). Up/down-arrow
      history via `localStorage` (`terminal_command_history`, last 25),
      falling back to dropdown navigation when a dropdown is open. Enter
      on a complete valid line assembles the payload and `console.log`s
      it (plus an on-page "Last logged payload" panel) — does not call
      the API, per the step's own boundary. `business_date` defaults to
      today (not one of the five named slots — flagged, not silently
      assumed, see changelog). Line-name resolution (slot 5) looks up
      the destination restaurant's real active meats via the existing
      `GET /api/stock-receipts/meats?restaurant_id=` — ordinary lookup,
      not the preset-prefill 21b is scoped to add. "Terminal" nav link
      added to all 8 existing pages.

      **Added directly by the architect session, same day, before
      21b**: a persistent slot guide above the hint bar
      (`renderSlotGuide`/`computeSlotStatus` in `terminal.html`) — the
      project owner found the original hint-bar-only design hard to
      follow once past a slot, since the hint disappears as soon as the
      cursor moves on. The guide shows all five slots at once: filled
      ones in green with their resolved value, the active one
      highlighted, upcoming ones dimmed, and the first bad token flagged
      red in place (e.g. `commissary-meat: "badmeat"?`) rather than
      silently letting later slots look reachable. Reuses
      `resolveExact`/`validateLinePair` exactly as `validateCommitted`
      does, so it can't disagree with what the hint bar or Enter would
      say about the same token. This wasn't in the original step 21
      design (which only specified a hint bar + filtering dropdown) —
      noted here as a same-day addition, not retroactively written into
      the design section above.

      **Not done**: nothing scoped to 21a is missing — 21b's real
      submission + preset-prefill remain untouched, as intended.

      **Verified live, 2026-08-29 (architect session, after the worker
      handoff)**: worker's diff pulled from `main` and independently
      checked rather than trusted from the transcript alone. `node
      --check` on the extracted inline script (clean, both before and
      after the slot-guide addition). Full backend suite re-run fresh
      from a clean clone: **11/11 files, 154/154 assertions, 0
      regressions** (twice — once at the worker's handoff point, once
      again after the slot-guide patch). Payload assembly read
      side-by-side against `commissary.js`'s real
      `POST /api/commissary/shipments` handler and confirmed to match
      the expected shape field-for-field, not just against the docs'
      description of it. Booted the real server against freshly-seeded
      data and hit `/api/commissary/meats`, `/api/restaurants`, and
      `/api/stock-receipts/meats?restaurant_id=` — all endpoints
      `terminal.html` depends on return real, usable data, and
      `GET /terminal.html` itself serves 200 with the new markup
      present. The slot state machine and the new slot guide were both
      exercised with a Node `vm`-context simulation (a real script
      execution with proper `let`/`const` scoping, not hand-copied
      logic) driving `updateStateMachine()` through the full happy path
      and several error paths (unknown commissary meat, unknown
      restaurant, negative quantity, unknown destination meat) —
      confirmed the guide correctly freezes at the first bad token
      instead of showing later slots as reachable.

      **Still genuinely untested**: no actual browser click-through with
      a mouse/keyboard (no headless browser available in any sandbox
      used so far — a real, standing gap, not a formality). The `vm`
      simulation above exercises the same code paths a real browser
      would but isn't a substitute for someone actually clicking through
      it once.
    - **21b [Done, 2026-08-29 — built and verified live by the architect
      session, same day as 21a's verification] (real submission +
      preset-prefill)**: wires the completed `ship` line to the actual
      `POST /api/commissary/shipments` call, and wires slot 5's prefill
      to `commissary_shipment_presets` for the chosen meat+restaurant
      pair.

      **Real submission**: `handleSubmit` now `fetch`es
      `POST /api/commissary/shipments` with the assembled payload,
      disabling the input while the request is in flight (prevents a
      stray keystroke firing a duplicate write against a live path).
      Three outcomes handled distinctly: network failure (input
      re-enabled, line preserved, explicit "was NOT sent" wording so the
      auditor never wonders if it went through); server-side rejection —
      HTTP non-2xx, e.g. an inactive/foreign meat_id (the real
      `{error: "..."}` message surfaced verbatim in the hint bar and
      status line, line preserved for a fix-and-resubmit, matching what
      the GUI form would do for the same bad input); and success (the
      real server response — `{ok, id, ...shipment, lines}` — shown in
      the renamed "Last saved shipment" panel, history updated, input
      cleared). The page's own copy and the "Last logged payload" panel
      (now "Last saved shipment") were updated to drop every 21a-boundary
      reference, since Enter is now a real write, not a preview.

      **Preset-prefill**: new `loadShipmentPresets(commissaryMeatId,
      restaurantId)` fetches `GET /api/commissary/shipment-presets` once
      both slot 1 and slot 2 resolve (tracked via a
      `lastPresetPairKey`, mirroring the existing `lastRestaurantId`
      pattern), merging every active preset's lines for that pair into
      one `meat_id -> default_quantity` map (first preset wins on a
      conflict — pure autofill, so a collision doesn't need stronger
      handling; the auditor can always overwrite the number). Slot 4's
      dropdown now shows preset-covered meats first, each already
      carrying its default quantity in the token (e.g. `bagnet:10`
      instead of a bare `bagnet:`), with a `(preset default N)` note in
      the sub-text and a one-line hint-bar mention of how many lines
      came from a preset. A meat with no matching preset line behaves
      exactly as it did in 21a — bare `name:` token, no default.

      **Verified live** (real server + real database, not mirrored
      logic): booted the app against freshly-seeded data, created a real
      preset via `POST /api/commissary/shipment-presets` (Jowl→FC,
      Bagnet default 10 + Sisig default 6), then drove the actual
      extracted `terminal.html` script through a Node `vm` context with
      a *real* `fetch` implementation (raw `http` requests against the
      live server, not a stub) — confirmed: (1) `shipmentPresetDefaults`
      populates correctly once both slots resolve; (2) the slot-4
      dropdown surfaces `bagnet:10`/`sisig:6` first, correctly tagged
      `hasDefault: true`, with the hint bar reporting "2 lines prefilled
      from a saved preset for this pair"; (3) a full valid line
      (`ship jowl fc 20 bagnet:10 sisig:6`) submitted via the real
      `handleSubmit()` actually created a `commissary_shipments` row +
      2 `commissary_shipment_lines` rows + 2 `stock_receipts` rows in
      the live database, returned the real server response, cleared the
      input, and updated history; (4) a submission referencing a
      foreign `meat_id` was correctly rejected by the server with the
      real error message surfaced in the UI, and — critically — the
      typed line was preserved rather than wiped on failure. Full
      backend suite re-run clean after these changes: **11/11 files,
      154/154 assertions, 0 regressions** (still frontend-only). Test
      database cleaned up after.

      **Still genuinely untested**: same standing gap as 21a — no real
      mouse/keyboard browser click-through. Everything above was driven
      programmatically through the real code paths against a real
      server, which is strong verification, but isn't the same as
      someone actually typing it.

      **Deferred, not forgotten**: the project owner proposed an
      AutoCAD-style layout — command bar docked bottom-center instead
      of top-of-page, with history reached both via up-arrow (already
      built) and a togglable slide-in sidebar for browsing further back,
      rather than the current always-visible history panel. Decided:
      non-modal (page content stays visible above the docked bar,
      unlike AutoCAD's more immersive feel), and the sidebar and the
      slot guide/dropdown don't compete for space since they sit on
      different axes (sidebar at the screen edge, guide/dropdown
      anchored to the input). Explicitly scheduled *after* logic/backend
      work is settled, not before — this note exists so it isn't
      silently dropped, not as a signal to start it next.

22. **[Done, 2026-08-29 — built by a fresh session and verified live]
    Merge Landing's In-House/Wastage/Other into one read-only
    "Allocations" cell, fed by a new dedicated Allocations page.**
    Requested 2026-08-29, framed explicitly as "do to Adjustments what
    the 2026-08-27 change already did to New Stock" — move detailed
    entry off Landing onto its own page, Landing shows a read-only sum.

    **Confirmed by reading the actual code before building anything**:
    this was smaller than it sounded. `computeMeatAudit` already only
    ever produced *one* summed `adjustments` number
    (`SUM(quantity) FROM adjustments WHERE ...`) — Landing's three boxes
    were a frontend-only illusion. Each one silently wrote to one
    specific hardcoded `adjustment_type` row (`Wastage`,
    `Staff Meal / In-House`, `Other / Uncategorized`) via
    `server/routes/dailyAudit.js`'s delete-then-insert helper. The
    seeded `adjustment_types` table already had three *more* real
    categories — `Allocation / Transfer`, `Spoilage`, `Damaged` — with
    no entry path anywhere in the app; the Allocations page finishes
    something the schema already promised, not just a Landing
    simplification.

    **Open question resolved before building, not assumed**: `locations`
    (needed for the `Allocation / Transfer` type's from/to fields) had
    zero rows and no admin UI at all — confirmed by querying it directly,
    not assumed from the schema. Flagged back to the project owner rather
    than picking a default unilaterally; decided: build minimal admin
    CRUD for both `adjustment_types` and `locations` now (new Settings
    tabs, name + a couple flags each), not deferred and not shipped with
    dead-end empty dropdowns.

    **Behavior change, deliberate, not incidental**: the old Landing
    boxes were a delete-then-insert singleton per (restaurant, meat,
    date, type) — at most one Wastage row per day, overwritten on every
    save. The new Allocations page is append-only, one row per entry,
    matching how `computeMeatAudit` already sums *every* row for that
    meat/date regardless of type. Two separate Wastage events the same
    day now both count instead of the second silently overwriting the
    first — verified live (see below), not just asserted.

    **What shipped**:
    - `schema.sql`/`migrate.js`/`connection.js`: `locations.active`
      added (a plain `ALTER TABLE ADD COLUMN`, not the rebuild-and-rename
      step 9's nullable-constraint change needed — a new column with a
      default doesn't require that).
    - `server/routes/settings.js`: full CRUD for Adjustment Types
      (`GET`/`POST`/`PUT /api/settings/adjustment-types`) and Locations
      (`GET`/`POST`/`PUT /api/settings/locations`), same pattern as the
      existing Meats/Dishes sections. Both are global lists, not
      restaurant-scoped — `adjustment_types` has no `restaurant_id`
      column at all, and `locations`' picklist needs to span every
      restaurant plus shared/central locations (e.g. the commissary) for
      a transfer to make sense.
    - New `server/routes/allocations.js`: `GET`/`POST /api/allocations`.
      Append-only per the behavior-change note above — no `PUT`/`DELETE`
      yet, matching `adjustments`' existing spot on `scope.md`'s
      deferred-activity-logging list (same treatment `sales`/
      `commissary_stock_receipts` already got). Validates active
      restaurant/meat/type, and — the one genuinely tricky bit — requires
      both `from_location_id`/`to_location_id` when the chosen type's
      `requires_transfer_locations = 1`, and *rejects* them (not silent
      ignore) when the type doesn't use them, on the theory that a client
      sending transfer fields for a plain Wastage entry is a bug worth
      surfacing. Reuses existing `GET /api/restaurants` and
      `GET /api/stock-receipts/meats?restaurant_id=` for its dropdowns
      rather than duplicating them.
    - `server/routes/dailyAudit.js`: `getMeatInputDecoration` no longer
      looks up in_house/wastage/other — just `remarks` now.
      `GET /api/daily-audit` explicitly adds `adjustments: audit.adjustments`
      to its response (it existed on the engine's return value all along,
      just was never surfaced). `GET /api/daily-audit/mixed` didn't need
      a code change for this — `adjustments` was already flowing through
      via `computeMixedDailyAudit`'s object spread, only the stale comment
      needed updating. `POST /api/daily-audit` no longer accepts or writes
      `in_house`/`wastage`/`other` at all — confirmed live that a stale
      client still sending those old field names doesn't error (Express
      silently ignores unrecognized body fields) and doesn't corrupt the
      `adjustments` sum.
    - `public/daily-audit.html`: three input boxes → one read-only
      `Adjustments` cell, carried as a fixed `data-adjustments` attribute
      (same pattern as the existing `data-new-stock`/`data-usage`) rather
      than three live inputs; step 13's live-recalculation now reads that
      fixed value instead of summing three fields client-side. Dish rows'
      three `-` placeholder cells collapsed to one.
    - New `public/allocations.html`: entry form (date, restaurant, meat,
      type, quantity, notes, from/to shown only when the type requires
      it) + a filterable list below, mirroring `stock-receipts.html`'s
      structure.
    - `public/settings.html`: new "Adjustment Types" and "Locations"
      tabs, each with an add-form and an inline-editable table.
    - "Allocations" nav link added to all 9 other pages.

    **Verified live** (real server, real database, not mirrored logic
    alone): booted the app against freshly-seeded data. Created two
    Locations via the real API (a restaurant-level one, a shared/central
    one — confirmed the `null restaurant_id` case sorts first per the
    route's `ORDER BY r.name IS NULL DESC`). Submitted two separate
    Wastage entries for the same meat/date (2.5, then 1.0) — confirmed
    both persisted as distinct rows, not one overwriting the other.
    Submitted an `Allocation / Transfer` entry without locations — got
    the exact expected rejection. Submitted one with valid locations —
    succeeded, with the from/to names correctly resolved in the list
    response. Confirmed `GET /api/daily-audit` and `GET /api/daily-audit/mixed`
    both return `adjustments: 4` (2.5 + 1.0 + 0.5, the exact sum of all
    three entries) for that meat/date — the number that will render in
    Landing's new read-only cell. Confirmed `daily-audit.html` serves
    the new `data-adjustments` markup and the `Adjustments` header, with
    zero leftover references to `.in_house`/`.wastage`/`.other` anywhere
    in the file. Every inline `<script>` block across all 10 pages in
    the app was syntax-checked as a full sweep (`node --check`), not
    just the files touched this session. Full backend suite re-run
    clean throughout, including a brand-new `allocations.test.js` (11
    tests, mirrored-logic pattern matching this project's established
    convention): **12/12 files, 165/165 assertions, 0 regressions.**

    **A real bug was caught mid-build, not shipped**: `settings.html`'s
    first draft of the Locations tab included a dead helper function
    (`restaurantOptsFor`) referencing an undefined variable — would have
    thrown at runtime the first time the Locations tab rendered. Found
    and removed before the live verification pass above, not after.

    **Still genuinely untested**: same standing gap as every prior
    frontend step in this project — no real mouse/keyboard browser
    click-through. Everything above was driven via real HTTP requests
    against a real running server, which is strong verification, but
    isn't the same as someone actually clicking through the three new/
    changed pages once.

## Future considerations (not scheduled, not designed — raised 2026-08-29)

Five items the project owner raised in one batch, thinking ahead past
everything built so far. None of these are designed yet — this section
exists so they aren't lost, and so the real connections between them
are visible before anyone starts designing in isolation.

**Priority, made explicit 2026-08-29**: item 1 was the one auditing-
service gap (real day-to-day recording need), items 2-5 are app-level
(dashboard, cleanup, future-proofing, a refinement) — secondary.
**Item 1 is now done** (below); nothing else on this list is currently
flagged as urgent.

1. **[Done, 2026-08-29] Allocations item-to-item conversion type.**
   Built as `POST /api/allocations/conversion` + a "Converts to" field
   on `allocations.html` — see `changelog.md`'s entry for full detail,
   including a real bug caught and fixed (the settings route wasn't
   returning the new flag) and the real supplier-pricing leak found and
   fixed in passing. Distinct from
   step 22's `Allocation/Transfer` type, which moves the *same* item
   between *locations* (from/to fields). This is converting stock *of
   one item into a different item* at the same location — e.g. 2 units
   of FC's Bagnet Sinigang becoming 2 units of Dinuguan, since both
   trace back to the same Jowl. Needs a different shape (a "converts
   to" item + quantity, not a from/to location) — don't conflate it
   with the existing transfer type in the UI or the data model.

2. **Management dashboard — cross-location stock rollup.** Upper
   management currently does this by hand in a spreadsheet, described
   as painful. Envisioned shape: rows = Commissary meat items (the root
   meats), columns = each location (Commissary, Silingan/A, FC, Likod —
   toggleable, up to 3 at once) + a grand total column. Real complexity:
   some locations' stock isn't a 1:1 match to a root meat (FC's Bagnet
   isn't literally "some kg of Jowl" without a conversion ratio) — the
   rollup needs to reverse-convert portioned items back to their
   raw-meat-equivalent to total correctly.

3. **RESOLVED 2026-08-29, correcting an earlier mis-model** — yield
   stays Commissary-only, but the fix is to stop treating Commissary as
   a singleton, not to give restaurants their own yield table. The
   original framing above (restaurant-level yield) was wrong: Likod
   "processing meat itself" isn't a separate event at all — Commissary,
   Restaurant A/Silingan, and Restaurant C/Likod are physically the
   same site. What looks like Likod marinating/prepping meat for its
   grill menu is Commissary's own yield step, just landing in Likod's
   stock without needing real shipment logistics (no delivery, same
   building). FC is the only genuinely remote location, which is why it
   needs real Shipments. The right generalization, if a future site
   ever *does* need its own on-site processing: **another Commissary
   instance**, not a restaurant-level feature — turn Commissary from an
   implicit singleton into a repeatable pattern (a `commissary_id`
   scoping `commissary_meats`/`commissary_yield_log`/etc., the same way
   `restaurant_id` already scopes restaurant data), not something
   special-cased once. Not designed yet, but the direction is settled;
   don't reopen "should restaurants get their own yield table."

4. **A dedicated cleanup pass is owed.** Several design pivots this
   project (Landing's three adjustment boxes → Allocations,
   `commissary_meat_map` being retired, likely others not yet audited
   for) probably left dead code, stale UI, or orphaned routes behind —
   the same category of issue the stray-git-text bug and the
   `commissary_meat_map` UI both turned out to be, just not
   systematically hunted for yet. Worth its own step, ideally before
   Restaurant C onboarding so nothing stale gets copied into a fresh
   restaurant's setup.

5. **REFINED 2026-08-29 — a two-way split resolves the conversion-ratio
   tension, not a single blanket policy.** Originally framed as "step
   20's dynamic-no-formula call vs. the dashboard needing ratios to
   total against" — resolved by recognizing two different kinds of
   commissary meat, not one:
   - **Raw type** (plain Jowl shipped as itself, no portioning
     happening): no ratio concept applies — genuinely just a quantity,
     step 20's dynamic-entry call stands unchanged here.
   - **Portioned type** (Bagnet, Sisig, Sinigang, DNG — named,
     officially-portioned products with real margin implications): a
     real **Standard** ratio should exist, the same pattern
     `commissary_meats.allowed_leeway_pct` already uses for the
     raw→processed yield step — actual shipment entries get *compared
     against* the Standard (Actual vs. Calculated, variance flagged),
     never blocking the save, consistent with how every other part of
     this app already works. Not "step 20 was wrong," but "step 20's
     call was right for raw meat and needs refining for named
     portions" — a `commissary_meat_type` classifier (or similar) is
     the likely shape, distinguishing which meats get a Standard at
     all. This also directly serves item 2's dashboard rollup and the
     original shipment-portioning question — the same Standard data
     both reverse-converts (Bagnet → Jowl-equivalent, for the
     dashboard) and forward-converts (Jowl → expected portion counts,
     for shipment guidance). Not designed in detail yet — table shape,
     where the Standard lives (on `commissary_meats` itself vs. a new
     table), and whether it's per-destination-restaurant or global per
     meat are all still open.

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
