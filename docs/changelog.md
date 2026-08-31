# Changelog / Development Notices

A running, dated log of real fixes, decisions, and environment quirks hit
during development — so they don't have to get rediscovered later, and so
anyone picking this project up (including future-you) has context on *why*
something is built the way it is, not just *what* it does.

Newest entries at the top. Small/routine commits don't need an entry here —
this is for things that took real debugging, changed a decision, or are
worth remembering if they happen again.

---

## 2026-09-01 (Claude Code session) — Step 23c-ii-c: commissary identity on GET /api/commissary/meats + label fixes

Backend + small frontend, bundled per this step's spec in session-status.md. `server/routes/commissary.js`'s `GET /commissary/meats` (~L50-62) now selects `commissary_id` plus the joined commissary's own `code`/`name`, aliased `commissary_code`/`commissary_name` (matches `dashboard.js`'s existing convention for the same shape) so they don't collide with the meat's own `code`/`name` already in the SELECT. Joined via `LEFT JOIN commissaries c ON c.id = cm.commissary_id`, not INNER — SQLite doesn't enforce FKs unless `PRAGMA foreign_keys = ON`, so a dangling `commissary_id` is reachable, and an INNER JOIN would silently drop that meat from all six live consumers instead of just returning null `commissary_code`/`commissary_name`. The WHERE clause's `active`/`commissary_id` are now qualified `cm.active`/`cm.commissary_id` — once the join lands, `active` exists on both tables and an unqualified reference would 500 with "ambiguous column name". The filter deliberately stays scoped to the *meat's* `active` flag, not the commissary's — whether a deactivated commissary's meats should also be hidden is a separate, unasked question. Purely additive: no new filter, no behavior change for the existing optional `commissary_id` param, `meat_type_id` (23c-i-b) untouched.

The label fixes this unblocks: `stock-receipts.html`'s `loadCommissaryMeats()` (~L148) and `commissary.html`'s `loadMeats()` (both `newMeat` and `filterMeat`, ~L120) now append the commissary's code to a meat's option label — but only when the fetched list actually spans more than one distinct `commissary_id`. Self-adjusting, identical rule on both pages, needs no selector state (works on `stock-receipts.html`, which has none). A single-commissary install sees no visible change anywhere. A row with a null `commissary_code` (the dangling-FK case above) renders with no suffix, never "undefined".

