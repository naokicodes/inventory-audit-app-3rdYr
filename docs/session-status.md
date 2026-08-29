# Session Status — read this first after token reset

Last updated: 2026-08-29 (post step-20a completion).
This is the authoritative "where we left off" doc. `HANDOFF.md` was
deleted this session (see `changelog.md`) — it had drifted stale and was
actively misleading; this file is now the only "where we left off" doc,
so always start here.

## Where things stand: steps 1–19 done. Steps 1–14 committed and pushed
to `main`; steps 15–18 committed locally this session, not yet pushed
(see below).

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

Step 20 is split into 20a/20b/20c (see its entry below). **20a (schema
only) is done** as of 2026-08-29 — six new Commissary tables + one
preset-lines child table added to `schema.sql`, verified, not yet
committed to git (uploaded-zip session, no `.git` present). **20b
(Commissary audit engine + read routes) is next.** Steps 21-22, and the
rest of step 20 beyond 20a, remain **draft proposals under active
discussion, not committed or built** — see their entries below for the
current state of that conversation (Commissary extend-not-migrate and
its own dedicated shipment page are resolved; the Command terminal page
and the Landing Allocations merge are still open).

Steps 10–14 are committed and pushed to `main`, independently verified
(2026-08-29): cloned fresh, confirmed the actual commits are present
(`7b0c541`/`2ff3032`/`5b31717` for 10–11, `97a5e74`/`98e2c0a`/`0ba4dd1`
for 12, `e16fd64` for 13, `866da77` for 14), ran the full suite from a
clean install (green), and live-smoke-tested the opening-stock write
path (step 12) against a real booted server. The step-12/13/14 "commit
status unverified" caveat from the prior session is resolved — no need
to re-check it. **Steps 15 through 19, plus the architecture-discussion
docs commits for steps 20-22, are done and committed in this session's
local clone only** — no push credentials available here (same
limitation noted for steps 10-11 originally). Whoever has git access
should pull these commits into the real local clone and push before
handing anything to the standby workers, or they'll be working against
a `main` that's badly behind what this doc describes. **Step 20a's
schema change (this session, 2026-08-29) is not committed anywhere** —
unlike the steps-15-19 session, this session had no `.git` at all (an
uploaded zip only), so there's nothing to commit to here; whoever has
git access should apply the `schema.sql` change fresh (it's small and
additive — see `changelog.md`'s step-20a entry for the exact diff
description) and commit it before starting 20b.

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
20. **[Draft proposal, under active discussion — not committed] Give
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

    **`commissary_meat_map`'s fate — RESOLVED 2026-08-29**: leave it
    alone, don't touch it in step 20. It becomes vestigial once
    `commissary_shipment_lines` exists — the auditor picks the
    destination meat live in the shipment form, no pre-declared mapping
    consulted. Not deleted (other code may still reference it), not
    repurposed, not schema-changed. If a coder session finds it still
    matters for something not accounted for here, flag it back rather
    than deciding unilaterally.

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
    - **20b (Commissary audit engine + read routes) — NEXT**: a
      `computeCommissaryMeatAudit`-shaped function mirroring
      `computeMeatAudit`'s beginning/usage/ending/variance shape, but
      with Stock In and Backed Up as two separate inflows and usage
      summed across all destination shipments for that meat/date
      (`commissary_shipments.total_quantity`, not sales×recipe). A GET
      route exposing it, mirroring `dailyAudit.js`'s pattern. 20a's
      tables now exist and are ready to build on.
    - **20c (shipment logging: write route + page)**: `POST` route
      creating one `commissary_shipments` row + N
      `commissary_shipment_lines` rows in one transaction, each line
      also writing a normal `stock_receipts` row for the destination
      (reuses existing mechanics unchanged). Then the dedicated page
      itself (form: source meat, destination, total, N output lines).
      Depends on 20a and 20b (the page will want to show current
      balance/context, not just blindly write).

    **Scope relative to step 19**: still doesn't block Restaurant B
    onboarding. FC's Bagnet/Sisig/Sinigang/DNG/etc. get onboarded as
    FC's own local stock items regardless of how this design lands —
    additive on top, not a prerequisite. Sequencing is the project
    owner's call.

21. **[Draft proposal, under active discussion — not committed] A
    second, bigger Command surface: a dedicated console/terminal page,
    separate from the step-14 floating widget.** Requested 2026-08-29.
    The floating panel (steps 14/15/18) stays exactly as it is — quick,
    single-click, "any tab" micro-actions. This is a *different*,
    full-page surface for people who'd rather type than click through
    forms, aimed specifically at Commissary's shipment logging first
    (Commissary is "more dynamic" than the restaurants, which are "more
    on the static side" — project owner's framing) — not a general
    command line for every screen on day one. **Design constraint, not
    yet built**: the terminal must call the *same* backend endpoints the
    GUI forms do (e.g. the same shipment-logging route step 20 will
    add), so it's a second input surface on one data path, never a
    parallel system that could drift out of sync with what the forms
    write. Command syntax, autocomplete, and history are all
    undesigned — this is a placeholder for the idea, not a spec.

22. **[Draft proposal, under active discussion — not committed] Merge
    Landing's In-House/Wastage/Other into one read-only "Allocations"
    cell, fed by a new dedicated Allocations page.** Requested
    2026-08-29, framed explicitly as "do to Adjustments what the
    2026-08-27 change already did to New Stock" — move detailed entry
    off Landing onto its own page, Landing shows a read-only sum.

    **Confirmed by reading the actual code, not assumed**: this is
    smaller than it sounds. `computeMeatAudit` already only ever
    produces *one* summed `adjustments` number
    (`SUM(quantity) FROM adjustments WHERE ...`) — Landing's three boxes
    are a frontend-only illusion. Each one silently writes to one
    specific hardcoded `adjustment_type` row (`Wastage`,
    `Staff Meal / In-House`, `Other / Uncategorized`) via
    `server/routes/dailyAudit.js`'s delete-then-insert helper. **Bonus
    finding**: the seeded `adjustment_types` table already has three
    *more* real categories — `Allocation / Transfer`, `Spoilage`,
    `Damaged` — with no entry path anywhere in the app today. A proper
    Allocations page doesn't just simplify Landing, it finishes
    something the schema already promised.

    **Rough shape (not final)**: Landing's meat row shrinks to one
    read-only `adjustments` cell (already computed, no engine change
    needed). A new `public/allocations.html`-equivalent page, parallel
    to Stock Receipts: restaurant, date, meat, `adjustment_type`
    (dropdown from the full admin-managed list), quantity, notes, and
    from/to location fields shown only when the chosen type has
    `requires_transfer_locations = 1` (already a real column,
    unused by any UI today). `dailyAudit.js`'s save handler drops the
    three hardcoded type lookups/writes entirely — the `adjustments`
    table becomes fully driven by this new page instead.

    **Open question, not yet resolved**: whether the existing
    `adjustment_types` admin CRUD (referenced in `daily-workflow.md` as
    "admin-managed," but with no actual settings-screen UI found in the
    repo) gets built alongside this, or stays a gap for later — the six
    real rows exist only via seed data today, nothing lets the project
    owner add a seventh without editing a JSON file by hand.

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
