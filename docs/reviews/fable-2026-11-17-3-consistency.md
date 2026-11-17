2cb16eeddc30cf766e07ca5bd58c54a7da2168f0

# Fable review 2026-11-17 - run 3-consistency

Read-only review of `main` at the hash above. Groundwork for a later clean-up of the docs.
Nothing was committed, pushed or edited except this file. No price, cost or staff name is in it.

## Setup

- `npm ci`, then `npm run verify`: **SUITE GREEN** (40 files, 748 passed, 0 failed) and
  **AUDIT CLEAN**. Node v24.19.0.
- Live checks ran on a throwaway `server/db/dev.db` (`npm run reseed`, `npm run seed:test`), server
  on port 3010 with the three Loyverse tokens empty. `beta.db` and `.env` were never used.
- Where a finding is about text only, the repro is the two places to read side by side (file and
  line). Where the text makes a claim about the code, the repro is a command that was run.

Severity: P0 = data loss or a security hole; P1 = a wrong number or wrong access; P2 = fragile or
confusing; P3 = polish. Most findings here are P2 or P3 because they are in documents, not in
running code. A document finding is marked P1 only when a queued step, built as written, would give
a wrong number or wrong access.

At a glance (25 findings):

- **P1 (4):** C-03 and C-04 (costs readable without see_costs), C-13 (a blind counter reads the
  hidden numbers elsewhere), C-14 (admin by extra role).
- **P2 (16):** C-01, C-02, C-05 to C-12, C-15 to C-19, C-25.
- **P3 (5):** C-20 to C-24.
- **In the way of the next builder steps (the roster):** C-02 (which step is next), C-15
  (roster-stations, roster-staff), C-12 and C-16 (roster-week, roster-day-status), C-01
  (roster-fill). For Naoki's landing-sales: two checks in Part B, area 2.
- Four findings are code on main that breaks an ADR and were proved by request: C-03, C-04,
  C-13, C-14. The rest are in the documents.

## Part A - consistency findings

### C-01 - roster-fill asks for an activity-log action the database refuses (P2)

- **Where:** docs/session-status.md:3720 (Step roster-fill: "an activity_log row (action FILL)");
  server/db/schema.sql:532; server/db/activityLog.js:33.