**Verified**: baseline full suite run first (14/14 files, 257/257 assertions, 0 failures), re-run after the route change alone (identical 257/257 — `commissary.test.js` had no exact-shape assertion on this SELECT, confirmed by reading the file rather than assumed, so the new columns were transparent), and again after the new tests (14/14 files, 260/260, 0 failures). Three new tests added to `commissary.test.js`: the joined columns come back populated and correct for two different commissaries, and a meat with a dangling `commissary_id` (constructed by toggling `PRAGMA foreign_keys` off for one insert, same pattern as `dashboard.test.js`'s dangling-`meat_type_id` case) is still returned with null `commissary_code`/`commissary_name` rather than dropped — placed at the very end of the test file so the extra row doesn't perturb earlier tests' unfiltered-count assertions. `node --check` on both changed HTML files' extracted inline scripts. Live end-to-end check against a real booted server: created a real second commissary and a commissary meat under it reusing the existing `M05` code, confirmed `GET /api/commissary/meats` returns both `M05` rows with correct, distinct `commissary_id`/`commissary_code`/`commissary_name`, replayed both pages' exact label logic against the live response confirming `M05 - JOWL (COM-A)` / `M05 - Test Jowl Dup (COM-TEST)` when unfiltered and plain `M05 - JOWL` (no suffix) when filtered to one commissary. Test rows cleaned up afterward via direct DB delete (no DELETE route exists for either table, expected — catalog/settings data). Server process stopped before ending the session (rule 21). Pushed directly to `main` in two commits (route+tests, then the two label fixes).

---

## 2026-09-01 (Claude Code session) — Step 23c-ii-b: page-level commissary selector on commissary-shipments.html

Frontend-only, `public/commissary-shipments.html` alone — the second of the four 23c-ii sub-steps, same pattern as 23c-ii-a with the corrected scope from the architect's 23c-ii-a review baked in from the start. Added a `<select id="commissary">` above the add-form, populated from `GET /api/settings/commissaries` filtered client-side to `active === 1`, first and default option "All commissaries" (value `""`).

Only `loadCommissaryMeats()` (`newCommissaryMeat`'s source) threads the selection as an optional `&commissary_id=N`. `loadContext()`, `loadPresets()`, and `loadStandards()` are deliberately left untouched — all three are already keyed by `commissary_meat_id`, which belongs to exactly one commissary, so adding `commissary_id` to those calls would be a live bug (23b-v makes a mismatched pair return `[]` rather than ignore it), not a no-op. The real work beyond the one threaded param is the change handler: since repopulating `newCommissaryMeat` resets its `.value` and silently invalidates everything downstream, selecting a different commissary reloads the meats list and then re-runs the same trio the existing `newCommissaryMeat` change handler runs (`loadContext()`, `loadPresets()`, `loadStandards()`), in that order.

**Verified**: baseline full suite run before starting and again after — identical **14/14 files, 257/257 assertions, 0 failures** both times (frontend-only, no regressions, no new tests expected). `node --check` on the extracted inline script. Live end-to-end check against a real booted server: created a second real commissary ("Commissary Test B" / COM-TESTB) and a commissary meat under it (reusing code `M05` on purpose, to also probe the pre-existing label-ambiguity note from 23c-ii-c's spec — not fixed here, out of scope for this step) via `POST`, confirmed `GET /api/settings/commissaries` lists both, confirmed `GET /api/commissary/meats?commissary_id=<new>` returns only the new meat while the unfiltered call still returns all of them, confirmed `GET /api/commissary/daily-audit`, `.../shipment-presets`, and `.../conversion-standards` all still resolve correctly for the new meat's id via the exact params `loadContext()`/`loadPresets()`/`loadStandards()` actually send (no `commissary_id`), and confirmed the served page contains the new selector markup. Test rows cleaned up afterward (direct delete of the test commissary meat and commissary — no DELETE route exists for either, expected, catalog/settings tables). Server process stopped before ending the session (rule 21) — also found and stopped a stale server process already holding port 3000 from a prior session before starting, per rule 21's own warning.

Pushed directly to `main`.

---

## 2026-09-01 (Claude Code session) — Step 23c-ii-a: page-level commissary selector on commissary.html

Frontend-only, `public/commissary.html` alone — the first of the four 23c-ii sub-steps split out by the architect session earlier the same day. Added a `<select id="commissary">` above the "On-hand balance" section, mirroring `daily-audit.html`'s restaurant selector pattern: populated from `GET /api/settings/commissaries`, filtered client-side to `active === 1`, first and default option "All commissaries" (value `""`).

The selection threads into the page's three commissary-scoped reads as an optional `&commissary_id=N`, omitted entirely when "All" is selected: `loadMeats()` → `GET /api/commissary/meats`, `loadBalances()` → `GET /api/commissary/daily-audit`, and the yield-log list → `GET /api/commissary/yield-log`. All three routes already accepted this filter (23b-iv, 23b-v) — no backend, schema, or route change. A `change` listener on the new selector re-runs all three, same as the existing date input's listener does for balances. The yield-log POST/PUT/DELETE paths were left untouched, per the step's explicit scope — they key off `commissary_meat_id`, which is already commissary-specific.

**Verified**: baseline full suite run before starting and again after — identical **14/14 files, 257/257 assertions, 0 failures** both times, confirming the frontend-only change is behavior-preserving on load, as expected (no new tests, per the step's own reasoning: the routes' existing "omitted = everything" convention is what makes defaulting to All provably equivalent to today's behavior). `node --check` on the extracted inline script. Live end-to-end check against a real booted server: created a second real commissary ("Test Commissary B" / TESTB) and a commissary meat under it via `POST`, confirmed `GET /api/settings/commissaries` lists both, confirmed `GET /api/commissary/meats?commissary_id=<new>` returns only the new meat while the unfiltered call still returns all 15, confirmed `GET /api/commissary/daily-audit?commissary_id=<new>` and `GET /api/commissary/yield-log?commissary_id=<new>` both scope correctly, and confirmed the served page contains the new selector markup. Test rows cleaned up afterward (direct delete of the test commissary meat and commissary, no DELETE route exists for either — expected, they're catalog/settings tables, not the two rule-9 tables). Server process stopped before ending the session (rule 21).

Pushed directly to `main`.

---

---

## 2026-09-01 (architect review of 23c-ii-b) — verified clean; 23c-ii-c's three implementation points resolved

Verified 23c-ii-b independently: read the real diff, ran the full suite
(14 files, **257/257, 0 failures**), `node --check` on the extracted inline
script. It follows the corrected spec exactly — only `loadCommissaryMeats()`
threads the filter, and the change handler reloads meats before re-running
`loadContext()`/`loadPresets()`/`loadStandards()`, which is the part that
matters since repopulating the dropdown resets its value. No rework.

Resolved three things in 23c-ii-c's spec that would otherwise have been
guessed, each of which had a wrong answer available:

**Alias the joined columns.** The route already returns the meat's own
`code`/`name`; unaliased joined columns collide. `dashboard.js` already
aliases them `commissary_code`/`commissary_name` — follow it.

**LEFT JOIN, not INNER.** A dangling `commissary_id` is reachable (SQLite
doesn't enforce FKs without `PRAGMA foreign_keys = ON`), and under an INNER
JOIN that meat silently disappears from all six consumers. Real stock
vanishing with no error is strictly worse than the wrong label 23b-vi-b's
null guard prevented.

**Qualify the WHERE.** `active` exists on both `commissary_meats` and
`commissaries`, so the current unqualified `active = 1` becomes an ambiguous
column reference the moment the join lands, and the route 500s. Also noted
explicitly that the filter stays on the *meat's* active flag — whether to
hide meats under a deactivated commissary is a question nobody has asked,
and answering it silently here would be the same class of mistake.

**Label rule for both pages**: show the commissary suffix only when the
fetched list spans more than one distinct commissary. One rule, both pages,
works on `stock-receipts.html` which has no selector, and a
single-commissary install sees no change at all.

**Found while specifying this — a second inner-join hazard, not fixed.**
`dashboard.js`'s own `JOIN commissaries` has exactly the silent-drop problem
described above. Different route, so it was left out of 23c-ii-c rather than
bundled (rule 16); recorded under "Known open items."

## 2026-09-01 (architect review of 23c-ii-a) — verified good; two spec corrections

Verified 23c-ii-a independently before reviewing: read the real diff, ran
the full suite (14 files, **257/257, 0 failures**), `node --check` on the
extracted inline script. All three reads thread `commissary_id` correctly,
and the "All" default sends `value=""` so the param is omitted and on-load
behavior is genuinely unchanged. No rework needed.

Two corrections to specs I wrote, both caught by reading the landed code
rather than by anything failing:

**23c-ii-b's entry was wrong** and would have had a worker introduce a bug.
It said `commissary-shipments.html`'s `GET /api/commissary/daily-audit` call
also needed the filter. It doesn't — `loadContext()` already passes
`commissary_meat_id`, and a meat belongs to exactly one commissary, so that
read is already narrowed. Worse, 23b-v deliberately made a mismatched
`commissary_meat_id` + `commissary_id` pair return `[]` instead of ignoring
the mismatch, so passing both can blank the context panel in the window
before the meat dropdown re-renders. Only `loadCommissaryMeats()` takes the
filter; the real work there is re-running the dependent trio after the meat
list changes.

**23c-ii-c gains one line of scope.** `commissary.html` has the same label
ambiguity as `stock-receipts.html` whenever "All commissaries" is selected —
both its dropdowns render `code - name`, so two commissaries sharing `M05`
give two indistinguishable options. Not a correctness bug (the option value
is `m.id`), but unreadable, and 23c-ii-c already has the commissary on that
route.

## 2026-09-01 (architect, web session) — 23c-ii split four ways; "no decisions needed" was wrong on three counts

No code changed. The hand-off into this session said 23c-ii was unblocked
and decision-free. Verified independently first (fresh clone, full suite
run: 14 files, **257/257, 0 failures**), then checked that claim against
the code rather than taking it — it was wrong three times over.

**Also settled the open question that opened the session**: the Dashboard
rendering as a flat table is correct, not broken. Reproduced live — seeded
a `Jowl` meat type, tagged `M05`, added a Conversion Standard, booted a
real server, and confirmed the row comes back as `kind: "meat_type"` with
`by_commissary` populated. One correction to the expected explanation: with
only COM-A existing, Jowl's toggle is **enabled and clickable**, not
disabled — a group of one still has a non-empty `by_commissary`. Only
`kind: "untagged"` rows get the disabled toggle. Also diffed the served
`dashboard.html` against the checked-out source to rule out rule 21's
stale-server trap.

**Terminal has a live correctness hazard.** `UNIQUE (commissary_id, code)`
means `M05` can exist in two commissaries; `resolveExact` uses
`list.find(...)` against an unfiltered `/api/commissary/meats` and silently
returns the first hit. Same shape as the double-count 23b-vi-a closed:
harmless today because COM-A is the only commissary, one admin action from
firing. Resolved as **qualified tokens (`com-a/m05`)** rather than a
page-level selector — the project owner's call, on the grounds that
Terminal exists precisely as a keyboard-only alternative to aiming a mouse
at forms, so a dropdown there defeats the screen's purpose. The selector
was the smaller build and was rejected knowingly.

**The Dashboard item was already built.** `dashboard.js` L69 says the route
is deliberately cross-commissary, and 23b-vi-b shipped the drill-down.
Dropped from 23c-ii's page list; nothing to build.

**A fourth backend gap, previously unflagged.** `GET
/api/commissary/meats` returns no commissary identity whatsoever, so
Terminal can't detect ambiguity or render a qualified token, and
`stock-receipts.html` can't label which `M05 - JOWL` is which. Neither
frontend piece was buildable. Identical shape to 23c-i-b — a catalog read
route missing one column, silently blocking work scoped as frontend-only —
and given the same additive treatment.

Split into 23c-ii-a (`commissary.html` selector), 23c-ii-b
(`commissary-shipments.html` selector), 23c-ii-c (the additive columns +
the `stock-receipts.html` label fix), and 23c-ii-d (the Terminal grammar,
which 23c-ii-c blocks). Full specs and the grammar's eight rules are in
`session-status.md`.

**Also corrected**: `web-vs-claude-code.md`'s "Push access — not yet
confirmed" section. Six Claude Code sessions in step 23 pushed straight to
`main` with no fallback used; the doc had been telling every session to
expect it might not work.

## 2026-08-31 (architect) — Rule 21 added: stop any server you start

Project owner hit `EADDRINUSE: address already in use :::3000` on
`npm run dev`. Not an app bug — a Claude Code session had left a server
running from its live verification check. Six sessions today each booted
one; every one cleaned up its test rows, none stopped its process. Worse
than a blocked port: the stale server kept serving `localhost:3000` from
a commit several behind HEAD, so the app *looked* fine while actually
serving old code.

Added as rule 21 in `rules-for-claude-code.md` rather than only into the
prompt template, so it binds every session regardless of whether whoever
writes the next prompt remembers the line. The template in
`architect-notes-PRIVATE.md` (not in this repo) gets a matching line.

## 2026-08-31 (Claude Code session) — Step 23b-vi-b: inline commissary drill-down + two backend gaps

`public/dashboard.html`: `kind:"meat_type"` rows with a non-empty `by_commissary` array are now expandable — a ▸/▾ toggle in the first cell, click to show one child row per commissary (its code/name and its own balance). The restaurant columns and grand total stay on the parent row only, rendered exactly once, never repeated or recomputed per commissary in the child rows — the child rows only fill their first two cells and leave the rest blank via `colspan`. No client-side recomputation anywhere: expand/collapse re-renders the already-fetched JSON (`lastRollupData`), it never re-fetches or derives new numbers. `kind:"untagged"` rows render a disabled toggle since they have no `by_commissary` at all.

Two backend gaps closed in `server/routes/dashboard.js`, both found by the architect review of 23b-vi-a rather than assumed unilaterally in this session:
1. Every `kind:"meat_type"` row now carries a `meat_type_active` boolean, sourced from `meat_types.active`. Rows are never filtered on it — a deactivated type is a cataloguing statement, not a claim the stock vanished, same reasoning untagged rows already got. `dashboard.html` renders it as an understated `(inactive type)` label next to the row's name.
2. The grouped-row build's `SELECT name FROM meat_types WHERE id = ?` used to read `.name` with no null guard — since SQLite doesn't enforce foreign keys unless `PRAGMA foreign_keys = ON`, a dangling `meat_type_id` would throw a `TypeError` and 500 the entire Dashboard. Now degrades gracefully: a missing meat type falls back to a `(unknown meat type #N)` label and `meat_type_active: false`, consistent with how every other missing-data case in this route already behaves.

`dashboard.test.js`'s mirror was updated to match (not weakened) and gained 3 new tests: `meat_type_active` correct for both an active and an inactive type (with the inactive type's row explicitly asserted to still appear, not be filtered), and a dangling `meat_type_id` (constructed by toggling `PRAGMA foreign_keys` off just for that one insert, since this test file otherwise runs with FKs enforced) confirmed to degrade rather than throw.

**Verified**: baseline full suite run first (14/14 files, 254/254 assertions, 0 failures) and again after the source-only backend edits (still 254/254, confirming the additive field and guard caused no regression before any new tests were added), then again after the new tests (**14/14 files, 257/257 assertions, 0 failures**). `node --check` on the extracted inline `<script>` from `dashboard.html`. Live end-to-end check against a real booted server: seeded a real second commissary sharing a meat type with Commissary A, confirmed the parent row expands to show both commissaries with their correct individual balances, confirmed the restaurant/grand-total columns appear exactly once (on the parent, blank on the children), confirmed an untagged row's toggle is disabled, and confirmed deactivating the test meat type flips `meat_type_active` to `false` while the row keeps reporting its real stock. Test rows cleaned up afterward.

Pushed directly to `main`.

---

## 2026-08-31 (architect review of 23b-vi-a) — inactive meat types resolved; a missing null guard found

Verified 23b-vi-a independently before reviewing: read the real route
diff and re-ran the full suite (14/14 files, **254/254, 0 failures**).
The implementation matches section 10c faithfully, and the motivating
regression test is genuine — it asserts `1054, not 1094`, so the
double-count bug fails loudly if it ever returns.

Two things the spec hadn't covered, both now decided rather than left as
accidents of implementation:

**Inactive meat types.** `meat_types.active` exists and 23b's CRUD can
set it, but nothing anywhere reads it — so deactivating a type currently
has no effect on the Dashboard at all. Resolved: grouped rows gain a
`meat_type_active` flag and are **never** filtered on it. Same reasoning
as untagged meats — the stock physically exists and an audit screen must
not silently drop it; deactivating is a cataloguing statement, not a
claim the meat vanished. Chose this over leaving it entirely unread
(which keeps `active` meaningless and would need a route change later to
do anything) and over excluding inactive types (hides real stock, and
contradicts the untagged decision). The flag is additive on purpose: the
UI decides presentation, and a future sort/filter decision already has
the data.

**A missing null guard.** The grouped-row build does `SELECT name FROM
meat_types WHERE id = ?` and reads `.name` unguarded. SQLite doesn't
enforce foreign keys unless `PRAGMA foreign_keys = ON`, so a dangling
`meat_type_id` would throw a `TypeError` and 500 the entire Dashboard
rather than degrade — inconsistent with every other missing-data path in
this app, which degrades gracefully.

Both folded into 23b-vi-b rather than dispatched separately: each is a
few lines, and that step is already opening the same two files.

## 2026-08-31 (Claude Code session) — Step 23b-vi-a: grouped stock rollup (fixes a live double-count bug)

`GET /api/dashboard/stock-rollup` rebuilt per `data-model.md` section 10c: rows are now grouped by `(meat_type_id, unit)` rather than one row per commissary meat. This is a correctness fix, not a display change — `commissary_conversion_standards` is keyed by `meat_type_id`, so before this step, two commissary meats sharing a type (now possible since 23c-i shipped the Commissary-creation UI) would each independently resolve the same standards and each produce their own `by_restaurant` total, silently doubling the real restaurant figure anywhere those rows got summed together. Grouping computes the restaurant reverse-conversion exactly once per group, on the parent row, making that double-count structurally impossible rather than merely unlikely.

`server/routes/dashboard.js`: each active commissary meat's own balance is still computed individually (needed either way, for `by_commissary`), then grouped into `kind: "meat_type"` rows (grouping key `(meat_type_id, unit)`, not `meat_type_id` alone — `meat_types` has no `unit` column, and a type whose members disagree on unit would otherwise sum into a meaningless number) or left as standalone `kind: "untagged"` rows for `meat_type_id IS NULL` meats, which are never grouped together or dropped. `computeRestaurantTotals` was factored out of the row loop specifically so it's called once per group. Sort order moved from `ORDER BY code` to sorting the combined row list by `name` (meat-type name for grouped rows, the meat's own name for untagged rows), since a grouped row has no single code.

`public/dashboard.html` got the minimum change needed to keep rendering correctly: the row-label cell now branches on `row.kind` (`meat_type` → name + unit only, `untagged` → `code - name` + unit, same as every row rendered before this step). Everything else in the render path — `by_restaurant` cell rendering, `commissary_balance`, `grand_total`, `row_has_any_data` — needed no change since both row kinds carry those fields with identical shapes. The table stays flat this step; `by_commissary` is present and correct in the JSON but has no UI yet — that's 23b-vi-b, queued next.

`server/routes/dashboard.test.js`'s mirror was rebuilt to match (not weakened) — existing tests now locate the Jowl row via `kind === 'meat_type' && meat_type_id === 1` instead of a `code` that no longer exists on grouped rows, with a second `commissaries` fixture added only after every test that asserts an exact single-commissary count, so none of them shifted. Four new tests: **the motivating case** — two commissaries both stocking a meat tagged to the same `meat_type_id` are grouped into one row, `commissary_balance` sums both real balances once, and `by_restaurant[FC].total` is asserted to be exactly 40, not 80 (what the old per-meat code would have produced if two such rows existed and their restaurant totals were ever summed) — a unit mismatch within one meat type splitting into two separate rows, an untagged meat keeping its own row rather than being dropped, and row sort order.

**Verified**: baseline full suite run first (14/14 files, 250/250 assertions, 0 failures) and again after (**14/14 files, 254/254 assertions, 0 failures** — the +4 new dashboard tests). `node --check` on all three changed files (including the extracted inline `<script>` from `dashboard.html`). Live end-to-end check against a real booted server: created a real second commissary + meat type, tagged one meat from each commissary to it with real opening-stock balances (20 and 15), confirmed the live JSON matches section 10c's shape exactly — `commissary_balance: 35`, `by_commissary` listing both commissaries by their own code/name, `grand_total: 35` with no restaurant double-count; confirmed `dashboard.html` still serves and its render logic produces no `"undefined"` label anywhere across all 14 seeded rows, with the grouped row correctly labeled by name+unit only. Test rows cleaned up afterward.

Pushed directly to `main`.

---

## 2026-08-31 (architect, web session) — 23b-vi's rollup shape resolved; a live double-count bug found while specifying it

No code changed. Resolved the last open architect decision in step 23,
after verifying 23b-v's landed work independently (real diff read, full
suite re-run: 14/14 files, **250/250, 0 failures**). Checked the one
thing in that diff that could have failed silently — it added an INNER
JOIN to the yield-log query, which would drop rows if
`commissary_yield_log.commissary_meat_id` were nullable. It is NOT NULL
(`schema.sql` L292), so the join is safe.

**Found while specifying the shape — a live correctness bug in `main`,
not a hypothetical**: `/dashboard/stock-rollup` builds one row per
commissary meat and looks up conversion standards by `meat_type_id`. Two
commissary meats sharing a type therefore both count the *same*
restaurant stock, double-counting it (tripling with three commissaries,
and so on). It cannot fire today only because `COM-A` is the sole
commissary — but 23c-i shipped the Settings tab that lets anyone create a
second one, so the trigger is now one admin action away. Recorded in
`session-status.md` with its trigger condition; 23b-vi fixes it as a side
effect of grouping, since grouping computes restaurant figures once per
group rather than once per commissary meat.

**Decided (full shape in `data-model.md` section 10c)**: group by
`(meat_type_id, unit)` with a nested `by_commissary` array driving an
inline expand/collapse drill-down, and untagged meats each getting their
own `kind: "untagged"` row rather than being omitted. Rejected: a flat
meat-type grouping (discards which commissary holds what, which 23c-ii's
drill-down immediately needs back) and keeping per-commissary-meat rows
plus a parallel summary block (two representations of the same numbers
that can drift — the same failure mode retired in Round 2 item 5).

**Why `unit` is in the grouping key**: `meat_types` is `id`/`name`/
`active` only — no unit — while `commissary_meats.unit` already varies
across the seed data (`kg` and `unit`). Grouping on `meat_type_id` alone
would happily sum 30kg and 20 units into "50". Including `unit` makes
that impossible; a mismatch surfaces as two honest rows instead.

**Explicitly left open, not scheduled**: whether `meat_types` should gain
an authoritative `unit` column enforced at tag time. It rests on a
business assumption nobody has confirmed — that a meat type is always
measured the same way at every commissary. If it isn't, the grouping-key
approach is the correct permanent answer rather than a stopgap. Flagged
for the project owner in section 10c; the two are complementary, not
competing, so nothing has to be torn out either way.

## 2026-08-31 (Claude Code session) — Step 23b-v: optional commissary_id filter on the Commissary daily-audit and yield-log read paths

Same optional-filter convention 23b-iv just landed on `GET /api/commissary/meats`, applied to the two remaining commissary-scoped read paths. Omitted, both routes behave exactly as before in every case; no page passes the new param yet — that's 23c-ii's job.

`server/engines/commissaryAuditEngine.js`'s `computeCommissaryDailyAudit` gains a fourth, optional `commissaryId` param (default `null`), restricting the meats it iterates to one commissary's catalog when given. The existing `commissaryMeatId` filter keeps working alongside it — both narrow the same WHERE clause, so a `commissaryMeatId` that doesn't belong to the given `commissaryId` correctly returns an empty array rather than silently ignoring the mismatch. `server/routes/commissary.js`'s `GET /commissary/daily-audit` reads the new `commissary_id` query param and passes it through unchanged otherwise (`date` still required, `commissary_meat_id` still optional).

`GET /commissary/yield-log` gets its own `commissary_id` clause added to the existing optional-clause builder. Unlike the other two routes, `commissary_yield_log` has no `commissary_id` column of its own — the commissary lives on the joined `commissary_meats` row — so the route's `ids` query now always joins to `commissary_meats` (harmless when the filter is omitted) and filters on `cm.commissary_id` when it's given.

**Explicitly not touched, per the dispatch prompt**: `computeYieldLogForDate` in `commissaryYieldEngine.js` — it has no route consumer (only its own test file calls it; the live yield-log route builds its own query and calls `computeYieldRow` per id), so it was left alone entirely. Whether it's dead code is a separate open question, not this step's call.

New tests: `commissaryAuditEngine.test.js` gained a second `commissaries` fixture (added after every existing test that asserts an exact unfiltered row count, so it doesn't shift any of them) plus 5 new tests on `computeCommissaryDailyAudit` — unchanged unfiltered listing now spanning two commissaries, filtering to each one, and both directions of combining `commissaryMeatId` with a matching/mismatched `commissaryId`. `commissary.test.js` gained mirrored route logic for both `GET /commissary/daily-audit` (calling the real, now-imported `computeCommissaryDailyAudit`) and `GET /commissary/yield-log` (mirroring its exact query-building, including the new join), plus 12 new tests covering the same shape of cases for both routes, reusing the second-commissary fixture 23b-iv already added rather than creating a third.

**Verified**: baseline full suite confirmed unchanged after the source-only edits (14/14 files, 233/233 assertions, 0 failures) before adding any tests, then again after adding the new tests: **14/14 files, 250/250 assertions, 0 failures** (+17 new). Live end-to-end check against a real booted server: unfiltered calls to both routes confirmed unchanged; created a second real commissary with its own meat and a real yield-log entry under it, confirmed `commissary_id` correctly includes/excludes the right rows on both routes, confirmed an unknown `commissary_id` returns `[]` rather than erroring; confirmed `commissary.html` (a consumer of both routes, calling them with no param) still serves and its exact unfiltered fetch calls still return the correct shape. Test rows cleaned up afterward.

Pushed directly to `main`.

---

## 2026-08-31 (architect, web session) — graphify's dirty working tree: expected, three paths flagged as undecided

No code changed. Project owner asked whether `graphify-out/` constantly
showing modified/untracked in `git status` is normal. It is — the
post-commit hook regenerates the graph on every commit, so the directory
is dirty by design.

Three paths in it, though, don't clearly belong in the "commit it"
bucket that `graph.json`/`GRAPH_REPORT.md` do: `graphify-out/cache/`
(a version-keyed rebuild cache — note `cache/semantic/` is deliberately
committed, so this needs a targeted line rather than a blanket ignore),
`.graphify_labels.json.sig`, and a date-stamped `graphify-out/<date>/`
directory that would add a folder per working day if committed.

**Deliberately not decided or ignored yet** — resolving it needs a check
of graphify's own docs for what the `.sig` and dated directory are for,
which is cheap but wasn't worth interrupting the 23b dispatch sequence.
Left uncommitted, which is safe: untracked and modified files persist on
disk regardless of the editor closing. Full detail and the alternative
worth deciding alongside it (whether to regenerate/commit the graph on
every commit at all, vs. only at step boundaries) recorded in
`web-vs-claude-code.md`'s graphify section rather than here, since that's
where the rest of the graphify setup notes live.

Same shape as two corrections already made on this tool (the over-broad
`.claude/` ignore, and `cost.json`): graphify writes several things with
different lifetimes into one directory, so "commit the whole folder"
keeps needing refinement.

---

## 2026-08-31 (Claude Code session) — Step 23b-iv: optional commissary_id filter on GET /api/commissary/meats

Single-route change, exactly the scope dispatched: `GET /api/commissary/meats` gains an OPTIONAL `commissary_id` query param — omitted, it behaves exactly as before (every active commissary meat, unfiltered); when present, adds `AND commissary_id = ?` to the existing WHERE. Follows the same optional-filter convention `GET /commissary/yield-log` and `GET /commissary/daily-audit` already use in this file, deliberately not `GET /api/settings/meats`'s required-`restaurant_id` convention — six live pages call this route with no param today (`commissary.html`, `commissary-shipments.html`, `terminal.html`, `stock-receipts.html`, and `settings.html`'s Shipment Presets and Conversion Standards sections) and a required param would have broken all six in one commit. `meat_type_id` (added by 23c-i-b) stays in the SELECT. No page passes the new param yet — that's 23c-ii's job, landing the commissary selector on each consuming page incrementally.

`server/routes/commissary.test.js` gained a second `commissaries` row (Commissary B) and a commissary meat under it, plus 5 new tests: omitted param returns every active meat across both commissaries unchanged; a `commissary_id` filters to only that commissary's meats with `meat_type_id` still present; a second commissary's meats are excluded when filtering to the first; filtering to the second commissary returns only its own meat (confirming codes are unique per commissary, not globally, by reusing the same code `CM01` on both sides); an unknown `commissary_id` returns `[]` rather than erroring.

**Verified**: baseline full suite run first (14/14 files, 228/228 assertions, 0 failures) and again after (**14/14 files, 233/233 assertions, 0 failures** — the +5 new tests, no regressions elsewhere). `node --check` on both changed files. Live end-to-end check against a real booted server: unfiltered call still returns the full unfiltered list unchanged; created a second real commissary + meat, confirmed filtering to the first commissary excludes it, filtering to the second returns only it, unfiltered returns both, and an unknown `commissary_id` returns `[]`; confirmed `commissary-shipments.html` (one of the six unchanged consumers) still serves and still calls the route with no param. Test rows cleaned up afterward.

Pushed directly to `main`.

---

## 2026-08-31 (architect, web session) — 23b-iv resolved as an OPTIONAL filter; two stale doc entries corrected

Pure architecture, no code changed. Verified 23c-i-b's landed work first
rather than trusting its commit message: read the real diff (exactly the
two intended changes, nothing extra) and re-ran the full suite
independently — **14/14 files, 228/228, 0 failures**, matching the
session's own claim.

**Decision, made here before dispatch rather than left to a worker**:
23b-iv's `commissary_id` filter on `GET /api/commissary/meats` is
**optional**, not required. The dispatch-order list had said to mirror
the `restaurant_id` convention of `GET /api/settings/meats` — checking
that route showed it *requires* the param (400s without it,
`settings.js` ~L190), while this route has six live consumers that pass
nothing today (`commissary.html`, `commissary-shipments.html`,
`terminal.html`, `stock-receipts.html`, and `settings.html` twice —
Shipment Presets and Conversion Standards). A required param would have
broken all six in one commit against rule 17, and forced 23c-ii's
selector work to happen at the same time, collapsing the step sizing
this project has kept deliberately small. `commissary.js`'s own sibling
routes (`GET /commissary/yield-log`, `GET /commissary/daily-audit`)
already use optional filters — the doc had been pointing at the wrong
file's convention. Corrected in place, so the next worker reads one
consistent instruction instead of a prompt contradicting the doc.

**Also found while checking consumers**: `stock-receipts.html` calls
this route and is not listed in 23c-ii's page list. Flagged in
`session-status.md` as an open scoping question for 23c-ii, not decided.

**Doc drift fixed**: Round 2 numbered item 2 ("No commissary-meat-
creation UI either") still read as open, though 23b built the backend
CRUD and 23c-i built the tab. Marked done with both halves recorded.

---

Two-file fix, exactly the scope dispatched: 23b's rekey of `commissary_conversion_standards` from `commissary_meat_id` to `meat_type_id` had left `POST /api/commissary/conversion-standards` requiring `meat_type_id` while `settings.html`'s Create form still posted `commissary_meat_id`, a 400 on every attempt. `GET` and the inline `PUT` edit on that same section were never affected and stayed untouched.

`server/routes/commissary.js`'s `GET /api/commissary/meats` gained `meat_type_id` in its SELECT — purely additive, no filter/param change (a `commissary_id` filter on this same route is separate step 23b-iv, not built here). This was needed, not optional, because the Conversion Standards dropdown is populated from this route, which previously had no way to tell the page which meat type a selected commissary meat belongs to. The alternative — repointing the dropdown at `GET /api/settings/commissary-meats?commissary_id=N`, which already returns `meat_type_id` — was considered and rejected: that route requires a `commissary_id`, which would have forced a local commissary selector into this section, pulling 23c-ii's selector scope into a step deliberately sized as tiny.

`public/settings.html`'s Conversion Standards section: `loadCsCommissaryMeats()` now carries each option's `meat_type_id` via `data-meat-type-id`; the `#add-conversion-standard` handler resolves the selected option's tag and sends `meat_type_id` in place of `commissary_meat_id`. An untagged commissary meat is refused client-side before any request is sent, with the message specified in the dispatch prompt pointing the admin at the Commissary Meats tab. `loadConversionStandards()`, the PUT path, the Shipment Presets section's near-identical dropdown, and every other tab are untouched.

**Verified**: baseline full suite run first (14/14 files, 228/228 assertions, 0 failures) and again after (identical counts — `commissary.test.js` has no exact-shape assertion on the SELECT, so the added column was transparent, confirmed rather than assumed). `node --check` on both changed files. Live end-to-end check against a real booted server: seeded a meat type, tagged a real commissary meat with it via the existing (untouched) `PUT /api/settings/commissary-meats/:id`, confirmed `GET /api/commissary/meats` now returns `meat_type_id` for it, POSTed a standard with the exact `meat_type_id` body the fixed page now sends and confirmed it landed, confirmed the existing `GET` (still keyed by `commissary_meat_id`+`restaurant_id`) sees it, confirmed the inline `PUT` edit still works, and confirmed the client-side untagged-meat guard's logic in isolation (empty `data-meat-type-id` → refused, a real id → passes through). Test rows cleaned up afterward.

Pushed directly to `main`.

---

## 2026-08-31 (architect recheck #2, first one run from Claude Code) — 23c confirmed incomplete; orphaned Create-Standard bug given its own step

Pure architecture and docs, no code changed. Project owner asked whether
step 23c was still incomplete, and — separately — whether running the
architect side from the Claude Code terminal against the local checkout
is more token-efficient than the web sandbox that every prior architect
pass used.

**23c is not complete, and the docs were accurate about that.** Verified
against the real source rather than the doc claims: 23c-i is genuinely
done (`settings.html` L50-52 has all three tab buttons with matching
`<section>` panels at L174/185/195, backed by nine routes in
`settings.js` L64-186), and all three of 23c-ii's stated blockers are
real —
`computeCommissaryDailyAudit(db, businessDate, commissaryMeatId = null)`
has no `commissary_id` parameter and neither engine file mentions one
outside test fixtures; `GET /api/commissary/meats`
(`commissary.js` L35-41) is a flat `WHERE active = 1` with no filter
param at all; and `dashboard.js` L51-76 still iterates per
commissary-meat, with its own inline comment saying the grouping is not
built.

**Two real doc defects found in the process, both now fixed in
`session-status.md`:**

1. **A dead-code pointer in 23b's remaining-items list.** It told a
   future worker to thread `commissary_id` through
   `commissaryYieldEngine.js`'s `computeYieldLogForDate` "plus their two
   `GET` routes." `computeYieldLogForDate` has no route consumer —
   `grep` confirms only `commissaryYieldEngine.test.js` calls it. The
   live `GET /api/commissary/yield-log` builds its own query inline and
   calls `computeYieldRow` per id. A worker following that text would
   have patched a function nothing uses and left the actual route
   unfiltered. Corrected in both places it appeared.

2. **An orphaned regression.** 23b's rekey entry said `settings.html`'s
   broken "Create Standard" form would be fixed "until 23c ships a
   meat-type-aware picker." Both halves were wrong: 23c-i shipped
   without touching it, and 23c-ii is a commissary selector, an
   unrelated concern. The bug belonged to no step and was blocked on
   nothing, while being a previously-working admin screen that is broken
   today (rule 17's exact concern).

**Decision, project owner's call:** the Create-Standard fix becomes its
own tiny step, **23c-i-b**, dispatched ahead of the three backend items
rather than bundled into the first of them. Reasoning recorded in
`session-status.md` — it is independent of the `commissary_id` work and
touches a different tab, so bundling would mix unrelated concerns in one
worker prompt, which is what rule 16 and 23a/23b's own splits already
established as the thing to avoid.

**One scoping correction made during that decision:** 23c-i-b was
initially framed as frontend-only. It cannot be, cheaply — the section's
dropdown is fed by `GET /api/commissary/meats`, whose SELECT does not
return `meat_type_id`, so the page has nothing to resolve the selected
meat to a meat type with. The step now includes adding that one column
to the route's SELECT (purely additive). The frontend-only alternative
— repointing the dropdown at `GET
/api/settings/commissary-meats?commissary_id=N` — was rejected because
that route requires a `commissary_id`, which would force a local
commissary dropdown into the section and drag 23c-ii scope into a step
deliberately sized as tiny.

**Also flagged, not fixed here:** `session-status.md` is now ~1750 lines
and mixes current truth with fully-resolved Round 1/Round 2 narrative,
while every worker prompt still says "read this first."
`web-vs-claude-code.md` already flags the trim as worthwhile; moving
everything above the step-23 section into a dated archive doc would be
the single highest-leverage remaining docs cleanup, and it is a
docs-only change (rule 19: no suite run needed). Not done here — it
deserves its own pass rather than a rider.

**On the terminal-vs-web question:** the terminal is the better fit for
the build loop, but not primarily for the clone/`npm install` reason
`web-vs-claude-code.md` gives — that tax is one-time per session. The
larger win is `/clear` plus graphify: a fresh worker queries the graph
instead of re-reading the whole status doc cold. `.claudeignore`
already excludes `graphify-out/` from context uploads, confirmed, so
the graph stays query-only. Where the terminal loses is that an
architect pass spends the stronger model's budget on file reads a web
sandbox would have spent free-tier budget on — so architect sessions
should stay short and dispatch-focused.

**Still open, not blocking:** 23b-vi's grouped-rollup response shape.
Three candidate shapes were put to the project owner (group by
`meat_type` with nested per-commissary rows; keep flat rows and add a
`commissary_id` filter; two routes, flat detail plus grouped summary)
and the decision was deferred. It gates only 23b-vi, so 23c-i-b, 23b-iv,
and 23b-v can all ship first.

---

## 2026-08-31 (Claude Code session) — Step 23c-i: Commissary/Meat Type tabs + commissary-meat creation UI

Frontend-only, scoped exactly to the split-off 23c-i piece: three new tabs on `settings.html` (Commissaries, Meat Types, Commissary Meats), no backend or schema changes — all three of 23b session 3's `GET`/`POST`/`PUT /api/settings/commissaries` / `/meat-types` / `/commissary-meats` routes already existed and already had test coverage.

Commissaries and Meat Types tabs are exact structural mirrors of the existing Restaurants and Adjustment Types tabs respectively (Meat Types simpler — `meat_types` only has `name`+`active`, no extra flag column). The Commissary Meats tab mirrors the existing Meats tab, but since `commissary_meats` is scoped by `commissary_id` and there's no page-level commissary selector (unlike the page-level restaurant selector Meats/Dishes/Recipes already share), it gets its own local commissary dropdown — same pattern the Shipment Presets/Conversion Standards sections already use for their local commissary-meat dropdown. Fields: code, name, unit, allowed leeway %, cost/unit, and an editable meat-type dropdown (optional tag, not an identity field, same treatment `PUT` already gives it on the backend).

**Verified**: `node --check` on the extracted inline script (syntax), full existing suite re-run at **14/14 files green, 228/228 assertions, 0 regressions** (untouched — this is frontend-only), and a live end-to-end check against a real booted server — created/edited a commissary, a meat type, and a commissary meat via the exact fetch bodies the new JS sends, confirmed each response shape matches what the page's render/edit functions read, confirmed the served `settings.html` actually contains all three new tabs and their load calls. Test rows cleaned up from the dev DB afterward. No browser click-through (same open item every frontend step in this project has carried — no headless browser available).

Pushed directly to `main` (`29b3858`) — this session had git access, no zip fallback needed.

---

## 2026-08-31 (architect recheck) — 23c split into 23c-i/23c-ii; new backend gap found

Pure architecture, no code changed. Project owner asked to recheck all of
step 23 before dispatching a fresh Claude Code prompt. Full suite re-run
independently (not trusted from commit messages): **14/14 files, 228/228
assertions, 0 failures** — matches session-status.md exactly.

Rechecking 23c's three listed pieces against the real code found it isn't
one unblocked unit: the "commissary selector everywhere" piece
(`commissary.html`, `commissary-shipments.html`, Terminal, Dashboard
drill-down) depends on backend `commissary_id` filtering that doesn't
exist yet. Two of the three backend gaps were already flagged (23b's
"remaining 2 items"). A third wasn't: `grep`-confirmed zero
`commissary_id` references anywhere in `commissaryAuditEngine.js`,
`commissaryYieldEngine.js`, or the `GET /api/commissary/meats` route —
the same route Terminal's slot-1 resolution and the Shipment form's
dropdown both call. That route is a flat, unfiltered list today; adding
a frontend selector would have nothing to filter against.

Split 23c into **23c-i** (Settings tabs + commissary-meat creation UI —
fully unblocked, exact mirror of the Restaurants/Meats tab pattern,
backed entirely by 23b session 3's already-tested routes) and **23c-ii**
(the selector — blocked on all 3 backend gaps, now folded into 23b's
remaining backend work as a 3-item list instead of 2). Also noted 23c-i
is a real prerequisite for 23c-ii, not just sequenced first for tidiness
— there's no way to create a second commissary to test the selector
against until the Settings tab exists.

`session-status.md` updated to reflect the split and the new gap.
Dispatching 23c-i to Claude Code today.

---

## 2026-08-31 (Claude Code session 3) — Step 23b: Commissary/meat-type/commissary_meats admin CRUD

Third Claude Code (CLI) session, continuing 23b's remaining 5-item list. Scoped to 3 of the 5 per rule 16 and stopped there: **Commissary CRUD, meat-type CRUD, and `commissary_meats` CRUD**, each an exact mirror of an existing admin CRUD pattern already in `settings.js` (Restaurants, Adjustment Types, and Meats respectively). Stated and confirmed this boundary before coding.

New `GET`/`POST`/`PUT /api/settings/commissaries`, `/api/settings/meat-types`, `/api/settings/commissary-meats` (the last scoped by `commissary_id` the way Meats is scoped by `restaurant_id`; `meat_type_id` is editable via `PUT` since it's a tag, not an identity field like `code`). Confirmed `meat_types` has no `UNIQUE(name)` in `schema.sql` (unlike `adjustment_types`) before writing a test asserting a duplicate name is currently allowed — checked, not assumed. Deliberately left `commissary.js`'s existing `GET /api/commissary/meats` untouched — a different, already-working active-only read route feeding the Shipment form's dropdown, no overlap with this admin CRUD work.

**Explicitly NOT done this session, per the stated boundary**: the remaining 2 of 23b's 6 items —
1. Threading an optional `commissary_id` filter through `commissaryAuditEngine.js`'s `computeCommissaryDailyAudit` and `commissaryYieldEngine.js`'s `computeYieldLogForDate` (both currently list across *every* commissary's meats with no per-commissary filter option) plus their two `GET` routes in `commissary.js`.
2. The fuller Dashboard rollup restructuring (grouping multiple commissaries' same-`meat_type_id` rows into one combined line, per 23b's own item 6 description).

**Flagged rather than decided**: item 5/6's exact grouped-rollup response shape isn't specified anywhere in `data-model.md`/`session-status.md` — they describe the intent (a combined grand total, a future per-location drill-down) but not the concrete API shape once multiple commissaries can share a `meat_type_id`. Left for the architect to resolve before a future session builds it, not guessed here.

**Verified**: 21 new tests in `settings.test.js` (Commissaries: 6, Meat Types: 5, Commissary Meats: 10), full suite **14/14 files, 228/228 assertions, 0 regressions** (was 207). Live end-to-end against a real booted server: created a commissary, a meat type, and a commissary meat over real HTTP; confirmed a duplicate commissary code is rejected; confirmed a duplicate `commissary_meats` code is rejected within one commissary but the identical code is accepted under a second commissary (the exact behavior `UNIQUE(commissary_id, code)` from 23a's schema change exists to allow).

## 2026-08-31 (Claude Code session 2) — Step 23b sub-piece: commissary_conversion_standards' rekey + its consumers

Second Claude Code (CLI) session on this project, continuing from 23a. Scoped narrowly per rule 16: only item 1 of 23b's 6-item list (the `commissary_conversion_standards` rekey and its direct engine/route consumers), not the other 5 items (Commissary/meat-type/commissary_meats CRUD, per-commissary engine params, the fuller cross-commissary Dashboard grouping). Stated and confirmed this boundary before coding.

**Schema + migration** (`server/db/schema.sql`, `server/db/migrate.js`'s new `migrateConversionStandardsMeatType`): drops `commissary_meat_id`, adds `meat_type_id` (NOT NULL FK), reworks `UNIQUE` to `(meat_type_id, restaurant_id, meat_id)`. The migration creates/reuses one `meat_types` row per *distinct* commissary meat referenced by an existing standard (two standards for the same commissary meat correctly resolve to the same type, not two), tags that `commissary_meats` row, and rewrites each standard's key column — same rebuild-and-rename pattern as every other migration in this file, sequenced after 23a's `migrateCommissaryMultiTenant` since it needs `commissary_meats.meat_type_id` to already exist.

**Route/engine consumers, not left broken by the rekey**: `commissary.js`'s `GET /commissary/conversion-standards` deliberately keeps its public contract (`commissary_meat_id` + `restaurant_id` in) — callers like the Shipment form still only know which specific commissary meat they're shipping, not its abstract type — and resolves internally via that meat's `meat_type_id`, returning `[]` for an untagged meat rather than erroring (matches "untagged/raw-dynamic meats are unaffected" from the design). `POST` now takes `meat_type_id` directly, since admin creation is inherently about the type, not one commissary's specific catalog row. `dashboard.js`'s per-commissary-meat rollup query got the matching minimal fix to stay correct — **not** the fuller "group Commissary A's and Commissary B's same-type rows into one line" restructuring 23b's item 6 describes, which stays explicitly open, not decided here.

**Known, flagged gap — not fixed this session, 23c's job**: `settings.html`'s "Create Standard" admin form still POSTs `commissary_meat_id`; it will fail the rekeyed route's validation until 23c ships a meat-type-aware picker. `GET` and `PUT` (edit) on that same page are unaffected — their own contracts didn't change.

**Verified**: 7 new tests in `migrate.test.js` (15/15 total), `commissary.test.js`/`dashboard.test.js` fixtures updated to the new schema (47/47 and 8/8 respectively, no test count change — same coverage, new field names). Full suite: **14/14 files, 207/207 assertions, 0 regressions** (was 200). Beyond mirrored-logic tests: a real on-disk `inventory.db` built with the literal pre-23a-*and*-pre-23b shape, booted through the real `connection.js`, confirming both migrations chain correctly in sequence. Live end-to-end against a real booted server: `GET` returns `[]` for an untagged meat, `POST` rejects both the old field name and an unknown `meat_type_id`, a real standard created via `meat_type_id` resolves correctly through the unchanged `GET` contract, and the dashboard rollup picks it up (`standardCount: 1`) without erroring. Committed in two pieces: schema+migration+migrate-tests, then route/engine fixes+fixture updates.

## 2026-08-31 (final) — .gitattributes: commit it, but flag the merge-driver gotcha

`graphify hook install` wrote `.gitattributes` (`graphify-out/graph.json merge=graphify`) — this gets committed, same category as `.gitignore` itself, not ignored. But the actual merge-driver logic lives in local `.git/config`, which never travels with a clone. Flagged in `web-vs-claude-code.md`'s graphify section: every fresh clone (teammate, new machine, fresh Claude Code checkout) needs `graphify hook install` run once before `graph.json` merges cleanly, or git falls back to normal conflict-marker merging on it.

## 2026-08-31 (later) — graphify's first real build, committed

First full `/graphify .` run, read directly from the committed `GRAPH_REPORT.md` rather than trusting the terminal summary alone. 73 files (40 code, 33 docs) → 446 nodes, 673 edges, 27 communities. 94% EXTRACTED / 6% INFERRED (avg confidence 0.83 on inferred edges), 336,934 input tokens to build.

**Known limitation, not fixed**: 70 dangling edges, concentrated in `public/*.html` → `/api/...` references, where the HTML-extraction subagent invented its own endpoint node IDs instead of matching the AST's real `server/routes/*.js` node IDs. Not worth a re-extraction pass — narrow, identifiable failure mode. Standing rule instead: verify against the real route file when a query surfaces an HTML-page-to-API-endpoint edge specifically; trust everything else normally. This is also why `--strict` mode isn't turned on yet (see the earlier token-efficiency entry) — nudge mode lets a session fall back to reading the real file when something looks off, strict wouldn't.

**Worth knowing when reading the graph, not a defect**: the "Graphify Skill Docs" community (44 nodes — the graph's second-largest) is graphify's own reference documentation about itself, indexed alongside the app since it lives under `.claude/skills/graphify/references/`. Several "surprising connections" the report surfaces (e.g. `computeMeatAudit()` "bridging" to Graphify Skill Docs) are `INFERRED` semantic-similarity edges between docs *about persistent context* (`session-status.md`, graphify's own pitch) rather than real code relationships — expected noise from indexing the tool's own docs into the same graph as the app, not a real architectural finding.

Committed: `graphify-out/` (76 files, 1.2M — `graph.html`, `graph.json`, `GRAPH_REPORT.md`, `manifest.json`, semantic cache). `graphify-out/cost.json` correctly excluded per `.gitignore`. `graphify hook install` run — post-commit/post-checkout hooks + the `graph.json` merge driver are now active locally (not tracked in git, that's normal — hooks live in `.git/hooks/`, never committed).

## 2026-08-31 (Claude Code session) — Step 23a: schema + migration for multi-Commissary generalization

First Claude Code (CLI) session on this project, per rule 18's 2026-08-31 addendum. Built exactly the schema+migration slice of item 3's already-resolved design (`data-model.md` section 10b): new `commissaries`/`meat_types` tables, `commissary_meats` gains `commissary_id` (NOT NULL FK) + `meat_type_id` (nullable FK), `UNIQUE(code)` reworked to `UNIQUE(commissary_id, code)`. No routes, no engine changes, no UI.

**Scope conflict found and resolved before coding, not silently decided**: the assigned scope also included rekeying `commissary_conversion_standards` from `commissary_meat_id` to a NOT-NULL `meat_type_id`. Checking the actual code first showed this would immediately break `server/routes/commissary.js`'s existing shipment/standards write path plus 2 test files' `commissary_conversion_standards` fixtures (`commissary.test.js`, `dashboard.test.js`) — conflicting with rule 17 (never leave working behavior broken) and rule 19 (full suite green). Asked the project owner directly rather than guessing which side to break: resolved to defer that table's rekey entirely to step 23b, bundled with the route/engine changes that actually consume `meat_type_id`. Not touched in this session at all — schema, route, or tests.

**Migration** (`server/db/migrate.js`'s new `migrateCommissaryMultiTenant`): mirrors the existing `migrateStockReceiptsNullableDestination` rebuild-and-rename pattern (NOT NULL columns and constraint changes aren't a plain `ALTER TABLE ADD COLUMN`). Since `commissaries`/`meat_types` are themselves brand-new tables a pre-23a database won't have, the migration creates them itself (matching `schema.sql`'s definitions exactly) before rebuilding `commissary_meats`, backfilling one real `commissaries` row (`COM-A`, "Commissary A") and pointing every existing row at it. Wired into `connection.js` before `schema.sql`, alongside the three existing migrations.

**Real fixture fallout, fixed as real 23a work** (not deferred, per the project owner's explicit boundary): `commissary_meats`' new NOT NULL `commissary_id` broke `seed.js` and 6 existing test files that raw-inserted `commissary_meats` rows without it (`activityLog.test.js`, `commissaryAuditEngine.test.js`, `commissaryYieldEngine.test.js`, `commissary.test.js`, `dashboard.test.js`, `history.test.js`). Each now creates/references a real `commissaries` row first. `seed.js` seeds one `COM-A` row itself (matching the migration's own default) rather than reading a new JSON file, since there's still only ever been one real commissary.

**Verified**: new `server/db/migrate.test.js`, 8/8 assertions — fresh-install no-op, already-migrated no-op, exactly one `commissaries` row created, every existing row's data preserved with `commissary_id` backfilled correctly, row count unchanged, the new `UNIQUE(commissary_id, code)` actually permits the same code under a second commissary while still rejecting a duplicate under the same one, and idempotent on a second run. Beyond the in-memory unit tests, also verified against a real on-disk `inventory.db` built with the literal pre-23a table shape (no `commissary_id`, global `UNIQUE(code)`) — booted the real `connection.js` against it and confirmed the migration ran for real, not just in a mocked scenario. Full existing suite re-run: **14/14 files, 200/200 assertions, 0 regressions** (was 192). `seed.js` re-run twice confirming idempotency (0 inserted the second time). Committed in two pieces per rule 16: schema+migration+migrate-tests, then the fixture fixups.

## 2026-08-31 (yet later) — Correction: .claude/ gitignore was too broad

Caught before it caused a real problem — the project owner asked whether `CLAUDE.md` (written by `graphify claude install --project`) needed its own ignore entry, which prompted a recheck against graphify's actual docs. It doesn't: `CLAUDE.md` and `.claude/skills/graphify/` (the project-scoped skill install) are meant to be **committed** — graphify's own docs print a `git add` hint for them. The earlier `.gitignore` entry (a blanket `.claude/`) would have silently blocked that. Narrowed to `.claude/settings.local.json` only, the actual machine-local file (API keys, personal tool permissions). See `web-vs-claude-code.md`'s graphify section for the corrected note.

## 2026-08-31 (later still) — graphify adopted for token efficiency, starting step 23a

Confirmed what graphify (github.com/Graphify-Labs/graphify) actually does after the project owner linked it: a local, deterministic code+docs knowledge graph with a first-class Claude Code integration (`graphify hook install` keeps it current on every commit; `graphify claude install [--project] [--strict]` nudges/redirects raw file reads toward graph queries). Directly answers the `session-status.md`-size problem flagged in the prior entry, and pairs with the project owner's `/clear`-after-each-feature discipline specifically because the graph persists on disk (and in git) independent of the conversation being cleared — see `web-vs-claude-code.md`'s expanded token-efficiency section for the full reasoning.

Adopted starting at step 23a, not retroactively. `.gitignore` gets one more line (`graphify-out/cost.json` — local-only, everything else in `graphify-out/` is meant to be committed). New `.claudeignore` added, separate from `.gitignore` and serving a different purpose: excludes `graph.json`/`graphify-out/` from Claude Code's own context uploads (queried via CLI, never read as raw context) so repeated `graphify extract`/`update` calls don't invalidate Claude Code's prompt cache — per graphify's own troubleshooting notes.

Flagged as genuinely untested on this specific repo — treat as "on" but not yet fully trusted for a step or two.

## 2026-08-31 (later) — Workflow doc correction: past workers were free-tier web chat, not Claude Code; .gitignore for Claude Code state

Project owner clarified directly: every "coder worker" step done so far (1–22, all of Round 2, item 3's design) was free-tier Claude.ai web chat, per rule 18's file-handoff pattern — not literal Claude Code. `web-vs-claude-code.md` had been written as if Claude Code was already in use; corrected, and rule 18 in `rules-for-claude-code.md` got a matching addendum. Claude Code's push-credential status (whether it can push directly, collapsing most of rule 18's handoff branch) is flagged as **unconfirmed**, not assumed — a session should try `git push` and fall back to the standard handoff format on failure until this is settled one way or the other.

Also added a "Token-efficiency notes" section to `web-vs-claude-code.md`, raised directly by the project owner: `session-status.md` has grown to 1700+ lines mixing current truth with fully-resolved historical narrative, and every session pays to read all of it per the standing instruction. Flagged as a real, worthwhile cleanup (trim to current/active state, move resolved history into `changelog.md` or an archive doc) — not done in this session, deserves its own pass. A "graphify" skill the project owner mentioned isn't visible from this web chat session; flagged as possibly relevant to the same problem, not designed around without knowing what it does.

`.gitignore`: added `.claude/` (Claude Code's local project config/state — machine-specific, shouldn't be committed), alongside the existing `*.db`/`.env` exclusions.

## 2026-08-31 — Architecture session: item 3's rekey resolved, multi-stage yield/allocation fully designed, real seed-data gap found

Pure architecture — no code changed. Two things resolved through real back-and-forth with the project owner:

**Item 3 (multi-Commissary generalization)**: the one open question left from 2026-08-30 — how `commissary_conversion_standards`' uniqueness reworks now that `commissary_meat_id` needs its own `commissary_id` scoping — is resolved as a real column swap: the table's key moves from `commissary_meat_id` to `meat_type_id`. Full table shapes for `commissaries`/`meat_types`, the `commissary_meats` rework, and the migration plan for today's single implicit commissary are in `data-model.md` section 10b. Sub-step plan confirmed: 23a (schema) → 23b (engine/routes) → 23c (UI), same shape as step 20's 20a/20b/20c split. Not started.

**Multi-stage yield + Commissary-side allocation**: both real scenarios (Shortplate's sear→braise chain, Chicken's processed→Miscuts split) resolved into one mechanism — a new nullable `output_commissary_meat_id` column on `commissary_yield_log` (NULL = today's same-row behavior, unchanged; set explicitly for a genuinely different output item), plus a new `commissary_adjustments` table (parallel to the restaurant-scoped `adjustments`, `kind` = `LOSS` or `ALLOCATION`) for redirecting or writing off processed stock. See `data-model.md` section 10b for the exact shapes.

**A real, previously-unflagged find while checking this against actual code**: `commissary-seed-data.json` already seeds three raw/backed pairs as separate catalog rows (`M01`/`M02` Whole Chicken, `M03`/`M04` Belly Slab, `M05`/`M06` JOWL) that no route or engine has ever referenced — `commissary_yield_log` only ever had one `commissary_meat_id` column, so the "Raw" rows were vestigial. Confirmed by the project owner: intentional, not dead data — not every meat gets backed up same-day. `output_commissary_meat_id` finally wires these up; no new seed rows needed, no historical data to migrate since nothing ever referenced them.

Also reconfirmed as a real, still-unfixed bug (flagged 2026-08-30, not yet built): `getCommissaryUsage` never counts a yield event's `raw_weight_in` as an outflow for the input meat — only `commissary_shipments` counts as usage today. Bundled into step 24a as a prerequisite fix, not a separate step, since the output-column change is meaningless without it.

Sequencing: 23a/23b/23c (item 3) first, since multi-stage yield's Miscuts tagging depends on `meat_types` existing. Then 24a (usage-formula fix + schema) → 24b (engine/routes) → 24c (UI). Full reasoning in `session-status.md`'s "Item 3 design" and "Multi-stage yield + Commissary-side allocation" sections.

Doc updates this session: `session-status.md` (both sections above), `data-model.md` (new section 10b + a note flagging that section 10 predates several live tables — not fixed here, just flagged).

## 2026-08-30 (later) — Architect review of all 4 worker sessions: one real regression found and fixed

Pulled all four workers' pushed work and independently verified each rather than trusting commit messages — full suite run, live checks against a real booted server, and direct code reads.

**Found a real regression**: worker 1's retirement of the older Commissary balance calculation (`getCommissaryBalance`/`listCommissaryBalances`, see the item-5 entry above) correctly removed both functions from `commissaryYieldEngine.js`, but left the 6 tests that directly called them still in `commissaryYieldEngine.test.js` — not a stale mirror silently passing, an outright `TypeError: getCommissaryBalance is not a function` failure. Removed the whole block (the functions' own retirement note already covers the historical reasoning; not duplicated into the test file) and fixed the now-unused import. 15/15 in that file, was failing 6/22 before this fix.

**Everything else checked out clean, no further issues found**:
- Restaurant-creation CRUD (item 1): live-tested, a real restaurant (`Likod`) created and confirmed appearing via `GET /api/restaurants`.
- Conversion Standards admin UI (item 3): both new Settings tabs coexist correctly — the parallel-edit conflict flagged when these two tasks were dispatched never actually materialized, both landed cleanly.
- The 4 cleanup fixes (see the entry above) — each independently re-verified, not just trusted.

Full suite after all fixes: **192/192, 0 failures.** This is now the true, verified state of `main` — not just what the commit messages claimed.

## 2026-08-30 — Item 4 continued: systematic cleanup pass, four small real fixes

A worker session tasked with the rest of item 4's cleanup pass (only `commissary_meat_map`'s retirement had been fixed so far, not a full sweep). Found and fixed four small, genuinely real issues — none large enough to need their own design discussion, all verified individually:

- **`dashboard.html` was missing the History nav link** every other page has. Plain oversight from whichever step first added that page, not caught since.
- **A stale comment in `daily-audit.html`** still described In-House/Wastage/Other as live-edited fields on the dish/meat rows, even though step 22 replaced that whole mechanism with a read-only Adjustments cell fed by the dedicated Allocations page.
- **A stale top-of-file comment in `server/index.js`** described the app as toolchain-confirmation-only — leftover from very early in the project, despite 9 route modules being mounted below it by now.
- **A real mirrored-logic gap in `sales.test.js`**: `patchSales()`'s test helper was missing the two top-level validation branches the real `PATCH /api/sales` route actually has (required-fields check, `business_date` format check) — the same category of risk that bit `stockReceipts.test.js` and `commands.test.js` before (a mirror that's silently narrower than the route it's supposed to represent, still passing, just not proving what it looks like it proves). Added both branches plus two new tests; 15/15 in that file now, was 13.

**This changelog/session-status entry is being written after the fact, by the architect session, not the worker** — the worker's own task said to update these docs and didn't. Flagging that plainly rather than letting it look like it happened at the time. All four fixes were independently re-verified before writing this: `sales.test.js`'s two new validation messages checked character-for-character against the real route (`server/routes/sales.js` lines 43/113/116), and the full suite re-run clean (192/192 — see the note below on the one real regression also found and fixed this pass, unrelated to this worker's own commits).

## 2026-08-30 — Round 2 findings item 3 (numbered-list item, not the design item): Conversion Standards admin UI

Closed the gap flagged in Round 2 findings' numbered list, item 3: `GET`/`POST`/`PUT /api/commissary/conversion-standards` already existed and worked (from the earlier "Item 5: Conversion Standards" work), but there was no Settings page for it - only read-only consumption on `commissary-shipments.html`'s implied-input hint. Creating a standard required calling the API directly. (Not to be confused with the separate, still-undiscussed "item 3 design" - multi-Commissary generalization - higher up in `session-status.md`'s Round 2 findings section; that's a different, larger piece of work this session did not touch.)

**No backend changes.** Built entirely against the existing routes in `server/routes/commissary.js` - no bug found while doing so, nothing flagged.

**Frontend**: new "Conversion Standards" tab on `public/settings.html`, same structural pattern as the Shipment Presets section (the closest template, per the same shape: pick a commissary meat + restaurant, list/create/edit entries for that pair) - restaurant comes from the page-level selector already used by every other tab; a local commissary-meat dropdown plus that restaurant together identify the `(commissary_meat_id, restaurant_id)` pair. Existing standards for the pair show in an editable table (ratio/notes/active, PUT on change); a form below adds a new standard (destination meat scoped to the current restaurant via the existing `/api/stock-receipts/meats` endpoint, ratio, optional notes, POST). `commissary_meat_id`/`restaurant_id`/`meat_id` aren't editable in place, matching the route's own "a different pairing is a different standard" comment and the identical non-editable-identifying-fields pattern the Presets section already uses.

**Verified live**: booted the server against a freshly reseeded DB and drove the exact request shapes the new UI sends - POST a new standard (Jowl → FC's Bagnet, ratio 0.3) succeeded; a duplicate-pairing POST correctly hit the existing "already exists" error; PUT edited ratio/notes/active and a follow-up GET reflected the change; confirmed `settings.html` serves with the new markup present. Full suite (`node --test` across all 13 test files) run both before starting and after the code change - 13/13 green both times, 0 regressions - no new backend tests needed since the routes already had coverage from the earlier Conversion Standards work.

This worker had no push credentials (`git push` failed with a credential error, same read-only pattern noted in `rules-for-claude-code.md` rule 18) - standard handoff format used, not yet on `main` as of this writing.

## 2026-08-30 — Round 2 findings item 1: Restaurant-creation CRUD (backend + Settings UI)

Closed the gap flagged in Round 2 findings item 1: `restaurants` rows only ever came from `seed.js` reading a JSON file - no way to create one through the app, which blocked the stated goal of handing this app to a new branch for genuine self-onboarding. Deliberately kept separate from the Commissary-creation work (item 3's design), same kind of gap but a different step, per that item's own note.

**Backend**: `GET`/`POST`/`PUT /api/settings/restaurants` added to `server/routes/settings.js`, matching the exact CRUD shape already used for Meats/Dishes/Adjustment Types/Locations in that file - read those first rather than inventing a new pattern. GET returns every row (not just active), same as the other settings list routes, so the admin table can list and reactivate. POST requires `name` + `code`, uppercases `code` (matches `meat_code`/`dish_code`), and gives the same friendly "already exists" error on the UNIQUE constraint. PUT edits `name`/`active` only - `code` is set once at creation and isn't part of the edit shape, same as meat/dish codes elsewhere. No `activity_log` wiring: this is settings/config data, not a daily transactional log, same reasoning already given for Adjustment Types/Locations.

**Frontend**: new "Restaurants" tab on `public/settings.html` (now the first tab), same add-form + editable-table pattern as the Locations section. Wired to also refresh the page-level Restaurant selector and the Locations tab's restaurant dropdown after any create/edit, so a newly-created restaurant is immediately usable everywhere else on the page without a reload.

**Tests**: `server/routes/settings.test.js` is a new file - the old one was deleted during item 4's cleanup pass since it only covered the retired commissary-mapping routes. 10 mirrored-logic tests (same in-memory-DB, no-framework style as `dailyAudit.test.js`/`stockReceipts.test.js`): create with/without required fields, duplicate-code rejection, edit name/active, code staying immutable across an edit, and confirming an inactive restaurant still appears in this settings list even though it drops out of the existing active-only `GET /api/restaurants` used elsewhere.

**Verified**: full suite 13/13 files green, 0 regressions against this session's actual pulled baseline (which by the time of this entry also includes item 5's Commissary balance retirement, landed by a separate worker on a completely disjoint set of files - re-ran the full suite after pulling that in too, still 13/13, still 0 regressions). Verified live against a real running server (fresh `seed.js` + `node server/index.js`): created a restaurant via HTTP, confirmed duplicate-code and missing-field rejection, edited name/active, confirmed the inactive row still lists here but drops out of `/api/restaurants`, reactivated it, and - the actual point of this step - confirmed the brand-new restaurant could immediately take a new meat via the existing `POST /api/settings/meats`, proving the onboarding gap is closed end-to-end, not just that the route returns 200.

**Handoff note**: this worker had no `git push` credentials (read-only clone) - see the session's own handoff message for the exact `git add`/`git commit` commands and file list, per rule 18's standard-handoff format.

---

## 2026-08-30 (later) — Round 2 item 5: retired the older, incomplete Commissary balance calculation

Two disagreeing "what does Commissary currently have" calculations were both live: `commissary.html` calling `GET /api/commissary/balances` → `commissaryYieldEngine.js`'s `getCommissaryBalance`/`listCommissaryBalances` (lifetime backed-in minus shipped-out, no date, no `commissary_stock_receipts`/New Stock concept at all, no physical-count comparison), versus `commissary-shipments.html`/the Dashboard's `GET /api/commissary/daily-audit` → `commissaryAuditEngine.js`'s `computeCommissaryMeatAudit` (a proper Beginning + Stock In + Backed Up − Usage = Ending daily audit, correctly including New Stock, comparable against a real physical count). The newer one was strictly more correct and complete, per Round 2 findings item 5.

Retired the older path: removed `getCommissaryBalance`/`listCommissaryBalances` (and their now-dead formula/verification doc comment) from `commissaryYieldEngine.js`, removed `GET /api/commissary/balances` from `commissary.js`. `commissary.html`'s "On-hand balance" section now calls `GET /api/commissary/daily-audit` with a new date field (defaults to today, same pattern `commissary-shipments.html`/`dashboard.html` already use) and shows current on-hand via "prefer the real physical count, fall back to calculated ending" - the same convention `dashboard.js`'s `currentBalance` already uses for the same kind of question. Fixed a stale comment in `commissaryAuditEngine.js` that referenced the now-deleted function. `commissary_yield_log`/`commissary_stock_receipts` themselves untouched - read-side retirement only, no schema change.

Rewrote `commissaryYieldEngine.test.js`'s balance section (7 tests plus their now-unused seed fixtures) the same way `stockReceipts.test.js` was rewritten in item 4 - they were mirrored-logic tests of the retired functions and would have kept passing against dead code. Full suite was 187/187 before, 180/180 after (down exactly 7, matching the removed tests), 0 regressions elsewhere.

**Verification note**: no network access this session (`github.com`/`registry.npmjs.org` both blocked), so `express` wasn't installable and no real HTTP server could be booted - same limitation `commissary.test.js`'s own header already documents hitting before. Verified instead by calling `computeCommissaryDailyAudit` directly (the exact function the route calls) against a realistic seeded scenario - beginning 20 + stock in 10 + backed up 12 − usage 8 = 34 calculated, correctly overridden to 33.5 by a real physical count, confirming New Stock is now included and the balance card would show a sensible, physically-grounded number. The old route's absence was confirmed by direct code removal, not by a live 404. A real HTTP click-through against a booted server, and a visual check of the new date field on `commissary.html`, are still owed next time a session has network/npm access.

---



Built the AutoCAD-style layout the project owner proposed and step 21's session-status.md entry deferred until backend/logic work settled (steps 20/21b and everything since are now done). Pure frontend layout work on `public/terminal.html` - no backend, no changes to the slot state machine (`splitInput`, `updateStateMachine`, `validateCommitted`, `computeSlotStatus`, `tryAssemblePayload`, `handleSubmit`, keyboard handling) or any route.

**What changed**: the command bar (`.term`) is now `position: fixed`, docked bottom-center, non-modal - page content (nav, h1, description, submit-status, "Last saved shipment" panel) stays visible and scrollable above it, `body` padding-bottom reserves the space so nothing hides behind the dock. Internal stacking flipped: the input line sits at the very bottom edge (nothing below it to push into), with the hint bar, slot guide, and dropdown stacking upward above it - the dropdown in particular now opens above the input instead of below, since a bottom-docked bar has no room underneath. The always-visible "Recent commands" panel is gone, replaced by a togglable right-edge slide-in `#history-sidebar` (a `translateX` toggle button, top-right) - a different axis than the input-anchored dock/guide/dropdown, so the two never compete for space, matching the resolved design. Up-arrow history recall (already built, step 21a) is untouched and works regardless of sidebar open/closed state. `renderHistoryList()`/`pushHistory()` are reused exactly as before - only the DOM container they render into moved.

**Two layout calls made and flagged, not covered by the resolved design note** (which only specified history moving to a sidebar): the sidebar slides from the right edge (no side was specified), and the "Last saved shipment" panel stays in normal in-page flow rather than moving into the sidebar (only history was named as moving).

**Verified live**: `node --check` on the extracted inline script (clean). Booted the real server against freshly-seeded data; confirmed `terminal.html` still serves (200) and all three endpoints it depends on (`/api/commissary/meats`, `/api/restaurants`, `/api/stock-receipts/meats?restaurant_id=`) still return 200. Drove the *actual* extracted script through a Node `vm` context with a real `fetch` (raw HTTP against the live server, not a stub) - typed through all five slots of `ship jowl fc 5 <meat>:5`, confirmed the hint bar and slot guide render correctly at each step (including the "done" slot styling and a deliberately-bad-token error case), then called the real `handleSubmit()`: it created a real `commissary_shipments` row (id=1, correct meat/restaurant/qty) via the real `POST /api/commissary/shipments` endpoint, cleared the input, and recorded the line to `terminal_command_history`. Confirmed the row directly in the SQLite file, then cleaned up the test database afterward. Full backend suite re-run clean after the change: **12/12 files, 178/178 assertions, 0 regressions** (matches the pre-change baseline exactly, as expected for a frontend-only change).

**Still genuinely untested**: same standing gap as 21a/21b - no real mouse/keyboard browser click-through, and nobody has visually confirmed the docked bar or sidebar animation actually looks right at a real viewport size (only that the CSS is well-formed and the underlying script still functions correctly headlessly).

---

## 2026-08-29 (later still) — Item 6: over-sold check now uses the fuller running balance where possible

Revisited the interpretation flagged as stale while building the Portion Actual write path: `GET /api/commands/oversold-check` used a same-day-only formula (`sold > prepped`) specifically because the fuller running balance depended on `portion_ending_actual`, which had no write path. That write path exists now.

New behavior is a hybrid, not a straight swap: uses the fuller running balance (`portionBeginning + prepped - sold < 0`) wherever a beginning count is actually established for a dish/date, falls back to the original same-day check where it isn't (`MISSING_BEGINNING_STOCK`) - same graceful-degradation pattern used everywhere else in this app. The fuller check matters in practice, not just in theory: a dish batch-prepped once and sold down over several days would false-positive on every zero-prep day under the old check, since it never accounted for carryover stock.

Rewrote the route to call `computeDishAudit` directly per candidate rather than maintaining a second, parallel SQL aggregate - single source of truth for both same-day figures and the running balance, no risk of the two drifting apart.

Caught a real problem in the existing tests before adding anything new: `commands.test.js`'s `runOversoldCheck` was a stale mirrored copy of the *old* logic - it happened to still pass numerically because none of its fixtures ever set a beginning count, so every case coincidentally exercised only the fallback branch. Rewrote the mirror to match the real route, and added two new tests exercising the fuller branch directly - the main motivating case (carryover correctly not flagged) and its counterpart (genuine over-selling still correctly flagged even with carryover).

15/15 in `commands.test.js` (was 13), full suite 187/187, 0 regressions. Verified live with the exact real motivating scenario: prep 50/sell 10/actual 40 on day one, sell 10 more on day two with zero new prepping - confirmed day two is correctly NOT flagged, which the old same-day check would have gotten wrong.

## 2026-08-29 (later still) — Portion Actual write path for BATCH_PREPPED dishes

Closed a real gap open since step 11: BATCH_PREPPED dish rows on Landing have been display-only the whole time - there was never a write path for `prepped`/`portion_ending_actual`, so portion variance could never move past "missing actual count" for any Batch-Prepped dish.

New `POST /api/daily-audit/portions` in `server/routes/dailyAudit.js` - same real SQLite upsert pattern (`ON CONFLICT ... DO UPDATE`) `ending_actual` already uses, against `prepped`/`portion_ending_actual`'s own `UNIQUE(restaurant_id, dish_id, business_date)` constraints. A manual write always wins over a SYSTEM row from step 15's "Sync batch stock" command - confirmed by reading commands.js directly, not assumed: sync-batch-stock's own query explicitly skips dishes that already have a `prepped` row, so a manual entry arriving after a sync-generated one is the auditor correcting an inferred default, which should take precedence.

Frontend: `daily-audit.html`'s dish rows are now editable for Prepped/Portion Actual, with live recalculation of Ending(calc)/Variance/Status mirroring `computeDishAudit` exactly - same pattern step 13 already built for meat rows. Save button now posts to both `/api/daily-audit` (meat rows) and the new `/api/daily-audit/portions` (dish rows) in one save action.

13 new tests in `dailyAudit.test.js` (was scoped to step 12 only, extended), including one that exercises the write path end-to-end through the real `computeDishAudit` function, not just checking rows landed in the table - confirms day two's portion beginning correctly derives from day one's actual count, not just that the INSERT succeeded. Full suite 185/185, 0 regressions.

Verified live end-to-end: real dish, real save, day one correctly shows `MISSING_BEGINNING_STOCK` with no prior actual, day two correctly shows `portionBeginning: 18` derived from day one's real saved actual count.

## 2026-08-29 (later still) — Item 4: Cleanup pass - retired commissary_meat_map's remaining code paths
Found the first real thing to clean up: the "full retirement of commissary_meat_map" decided several turns back (session-status.md's step-20 entry) was designed but never actually implemented - the manual COMMISSARY-source path in `stockReceipts.js`, the whole "Unallocated" receipt concept, and the admin CRUD/UI in `settings.js`/`settings.html` were all still live.

Implemented as designed: `POST`/`PATCH /api/stock-receipts` now accept `DIRECT` only - a manual `source: COMMISSARY` entry is rejected with a message pointing to the Shipments page, since that's the only place a `COMMISSARY`-sourced row gets created now. Removed the whole Unallocated concept (restaurant_id/meat_id left NULL pending later assignment) along with it - it only ever existed to support the retired manual path. `commissary_meat_map`'s admin CRUD routes and its "Commissary Mapping" tab on Settings are gone. The `commissary_meat_map` table itself, and its `CHECK` constraint still technically permitting the old NULL/NULL/COMMISSARY shape, are both untouched - no destructive schema changes.

Found and fixed a genuine test-suite problem while at it, not just app code: `stockReceipts.test.js`'s 17 tests were all mirrored-logic tests of the *old* behavior, duplicated inline - they still passed after the retirement because they were testing stale copied logic that no longer matched the real route, which would have been actively misleading. Rewritten to match reality (11 tests now). `settings.test.js` turned out to be dedicated entirely to the retired routes with nothing else to test - deleted outright rather than left as an empty shell.

Full suite: 178/178 (down from 209 - 31 fewer tests for genuinely retired functionality, not a coverage loss). Verified live: `DIRECT` still works, manual `COMMISSARY` and the old Unallocated shape are both correctly rejected, `settings.html` no longer references the removed feature, and - the real regression risk this change carried - `POST /api/commissary/shipments` still works end-to-end, confirming it never actually depended on any of the retired code (it always wrote `stock_receipts` directly).

## 2026-08-29 (later still) — Item 2: Management Dashboard (cross-location stock rollup)

New `GET /api/dashboard/stock-rollup?date=&restaurant_ids=` (`server/routes/dashboard.js`) — rows = every active Commissary meat, columns = Commissary's own balance plus one reverse-converted total per selected restaurant, plus a grand total. Reverse-conversion reuses item 5's `commissary_conversion_standards` directly: for each restaurant meat with a standard pointing back to a given Commissary meat, `balance / ratio_per_unit` gives the implied Commissary-meat-equivalent, summed across every matching meat (a Commissary meat can legitimately feed several of a restaurant's own meats - e.g. Jowl feeding both Bagnet and Sisig - and both correctly count).

"Current balance" prefers a real physical actual count over the calculated ending, same reasoning used everywhere else in this app. A meat/date with no data at all contributes 0 to sums but is flagged per-cell (`hasData`) so the frontend can show "-" instead of a misleading zero.

New page `public/dashboard.html` - a date picker, toggleable restaurant checkboxes (all active restaurants selected by default), and the rollup table. "n/a" in a cell means no Conversion Standard exists for that pairing (nothing to reverse-convert); "-" means a standard exists but there's no data yet for that meat/date - deliberately different signals, not conflated.

Nav link added to all eleven pages. Along the way, found and fixed a genuine pre-existing gap unrelated to this feature: `settings.html`'s own nav never had an Allocations link either - fixed both in the same edit rather than leaving it.

8 new tests (`dashboard.test.js`), full suite 209/209, 0 regressions. Verified live end-to-end with a real scenario: seeded real Commissary and FC opening stock plus two real standards, confirmed the grand total (60) matches the hand-computed expectation exactly, confirmed the zero-restaurants-selected edge case the frontend relies on returns cleanly.

## 2026-08-29 (later still) — Item 5: Conversion Standards (per-pairing ratio, live comparison on Shipment form)

New `commissary_conversion_standards` table, one row per `(commissary_meat_id, restaurant_id, meat_id)` — ratio-per-unit-of-input, e.g. "Jowl → FC's Bagnet: 0.3 units per kg." Deliberately separate from `commissary_shipment_presets` (the mix is a demand decision, can have several; the rate is a fact, exactly one per pairing) — see `session-status.md`'s item 5 entry for the full reasoning, settled through real discussion with the project owner, not assumed.

Backend: `GET`/`POST`/`PUT /api/commissary/conversion-standards`, same validation shape as the existing preset routes. No new activity_log wiring - settings data, same treatment as presets.

Frontend: `commissary-shipments.html` now computes an implied-input total live as the auditor types each line - `quantity / ratio_per_unit`, summed across every line with a known standard, compared against the shipment's `total_quantity`. Lines with no standard don't contribute (raw type, unchanged from step 20). Falls back to the old naive raw-quantity sum when no line has any standard at all.

Caught one real test bug before calling this done (not a production bug): an early test tried creating a standard against a restaurant fixture that was deliberately inactive, so the create silently failed and a later assert got an undefined id - fixed by using an already-known-good standard instead of assuming a create would succeed.

29 new tests (47/47 in `commissary.test.js`), full suite 201/201, 0 regressions. Verified live end-to-end: real standard created via HTTP, fetched back in the exact shape the frontend expects, and the frontend's exact arithmetic replicated against that real response (3 units at 0.3 units/kg → 10kg implied, confirmed).

## 2026-08-29 (later still) — Portion Conversion allocations (item 1, Future considerations)

Converts stock of one item into a different item, same restaurant/date — e.g. FC's Sinigang becoming Dinuguan. New `POST /api/allocations/conversion`, a new `Portion Conversion` adjustment type, and a `linked_adjustment_id` column tying the two written rows together. Distinct from the existing `Allocation / Transfer` type, which moves the same item between locations.

Schema: `adjustment_types.requires_conversion_target`, `adjustments.linked_adjustment_id`, plus a migration (`migrateConversionColumns`) for pre-existing databases — verified against a simulated old-shape DB, not just a fresh one.

Frontend on `allocations.html`: a "Converts to" meat + quantity pair, shown only when the selected type requires it, routes to the new endpoint instead of the plain one.

Caught and fixed one real bug before calling this done: `GET /api/settings/adjustment-types` wasn't selecting the new `requires_conversion_target` column, so the frontend would never have shown the conversion fields at all — found via a live check, not assumed.

Real supplier pricing (6 values in `commissary-seed-data.json`) was also found sitting in this public repo and stripped this session — unrelated to this feature, caught in passing.

7 new tests (18/18 in `allocations.test.js`), full suite 172/172, 0 regressions. Verified live end-to-end with the actual Sinigang→Dinuguan scenario from this project's own design discussions — correct signs written, correctly flows through to Landing's read.

## 2026-08-29 (later still) — Step 22: Landing Allocations merge, built and verified live

**Built directly by the architect session**, continuing the "ship code
ourselves for a few steps" approach from step 21b, after resolving one
real open question with the project owner first (see below) rather than
picking a default unilaterally.

**Open question resolved before writing any code**: `locations` (needed
for the `Allocation / Transfer` adjustment type's from/to fields) had
zero rows and no admin UI anywhere — confirmed by querying it directly
against the schema, not assumed. Shipping the Allocations page as
originally scoped would have meant one of six real types leading to two
permanently-empty dropdowns. Flagged to the project owner with three
options (build minimal admin CRUD now / ship without that one type for
now / ship with empty dropdowns and hand-seed locations manually);
decided: build minimal CRUD for both `adjustment_types` and `locations`
now, small - just name plus a couple flags each, same shape as the
existing Meats/Dishes settings tabs.

**Confirmed by reading the actual code before building anything**:
`computeMeatAudit` already produced one summed `adjustments` number -
Landing's three input boxes (In-House/Wastage/Other) were a
frontend-only illusion, each silently writing to one hardcoded
`adjustment_type` row via a delete-then-insert helper in
`dailyAudit.js`. The seeded `adjustment_types` table already had three
more real categories (`Allocation / Transfer`, `Spoilage`, `Damaged`)
with no entry path anywhere in the app - this step finishes something
the schema already promised, not just a Landing simplification.

**Deliberate behavior change, not incidental**: the old Landing boxes
were a singleton per (restaurant, meat, date, type) - at most one
Wastage row per day, silently overwritten on every save. The new
Allocations page is append-only, matching how the audit engine already
sums *every* adjustments row for that meat/date regardless of type.
Verified live (see below) that two separate same-day Wastage entries
now both count instead of the second clobbering the first.

**What shipped**:
- `server/db/schema.sql`/`migrate.js`/`connection.js`: `locations.active`
  column, added via a plain `ALTER TABLE ADD COLUMN` (simpler than step
  9's rebuild-and-rename, which was only needed there because it had to
  *loosen* an existing NOT NULL constraint - a brand-new column with a
  default doesn't need that).
- `server/routes/settings.js`: CRUD for Adjustment Types and Locations,
  both global lists (not restaurant-scoped) - `adjustment_types` has no
  `restaurant_id` column at all, and a transfer's location picklist
  needs to span every restaurant plus shared/central locations (e.g.
  the commissary).
- New `server/routes/allocations.js`: `GET`/`POST /api/allocations`.
  Append-only (no `PUT`/`DELETE` yet) per the behavior-change note above
  - `adjustments` is already on `scope.md`'s deferred-activity-logging
  list, same treatment `sales`/`commissary_stock_receipts` got.
  Validates active restaurant/meat/type; requires both from/to locations
  when the type's `requires_transfer_locations = 1` and *rejects* them
  (not silent-ignores) when the type doesn't use them - a client sending
  transfer fields for a plain Wastage entry is almost certainly a bug
  worth surfacing. Reuses `GET /api/restaurants` and
  `GET /api/stock-receipts/meats?restaurant_id=` rather than duplicating
  dropdown endpoints.
- `server/routes/dailyAudit.js`: `getMeatInputDecoration` simplified to
  just the `remarks` lookup. `GET /api/daily-audit` now explicitly
  returns `adjustments: audit.adjustments` (it existed on the engine's
  return value all along, just was never surfaced to the frontend).
  `GET /api/daily-audit/mixed` needed no code change - `adjustments` was
  already flowing through via the engine's object spread, only a stale
  comment needed updating. `POST /api/daily-audit` no longer accepts or
  writes `in_house`/`wastage`/`other` - confirmed live that a stale
  client still sending those field names doesn't error and doesn't
  corrupt the `adjustments` sum (Express silently ignores unrecognized
  body fields).
- `public/daily-audit.html`: three input boxes replaced with one
  read-only `Adjustments` cell, carried as a fixed `data-adjustments`
  attribute (same pattern as the existing `data-new-stock`/`data-usage`)
  rather than three live inputs. Step 13's live-recalculation now reads
  that fixed value instead of summing three client-side fields.
- New `public/allocations.html`: entry form + filterable list, mirrors
  `stock-receipts.html`'s structure.
- `public/settings.html`: new "Adjustment Types" and "Locations" tabs.
- "Allocations" nav link added across all 9 other pages.

**A real bug caught mid-build, not shipped**: `settings.html`'s first
draft of the Locations tab included a dead helper function
(`restaurantOptsFor`) that referenced an undefined variable - would have
thrown the first time that tab rendered. Found and removed before the
live verification pass below, not discovered by it.

**Verified live** (real server, real database, not mirrored logic
alone): booted the app against freshly-seeded data. Created two real
Locations via the API (restaurant-level + shared/central, confirming
the `null restaurant_id` case sorts first per the route's own
`ORDER BY r.name IS NULL DESC`). Submitted two separate same-day
Wastage entries (2.5, then 1.0) - confirmed both persisted as distinct
rows. Submitted an `Allocation / Transfer` entry without locations -
got the exact expected rejection; submitted one with valid locations -
succeeded, with from/to names correctly resolved in the response.
Confirmed both `GET /api/daily-audit` and `GET /api/daily-audit/mixed`
return `adjustments: 4` (2.5 + 1.0 + 0.5, the precise sum of every
entry) for that meat/date. Confirmed `daily-audit.html` serves the new
markup with zero leftover references to the old three fields anywhere
in the file. Every inline `<script>` block across all 10 pages in the
app was syntax-checked as a full sweep, not just the files touched this
session. Full backend suite re-run clean throughout, including a new
`allocations.test.js` (11 tests, mirrored-logic pattern matching this
project's established convention): **12/12 files, 165/165 assertions,
0 regressions.**

**Still genuinely untested**: same standing gap as every prior frontend
step - no real mouse/keyboard browser click-through. Everything above
was driven via real HTTP requests against a real running server, which
is strong verification, but isn't the same as someone actually clicking
through the three new/changed pages once.

**Files changed**: `server/db/schema.sql`, `server/db/migrate.js`,
`server/db/connection.js`, `server/routes/settings.js`, new
`server/routes/allocations.js`, new `server/routes/allocations.test.js`,
`server/routes/dailyAudit.js`, `server/index.js`,
`public/daily-audit.html`, new `public/allocations.html`,
`public/settings.html`, plus a one-line nav addition to
`public/index.html`, `public/stock-receipts.html`, `public/commissary.html`,
`public/commissary-shipments.html`, `public/sales.html`,
`public/terminal.html`, `public/history.html`.

---

## 2026-08-29 (later still) — Step 21b: real submission + preset-prefill, built and verified live

**Built directly by the architect session**, same day as 21a's
verification, following the project owner's "let's ship code ourselves
for a few steps" call rather than dispatching another worker for
already-well-specified, low-risk work.

**Real submission**: `handleSubmit` (in `terminal.html`) now calls the
real `POST /api/commissary/shipments` instead of `console.log`-ing the
payload. Input is disabled while the request is in flight, to prevent
a duplicate write from a stray keystroke. Three outcomes:
- **Network failure**: input re-enabled, typed line left in place,
  status explicitly says the line was NOT sent.
- **Server rejection** (HTTP non-2xx): the real `{error: "..."}`
  message from the route is shown verbatim in both the hint bar and
  the status line; the typed line is preserved so the auditor can fix
  and resubmit, matching how the GUI form behaves for equivalent bad
  input.
- **Success**: the real server response (`{ok, id, ...shipment,
  lines}`) is shown in the renamed "Last saved shipment" panel (was
  "Last logged payload" in 21a), history is updated, input clears.

**Preset-prefill**: new `loadShipmentPresets(commissaryMeatId,
restaurantId)` fetches `GET /api/commissary/shipment-presets` once both
slot 1 (commissary-meat) and slot 2 (restaurant) resolve, merging every
active preset's lines for that pair into a `meat_id -> default_quantity`
map (first preset wins on a collision — pure autofill, no stronger
handling needed since the auditor can always overwrite the inserted
number). The slot-4 dropdown sorts preset-covered meats first and
inserts their default quantity directly into the token
(`bagnet:10` instead of a bare `bagnet:`), with a sub-text note and a
hint-bar line stating how many lines came from a preset.

**Verification — real server, real database, not mirrored logic**:
booted the app against freshly-seeded data, created a real preset via
`POST /api/commissary/shipment-presets` (Jowl→FC: Bagnet default 10,
Sisig default 6). Then drove the *actual* extracted `terminal.html`
script through a Node `vm` context, this time with a real `fetch`
implementation backed by raw `http` requests against the live server
(not a stub returning canned data) — confirmed: preset defaults
populate correctly once both slots resolve; the slot-4 dropdown
surfaces the preset-covered meats first with the right defaults and the
correct hint-bar count; a full valid line submitted through the real
`handleSubmit()` actually wrote a `commissary_shipments` row + 2
`commissary_shipment_lines` rows + 2 `stock_receipts` rows to the live
database and returned the real server response; and a line referencing
a foreign `meat_id` was correctly rejected with the real server error
message, without losing the typed input. Full backend suite re-run
clean throughout: **11/11 files, 154/154 assertions, 0 regressions**
(frontend-only change, no backend/schema touched). Test database
cleaned up after each run.

**Still genuinely untested**: same standing gap as 21a — no real
mouse/keyboard browser click-through has happened. The `vm` simulation
exercises the same code paths a browser would, driven against a real
server, but it isn't a substitute for someone actually using it once.

**Deferred, documented, not built**: the project owner proposed an
AutoCAD-style layout (command bar docked bottom-center rather than
top-of-page, history reachable via up-arrow plus a togglable slide-in
sidebar for browsing further back, instead of the current always-visible
history panel). Decided as non-modal — page content stays visible above
the docked bar — with the sidebar and the slot guide/dropdown never
competing for space since they sit on different axes. Deliberately
scheduled after logic/backend work, not before; written down here so it
isn't silently dropped from a future session's radar.

**Files changed**: `public/terminal.html` only. No backend, schema, or
other pages touched.

---

## 2026-08-29 (later) — Step 21a verified live + persistent slot guide added

**Context**: the worker handoff below (step 21a) was pulled from `main`
after the project owner pushed it, and independently re-verified by the
architect session rather than trusted from the worker's own transcript.
Separately, the project owner tried the described design and found the
hint-bar-only approach hard to follow once the cursor moves past a slot
— the hint disappears, so there's no way to see what you already typed
for an earlier slot without scrolling back up the input line mentally.

**Verification performed** (all fresh, not reused from the worker's
claims): cloned the actual pushed commit, ran `npm install` +
the full backend test suite (11/11 files, 154/154 assertions, 0
regressions — matches what the worker reported, now independently
confirmed). Read `commissary.js`'s real `POST /api/commissary/shipments`
handler directly and compared it field-for-field against
`terminal.html`'s assembled payload — matches exactly
(`commissary_meat_id`, `restaurant_id`, `business_date`, `total_quantity`,
`notes`, `actor`, `lines: [{meat_id, quantity}]`). Booted the real
server against freshly-seeded data (real Restaurant A/FC/commissary
catalogs, not fixtures) and confirmed `GET /terminal.html` serves 200
with the expected markup, and that `/api/commissary/meats`,
`/api/restaurants`, and `/api/stock-receipts/meats?restaurant_id=` (the
three endpoints the terminal depends on) all return real, usable data.

**Persistent slot guide added** (architect session, same day, not a
separate worker dispatch — small and low-risk enough to build directly):
a new `renderSlotGuide`/`computeSlotStatus` pair in `terminal.html`,
rendered above the existing hint bar. Shows all five conceptual slots
at once — `ship`, `<commissary-meat>`, `<restaurant>`, `<total-qty>`,
`<name:qty pairs>` — with already-filled slots shown in green with
their resolved value, the currently-active slot highlighted, upcoming
slots dimmed, and the first invalid token flagged in red in place
(e.g. `commissary-meat: "badmeat"?`), rather than letting later slots
appear reachable once an earlier one is actually broken.
`computeSlotStatus` deliberately reuses the exact same `resolveExact`/
`validateLinePair` calls `validateCommitted` already uses for the hint
bar and Enter-time validation, rather than re-implementing the checks —
so the guide can never show a slot as valid that the hint bar or submit
path would reject, or vice versa.

**How the new code was tested**: no headless browser available (same
standing gap as every prior frontend step), so the slot state machine
and the new guide were exercised via Node's `vm` module — running the
actual extracted `<script>` content in a proper JS context (correct
`let`/`const` global scoping, unlike a bare `eval()`, which was tried
first and produced misleading false failures due to direct-eval's
block-scoping of `let`/`const` — worth remembering if a future session
tries the same shortcut) with DOM elements stubbed by id. Drove
`updateStateMachine()` through the full happy path (`ship jowl fc 20
bagnet:12 sisig:5`, confirming each slot goes `active` → `done` with the
correct resolved value at the right moment) and four error paths
(unknown commissary meat, unknown restaurant, negative quantity, unknown
destination meat) — confirmed the guide correctly freezes at the first
bad token, and later slots stay `upcoming` rather than looking
reachable. Full backend suite re-run again after this patch, still
154/154, 0 regressions (expected — frontend-only change).

**Files changed**: `public/terminal.html` only (CSS for
`.slot-guide`/`.slot.done`/`.slot.active`/`.slot.upcoming`/`.slot.error`,
the guide's container div, `computeSlotStatus`/`renderSlotGuide`
functions, one call site added in `updateStateMachine`, and one
sentence added to the page's own explanatory copy). No backend, no
other pages, no schema.

**Still open, same as the worker's own handoff noted**: no real
mouse/keyboard browser click-through has happened. The `vm` simulation
above exercises the same code paths a real browser would, but it isn't
a substitute for someone actually using it once.

---

## 2026-08-29 — Step 21a: Terminal shell + slot state machine (WIP handoff - see below)
New `public/terminal.html`: a Discord-slash-command-style input line, hint
bar, and filtering dropdown, driven by a small state machine keyed on
committed-token count (not a natural-language parser). Implements all
five slot types from session-status.md's step 21 entry for the `ship`
command: `ship` (literal), `<commissary-meat>`, `<restaurant>`,
`<total-qty>`, and one-or-more `<name:qty>` pairs. Up-arrow recalls the
last 25 submitted commands via `localStorage` (`terminal_command_history`);
down-arrow steps back toward the in-progress draft, shell-style.
ArrowUp/Down navigate the open dropdown instead when one is showing.

**Step 21a's explicit boundary, honored**: Enter on a complete, valid line
assembles the payload and `console.log`s it (also shown in an on-page
"Last logged payload" panel for visibility beyond the browser console) -
it does NOT call `POST /api/commissary/shipments`. No backend changes.
Mirrors step 14's "prove the plumbing before the real command" pattern.

**Two things not covered by the five named slot types, decided rather than
silently assumed**:
- `business_date` (required by the real route but not one of the five
  slots) defaults automatically to today, same default
  `commissary-shipments.html`'s date field already uses.
- Token matching (commissary-meat / restaurant / line-name) compares the
  typed token against each candidate's `code` OR a lowercased,
  space-stripped version of its `name` - needed because names like
  "Whole Chicken" contain spaces and the line is whitespace-tokenized.
  Choosing an item from the dropdown always inserts the space-free form,
  so a line built entirely by dropdown selection is always parseable.
  Line-name resolution (slot 5) looks up the destination restaurant's
  real active meats via the existing
  `GET /api/stock-receipts/meats?restaurant_id=` endpoint (same one
  `commissary-shipments.html` already uses) so the logged payload's
  `meat_id` values are real, matching the "shaped exactly like the real
  payload" requirement - this is ordinary lookup, not the preset-prefill
  step 21b is scoped to add.

**Nav**: added a "Terminal" link to all 8 existing pages' shared nav
(`index.html`, `daily-audit.html`, `stock-receipts.html`, `commissary.html`,
`commissary-shipments.html`, `sales.html`, `settings.html`, `history.html`),
matching how every prior new page joined that same shared list.

**Verified**: `node --check` on the extracted inline `<script>` (syntax
clean). A mirrored-logic trace test (11 assertions, not committed as a
repo test file - this project's `.test.js` pattern is backend/engine-only,
confirmed by checking all 11 existing test files live under `server/`)
exercised the pure parsing/validation/assembly functions against mock
commissary-meat/restaurant/destination-meat data: slot detection by
committed-token count, space-containing names resolving via the
normalized token, partial-text filtering, a full valid line assembling
byte-for-byte into `commissary.js`'s real payload shape, and rejection of
an unknown restaurant, a malformed name:qty pair (no colon), a
non-positive total-qty, and a destination-meat name that doesn't belong
to the chosen restaurant. All 11 passed. **Not verified**: no browser
click-through (this sandbox has no headless browser, same standing gap
every prior frontend step in this project has carried) and no live-server
HTTP check (no `node_modules` in this handoff's zip and no network access
in this sandbox, so `npm install` / booting a real server wasn't
possible this session - honestly flagged, not claimed).

Full existing backend suite re-run after the nav edits (touches static
HTML only, but re-run anyway rather than assume): **11/11 files, 154/154
assertions, 0 regressions**.

**Handoff mechanics**: this sandbox has no `.git` directory at all (not
just no push credentials - no repo present in the zip) and no network
access, so this is a full file-handoff per rule 18, not a push - see
session-status.md's step 21 entry for the exact files and commands.

## 2026-08-29 — Step 20: commissary_shipment_presets closed out ("quick formulas")
Closes the piece 20c explicitly deferred (see 20c's own entry below).
Confirmed before starting: 20c genuinely on `main` (fresh `git clone`,
not zip) — `POST /api/commissary/shipments` and
`public/commissary-shipments.html` both present, baseline suite 11/11
files / 138/138 assertions green.

**Backend** (`server/routes/commissary.js`): three new routes —
`GET /api/commissary/shipment-presets?commissary_meat_id=&restaurant_id=`
(active presets + lines for one pair), `POST /api/commissary/shipment-presets`
(create preset + lines, one transaction, same up-front validation
shape as the shipments route), `PUT /api/commissary/shipment-presets/:id`
(edit name/active, full lines replace — no per-line active flag in the
schema, and this is settings data, not an audited log, so
delete-then-reinsert is fine). No `activity_log` wiring — matches the
existing treatment of `commissary_shipment_lines`/
`commissary_stock_receipts`, not in rule 9's scope. Placed in
`commissary.js` rather than `settings.js`: scoped to the
`commissary_shipments` neighborhood specifically, not the core
meats/dishes/recipes admin surface `settings.js` owns.

**Frontend** (`public/commissary-shipments.html`): once both a
commissary meat and destination restaurant are picked, a "Load preset"
control appears if any active presets exist for that exact pair.
Loading one autofills the output lines (meat + quantity) — never
locks them; the auditor can still add, remove, or edit every line
before saving, same as typing from scratch. No validation ties a save
to the preset it came from, per the step's own instruction.

**Explicitly deferred, not attempted**: a preset-*authoring* admin UI
(a settings page or section to create new presets through the
browser). Presets can be created today via the API (see the live curl
verification below and the new tests), but there's no in-app form for
it yet. This follows the task's own stated fallback for oversized
scope — bundling a third UI surface (use-a-preset on the shipment form
+ author-a-preset admin screen, on top of the backend) risked exactly
the kind of oversized step rule 16 exists to prevent. A future step
should build that admin screen (smallest reasonable shape: likely a
small section on `settings.html`, since presets are settings-managed
data — the CRUD routes it needs already exist).

**Verified**: 16 new assertions in `commissary.test.js` (33/33 in that
file), mirrored-logic style matching the existing shipment tests. Full
suite re-run: **11/11 files, 154/154 assertions, 0 regressions** (was
138). **Verified LIVE this session** — network + git access were
available (`git clone` worked directly, no zip fallback needed):
booted a real server, exercised create/list/edit/deactivate over real
HTTP, confirmed the wrong-restaurant-meat rejection, confirmed a
deactivated preset drops out of the pair listing while a fresh preset
for the same pair still shows, confirmed the new page serves (HTTP
200) and the preset list endpoint's JSON shape matches exactly what
the frontend JS reads (`p.id`, `p.name`, `p.lines[].meat_id`,
`p.lines[].default_quantity`). **Not verified**: an actual browser
click-through of the "Load preset" button — same sandbox limitation
as every other frontend step in this project's history (no
puppeteer/playwright, download host not in the network allowlist).
Pushed straight to `main` per rule 18.

---

## 2026-08-29 — Process: rules 18/19 refined, step 20c independently verified + pushed
Two follow-ups after reviewing the step-20c coder session's transcript.

**Rules 18/19 refined in `rules-for-claude-code.md`**:
- Rule 19 (new): re-run the full test suite after code changes, not
  after doc-only edits. The step-20c session ran the entire 11-file
  suite a third time purely because `changelog.md`/`session-status.md`
  had changed — zero chance of catching anything, markdown can't break
  a JS test. The baseline-before and after-code-change runs stay
  mandatory (they've caught real problems before — the step-15/16
  cross-test interaction bug was found exactly this way); only the
  pure-docs-edit re-run is cut.
- Rule 18 extended with the current worker network/git reality: only
  one coder worker has live network + `git` access as of 2026-08-29;
  the rest don't yet (locked on the project owner's end), expected to
  unlock incrementally around the 10-task mark per worker. Until then,
  the mirrored-logic-tests-plus-hand-run-verification-script pattern
  (established across steps 12–20c) is the expected norm, not an
  exception to apologize for — and a worker without network shouldn't
  build its own zip/git-command packaging unless explicitly asked, since
  that duplicates the architect's own job under this rule.

**Step 20c independently verified and confirmed pushed**: the
step-20c coder session had no network and could only hand back files +
git commands for manual push (see its own changelog entry above). The
project owner pushed them; the architect conversation then re-verified
rather than trusting the commit messages — pulled fresh, re-ran the
full suite (11/11 files, 138/138 assertions, matching the coder
session's own number), then did the live-HTTP check that session
couldn't: booted a real server, `POST`'d a real two-line shipment
(Jowl → FC's Bagnet + Sisig), confirmed usage moved 0→9 via `GET
/api/commissary/daily-audit`, confirmed both destination
`stock_receipts` rows landed with the correct `source`/
`commissary_meat_id`, confirmed `activity_log` correctly uses
`source: 'MANUAL'` for this human-triggered write. No gaps found —
`session-status.md`'s "20c hand-off" block (which described files
existing only in a working copy, not on `main`) is now stale and
rewritten to reflect the confirmed-pushed, confirmed-verified state.

## 2026-08-29 — Step 20c: Shipment logging (write route + dedicated page)
**Environment note, flagged up front**: this session worked from the
uploaded zip fallback, not a `git clone` — `github.com` returned a 403
("Host not in allowlist") and `npm install` also 403'd against
`registry.npmjs.org`. Same bucket as steps 12-19's sessions, just
resurfacing after step 20b's session had working git/network. Practical
consequence: **no live Express server this session** — no `npm install`
means no `express` module, so nothing could actually boot. Verification
below is the mirrored-logic test file (same convention as
`commands.test.js`/`stockReceipts.test.js`) plus a hand-run script that
exercises the **real** `commissaryAuditEngine.js` and the **exact**
transaction code from the route (copy-pasted from the actual file, not
re-derived) against a real in-memory `node:sqlite` DB — not a live HTTP
smoke test. Flagging this rather than claiming a live-server check that
didn't happen.

**Confirmed 20a/20b both landed** before starting, per the prompt's own
instruction: all 7 `commissary_*` tables from step 20a present in
`schema.sql` (`commissary_stock_receipts`, `commissary_shipments`,
`commissary_shipment_lines`, `commissary_shipment_presets`,
`commissary_shipment_preset_lines`, `commissary_ending_actual`,
`commissary_opening_stock`), and step 20b's
`server/engines/commissaryAuditEngine.js` +
`GET /api/commissary/daily-audit` both present in
`server/routes/commissary.js`.

**Part 1 - write route**: `POST /api/commissary/shipments`, added to
`server/routes/commissary.js` (not a new route file - this is
commissary-owned data, same file as the step-20b read route). Body:
`{ commissary_meat_id, restaurant_id, business_date, total_quantity,
notes?, actor?, lines: [{ meat_id, quantity }, ...] }`. In one
transaction: one `commissary_shipments` row, then per line one
`commissary_shipment_lines` row AND one `stock_receipts` row for the
destination (`source='COMMISSARY'`, `commissary_meat_id` set) - the exact
same table/columns `POST /api/stock-receipts` already writes for a normal
COMMISSARY receipt, reused unchanged rather than reinvented, per the
prompt's explicit instruction. Each `stock_receipts` write gets its own
`activity_log` CREATE row in the same transaction (rule 9) via the shared
`withTransaction`/`logActivity` helpers - same pattern
`commands.js`'s `sync-batch-stock` route already uses for "one write
triggers another table's write, same transaction," used here as the
reference implementation the prompt pointed at.

Validation, all up-front (before the transaction opens, so a bad line
fails cleanly with nothing written at all - confirmed by a dedicated
test): `commissary_meat_id` must be an active commissary meat;
`restaurant_id` must be an active restaurant; every line's `meat_id` must
be one of *that* restaurant's own active meats (a line pointing at a
different restaurant's meat, or an inactive meat, is rejected). No
`commissary_meat_map` lookup anywhere in this route - per
`session-status.md`'s "commissary_meat_map's fate" resolution, the
auditor picks the destination meat live in the form; the mapping table is
untouched (not deleted, not repurposed - out of scope for this step).

**Not enforced, per explicit instruction**: no reconciliation between
`total_quantity` and the sum of line quantities - different units on each
side (kg of a raw commissary meat vs. portion-units of a named output)
make a strict equality check not generally meaningful. The page shows
this as an informational-only comparison (see Part 2); the backend
doesn't compute or return it at all.

**Explicitly deferred, not attempted**: `commissary_shipment_presets` /
`commissary_shipment_preset_lines` (the "quick formulas" autofill). The
prompt scoped this as out-of-scope-unless-small-enough-to-not-crowd-the-
rest; building the write route + a full new page was already the largest
of the three 20a/20b/20c sub-steps, so presets were not attempted this
session, not silently dropped. A future step should read the preset
tables from `schema.sql` (already there since 20a) and add a "load
preset" autofill action to `commissary-shipments.html`'s form - the
preset never becomes authoritative, the auditor can still edit every
number before saving.

**Part 2 - the dedicated page**: new `public/commissary-shipments.html`,
its own page (like Stock Receipts), not the Command Panel widget - per
session-status.md's already-resolved "Shipment-logging UI" note. Form:
date, source commissary meat, total quantity, then a read-only context
block (see below), then destination restaurant, then 1+ output lines
(destination meat + quantity, "+ Add line"/"Remove" per row, always at
least one line), notes, Log Shipment. Changing the destination restaurant
re-fetches that restaurant's own active meats via the *existing*
`GET /api/stock-receipts/meats?restaurant_id=` route (step 9) - no new
GET route needed for this. "Shipments" added to nav on all seven existing
pages plus the new page itself (nav block is identical across every page
in this repo - confirmed textually identical before editing, then patched
all seven with the same one-line insertion).

**Read-only context above the form**: on commissary-meat/date change,
fetches step 20b's `GET /api/commissary/daily-audit?date=&
commissary_meat_id=` and renders `beginning`/`stockIn`/`backedUp`/`usage`
(labeled "Shipped out so far") as plain read-only cards - so the auditor
sees where this meat stands before typing a shipment against it, per the
prompt's explicit requirement. Re-fetched after a successful save so
"Shipped out so far" reflects the just-logged shipment immediately.

**Informational line-sum display**: a small hint line below the output
lines shows `Lines total: X (shipment total: Y)`, recomputed on every
quantity keystroke - purely informational, never blocks Save, no
styling implying an error even when they differ (which is expected and
fine per the units note above).

**Tests**: new `server/routes/commissary.test.js`, mirrored-logic style
(17/17 assertions) - missing/invalid top-level fields, no lines, a line
missing quantity, unknown/inactive `commissary_meat_id`, unknown/inactive
`restaurant_id`, a line's `meat_id` belonging to a different restaurant,
a line's `meat_id` being inactive, a valid two-line shipment landing both
the shipment+lines and both destination `stock_receipts` rows correctly,
sum-of-lines allowed to differ from `total_quantity` with no rejection,
each `stock_receipts` write getting its own `activity_log` CREATE,
confirmed `commissary_shipments`/`commissary_shipment_lines` themselves
get zero `activity_log` entries (correctly out of rule 9's scope), the
new receipts feeding a `getNewStock`-style sum for the destination
meat/date, and a rejected line rolling back cleanly with nothing written.

**Verified beyond the mirrored-logic file** (since no live server was
possible - see the environment note above): a hand-run script
(`node -e '...'`, not committed) that seeded a real in-memory DB, called
the **real** `computeCommissaryDailyAudit` from
`commissaryAuditEngine.js` before and after running the **exact**
transaction code from the new route (not a re-derivation - copied
directly from `commissary.js`), confirming `usage` went from `0` to `9`
(the shipment's `total_quantity`) after two lines totaling `4 + 5 = 9`
were written, and that the destination restaurant's `stock_receipts`
correctly show `4` for one meat and `5` for the other on that date. This
exercises the real production code path for the read side, just without
an HTTP layer wrapping the write side.

**Full existing test suite re-run after, all files individually**:
**11/11 files green, 138/138 assertions, 0 regressions** (10 pre-existing
files unchanged + this step's new file, 121 + 17 = 138).

**Not verified, and known to remain unverified**: an actual browser
click-through of the new page's form (no headless browser in this
sandbox - same standing gap as every frontend step since step 11), and a
true live-server HTTP round-trip (blocked by the network/npm situation
above, not attempted for this step specifically - step 20b's session had
this working, so it's expected to work again once network/git access is
available for a future session).

**Not committed to git this session** - no `.git` present (zip fallback),
no network to `git init`+push even if a local repo were created. Whoever
has GitHub access next should pull these changes in as a normal commit
(not `wip:` - this step's own scope, per the breakdown above, is
complete: write route + tests done, page done, presets explicitly
deferred and documented, not a partial/broken hand-off) before starting
whatever's next.

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