- **What happens:** the spec tells the builder to log each entry Fill writes with the action
  `FILL`. The activity log accepts only CREATE, UPDATE and DELETE, twice over: the helper throws,
  and the table has a CHECK on the column. SQLite cannot widen a CHECK, so `FILL` needs a rebuild
  of `activity_log` in `migrate.js`. The step's Touches line lists neither `activityLog.js`,
  `schema.sql` nor `migrate.js`, and the step is not marked as a schema step ("one schema step at
  a time"). A builder either stops on a Class B question or quietly logs `CREATE` instead, and
  then "Undo Fill" and History cannot tell a Fill row from a hand entry by the log.
- **Repro (run):**
  ```
  node -e "const {DatabaseSync}=require('node:sqlite');const fs=require('fs');
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('server/db/schema.sql','utf8'));
  const {logActivity}=require('./server/db/activityLog.js');
  try{logActivity(db,{actor:'Test',entityType:'roster_entries',entityId:1,action:'FILL',before:null,after:{},source:'MANUAL'})}catch(e){console.log(e.message)}
  try{db.prepare(\"INSERT INTO activity_log (actor,entity_type,entity_id,action,source) VALUES ('Test','roster_entries',1,'FILL','MANUAL')\").run()}catch(e){console.log(e.message)}"
  ```
  Output: `logActivity: invalid action "FILL"` and
  `CHECK constraint failed: action IN ('CREATE', 'UPDATE', 'DELETE')`.
- **ADR:** ADR-096 (Fill, Undo Fill); rules-for-claude-code rule 9 (the log's shape).
- **Smallest fix:** in the roster-fill spec, replace "(action FILL)" with "action CREATE, with
  `filled: 1` in the after snapshot" (and DELETE for Undo Fill). The `filled` column already
  carries the meaning; no schema change.

### C-02 - the queue's brackets and its newest order note disagree; a closed step is named as runnable (P2)

- **Where:** docs/dispatch-queue.md:93-98 (the 2026-11-16 note), :279, :283, :318-319, :434, :471,
  :505; docs/session-status.md:148-150 and :3189; .claude/commands/start.md section 3.
- **What happens:**
  1. The 2026-11-16 note (queue and session-status) says "3zi business-day (runnable, no shared
     file) any time" and "roster-week (also needs 3zi)". business-day has been CLOSED since
     2026-11-02 (PR #55); `server/businessDay.js` is on main. The roster's first step is really
     roster-stations.
  2. `/start` picks "the first step in queue order whose dependencies are satisfied". Six open
     steps still carry a `[blocked: ...]` tag whose every blocker is CLOSED: allocation-requests
     (3zc, first in file order), sheet-close (3zd), roster-stations (3zl), staff-meal-log (3zx),
     cost-guard and side-sheets. The 11-16 note says the roster goes first and that cost-guard,
     side-sheets and supply-tags wait until roster-fill, but no tag says so, and no note since
     2026-10-28 places allocation-requests at all. With roster-stations claimed by one builder,
     the next run finds landing-sales free (tagged `[runnable]`, although both notes give it to
     Naoki; preview-pid and restaurant-pc-ii are tagged `[Naoki's own PR]`) and after it
     cost-guard (neither shares a file with roster-stations), against the note.
  3. Fourteen dated order notes sit above the queue (lines 37-98); each is partly overtaken by the
     next. `/naoki-qs` is told to honour "an Order this week note" and has to work out which one.
- **Repro (run):** a script that reads docs/dispatch-queue.md, lists every step with no CLOSED
  line and checks each named blocker:
  ```
  3zc  allocation-requests [blocked: user-id-authorship]  => user-id-authorship (CLOSED)
  3zd  sheet-close         [blocked: sheets-tier1]        => sheets-tier1 (CLOSED)
  3zl  roster-stations     [blocked: sheets-tier1, import-identity, role-assignments] => all CLOSED
  3zn  roster-week         [blocked: roster-staff, business-day] => business-day (CLOSED)
  3zx  staff-meal-log      [blocked: staff-meal-settings, role-assignments] => both CLOSED
  -    cost-guard          [blocked: role-assignments]    => role-assignments (CLOSED)
  -    side-sheets         [blocked: side-items, site-filter] => both CLOSED
  ```
  And `ls server/businessDay.js server/businessDay.test.js` (both exist).
- **ADR:** ADR-061 (the queue runs in file order); ADR-096 (roster first).
- **Smallest fix:** one drop-in: delete "3zi business-day" from the 11-16 note in both files; set
  the tags to what is true today (`[runnable]` on roster-stations; `[blocked: roster-fill]` on
  cost-guard and side-sheets; a stated place for 3zc, 3zd and 3zx to 3zz); fold the fourteen notes
  into one "Order now"; tag landing-sales `[Naoki's own PR]` if that is meant.

### C-03 - History hands out the costs that the lists hide, logged out included (P1)

- **Where:** GET /api/history (server/routes/history.js:44-73); the snapshots are written by
  server/engines/sideItems.js:104 and server/engines/staffMealSettings.js:71, :87, :130.
- **What happens:** side-items hides `cost_per_unit` from everyone but an admin on its own list
  (server/routes/sideItems.js:27-31). But every change to a side item, a meal slot or the rice
  rate is logged with a full before / after snapshot, and History returns those snapshots to
  anyone: logged out, or a blind counter. So an item's cost, the rice price per kg and the meal
  budgets can all be read by anyone on the restaurant Wi-Fi. cost-guard (queued) lists four
  reads and does not list History; blind-history (planned) is about count numbers, not costs.
  After both land as written, this stays open.
- **Repro (run on dev.db; the numbers are made up):**
  ```
  curl -H "Cookie: user_id=2" -H "Content-Type: application/json" \
    -d '{"name":"Test Onion","main_unit":"kg","cost_per_unit":777}' localhost:3010/api/side-items
  curl "localhost:3010/api/side-items?site=RA"                 # logged out: no cost field
  curl "localhost:3010/api/history?entity_type=side_items"     # logged out: 200
  ```
  The last answer contains `"after":{"id":1,"name":"Test Onion",...,"cost_per_unit":777,...}`.
  The same call with `Cookie: user_id=6` (Test Counter RA) returns the same. After a rice rate and
  a slot budget were saved as Test Admin, logged-out `GET /api/history` also returned
  `"price_per_kg":12345` and `"fixed_budget":54321,"per_head_rate":678`.
- **ADR:** ADR-060 (no read returns a unit cost without see_costs, logged out included); ADR-041
  and ADR-091 (History stays open, with a planned blind-history); ADR-009.
- **Smallest fix:** add History to cost-guard's list: for a requester without `see_costs`, strip
  the COST_FIELDS (plus `price_per_kg`, see C-04) from the `before` and `after` objects in
  history.js before answering. One function, one test.

### C-04 - the rice price is a unit price behind an open read, and cost-guard's list misses it (P1)

- **Where:** GET /api/settings/staff-rice-rates (server/routes/settings.js, built by
  staff-meal-settings, PR #82, merged 2026-11-16); docs/session-status.md:4536-4540 (cost-guard:
  COST_FIELDS is "today `cost_per_unit` and `cost_per_portion`", four reads).
- **What happens:** staff-meal-settings was specced on 2026-11-12 with "GETs stay open
  (ADR-042)". ADR-060 came two days later and says every read of a unit cost or price needs
  see_costs. The step merged after ADR-060 with the open read unchanged, and cost-guard's spec was
  not widened. The rice price per kg is exactly the kind of figure ADR-060 protects. The slot
  budgets ride on the same open read (GET /api/settings/staff-meal-slots, any site, no login);
  ADR-060 lets the cook see the budget on the meal page, but nothing decided that a logged-out
  phone may read every site's budgets.
- **Repro (run on dev.db; made-up numbers):**
  ```
  curl -H "Cookie: user_id=2" -H "Content-Type: application/json" \
    -d '{"cups_per_head":1,"grams_per_cup":1,"price_per_kg":12345}' localhost:3010/api/settings/staff-rice-rates
  curl localhost:3010/api/settings/staff-rice-rates            # logged out
  ```
  Answer, HTTP 200: `[{"id":1,...,"price_per_kg":12345,...}]`. Same with `Cookie: user_id=6`.
  `curl "localhost:3010/api/settings/staff-meal-slots?site=RA"` logged out returns
  `fixed_budget` and `per_head_rate`.
- **ADR:** ADR-060; ADR-042 (reads stay open) is the older rule it narrows; ADR-044 (the rates
  "live off-repo").
- **Smallest fix:** in the cost-guard spec, add `price_per_kg` to COST_FIELDS and
  GET /settings/staff-rice-rates to the reads. Ask Naoki one question for the budgets: may a
  logged-out phone read them, or only people who can use that site?

### C-05 - ADR-037 is superseded in part by ADR-096 and nothing says so (P2)

- **Where:** docs/decisions/ADR-037-roster-placements-and-access.md:3-5, :20, :25, :51;
  docs/decisions/ADR-096-roster-fill.md:5; docs/decisions/README.md:82; docs/session-status.md:445-447.
- **What happens:** ADR-096's Supersedes line reads "ADR-013 in part (a new week as a full copy of
  last week; one placement per person per day)". "One placement per person per day" is not in
  ADR-013 at all. It is ADR-037's line 20, word for word, and the detailed "Copy last week" rule
  is ADR-037's line 25. ADR-037's Status still reads "Accepted 2026-11-01", its index row has no
  note, and its own "Reopen only if" ("people routinely work two stations in one day") is exactly
  what ADR-096 records. The 2026-11-01 block in session-status ("One placement per person per day
  ... Copy last week reverts one-offs") also stands unamended, although the 10-28 block shows the
  habit of adding a "Superseded ... by ADR-038" note in place. A builder who reads ADR-037 for
  roster-week (the spec's first line says "Decided ADR-013 and ADR-037") meets two rules that no
  longer hold.
- **Repro:** `grep -n -i "one placement\|copy last week" docs/decisions/ADR-013-roster.md
  docs/decisions/ADR-037-roster-placements-and-access.md docs/decisions/ADR-096-roster-fill.md
  docs/decisions/README.md` - the phrase is found only in ADR-037 (lines 20, 25) and in ADR-096's
  Supersedes line; ADR-037 line 3 and README line 82 carry no supersede note.
- **ADR:** ADR-037, ADR-096; decisions/README rules 2 and 5.
- **Smallest fix:** ADR-037 Status: "Accepted 2026-11-01; superseded in part by ADR-096 (one
  placement a day; copy last week)", the same words in its index row, ADR-037 added to ADR-096's
  Supersedes line, and one "superseded 2026-11-16 by ADR-096" note on session-status:445-447.

### C-06 - two devices: "never last-write-wins" and "last save wins" are both on the do-not-reopen list (P2)

- **Where:** docs/session-status.md:516-518 (2026-09-15, under "Things NOT to re-litigate");
  docs/decisions/ADR-015-blind-count-and-recount.md:25; docs/session-status.md:467 and ten step
  specs (lines 3030, 3592, 3654, 3791, 3867, 4160, 4240, 4291, 4630, 4719);
  docs/dispatch-queue.md:613; docs/tech-stack.md:69.
- **What happens:** the 09-15 entry says concurrency is optimistic (a version column and "changed
  under you - reload"), "NOT last-write-wins". ADR-015 (10-28) and every spec since say "last save
  wins, both kept". The built code follows ADR-015: no version column and no "changed under you"
  message exist. The 09-15 line was never amended, has no ADR, and the queue still lists an
  "optimistic-concurrency column" as planned. Both statements sit in the list a builder is told
  not to question.
- **Repro:** `grep -n -i "last save wins\|last-write-wins" docs/session-status.md docs/decisions/*.md`
  (11 hits for "last save wins", 1 for "NOT last-write-wins");
  `grep -rn -i "changed under you\|optimistic" server public` returns nothing.
- **ADR:** ADR-015; no ADR holds the 09-15 line.
- **Smallest fix:** ask Naoki which stands. If "last save wins with history" (what is built):
  mark session-status:516-518 "superseded 2026-10-28 by ADR-015" and drop the planned column from
  dispatch-queue:613 and tech-stack:69.

### C-07 - finalization and dated sheets were decided, have no ADR and no step, and later text treats them as built (P2)

- **Where:** docs/session-status.md:514-515 (2026-09-26: Done / Closed per sheet; a dated sheet
  row with `owner_user_id` and `finalization_status`); :3019 ("Finalization is not built yet");
  :3855-3856 and :3865 (write-permission: "finalize" as a review-page action; "isBlocked and
  finalization refuse first, as today"); docs/decisions/ADR-084-read-only-login-refused-every-write.md:30-31
  ("allocations and finalize check none today"); docs/decisions/ADR-095-roles-page-details.md:15
  (the switch line "Finalizes the day"); docs/dispatch-queue.md:612.
- **What happens:** the two-step close (the owner marks Done, the head chef Closes) is on the
  do-not-reopen list, but nothing was built: no route, no table, no status. It has no ADR, and its
  only queue entry is one line under "Planned - NOT yet specified". Meanwhile write-permission's
  edge states say finalization refuses a save "as today", ADR-084 speaks of a finalize action that
  checks no role, and the Roles page ships a switch labelled "Finalizes the day" that today only
  gates recount orders. The "one owner per sheet" half is also overtaken: since ADR-011, ADR-014
  and ADR-037 the writer is tonight's pick or placement, not a sheet owner.
- **Repro:** `grep -rniE "finaliz" server public --include=*.js --include=*.html --include=*.sql`
  finds only the `can_finalize` flag, `canOrderRecount` and the Roles page label; the route list
  (`grep -n "router\." server/routes/dailyAudit.js`) has no finalize route.
- **ADR:** ADR-015 ("orders only before finalization"), ADR-084, ADR-095, ADR-011, ADR-037.
- **Smallest fix:** one ADR that says what finalization is today (decided 09-26, not built; the
  sheet-owner part replaced by picks) and names a planned step; in write-permission's spec drop
  "and finalization" from the Blocked line and "finalize" from the list of actions.

### C-08 - three "built" claims that are not on main (P2)

The same class as the meat-request error corrected on 2026-11-15 (ADR-092: "the docs called it
built").

1. **Running-low.** docs/session-status.md:502 says "Both modes are BUILT - PERCENT ... and
   ABSOLUTE ... (feature present, unused)". There is no par level, threshold or running-low code
   or column anywhere. docs/dispatch-queue.md:611 lists "Running-low par-level config" as planned
   and not specified. The supply notes build on it ("running-low pre-fill later").
   Repro: `grep -rn -i "running.low\|par_level\|threshold" server public --include=*.js
   --include=*.html --include=*.sql` finds only two code comments about variance "status
   thresholds" in public/daily-audit.html; the same search in server/db/schema.sql finds nothing.
2. **The management dashboard.** docs/areas/management-view.md:16 says "Built: dashboard with
   losses and stock value", and the map says "Partly built". The only dashboard route is
   /api/dashboard/stock-rollup, which returns balances in quantities. No loss, value or peso
   field exists; the valuation engine is a planned, unsliced item (dispatch-queue.md:658).
   Repro (run): `curl "localhost:3010/api/dashboard/stock-rollup?date=2026-11-17"` - every key in
   the answer: date, restaurants, rows, kind, meat_type_id, unit, commissary_balance,
   by_commissary, balance, by_restaurant, total, grand_total and has-data flags.
3. **The internal meat request.** docs/session-status.md:362-363 (the 2026-11-14 block) still
   says "the landing's meat lines become the built internal request". The 11-15 correction fixed
   the area files but not this line.

- **ADR:** ADR-092 (the correction), ADR-029 and ADR-057 (the management view), decisions/README
  rule 5.
- **Smallest fix:** session-status:502 "Both modes are decided; neither is built";
  management-view.md:16 "Built: a stock rollup across sites, in quantities (no pesos yet)";
  session-status:363 "become the internal request (decided, not built: ADR-092)".

### C-09 - the activity log has three different stated scopes, and Settings changes are not logged (P2)

- **Where:** docs/scope.md:48 ("Changes to stock and settings are kept in an activity log") and
  :72-73 ("today: stock receipts, yield, settings, roles, roster and the other tables their steps
  name"); docs/session-status.md:618-621 ("Scoped to stock_receipts and commissary_yield_log
  only"); docs/rules-for-claude-code.md rule 9 ("scoped to just these two tables for now - don't
  silently extend it"); server/routes/settings.js.
- **What happens:** what is logged on main: stock receipts, the yield log, prepped, side items
  and their units and links, staff-meal slots and rice rates, roles and role assignments. Not
  logged: every other Settings change (meats, dishes, recipes, costs, restaurants, commissaries,
  meat types, adjustment types, locations: 19 write routes), allocations and adjustments,
  shipments, sales edits. The roster is not built at all. So scope.md (rewritten 2026-11-16 as
  "current") overstates, and the two older texts understate and still forbid what every step since
  role-assignments does by spec.
- **Repro (run on dev.db, made-up values):** as Test Admin,
  `curl -X PUT -H "Cookie: user_id=2" -H "Content-Type: application/json" -d
  '{"name":"Test renamed meat","unit":"kg","cost_per_unit":4242,"active":1}'
  localhost:3010/api/settings/meats/1` answers `{"ok":true}`; `GET /api/history` before and after
  has the same 3 rows (side_items, staff_meal_slots, staff_rice_rates). A meat's name, unit and
  cost changed with no trace. `grep -c logActivity server/routes/settings.js` prints 0.
- **ADR:** none records the log's scope (rule 9 is the only rule); ADR-097 leans on it (an admin
  who does not code changes Settings).
- **Smallest fix:** scope.md:48 "Changes to stock receipts, yields, roles, side items and
  staff-meal settings are kept in an activity log; other Settings changes are not yet"; drop
  "settings" and "roster" from line 72's "today" list; mark session-status:618-621 and rule 9 as
  widened by the steps that name their own log rows. Whether Settings -> Meats (costs, units)
  should be logged is a question for Naoki (Part B).

### C-10 - session-status.md opens on 2026-09-03 and is 4,934 lines of a file "kept short" (P2)

- **Where:** docs/session-status.md:1-73 and the whole file.
- **What happens:** the file a fresh session is told to read first says, under "Current state -
  2026-09-03": steps 1 to 25c closed, "Queue: 25a, then 24b-v, then 25d, then soft launch", three
  pre-launch pillars (Core, Terminal, CRUD), "16 files, 325/325 assertions". Today: 40 files, 748
  assertions, Beta defined by ADR-002 and ADR-007, the queue led by the roster. Line 601 (still
  under "Things NOT to re-litigate") says "Single local machine, one SQLite file, no
  hosting/multi-user - see scope.md", against ADR-034, ADR-070 and the new scope.md; line 503
  says "five roles ... the five names are fixed", against ADR-034 (six) and the Roles page
  (roles can be added). ADR-001 planned for this list to become "one line per ADR"; it is 772
  lines.
- **Repro (run):** a line count per `## ` section of docs/session-status.md:
  total 4,934; under headings of steps already CLOSED 2,140 (42 full specs, e.g. side-items 110 lines,
  import-identity 107, role-assignments 96); open step specs 1,515; "Things NOT to re-litigate"
  772; the 2026-09-03 gap hunt 214; "Current state - 2026-09-03" 56.
  `npm test` prints "40 files, 748 passed".
- **ADR:** ADR-001 (session-status slims into state plus an index); rules-for-claude-code rule 22.
- **Smallest fix (for the clean-up):** replace lines 19-73 with a ten-line "Current state" dated
  today; move the 42 closed specs to session-history.md behind one-line stubs (the 09-03 archive
  pass did exactly this); cut "Things NOT to re-litigate" to the entries no ADR holds, each either
  given an ADR or marked superseded.

### C-11 - side sheets: no step makes "only tonight's person writes" true for veggies, pantry or the bar (P2)

- **Where:** docs/session-status.md:3853-3856 (write-permission: "Enforced on: the restaurant meat
  landing's count saves ... and the commissary writes"), :3878-3881 (its Touches);
  :4708-4713 and :4735-4736 (side-sheets: the site check only; "Not in scope: ... who counts which
  sheet tonight (tonight-picks)"); :3767-3769 (tonight-picks: "one pick covers every sheet that
  station opens (meat now, veggies and pantry later)").
- **What happens:** ADR-011 says only tonight's assigned person may write, and ADR-014 says one
  pick covers the three kitchen sheets. write-permission was specced on 11-01 for the two engines
  that existed; side-sheets was specced on 11-14 and points at tonight-picks; tonight-picks points
  at "later". Neither side-sheets nor write-permission lists the side-sheet save
  (PUT /api/side-sheets/:sheetId/items/:itemId) or `server/routes/sideSheets.js`. Built as
  written, any cook with the site can overwrite the picked counter's veggie and pantry counts,
  and a bar sheet can be saved by anyone at the site.
- **Repro:** read the three passages side by side; `grep -n "sideSheets\|side-sheets"` inside the
  write-permission section (lines 3840-3900) returns nothing.
- **ADR:** ADR-011, ADR-014, ADR-037.
- **Smallest fix:** one line in write-permission's "Enforced on" list (and Touches):
  "the side-sheet save, against that sheet (mayWriteSheet), if side-sheets is on main; if not,
  side-sheets adds the call when it lands".

### C-12 - roster-week: one leave or one borrowed day in the new week blocks "Start the week" (P2)

- **Where:** docs/session-status.md:3615-3617 ("Start the week ... Refused when the week already
  has entries"), :3573-3574 (the original rule: "if anyone of the site already has an entry that
  week"), :3670-3672 (leave is entered as from-to dates, "One entry per day"), ADR-013 line 28
  ("Assignments can be set in advance").
- **What happens:** the flow is Start the week, then day offs, then leave. But leave is now a
  date range: a two-week leave typed this week writes entries into next week. So does a day at
  another restaurant that the other site's supervisor sets in advance. Either one makes next
  week "have entries", and Start the week is refused for the whole site: no day offs are copied
  and the supervisor rebuilds them by hand, which is the work Fill was meant to save.
- **Repro:** read the lines above together; the tests listed for the step ("Start the week copies
  only rest days") never start a week that already holds a leave.
- **ADR:** ADR-096 ("A new week starts with last week's day offs", "Leave is entered as from-to
  dates").
- **Smallest fix:** Start the week copies each person's day off onto every day of the new week
  that has no entry for that person, and is refused only when the week already has a day off
  (REST_DAY) copied or set. One sentence in the 11-16 block, one test.

### C-13 - a blind counter reads new stock, sales and allocations on every page but the count page (P1)

- **Where:** GET /api/history, GET /api/stock-receipts, GET /api/sales, GET /api/allocations
  (blindness is applied only in server/routes/dailyAudit.js:111, :145, :216, :364);
  docs/decisions/ADR-041-owner-site-per-request.md:22-23; ADR-091 lines 27-28;
  docs/dispatch-queue.md:676-677 (blind-history, planned, "Q15").
- **What happens:** ADR-015 says counters "never see beginning, new stock, sales, in-house,
  allocations, expected or variance. The server strips them, not just the page." ADR-041 says
  History "must not show a blind user the numbers the landing hides". On main the count routes
  strip them, and the same login then reads the same numbers one menu item away. The fix for
  History (blind-history) has waited on one unanswered question (Q15) since 2026-11-02; nothing
  is decided for the other three reads. History also shows the other site's receipts.
- **Repro (run on dev.db; Test Counter RA = id 6, Test Counter FC = id 7):**
  ```
  curl -H "Cookie: user_id=4" -H "Content-Type: application/json" -d '{"restaurant_id":1,"meat_id":2,
    "business_date":"2026-11-16","quantity":37,"source":"DIRECT","actor":"Test Head Chef RA"}' localhost:3010/api/stock-receipts
  curl -H "Cookie: user_id=6" "localhost:3010/api/daily-audit?restaurant_id=1&date=2026-11-16"
    # blind: true; the row is {"type":"MEAT","item_id":2,"name":...,"count":null,"remark":"","recount_open":false}
  curl -H "Cookie: user_id=6" "localhost:3010/api/stock-receipts?restaurant_id=1"      # 200, "quantity":37
  curl -H "Cookie: user_id=6" "localhost:3010/api/history?entity_type=stock_receipts"  # 200, "quantity":37
  curl -H "Cookie: user_id=7" "localhost:3010/api/history?entity_type=stock_receipts"  # 200, the other site's receipt
  curl -H "Cookie: user_id=6" "localhost:3010/api/sales?restaurant_id=1&year=2026&month=11"  # 200, per dish per day
  curl -H "Cookie: user_id=6" "localhost:3010/api/allocations?restaurant_id=1&date=2026-11-16" # 200
  ```
  For contrast, `GET /api/daily-audit/count-history` as id 6 answers 403 "Counters do not see
  count history."
- **ADR:** ADR-015, ADR-038, ADR-041, ADR-091.
- **Smallest fix:** answer Q15 with the scope stated: either "blind = the count page only" (then
  strike ADR-041's sentence and the blind-history step), or one helper used by the four list
  reads that returns 403 (or rows without quantities) to a requester who is blind at that site.

### C-14 - an admin role given as an extra role works on the Roles page and nowhere else (P1)

- **Where:** server/middleware/requireAdmin.js:5; server/routes/commands.js:23;
  server/routes/sideItems.js:29; server/db/siteAccess.js:42 (all read the base role's flag);
  server/db/permissions.js:118 (`isAdmin` uses `can()`); ADR-042 line 18.
- **What happens:** ADR-034 says what a person may do is everything their live roles allow, and
  a role with admin has everything. ADR-042 says its check is a stopgap that "moves into
  permissions.js (can, ADR-034)" once role-assignments exists. role-assignments closed on
  2026-11-15 and no step carried that move. So a trusted helper given "admin" as an extra role
  (the Roles API accepts it) is told "Only an admin can change settings" and "Only an admin can
  run this command", while /api/auth/me lists admin for them and the Roles page lets them change
  any role, including their own base role, after which Settings lets them in. The refusals are
  not a boundary, only a contradiction; by the code (siteAccess.js:42, not run) the same gap applies to a
  management role given as an extra role: no all-site read.
- **Repro (run on dev.db, then undone):**
  ```
  curl -H "Cookie: user_id=2" -H "Content-Type: application/json" -d '{"role_id":2}' localhost:3010/api/users/6/roles   # {"ok":true}
  curl -H "Cookie: user_id=6" localhost:3010/api/auth/me            # capabilities_by_site.RA includes "admin"
  curl -X PUT -H "Cookie: user_id=6" ... localhost:3010/api/settings/meats/1          # 403 Only an admin can change settings
  curl -X POST -H "Cookie: user_id=6" ... localhost:3010/api/commands/sync-batch-stock # 403 Only an admin can run this command
  curl -X PUT -H "Cookie: user_id=6" ... -d '{"capability":"sees_expected","on":true}' localhost:3010/api/roles/5/capabilities  # 200
  curl -X PUT -H "Cookie: user_id=6" ... -d '{"role_id":2}' localhost:3010/api/users/6/base-role   # 200, and Settings now answers 200
  ```
- **ADR:** ADR-034, ADR-042 (its last Decision line), ADR-010.
- **Smallest fix:** a small step (or a line in cost-guard, which already touches settings.js):
  requireAdmin, commands.js `adminOnly` and the side-item cost check call
  `can(db, req.user, 'admin', null)`; decide in the same block whether a bypass role by
  assignment bypasses site checks.

### C-15 - the Stations, Shifts and Staff import tabs do not say who owns what (P2)

- **Where:** docs/session-status.md:3426-3429 (Stations tab), :3469-3471 (Shifts tab),
  :3504-3506 and :3533-3534 (Staff tab); ADR-047 Consequences ("Later import tabs (Stations,
  Staff, role assignments) say in their own specs whether these rules apply"); ADR-082
  Consequences ("Later import tabs ... say in their own specs who owns what").
- **What happens:** the three tabs are specced as plain upserts ("Upsert by (site_code, name)",
  "Upsert by name"), while the Staff page edits the same fields (kitchen flag, order, minimums,
  shift rows, main station, sub-stations, standing access, usual break, "also works"). The specs
  do not say: whether a name on two rows is held (ADR-047); whether a cell is the full list, so
  that a station, a sheet link or a standing access missing from the sheet is removed; or whether
  the page or the sheet wins once a row exists. That is the gap ADR-082 closed for roles: an
  import run to add one waiter would put back every minimum the supervisor tuned on the page,
  and would restore a standing access (a write permission) an admin had removed. There is also no
  `--export` for these tabs, so the sheet cannot be brought back in step with the page.
- **Repro:** read the four passages against ADR-082's Decision; `grep -n "export"` inside the
  roster-stations and roster-staff sections (lines 3396-3540) returns nothing.
- **ADR:** ADR-047, ADR-082, ADR-097 (stations and shift rows are "data an admin edits").
- **Smallest fix:** one sentence per tab in the 11-16 blocks, following ADR-082: the import adds
  new stations, rows and people; for existing ones it compares and lists differences ("change it
  on the Staff page") and never removes a link or an access; a duplicated name is held;
  `--export` writes the three tabs.

### C-16 - the roster specs: lines the 2026-11-16 blocks leave open (P2)

Each of the four held specs is the 11-01 text plus a block that "overrides any reading of the text
above". The blocks add; they do not say which old lines die. A builder starts roster-stations
next, so these are worth one more drop-in.

1. **roster-week tests and page text** (session-status:3595-3602, :3583-3589): "one entry per
   person per day", "copyWeek reverts each one-off, keeps rest days, fills new people" and the
   "Copy last week" button are still listed; the block says only "Tests add". The step title in
   both files still reads "copy last week" (session-status:3542, dispatch-queue:354).
2. **Who edits a second placement** (:3559-3561): the head chef may edit a person only when "the
   person's main station is a kitchen station". If the commissary person's main station is
   Commissary, as the paper has it, and he is a kitchen closer every day (roster.md:65), the head chef cannot touch
   one of her three closers. Not decided either way.
3. **Fill, "yesterday's kind"** (:3704-3708): Silingan's kitchen has two Mid-shift rows
   (roster.md:53-54) and the scullery three rows. The rule keeps a person's kind, not their row,
   and gives no tie-break between two rows of that kind, so people can swap between the 11AM and
   1PM rows from one day to the next; on paper a person's cell is "mostly the same all week".
4. **Fill, covering the commissary person** (:3709-3717): on paper "whoever covers his day off
   does both" jobs (roster.md:65-66). Fill gives the second job only to the person who owns it
   ("Also works"); the person moved in to cover gets the commissary and not the kitchen closing.
5. **"Also works" needs a shift row** (:3530-3532): `also_shift_id` points at a station's row. A
   second job at a station with no rows (most stations) cannot be stored.
6. **Two placements at two sites**: slot 2 may be "at another row or station", so it can be at
   another restaurant (the paper's part-day "someone at Likod that day"). "Present counts a
   person once a day" (:3673) does not say at which site, and the staff-meal head count is
   prefilled from Present per site.
7. **Totals** (:3645-3648 against :3673-3676): the old text lists six totals and a
   `headCount()` of six fields; the block lists the paper's four rows (Present, Day offs, Leave,
   Head count). Whether the phone's day view shows six or four, and whether `headCount()` gains
   `head_count`, is not said.
8. **The three steps after Fill** have no 11-16 block although their inputs changed:
   tonight-picks still says "DEPENDS ON roster-day-status" (:3758) while the queue says
   `[blocked: roster-fill]`; login-tonight and write-permission read "an ON_DUTY entry" (:3810,
   :3845) written when a person had one entry a day; roster-board (ADR-090) describes each cell as
   "the station", decided the day before two placements.

- **Repro:** the cited lines; nothing here can be run until the steps are built.
- **ADR:** ADR-096, ADR-037, ADR-013, ADR-090.
- **Smallest fix:** a short "Decisions" block on roster-week and roster-fill answering 1 to 7 in
  a line each (suggested: old copy tests and button removed; the head chef may edit any entry
  whose station is a kitchen station; Fill keeps yesterday's row when it still exists; the cover
  also gets the covered person's "also works" row; "also works" may name a station with no rows;
  Present counts the person at the site of slot 1), and a one-line "also reads slot 2" note on
  the three later specs.

### C-17 - ADR-046's end condition has arrived, and ADR-063's COOKED column depends on it (P2)

- **Where:** docs/decisions/ADR-046-typed-non-meat-lines.md:11, :16-22, :37;
  docs/decisions/ADR-063-side-usage-while-counting.md:18-19; docs/session-status.md:4193
  (staff-meal-log: "Other: a typed name and an estimated peso amount"); dispatch-queue.md:498
  (side-items CLOSED 2026-11-14).
- **What happens:** ADR-046 (11-12) lets staff-meal lines for veggies and pantry be a typed name
  and a peso guess "until a site's veggie and pantry items exist in the app", because then
  "schema.sql holds only meats". Two days later side-items put the catalog on main. staff-meal-log
  is still specced with typed lines only, and no step or decision says when a line starts picking
  an item with an approximate kg (ADR-003 "resumes"). ADR-063 computes the side sheet's COOKED as
  usage less waste and staff meals; a typed peso line has no item and no kg, so it can never be
  subtracted, and "other usage" (ADR-003) stays unusable for staff meals.
- **Repro:** `grep -n "side_items" server/db/schema.sql` (the table exists, line 629);
  session-status:4193 and :4208-4210 (staff_meal_lines has `item_name` and `estimate_pesos`, no
  side-item column).
- **ADR:** ADR-003, ADR-046, ADR-063.
- **Smallest fix:** a question for Naoki before staff-meal-log is built: typed lines only for
  now (then say so in ADR-046's Status: "ends with step <name>"), or add an optional
  `side_item_id` and approximate quantity to staff_meal_lines in staff-meal-log, so nothing has
  to be migrated later.

### C-18 - ADR-040's "reopen only if" has been met by ADR-070 (P2)

- **Where:** docs/decisions/ADR-040-logged-out-until-write-permission.md:33-36;
  docs/decisions/ADR-070-tailscale-remote-access.md:14-18; docs/session-status.md:158-159
  (the second builder gets Tailscale after the beta-3 install).
- **What happens:** ADR-040 lets a logged-out request read and write everything until
  write-permission, and says to reopen "if the app is reachable beyond the restaurant's Wi-Fi
  before write-permission lands (then a login or the shared-password gate comes first)". ADR-070
  (twelve days later) makes the app reachable away from the restaurant through Tailscale and
  opens the firewall to that range. Since 2026-11-16 write-permission sits behind seven roster
  steps. Nobody recorded whether Tailscale counts as "beyond the Wi-Fi". Until then every
  device on the tailnet can change counts and read costs without logging in (C-03, C-04).
- **Repro:** read the two ADRs; `grep -n "100.64" scripts/restaurant-pc.bat` shows the rule.
- **ADR:** ADR-040, ADR-070, ADR-084.
- **Smallest fix:** one line from Naoki, added to ADR-070's Consequences: "Tailscale devices are
  invited one by one and count as inside the restaurant for ADR-040" - or the opposite, which
  moves sign-the-cookie and the logged-out 401 ahead of the roster.

### C-19 - ADR-097 names docs/official as the admin's manual; the folder is from 2026-10-19 and has no admin or running guide (P2)

- **Where:** docs/decisions/ADR-097-runs-without-a-coder.md:19-20 ("docs/official/ is the admin's
  manual"); docs/official/README.md:26-36; docs/official/system-overview.md:19, :30, :43, :49-50,
  :79-81.
- **What happens:** the folder holds an overview and a glossary, last checked 2026-10-19. The
  admin guide and "running-the-app" (install, start, back up) are listed "to write". No step, no
  architect item and no owner is named for them, and ADR-097 adds none. The overview is wrong on
  five points by its own rule ("session-status wins"): FC "stays on the Excel process" (ADR-065),
  five roles (six since ADR-034), "login comes next" (built 10-25), sides planned "with Scullery
  at FC" and "sheet owners with Done and Closed" (ADR-065, C-07), Beta "with sample data"
  (ADR-007).
- **Repro:** `git log -1 --format=%ad -- docs/official` gives 2026-10-19; read the cited lines.
- **ADR:** ADR-097, ADR-065, ADR-034, ADR-007.
- **Smallest fix:** add to the architect queue one item "official docs: admin guide and running
  the app" with a date (beta-3 is when an admin first needs it), and fix the five lines.

### C-20 - the area map and the area files lag main in both directions (P3)

The map (docs/areas/README.md, dated 2026-11-16) and each file's Status line agree with each
other. Against main they differ:

| Area | The map says | On main | Proof |
|---|---|---|---|
| 2 Meat landing | "blind count + recount Specced"; the file's APP section still says blind is "derived from role flags" | Built: blind-count CLOSED 2026-11-01 (PR #51), by site role since PR #78 | `GET /api/daily-audit` as Test Counter RA returns `blind: true` and rows of `type,item_id,name,unit,count,remark,recount_open`; a recount order as that user answers 403 |
| 1 Who does what | "Specced (picks, login list, write permission); login Built"; the file lists role-assignments and roles-page under "Specced" | roles per site and the Roles page are Built (PRs #78, #83) | dispatch-queue.md:326, :334 |
| 6 Roster | the file lists business-day, role-assignments, roles-page as "Specced 2026-11-01" | all three CLOSED | dispatch-queue.md:319, :326, :334 |
| 3, 4 Veggies, Pantry | "Specced (side-items, side-sheets)" | side-items Built (PR #74); side-sheets Specced | dispatch-queue.md:498 |
| 9 Staff meals | "Specced (3zw-3zz)" | staff-meal-settings Built (PR #82) | dispatch-queue.md:428 |
| 7 Supplier orders | "Decided"; the file says "Not specced" | supply-tags is Specced (2026-11-15) | session-status.md:4897 |
| 10 Prices | "Decided"; the file says "Not specced (import-settings price slice)" | the side-items import already carries a cost column; cost-guard is Specced | session-status.md:4600, :4525 |
| 17 Management view | "Partly built"; the file says "Built: dashboard with losses and stock value" and "Queue item A10" | a stock rollup in quantities only (C-08); A10 is the staff-meals item | C-08 |
| 16 Sales | IRL line "FC's token not set yet, 2026-11-14" | not checkable from the repo | ask |

Six area files have no "Open questions" section although the template has one: fc-scullery,
management-view, prices, sales, supplier-orders, veggies. supplier-orders is the one that matters:
session-status:155-156 says its 11-16 notes came "with open questions for A9", and they are only
in arrivals-and-bills.md.

- **ADR:** ADR-008 ("every architect conversation ends by updating the map").
- **Smallest fix:** update the nine cells; add the missing section to the six files ("None open"
  is an answer).

### C-21 - smaller lines that a later decision overtook without a mark (P3)

Each is one sentence in an accepted ADR or in "Things NOT to re-litigate" that no longer holds,
with no supersede note on the old text. None blocks a queued step today.

| Old text | Overtaken by | Note |
|---|---|---|
| ADR-059 line 15: "Supplier orders are made here: the commi for raw meat, the podium for side items"; the same in session-status.md:882 | ADR-021 (each sheet's counter writes the first lines; the landing has the final say) and the 2026-11-15 floor note (session-status:203-208: the landing's PO, MEATS too, goes to suppliers) | ADR-059's Status says "detailed by ADR-021 to ADR-023"; this line is replaced, not detailed. The podium receives; it does not order |
| ADR-024 line 14: "Staff fill only beginning and ending" | ADR-063 (the counter types the ending and Received; yesterday's ending is carried) | no note either way |
| ADR-010: "Until supervisor exists, blindness is derived from role flags"; "No new role bypasses site scoping" as the whole rule for site access | ADR-038; ADR-034 and ADR-091 (a role assignment at a site also gives the site) | ADR-034 says "refines ADR-010"; ADR-010's Status and index row say nothing |
| session-status.md:503: "five roles ... the five names are fixed" | ADR-034 (six), ADR-083 (six built-in names; other roles can be added and renamed) | still under "Things NOT to re-litigate" |
| session-status.md:494-495: side inventory has "no variance" | ADR-025 and ADR-087 (bar items sold as they are get expected and a difference) | bar only |
| session-status.md:600-602: "Single local machine, one SQLite file, no hosting/multi-user - see scope.md" (two bullets run together on one line) | ADR-034, ADR-070, scope.md of 2026-11-16 | |
| session-status.md:449: "head count = on duty + floater at the site" | roster-day-status 11-16 block: "Head count (Present + Day offs + Leave)" | see C-22 |
| docs/areas/staff-meals.md:50-51: "budget figure kept as the maximum reference until the rule is confirmed (40)" listed as Decided | ADR-027, whose Supersedes line names exactly this item 40 | |
| ADR-023 line 16: receipts go to each restaurant's cashier on arrival | the 2026-11-16 note (receipts reach the main supervisor in the evening first) | flagged "asked" in arrivals-and-bills.md:16-19; an open question, see Part B |

- **Repro:** read each pair. The pairs were found by reading every ADR against the four document
  sets; the declared supersede links were also checked by script (31 "Supersedes" references:
  each one that names an ADR as superseded has the mirror on the old file's header and index
  row; the exceptions are the "refines / details / answers" links, which carry no mirror by
  design, and ADR-096 to ADR-037, C-05). One link has no mirror the other way: ADR-059 says its
  frozen-SPOS line is superseded by ADR-005, whose own Supersedes line says "none". Two index
  titles differ from their files: ADR-082 and ADR-088 are shortened in the index.
- **ADR:** decisions/README rule 2 (only Status and Superseded-by lines change) and rule 5.
- **Smallest fix:** a Status note on ADR-059, ADR-024 and ADR-010 ("superseded in part by ...");
  inline "superseded" notes on the five session-status lines, or delete them in the clean-up.

### C-22 - words that mean two things (P3)

- **Head count.** The paper's bottom row and the 11-16 roster block: everyone on the roster that
  day (Present + Day offs + Leave). ADR-027, ADR-044, ADR-002 and staff-meal-log: the people who
  eat (prefilled from Present). session-status.md:449 defines it the second way under the roster.
  The function is `headCount()` and returns Present among other fields. A budget of head count x
  rate built on the wrong one counts people on their day off.
- **Close / closed.** (a) An admin closes a sheet: "under maintenance", switched off (ADR-012,
  step sheet-close, "Likod's sheets start closed"). (b) The head chef Closes a day's sheet after
  the owner marks it Done (session-status.md:514, never built, C-07). (c) A step is CLOSED.
  (d) Closing time, closers and "closed yesterday" in the roster.
- **Landing.** The paper sheet, the page (the review view), and the job ("the landing" is the
  head-chef role, ADR-035); "the landing person" in ADR-015, ADR-021 and ADR-022 predates ADR-035.
- **In-house.** Staff meals plus staff orders (ADR-028); the side sheet's INHOUSE column (unused,
  ADR-027); the adjustment type "Staff Meal / In-House".
- **Smallest fix:** the glossary (docs/official/glossary.md) gets these four entries; the roster
  block renames the paper's row to "On the roster" in code and keeps "Head count" as its label.

### C-23 - decisions with no step, not even a planned name (P3)

Checked by searching docs/dispatch-queue.md for each. Decided and present in the queue only as a
family or a planned name are fine and not listed (staging, meat-request, side-waste, the bar
steps, supplier-orders, arrivals, bills, roster-board, site-picker, blind-history, no-popups,
name-map-settings, grouped navigation, spos-import).

| Decision | What has no step |
|---|---|
| ADR-018 | miscut as a counted kg item filled by the yield; the shared cost per kg. staff-meals.md:82 says miscut meals "join when the miscut item exists"; nothing creates it. `grep -i miscut docs/dispatch-queue.md` is empty |
| ADR-028 | the in-house summary on the landing; staff orders recognised by the staff name in Loyverse. It also has the oldest open question (which Loyverse field) |
| ADR-029 | Spent and Used. management-view.md says "Not specced. Queue item A10", and A10 is staff meals |
| ADR-042 | "the check moves into permissions.js (can)" once role-assignments exists (C-14) |
| ADR-022 | unplanned buys recorded against items |
| ADR-088 | the Sunday export (named only as "A13") |
| ADR-002 | operating expenses (Final scope); parked in scope.md, placement still open |
| ADR-011 | PINs before Live ("decided later") |
| ADR-097 | the admin's manual (C-19) |
| session-status 09-15 / 09-26, no ADR | finalization and dated sheets (C-07); the optimistic-concurrency column (C-06); running-low (C-08); the unstandardized (sahog) residual; snapshot-then-sync backups; CSV export |
| session-status 10-05, no ADR | the real Loyverse port (sales written into the app, nightly). scope.md parks it; the landing's expected values and ADR-002's "real shortages day by day" rest on sales reaching the app |

- **Smallest fix:** for the clean-up, one table in dispatch-queue.md, "Decided, no step yet", with
  these rows, so that "Planned" stops being five lists in different formats
  (dispatch-queue.md:598, :621, :636, :646, :663), of which the first still lists the users table
  and busy_timeout, both built.

### C-24 - the architect queue (A0 to A15) is referenced 97 times and listed nowhere (P3)

- **Where:** e.g. scope.md:68 (A11, A12, A13, A15), management-view.md:23 (A10),
  ADR-089 (A15), ADR-088 (A13), dispatch-queue.md family headings (A8, A9).
- **What happens:** ADR-008 says architect work runs as a queue of items. The repo never says
  what each item is, which are done and which are parked; that lives in handoffs outside the
  repo. A reader cannot tell that management-view's "A10" is a wrong pointer without reading
  five other files.
- **Repro:** `grep -rnoE "\bA(1[0-5]|[1-9])\b" docs/areas docs/scope.md docs/decisions
  docs/dispatch-queue.md | wc -l` gives 97 hits; no file defines the list.
- **ADR:** ADR-008, ADR-001.
- **Smallest fix:** twelve lines at the top of dispatch-queue.md: A-number, name, state (done,
  open, parked), the areas it covers.

### C-25 - the commissary is called Built, but raw meat arriving from a supplier still cannot be entered (P2)

- **Where:** docs/areas/commissary.md:46 ("Built: yield (Path 1, kg), shipments ...") and :63-64
  ("Open questions: None open"); docs/areas/README.md row 15; docs/dispatch-queue.md:518-540
  (Step 25a); docs/session-status.md:1274-1362 (its spec, headed "NEXT");
  scripts/write-path-allowlist.json.
- **What happens:** the commi sheet's STOCK IN column (supplier deliveries) has had no way into
  the app since the gap was found on 2026-09-02. Step 25a was cut to quantity-only (ADR-049) and
  then "folds into the supply family" as part of arrivals, which is planned, not specced, and
  sits behind four other supply steps (supply-tags, suppliers, supplier-orders, buyer-list).
  Without Stock In a commissary balance cannot be right for any meat that was delivered. The area file and the map say Built and list no open
  item; scope.md lists "the commissary (yield, shipments, meat requests and staging)" in scope
  without it. The 89-line 25a spec still in session-status describes the weigh-in design that
  ADR-049 cancelled. Related: the same allowlist calls `commissary_meat_map` "an open
  architectural question - possibly vestigial"; session-status.md:1723 says it was retired on
  2026-08-29; ADR-053 says staging runs through it. Three answers for one table.
- **Repro (run):** `grep -rn "INTO commissary_stock_receipts" server scripts --include=*.js`
  returns nothing; `npm run audit:write-paths` prints "allowlisted as expected-missing: 3 tables"
  and the allowlist entry reads "Step 25a builds the supplier intake write path. DELETE THIS ENTRY
  when 25a lands."
- **ADR:** ADR-049, ADR-059 (arrivals), ADR-053 (the map), ADR-092 ("the commi stays on paper
  during Beta" is why this has not hurt yet).
- **Smallest fix:** commissary.md APP gains "Missing: Stock In from suppliers (was step 25a; now
  part of arrivals, A9)"; the 25a spec moves to history with a two-line stub; one line in ADR-053
  or the allowlist settles what `commissary_meat_map` is.

## Part B - what we still need to find out

A checklist by area. Three kinds of line: **OQ** = an open question written in docs/areas (all of
them are here, plus the ones written inside IRL text rather than under "Open questions");
**IRL** = the map shows APP ahead of IRL (IRL below Confirmed while the APP is Decided or
further); **A** = an assumption found in Part A. **BLOCKS** names a queued step (one with a spec
in the Queue today). "Planned" means it blocks only a step that has no spec yet.

APP ahead of IRL on the map (2026-11-16): 6 Roster (FC and Likod only), 7 Supplier orders,
8 Arrivals and bills, 10 Prices, 11 Podium, 17 Management view, 18 Money, 19 Waste. Only 17 has
something built on an IRL that is Written; 7 has a specced step and 19 a built half. No area
breaks the map's own habit 1 (no spec until IRL is at least Written).

### Across areas (the documents themselves)

- [ ] A (C-02) Where do allocation-requests (3zc), sheet-close (3zd) and staff-meal-log to
  staff-meal-view go relative to the roster? **BLOCKS** the order of every builder run.
- [ ] A (C-18) Does a phone on Tailscale count as inside the restaurant for ADR-040? **BLOCKS**
  the place of write-permission and sign-the-cookie.
- [ ] A (C-13, "Q15", open since 2026-11-02) Is blind the count page only, or every read of new
  stock, sales and allocations? Planned (blind-history).
- [ ] A (C-04) May a logged-out phone, or a counter of another site, read the meal budgets?
  **BLOCKS** cost-guard (its field list).
- [ ] A (C-14) Does an admin or management role given as an extra role act everywhere the base
  role would? **BLOCKS** cost-guard if the fix rides on it (both touch settings.js).
- [ ] A (C-06) Two devices: last save wins (built), or the 09-15 "changed under you" rule?
- [ ] A (C-07) Finalization: still wanted? If yes, who marks Done now that there is no sheet
  owner? Until answered, write-permission's "finalize" lines cannot be built as written.
  **BLOCKS** write-permission (two sentences of it).
- [ ] A (C-09) Should a change to a meat's cost, unit or recipe in Settings be logged?
- [ ] A (C-19) Who writes the admin's manual and the "running the app" page, and by when?
- [ ] A (C-25) What is `commissary_meat_map`: retired, or the staging map? Planned (staging).
- [ ] The example first name used in ADR-047 and in staff-meal-check's extra-meal example: is it
  invented (ADR-009)? It could not be checked from the repo.

### 1 Who does what tonight

- [ ] OQ (who-does-what.md:58) PINs for staff before Live. Decide later; blocks nothing queued.
- [ ] A (C-11) Who may save a veggie, pantry or bar sheet: tonight's pick and placement, as for
  meat? **BLOCKS** side-sheets and write-permission.

### 2 Meat landing (Silingan, FC)

- [ ] A (landing-sales, session-status:4463-4465) The Pizza tables read Loyverse categories named
  "PIZZA" (Silingan, Likod) and "PIZZA", "ADD-ONS PIZZA" plus items "FREE * PIZZA" (FC). FC's
  names come from the item list sent on 11-15; nothing records that Silingan's and Likod's
  category is called exactly that. A wrong name gives an empty table with no warning.
  **BLOCKS** landing-sales (a five-minute check with the real tokens).
- [ ] A (meat-landing.md:51-52 against :95) The 11-14 paper remark "3 portions to bagnet: 1
  Baglaw, 2 Laing" adds up to 3 only if those two Laing were platters (1 each); with two solos
  the map gives 2. Confirm Laing solo = 1/2 with FC. The spec's "one day against FC's paper POS
  column" check covers it. **BLOCKS** landing-sales (its last check, not its build).
- [ ] OQ in text (meat-landing.md:98-99) Which Loyverse item is the pork pancit (it takes Bagnet,
  not Quarter)? A remark until known; does not block.
- [ ] OQ in text (meat-landing.md:55-57) Grams per dish for Arrabiatta and servings per pack for
  Tuna Tinola and Daing. Planned (fc-dish-map).
- [ ] A (ADR-094) The CPA platter takes "1 (bigger) Quarter": is the bigger quarter counted on the
  same Quarter line? Planned (fc-dish-map).
- [ ] A FC's dishes and recipes in the app predate FC's menu, so FC's expected values on the
  landing are not usable until fc-dish-map. Is FC meant to count meat in the app from beta-3, or
  only read Kitchen Sales?
- [ ] meat-landing.md says "None open"; the lines above are its open items.

### 3 Kitchen veggies and 4 Pantry

- [ ] OQ (pantry.md:31) Items shared with a pizza station: how they are counted. Parked with
  pizza (A11); does not block side-sheets.
- [ ] A (session-status:495) "units are unverified and need a data investigation": are Silingan's
  and FC's item lists, units and conversions in the settings workbook filled and checked? Blocks
  the first real import, not the build of side-sheets.
- [ ] A (C-17) Do staff-meal lines for veggies and pantry pick an item now that the catalog
  exists? **BLOCKS** staff-meal-log (its lines table).
- [ ] veggies.md has no "Open questions" section.

### 5 Bar

- [ ] OQ (bar.md:72-73) What Likod's OUT column records. Planned (bar-check for Likod).
- [ ] A (ADR-086 line 36 against lines 20-21) check_kitchen is seeded on head-chef and supervisor,
  while the text says the head chef ticks kitchen sheets. Both on purpose? Planned (side-waste).

### 6 Roster

- [ ] IRL FC's and Likod's rosters are Written only, from an older workbook tab; ADR-096 gives FC
  the same features and Fill. FC's current rows, shift times and minimums have not been seen.
  Blocks FC's first import, not a build.
- [ ] OQ (roster.md:117-118) Silingan's stations, rows, minimums and people are drafted in the
  private notes: confirm them with the supervisor before the import. Blocks the first real import
  after roster-stations and roster-staff.
- [ ] OQ (roster.md:115-116) How he shares the roster today (print, photo). Does not block.
- [ ] A (C-01) The log action for Fill. **BLOCKS** roster-fill.
- [ ] A (C-12) Start the week when a leave or a borrowed day is already in the new week.
  **BLOCKS** roster-week.
- [ ] A (C-15) Page or workbook: who owns stations, rows, minimums, standing access?
  **BLOCKS** roster-stations and roster-staff (their import halves).
- [ ] A (C-16.2) May the head chef edit the kitchen placement of a person whose main station is
  not a kitchen station? **BLOCKS** roster-week.
- [ ] A (C-16.3, .4, .5) Ask the supervisor: do people keep the same row all week, or only the
  same kind? Does whoever covers the commissary also take his kitchen closing? Does anyone have
  a regular second job at a station with no shift rows? **BLOCKS** roster-fill and roster-staff.
- [ ] A (C-16.6, .7) A person placed at two sites in one day: Present where? Six totals or four
  on the phone? **BLOCKS** roster-day-status.
- [ ] A (roster.md:36-38 against :72-75) On 10-28 the head chef listed her kitchen people's days
  first; on 11-15 the supervisor sets day offs first. Who sets the kitchen's day offs now?
  **BLOCKS** nothing by itself; it decides whether roster_kitchen still matters before Fill.
- [ ] A (C-22) "Head count" in code and labels. **BLOCKS** roster-day-status and staff-meal-log
  (whichever lands second wires the prefill).

### 7 Supplier orders and buying

- [ ] IRL Written; the APP is Decided and supply-tags is Specced.
- [ ] A (C-21) Who writes the supplier order for raw meat: the commi (ADR-059, commissary.md:26)
  or the landing's consolidated PO (11-15)? Planned (supplier-orders); does not block supply-tags.
- [ ] A (supply-tags) FC's four direct meats must exist as FC meats in Settings for an admin to
  tag them. Not checked against the real list.
- [ ] The file has no "Open questions" section; its 11-16 questions are under area 8.

### 8 Arrivals and bills

- [ ] IRL Written; the APP is Decided.
- [ ] OQ (arrivals-and-bills.md:42-43) Do only shop-run receipts go to the main supervisor, or
  every receipt? This contradicts ADR-023 (receipts to each cashier on arrival) and is marked
  "asked" at :16-19. Planned (arrivals, bills).
- [ ] OQ (:44-45) Is the arrival checked against the receipt, not the PO? Planned.
- [ ] OQ (:46-47) Should the buyer run show cash given minus receipts = change? Planned.
- [ ] A (C-25) Supplier meat arriving at the commi has no way in until arrivals. Planned.

### 9 Staff meals and in-house

- [ ] OQ (staff-meals.md:83-84) Which Loyverse field carries the staff member's name on a staff
  order. Open since 2026-10-25 (ADR-028). No step (C-23).
- [ ] OQ in text (staff-meals.md:27-30) The in-house order slip: is the same order also rung up
  in Loyverse? If not, ADR-028's "sales already remove the stock" does not hold for those orders.
- [ ] OQ (staff-meals.md:82) Miscut meals wait for a miscut item that no step creates (C-23).
- [ ] A (staff-meal-log, session-status:4226-4229) Every checker gets "log staff meals", not only
  cooks (ADR-045 says "cooks hold it"). On purpose? **BLOCKS** staff-meal-log (one default).

### 10 Prices and 11 Podium

- [ ] IRL Written for both; the APP is Decided.
- [ ] A (prices.md:7-8) How far is the private price workbook from "about 75% of items priced"?
  Planned (bills, valuation); it also decides how many staff-meal lines show "not priced".
- [ ] Podium: none open.

### 12 Pizza stations, 13 Likod grill, 14 FC scullery

- [ ] OQ (pizza.md:55-56) Whose stock the shared station's is, and which pantry it draws from.
  Parked (A11).
- [ ] A (ADR-094) "Naoki picks the pizzas in effect later": the Pizza tables are temporary until
  then.
- [ ] OQ (likod-grill.md:40) Which commi product becomes which grill item. Parked (A12).
- [ ] A Likod is not a site in the app (two restaurants are seeded), while its sales already show
  on Kitchen Sales and its roster "waits for A12". Nothing queued depends on it.
- [ ] FC scullery: none (paper, ADR-065).

### 15 Commissary

- [ ] The file says "None open". From ADR-092: "who answers for what comes later"; until when
  the commi stays on paper; Likod as a destination (A12). Planned (meat-request).
- [ ] A (C-25) Stock In.

### 16 Sales

- [ ] A (sales.md:6) "FC's token not set yet" (2026-11-14): is it set on the PC now? **BLOCKS**
  landing-sales' check with real tokens, and beta-3.
- [ ] A (C-23) With the real Loyverse port parked, how do sales reach the landing's expected
  values during Beta: typed on the Sales page, or not at all?
- [ ] The file has no "Open questions" section.

### 17 Management view

- [ ] IRL Written (one chat, 2026-10-24) and the map says "Partly built": the one area that is
  ahead in the map's own sense. What is built is a stock rollup in quantities (C-08).
- [ ] A What do the owners look at each night, in what order? Nothing since 10-24 records it.
  Planned (Spent and Used has no step, C-23).

### 18 Money and operating expenses

- [ ] IRL Written; the APP is Decided.
- [ ] OQ (money.md:31-32) Where Likod's staff are paid (the template has no Likod tab); whether
  the export gives days or pesos; how long the weekly payroll takes. Parked (A13).
- [ ] OQ (money.md:33) Operating expenses: entered where? Parked (A13); ADR-002 keeps them in the
  Final scope.

### 19 Waste

- [ ] IRL Written, and waste.md:8 says "The waste paper has not been seen yet", while its open
  questions read "None open". Meat waste is Built and side waste Decided (ADR-086). See the
  paper before side-waste is specced. Planned (side-waste).

## Checked and found clean

- `npm run verify`: SUITE GREEN (40 files, 748 passed), AUDIT CLEAN.
- The ADR set: 97 files, 97 index rows, no gap in the numbers. Every declared supersede link
  (ADR-035, 036, 038, 045, 046, 049, 051, 053, 055, 057, 059, 064, 067, 075, 086, 091, 092, 094,
  096 to ADR-013) has its mirror on the old file's header and on the old index row. The reversal
  pairs ADR-048 to ADR-059 are marked on both sides.
- CLOSED lines: for 69 steps the queue and session-status agree on the date and the PR number
  (checked by script). The only mismatches are the 09-03 stubs (archive-pass, 25a, 25d).
- docs/areas: every file's Status line matches its row in the map (C-20 is about both lagging
  main, not about each other).
- FC's map in meat-landing.md: 27 lines in the sheet's order, 45 item names, every "takes" item is
  in the table, every line a take points at exists, and it matches ADR-094 and the landing-sales
  spec line for line. No price in it. The function names the spec leans on (categoryAccount,
  buildResolver, dishTotal, computeCategories) exist in loyversePreview.js.
- The 2026-11-16 roster blocks against ADR-096: shift rows, kinds, minimums, two placements, the
  break text, Start the week, leave as dates, "counts once", Undo Fill, staff with no login and
  the 1024px grid are all present in the specs. C-01, C-12, C-15 and C-16 are what is missing.
- No price, cost or budget in the repo: every `cost_per_unit` and `cost_per_portion` in the seed
  files is null; staff-meal slots are seeded with names only.
- Live, on dev.db: Settings writes answer 401 logged out and 403 for a counter (ADR-042); a
  malformed or repeated id answers 400 (ADR-074); an RA counter gets 403 at FC (site-filter); the
  catalog read /stock-receipts/meats is open and has no cost (ADR-043); /restaurants carries
  `can_use` (ADR-091); a built-in role cannot be renamed and "Admin" cannot be created next to
  "admin" (ADR-083, ADR-073); the admin commands refuse a counter and a logged-out request
  (ADR-041); a counter is blind, a head chef is not, logged out is blind, and a counter cannot
  order a recount or read count history (ADR-015, ADR-038); Kitchen Sales answers for `pos=fc`
  with "token not set" and refuses an unknown `pos` (ADR-066); the side-items list leaves the
  cost out for a non-admin (ADR-060's stopgap; by its code and its passing test, the live list
  had no sheet to show); the settings import names its database and
  refuses one that does not exist, creating nothing (ADR-081).
- The pages take "today" from `new Date().toISOString()`, the UTC date. In Manila (UTC+8) that
  is exactly the 8am business date of ADR-036, so counts after midnight land on the right day.
- A management login can still write today (a stock receipt saved as Test Management, 200).
  That is as decided: ADR-084 places the refusal in write-permission and nowhere earlier.

## Not reached

- docs/tech-stack.md, data-model.md, daily-workflow.md, testing-plan.md, click-through.md,
  ui-conventions.md, loyverse-sync.md, commissary-and-stock-receipts.md, workflow-guide.md,
  autopilot-guide.md, engineer-role.md, decision-authority.md, web-vs-claude-code.md,
  changelog.md and session-history.md were not read against the ADRs (the run's four document
  sets came first). session-status.md:859 itself says tech-stack.md still describes local
  hosting.
- Inside session-status.md: the closed step specs (lines 1782-2970 and the closed ones after),
  the 09-03 gap hunt and the four oldest open specs (25a, 24b-v, 25d, 25e) were skimmed, not
  checked line by line. Every open spec from allocation-requests on was read whole.
- .claude/commands (naoki-qs, naoki-qpr, naoki-qm, review) against ADR-006, ADR-071, ADR-072 and
  ADR-075: only start.md section 3 and the first part of naoki-qs.md were read.
- The page side of the built rules (what a phone shows) was not clicked through; every live check
  was an API request.
- Loyverse itself: no token was used, so category names and item names could not be checked.
- The private notes and the workbooks are outside the repo; every Part B line that says "not
  checkable from the repo" needs them.

## Short notes (not findings)

Design points where the ADR is clear; nothing here asks to reopen a decision.

- ADR-096 has Fill take people "by name", so the same people always get the first pick of rows
  in a tie. Deterministic as decided; the supervisor may read it as favouritism.
- Decision blocks appended under an old spec are the house style and ADR-072 depends on them.
  For the clean-up: when a block changes more than half of a spec that is not yet built (the
  four roster specs), rewriting the spec whole and keeping the old text in history would be
  cheaper for the builder than the override.
- Name-keyed maps keep growing (the dish map, FC's landing map, the pizza categories, soon the
  bar links) while the 09-15 rule "map by explicit product_id, never by name" waits on the parked
  real port. ADR-097's name-map-settings is the natural place to settle the key.
- ADR-084 leaves a read-only login able to write until write-permission; with the roster first,
  that is seven steps away. Settled; see C-18 for the one question it sharpens.
- sign-the-cookie's first lines say that until write-permission "nothing depends on who you
  are, so a forged cookie gains nothing". Since settings-guard, role-assignments and roles-page
  that sentence is out of date: every admin request in this report was made by typing
  `Cookie: user_id=2`, with no login. Picking the admin's name on the login page does the same,
  which is the decided Beta trade-off (identity, not security; real passwords before Live). The
  spec line should be reworded; the decision is not questioned here, but it is the reason C-18
  needs an answer.
- The server is stopped and the throwaway database is left in server/db/dev.db (gitignored).
