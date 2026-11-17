2cb16eeddc30cf766e07ca5bd58c54a7da2168f0

# Run 5-pages-updates - inventory-audit-app (2026-11-17)

Read-only review. Findings are written here as each is confirmed.

## Summary

23 findings: 6 at P1, 12 at P2, 5 at P3. No P0 found in this run's area. Part B1 (migrations) is clean.

| ID | Sev | One line |
|---|---|---|
| U-01 | P1 | Two phones on the landing: the second phone's save puts back an old count it never touched (I-01 / F2 confirmed on screen) |
| U-03 | P1 | Commissary count page: same overwrite, and any later save erases the notes (I-02 confirmed) |
| U-04 | P1 | New: a head chef's Save Day stores prepped = 0 for every dish, so "Sync batch stock" skips them |
| U-10 | P1 | A blind counter can read new stock, adjustments and sales on other pages (PERM-03) |
| U-11 | P1 | Costs on screen for every role and logged out; History prints them (C-13) |
| U-17 | P1 | New: one tap on Roles -> Deactivate removes admin rights from every admin, no confirmation |
| U-02, U-13 | P2 | A page the person cannot use throws and sits on "Loading..." |
| U-05, U-09 | P2 | A failed save shows `Unexpected token '<'...` or `Failed to fetch`; part may already be saved |
| U-06 | P2 | A draft follows the phone, not the person |
| U-07 | P2 | The commissary page keeps no draft and forgets the commissary |
| U-12 | P2 | A refused Settings edit looks saved |
| U-15 | P2 | A phone with the wrong date saves to the wrong day and is told "Saved" (F7: the 8am turn itself is right) |
| U-18 | P2 | The import says how many, not which; removed rows do nothing, silently |
| U-20 | P2 | Update: network down during `npm ci` leaves the PC unable to start the app |
| U-21 | P2 | Update: PC switched off mid-update leaves no trace that it was unfinished |
| U-22 | P2 | Update: the desktop launcher stays the old copy |
| U-08, U-14, U-16, U-19, U-23 | P3 | Number boxes, small page things, pop-ups, import and launcher wording |

## Setup

- Fresh clone at `~/fable-review-5/review`, commit above. `npm ci` ok. `npm run verify`: 40 files,
  748 passed, 0 failed - **SUITE GREEN**, **AUDIT CLEAN**.
- Throwaway database `server/db/dev.db` (`npm run reseed`, `npm run seed:test`), server on port 3010
  with the three Loyverse tokens empty. No `.env`, no `beta.db`.
- Pages driven with Playwright 1.65.1 / Chromium at 390x844 (phone, touch), logging in by tapping
  the name on the real login page. Scripts and screenshots are in `~/fable-review-5/ui`
  (`lib.js`, `a1-*.js`, ... and `shots/`), outside the clone.
- Earlier reports I could read: run 2 (I-..) and run 4 (F..). I did not have the reports that hold
  PERM-03 and C-13, so those two are answered from what the pages show, not against their wording.

Severity: P0 = data loss or a security hole; P1 = a wrong number or wrong access; P2 = fragile or
confusing; P3 = polish.

## Findings

### U-01 - P1 - Watched on two phones: the second phone's save puts the first phone's old count back (confirms I-01 / F2)

- **Where:** `public/daily-audit.html:699-704` (the page posts every row with the value it loaded);
  `server/engines/blindCount.js:111-112` (an untouched row that differs from the stored one is saved).
- **What happens, as seen on the screens:** phone A (Test Counter RA, the blind count list) saves
  Belly Slab = 40. Phone B (Test Head Chef RA, Review view) opens the sheet and sees 40. Phone A
  corrects Belly Slab to 47 and saves. Phone B types JOWL = 12 - never touching Belly Slab - and
  taps Save Day. Both phones say "Saved 11 meat row(s)". The stored Belly Slab is 40 again.
  Phone A still shows 47 until it reloads, then 40. The head chef's own history line reads
  "counted by Test Counter RA (first 40.00) - changed by Test Counter RA, Test Head Chef RA":
  it names the head chef as having changed an item they never touched, and shows neither the 47
  nor that it was lost.
- **Repro (ran):** `node a1-landing.js` in `~/fable-review-5/ui`. The body phone B's page sent:
  `POST /api/daily-audit` with 11 rows, among them
  `{"meat_id":2,"ending_actual":"40","remarks":"","touched":false}` and
  `{"meat_id":3,"ending_actual":"12","remarks":"","touched":true}`.
  After it: `STORED X actual = 40`; history
  `40 COUNT by Test Counter RA | 47 EDIT by Test Counter RA | 40 EDIT by Test Head Chef RA`.
- **ADR:** ADR-015 (two devices: last save wins - for the item that was saved, not for one that
  was not).
- **Smallest fix:** as I-01 / F2 say: in `saveCount`, `if (!touched && current) return null;`.
  The page side is already right (it sends `touched:false`), so no page change is needed.
- **Also seen:** "Saved 11 meat row(s)" is the number of rows posted, not the number written
  (`server/routes/dailyAudit.js:197`, `saved++` outside the `if`). A counter who typed one number
  is told 11 were saved; nobody can tell from the message what was actually written. P3: say
  "Saved" plus the count of rows that really changed.

### U-02 - P2 - Landing opens on a site the person cannot use and sits on "Loading..." forever

- **Where:** `public/daily-audit.html:108-112` (the picker lists every restaurant, first one
  selected) and `:516-535` (a 403 answer is treated as rows).
- **What happens:** the restaurant list is sorted by name, so FC is first. Test Counter RA and
  Test Head Chef RA (RA only) open Landing and see the grid stuck on "Loading..."; the console has
  `403 GET /api/daily-audit/mixed?restaurant_id=2` and `TypeError: rows.map is not a function`.
  Nothing on screen says "you have no access to FC" or "pick your restaurant". The Save Day button
  is still there. With the real names (FC, Likod, Silingan) every Silingan and Likod counter
  starts on FC this way.
- **Repro (ran):** `node probe.js "Test Counter RA" daily-audit.html` - body text ends
  "Restaurant FC / Restaurant A ... Loading... Save Day".
- **ADR:** ADR-091 already decides the fix ("the count pages' pickers show only `can_use` sites,
  and a 403 shows its message instead of Loading..."; planned step site-picker). Not built at this
  commit, so this is what staff meet at beta-3. Listed because it is the first thing a counter sees.
- **Smallest fix:** in `loadRestaurants`, `restaurants.filter(r => r.can_use)`; in `loadGrid`,
  `if (!res.ok) { gridContainer.textContent = data.error; return; }`.

### U-03 - P1 - Commissary count page: a stale phone puts the old count back, and every later save erases the notes (confirms I-02)

- **Where:** `public/commissary.html:306-307` (the Notes box is drawn empty, the stored note is
  never put in it) and `:324-328` (every row is posted, an empty box as `notes: null`);
  `server/routes/commissary.js:227-236` (every row with a number is upserted, no touched check, no
  history).
- **What happens, as seen on the screens:**
  1. Phone A (Test Commi) saves Belly Slab = 60. Phone B (Test Admin) opens the page, sees 60.
  2. Phone A corrects to 66 with the note "recount, 6 kg in the back chiller". Screen: "Saved."
     The Notes box is empty again straight after the save, and still empty after a reload. The
     note is shown nowhere on the page, so the person cannot see that it was kept (it was, at
     this point).
  3. Phone B types Belly Slab Raw = 20 and taps Save counts. Its page posts all 15 rows,
     including `{"commissary_meat_id":3,"ending_actual":"60","notes":null}`. Stored Belly Slab is
     60 again and the note is gone. Screen: "Saved." No history row, no log row.
  4. Same phone, second save: A re-enters 66 and the note, reloads, and taps Save counts with
     nothing typed. Stored: 66, `notes: null`. The note is erased by the person's own second save.
     Belly Slab Raw, counted by Test Admin, is now stamped `created_by_user_id` = Test Commi.
- **Also seen:** the "who counted" name is whatever is typed in the "Your name" box at the top of
  the page; left empty (the default on a new phone) every count is stored with `created_by` NULL,
  even though the person is logged in. The page opens on "All commissaries", where the count
  table is replaced by a hint - the commi must pick the commissary first every visit.
- **Repro (ran):** `node a1-commissary.js` in `~/fable-review-5/ui`; then
  `SELECT commissary_meat_id, quantity, notes, created_by, created_by_user_id FROM commissary_ending_actual`
  -> `3 | 66 | NULL | NULL | 8` and `4 | 20 | NULL | NULL | 8`.
- **ADR:** ADR-015 (every save is kept), ADR-080 (the last saver is stamped - here a non-saver).
- **Smallest fix:** as I-02: the route skips a row equal to the stored one and only writes `notes`
  when a note is sent; the page fills the Notes box from the stored note (the GET must return it)
  and uses the logged-in name when the name box is empty.

### U-04 - P1 - One Save Day by the head chef writes "prepped = 0" for every dish, and "Sync batch stock" then skips them all (new)

- **Where:** `public/daily-audit.html:194`, `:265`, `:295` (the Prepped box is drawn with
  `r.prepped ?? ''`, and the server sends 0 for "no row", so the box holds "0") and `:727-733`
  (every dish row is posted); `server/routes/dailyAudit.js:306-313` (a posted prepped with no
  existing row is inserted, no touched check); `server/routes/commands.js:134-139` (the sync only
  fills a dish/day that has NO prepped row).
- **What happens:** anyone on the full (not blind) landing - head chef, admin - types one meat and
  taps Save Day. The page sends `{"dish_id":3,"prepped":"0","portion_actual":"","touched":false}`
  for each of the 22 batch-prepped dishes. The server stores 22 `prepped` rows of 0 for that day
  (and 22 activity-log CREATE rows with no actor) and the screen says "Saved 11 meat row(s) and 22
  dish row(s)." When the admin later runs "Sync batch stock", those dishes already have a row, so
  the command leaves them at 0: sold 7, prepped 0. Meat usage for a batch-prepped dish is
  prepped x recipe, so that day's usage is understated and the meat shows a shortage that is not
  real. The blind counter's page does not do this (it has no Prepped box).
- **Repro (ran):** `node a2-prepped-zero.js`, then `node tmp-sync.js` in `~/fable-review-5/ui`.
  2026-11-24 (head chef saved one meat on the page, then a sale of 7 Bagnet Sisig was entered):
  after the sync `sold 7, prepped 0`. 2026-11-25 (same sale, no landing save):
  `sync-batch-stock -> synced 1`, `sold 7, prepped 7`. Database after three such saves:
  `prepped` has 22 rows of 0 for each of the three dates; `activity_log` has 66 `prepped CREATE`.
- **Earlier reports:** F2 notes that `prepped` has no touched check; I-12 is about the sync going
  stale. Neither has this chain; it only shows when the real page does the saving.
- **ADR:** rule 4 (calculated values are not stored); the route's own comment ("a repost of the
  same number must not ... log a no-op correction").
- **Smallest fix:** in the portions route, skip a prepped value when there is no existing row and
  the value is 0 (a 0 with no row means the same as no row), or skip any prepped row not marked
  `touched`. One test: post `prepped:"0", touched:false` for a dish with no row -> no row, no log.

### U-05 - P2 - When a save fails on the server the screen shows a programmer's message, and part of the sheet may already be saved

- **Where:** `public/daily-audit.html:715` and `:739` (`await res.json()` on an HTML error page);
  `server/index.js` (no JSON error handler); the per-row loop in `server/routes/dailyAudit.js:184-198`.
- **What the person sees (exact text, each case ran with `node a2-failures.js <case>`):**
  - **Database locked** (`lock`: another process holds the write lock for a moment - any second
    writer on the same file): the save fails at once (0.0 s, the 5-second wait does
    not apply - this confirms run 4's F3 from the page) and the status line reads
    `Error saving: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`. Nothing was saved.
    The typed numbers stay on screen.
  - **One bad row** (`badrow`: the I-08 body - the page itself cannot produce it, so the row was
    injected on the way out): the same text, `Error saving: Unexpected token '<', "<!DOCTYPE "...
    is not valid JSON`. The row before the bad one WAS saved (55), the bad one and the one after
    were not. The screen still shows all three numbers with no mark on any of them. Only after a
    reload does the page say "Restored 2 unsaved entries from Nov 17, 11:27 AM - not saved yet."
    and tag the two unsaved rows "(unsaved)". So the draft does tell the truth - but only if the
    person reloads; before that they cannot tell what was saved.
  - **No network** (`offline`): `Error saving: Failed to fetch`. Nothing saved, numbers stay on
    screen. A reload while offline shows the browser's own "no internet" page; back online the
    page reopens with "Restored 1 unsaved entry from ... - not saved yet." and the number is back.
    This part works as count-drafts intended.
  - **Server stopped** (`stopped`, `midsave`): see U-09 below.
- **ADR:** ADR-097 ("every message tells the person what to do next, in plain words").
- **Smallest fix:** a last-in-line Express error handler in `server/index.js` that answers JSON
  (`{ ok: false, error: 'Could not save.' }`) instead of the HTML stack page; in the page, read the
  body with `res.json().catch(() => ({}))` and show "Could not save - your numbers are still on
  this phone. Tap Save Day again." After a failed save call `restoreDraft()` so the "(unsaved)"
  tags show without a reload.

### U-06 - P2 - An unsaved draft belongs to the phone, not the person: the next person to log in gets it, and saving stamps their name

- **Where:** `public/daily-audit.html:528` and `:556` (`DraftStore.key('daily-audit', restaurantId, date)`,
  no user; `draft-store.js:25` already takes an optional user). Logging out does not clear it.
- **What happens:** Test Counter RA types two counts and does not save, then logs out. Test Head
  Chef RA logs in on the same phone and opens the same date: "Restored 2 unsaved entries from
  Nov 17, 11:27 AM - not saved yet." with the counter's numbers in the boxes. Save Day stores them
  as `33 COUNT by Test Head Chef RA`, `34 COUNT by Test Head Chef RA`. It also runs the other way:
  numbers a head chef typed are shown to a blind counter who logs in next on that phone.
- **Repro (ran):** `DATE=2026-11-23 node a2-failures.js draft`.
- **ADR:** ADR-080 (the saver is stamped - correct - but the person did not count it); ADR-015
  (a recount should not start from the first counter's numbers).
- **Smallest fix:** pass the user id as the fourth argument to `DraftStore.key` on the landing
  (the page already calls `/api/auth/me` for the nav), so a draft is restored only for the person
  who typed it.

### U-07 - P2 - The commissary page keeps no draft, and forgets which commissary was picked

- **Where:** `public/commissary.html:737` area (the month-opening panel is created without
  `draftPage`; the count table has no draft at all) and `:183-188` (always starts on
  "All commissaries").
- **What happens:** Test Commi types a count, the page reloads (pull-to-refresh, Android dropping
  the tab): the page is back on "All commissaries", the count table is replaced by "Select a
  specific commissary above...", and after picking it again the typed count is gone. No notice.
  The landing keeps drafts; the commissary - 15 meats and long freezer counts - does not.
- **Repro (ran):** `WHO="Test Commi" node a2-failures.js commdraft` ->
  `selected = "All commissaries" | count rows on screen = 0`, `typed 44 still there: false`.
- **ADR:** step count-drafts ("Commissary does not yet" - known, deferred). Listed because run 5 is
  the first to watch it happen.
- **Smallest fix:** when the user can use exactly one commissary, select it on load; reuse
  `DraftStore` for `.count-actual` / `.count-notes` as the landing does.

### U-08 - P3 - What the number boxes accept on a phone (confirms I-07 from the page)

Typed into the counter's END boxes (`node a2-failures.js typed`), then Save Day -> "Saved 11 meat row(s).":
`-5` is stored as -5; `1,5` becomes 15 (the comma is dropped silently); `99999999999` is stored;
`7.123456` is stored with all its decimals; `1e999` shows in the box but is sent as empty, so
nothing is saved for that row and the message still says "Saved 11". Fix with I-07's helper
(refuse a negative or absurd count with a plain message) and `min="0"` on the inputs.

### U-09 - P2 - Server stops in the middle of Save Day: the phone says "Failed to fetch" though the meats were saved

- **Where:** `public/daily-audit.html:710-742` (two requests per Save Day: meats, then dishes).
- **What happens:** Test Head Chef RA types two meats and one dish count and taps Save Day. The
  meat request is answered; the server is killed before the dish request. Screen:
  `Error saving: Failed to fetch`, no mark on any row. Stored: both meats saved, the dish not.
  When the server is back and the same phone reopens the sheet: "Restored 1 unsaved entry from
  Nov 17, 11:30 AM - not saved yet." and only the dish row is tagged "(unsaved)". So the draft
  sorts it out correctly after a reload; in the moment the message reads as "nothing was saved".
  With the server fully down before the tap (`stopped`): the same `Error saving: Failed to fetch`;
  a reload shows the browser's own "can't reach this page" (the numbers stay in the draft).
- **Repro (ran):** `node a2-midsave.js`; `DATE=2026-11-27 node a2-failures.js stopped`.
- **ADR:** ADR-097 (plain messages that say what to do next).
- **Smallest fix:** same page change as U-05: on any failed save show "Could not reach the
  server. Your numbers are kept on this phone - tap Save Day again when the app is back." and
  call `restoreDraft()` so unsaved rows are tagged at once.

### U-10 - P1 - A blind counter can read new stock, adjustments and sales on screen, one tap from the count list (PERM-03, page side)

- **Where:** the nav on every page (`public/*.html`, the same 11 links for every role) and the
  reads behind `stock-receipts.html`, `allocations.html`, `sales.html`, `history.html`,
  `kitchen-sales.html`. Only the landing (`/api/daily-audit*`) and the month opening are stripped.
- **What happens:** made-up sentinel numbers were planted for Restaurant A on 2026-11-17 (a receipt
  of 4321.5, an adjustment of 2468.5, a sale of 1357, an opening of 8642.25). Logged in as Test
  Counter RA at 390x844:
  - Landing: clean. None of the four numbers is on screen, in the page's DOM, or in any answer the
    page fetched; the month opening answers "Counters do not see month openings." This part of
    ADR-015 holds, logged out too.
  - Stock Receipts: the list shows `2026-11-17 Restaurant A M01 - Whole Chicken Raw (unit) 4321.50
    DIRECT` (new stock), with Edit and Delete buttons.
  - Allocations: 2468.5 is on screen (adjustments).
  - Sales: the grid box for that dish holds 1357 (sales).
  - History: `CREATE stock_receipts #1 ... quantity 4321.5` is on screen.
  - Kitchen Sales: opens for the counter and lists every dish with today's sold columns (empty
    here only because the test tokens are empty).
  So everything the landing hides except Beginning is readable by the same person on the same
  phone; with yesterday's count (their own) they can work out the expected number.
- **Repro (ran):** `node a3-setup.js` then `node a3-crawl.js` in `~/fable-review-5/ui`; the lines
  for "Test Counter RA" in `shots/a3-summary.txt` (`EXPECTED visible: new stock`, `adjustment`,
  `EXPECTED dom: sales`), screenshots `shots/a3-Test_Counter_RA-*.png`.
- **ADR:** ADR-015 ("they never see beginning, new stock, sales, in-house, allocations, expected
  or variance. The server strips them, not just the page"), ADR-038. ADR-091 already plans
  blind-history for the History page only.
- **Smallest fix:** one helper next to `isBlind`: for a user who is blind at the row's site, the
  GETs for stock receipts, allocations, sales, history and the Loyverse preview answer 403 with the
  same plain line the month opening uses; and the nav hides those links for a blind user (the
  page already calls `/api/auth/me`).

### U-11 - P1 - Costs are on screen for every role and for a logged-out visitor; History prints them even where the read is guarded (C-13, page side)

- **Where:** `public/settings.html:378`, `:442`, `:1127` (cost boxes), the Staff meals tab
  (budget); `public/history.html` (prints every before/after field of the activity log);
  `server/routes/settings.js:164,210,247`, `server/routes/commissary.js:82`, `server/routes/history.js`.
- **What happens:** made-up sentinel costs were planted (meat 7777.77, dish 8888.88, commissary
  meat 6666.66, meal-slot budget 5555.55, side item 3333.33). The numbers are in the page for every role and logged out (seen on screen as Test Counter RA; head chef and management may see costs under ADR-060, a counter, the commi and a logged-out visitor may not):

  - Settings -> Meats: the "Cost/unit" box shows 7777.77. Dishes: "Cost/portion" 8888.88.
    Commissary Meats: 6666.66. Staff meals: the budget 5555.55. All editable-looking boxes.
  - History (linked in the nav as "History", titled "Admin History"): on screen for everyone,
    `CREATE side_items #1 ... cost_per_unit 3333.33` and `UPDATE staff_meal_slots #1 ...
    fixed_budget - -> 5555.55`. The side-items read itself is guarded (the cost was not in
    `/api/side-items` for any non-admin) - History hands the same number out.
  - `/api/commissary/meats` carries `cost_per_unit` to every page that lists commissary meats
    (Commissary, Shipments, Stock Receipts, Terminal). Not drawn on screen, but it is in the phone.
- **Repro (ran):** `node a3-crawl.js` (lines `COST visible`, `COST dom`, `cost keys in`), and
  `node a3-details.js` ("Meats tab tapped: cost box on screen = true value 7777.77").
- **ADR:** ADR-060 (no cost for anyone without `see_costs`, "logged out included"; step cost-guard,
  planned, not built at this commit), ADR-009. Listed because beta-3 runs this commit on the
  restaurant Wi-Fi; the History path is not in ADR-060's "covered now" list and would be missed by
  a cost-guard built from that list.
- **Smallest fix:** in cost-guard, strip the cost and budget keys from `before` / `after` in
  `GET /api/history` for anyone without `see_costs`, alongside the three Settings reads and the
  commissary meat list.

### U-12 - P2 - A Settings edit that the server refuses looks saved

- **Where:** `public/settings.html:389-404` (`saveMeatRow`) and its twins for dishes, commissary
  meats and the other tables: the row saves on `change`, and the answer is never read.
- **What happens:** Test Counter RA opens Settings -> Meats, types 1.11 in the Cost/unit box and
  moves on. The page sends `PUT /api/settings/meats/1`, the server answers 403 (ADR-042, correct),
  and the screen shows nothing: the box keeps 1.11 until the page is reloaded. The same silence
  meets an admin whose save fails (locked database, no network) - and an admin whose save works:
  there is no "Saved" either, so nobody can tell which edits landed.
- **Repro (ran):** `node a3-details.js` -> `counter changed the cost box -> sent ["PUT
  /api/settings/meats/1"] answer ["403 PUT /api/settings/meats/1"]`, `box now shows 1.11 | any
  message on screen: []`, `stored cost still 7777.77: true`.
- **ADR:** ADR-042 (the refusal is right), ADR-097 (the admin does not code: every message says
  what happened and what to do).
- **Smallest fix:** one shared `saveRow(url, body, row)` in settings.html that reads the answer,
  shows "Saved" or the server's error beside the row, and reloads the table on an error. For a
  non-admin, disable the inputs (capabilities come from `/api/auth/me`).

### U-13 - P2 - Pages a role cannot use do not say so: they throw and sit on "Loading..."

Same root as U-02 (a 403 answer is used as if it were rows). Seen in the crawl (`shots/a3-summary.txt`):

| Role | Page | What is on screen | Console |
|---|---|---|---|
| Test Counter RA, Test Head Chef RA | Landing (default site FC) | "Loading..." | `rows.map is not a function` |
| Test Counter RA, Test Head Chef RA | Commissary | "Loading..." in the balance, count and yield areas | `meats.map is not a function` |
| Test Counter RA, Test Head Chef RA | Shipments | the meat and preset lists do not load | `meats.map`, `currentPresets.map is not a function` |
| Test Counter RA, Test Head Chef RA, Test Commi | Settings (Shipment Presets, Conversion Standards) | those lists do not load | `presets.map`, `standards.map is not a function` |
| Test Commi | Landing (either site) | "Loading..." | `rows.map is not a function` |
| Test Commi | Stock Receipts | "Loading..." | `lastRows.map is not a function` |
| Test Commi | Allocations | "Loading..." | `rows.map is not a function` |
| Test Commi | Shipments (conversion standard for a restaurant) | the standard does not load | `currentStandards.find is not a function` |
| Test Counter RA, Test Head Chef RA, Test Commi | Sales (default site) | empty grid, no message | 403 only |

Clean for every role: Home, Login, Dashboard, Kitchen Sales, History, Roles (logged out it says
"Log in first: Log in", which is the pattern the others need), Terminal. Test Admin and Test
Management: no console error on any page.
**Fix:** one small `getJson(url)` helper that returns the rows or shows the server's `error` text
in the page's list area; ADR-091's site-picker for the pickers.

### U-14 - P3 - Small things seen on the pages

- **Who am I:** Dashboard and Kitchen Sales do not load `command-panel.js`, so they show no name
  and no "Log out" while every other page does (`node a3-details.js`: "Pages with no name / Log
  out shown while logged in: dashboard.html, kitchen-sales.html").
- **Home:** after tapping a name the person lands on `index.html`, which reads "Setup OK - server,
  static files, and database connection are all working." Kitchen Sales and Roles are linked only
  from there, not from the nav. (login-tonight's "your work tonight" is specced; this is today.)
- **Nav:** the same 11 links for every role on a 390px screen, including Terminal and Settings for
  a counter (ADR-032 grouped navigation is decided, not built).
- **Management writes:** Test Management (read-only) types a count on Landing and taps Save Day:
  "Saved 11 meat row(s) and 22 dish row(s).", stored. ADR-084 places the refusal in
  write-permission, which is not built - known and decided; noted only because the page offers
  the Save button to a read-only login.
- **Clean:** no dead link on any page for any role; no page scrolls sideways at 390px on load
  (ADR-077 holds); no browser pop-up on load; the login list and login work for every Test account.

### U-15 - P2 - Dates: the pages turn at 8am Manila on any phone, but follow the phone's date; a phone a day wrong saves to the wrong day and is told "Saved" (F7, page side)

- **Where:** `public/daily-audit.html:102`, `commissary.html:167-168`, `commissary-shipments.html:113`,
  `stock-receipts.html:122`, `allocations.html:95`, `dashboard.html:84`, `sales.html:74`,
  `terminal.html:784`; `kitchen-sales.html:209-211` (its own copy of the rule). The write routes
  take any `business_date`.
- **What the pages show (`node a4-dates.js`, Playwright clock and timezoneId; full table in
  `shots/a4-dates.json`):**

| Phone clock | Landing, Commissary (both dates), Shipments, Stock Receipts, Allocations, Dashboard | Kitchen Sales | Sales (month) |
|---|---|---|---|
| 07:59 Manila, Nov 18 | 2026-11-17 | Tue, Nov 17 | 2026-11 |
| 08:00 Manila, Nov 18 | 2026-11-18 | Wed, Nov 18 | 2026-11 |
| 00:30 Manila, Nov 18 | 2026-11-17 | Tue, Nov 17 | 2026-11 |
| the same two instants, phone set to Los Angeles time | 2026-11-17 / 2026-11-18 | same | same |
| phone date a day ahead (says Nov 18, 21:00) | 2026-11-18 | Wed, Nov 18 | 2026-11 |
| phone date a day behind (says Nov 16, 21:00) | 2026-11-16 | Mon, Nov 16 | 2026-11 |

- **What this confirms and refutes of F7:** every page's default date equals ADR-036's rule at
  07:59, 08:00 and after midnight, and it does not depend on the phone's time zone (the expression
  is the UTC date, which is Manila minus 8 hours). So staff will see the right date on a phone
  whose clock is right - F7's "by coincidence" is true of the code, not visible to staff. What does
  bite is the phone's own date: the pages have no other source.
- **Where a save lands:** on the day-ahead phone the landing opened on 2026-11-18, the count was
  posted with `business_date=2026-11-18`, and the screen said "Saved 11 meat row(s) and 22 dish
  row(s)." The real business day (2026-11-17) still has no count for that meat. Day-behind phone:
  the same onto 2026-11-16 - and there it would be typed over the night before's real counts.
  Nothing on screen or on the server compares the date with the server's business day.
- **A tab left open:** loaded at 22:00 on Nov 17, looked at again at 20:00 on Nov 18 without a
  reload, the date box still says 2026-11-17; a save goes to yesterday.
- **Terminal:** has no date box at all; a shipment typed there is dated from the phone's clock at
  that moment (`terminal.html:784`), and the person never sees or picks the date (ADR-036: "pages
  that pick a date always show and allow choosing it").
- **Times on screen are UTC:** History and the Stock Receipts "Entered" column print the stored
  text as is: at 11:31 Manila they read `2026-11-17 03:31:46`. An entry made at 01:00 Manila on the
  18th reads "2026-11-17 17:00".
- **ADR:** ADR-036 (one helper), ADR-033.
- **Smallest fix:** F7's: `GET /api/auth/me` also answers `business_date` (from
  `server/businessDay.js`); each page uses it for its default. Then one line on the count pages:
  when the date box is not the server's business date, show "You are looking at <date>, not
  tonight." (a warning, not a block). Format the two timestamp columns in Manila time.

### U-16 - P3 - Buttons: one browser pop-up met on the first tap; more are in the pages

As Test Admin every visible button on every page was tapped once (`node a3-buttons.js`, 84 taps,
page reloaded before each; results in `shots/a3-buttons.json`). Every button did something, except
ones that were already the selected tab or view (Review, Silingan + Likod, Restaurants) and
"Remove" on a shipment's only line (nothing happens, nothing says why). One native pop-up: Settings
-> "Add Restaurant" with empty boxes -> `alert: Name and code are required.` Counted in the page
files: 27 `alert/confirm/prompt` calls in settings.html, 5 in commissary.html, 5 in
stock-receipts.html, 1 in sales.html. ADR-093 (no browser pop-ups; step no-popups is planned).
The pass only tapped what is on screen at load - Edit/Delete flows deeper in each page were not
walked.

## Part B - the update path

### B1 - Migrations from beta-2: clean (no finding), with three notes

- **What was run:** `~/fable-review-5/old` = a second clone, detached at tag `beta-2` (`1e81755`).
  Seeded, started on port 3011, then filled through its API (`ui/b1-drive-old.js`): month
  openings for both restaurants and the commissary, counts on two days by the counter, an edit by
  the head chef, a recount order and its recount, portions, three receipts (one edited, one
  deleted), two adjustments, sales and a batch sync, commissary counts, a yield, a write-off and a
  shipment, and Settings edits (costs, a rename, a new meat, a recipe quantity, an adjustment type,
  a location, a meat type, a conversion standard). Snapshot of 81 page reads as five roles plus
  every table (`ui/b1-snapshot.js` -> `upgrade/before.json`). Server killed the way a person stops
  it (window closed). Database copied with its `-wal` and `-shm`, and the main clone started on
  the copy with an absolute `DB_PATH`.
- **Result:**
  - The server starts in about a second and prints only its usual address lines. Nothing says the
    database was updated, and nothing needs to: it works.
  - `PRAGMA integrity_check`: ok. `PRAGMA foreign_key_check`: 0 rows. Before and after.
  - Every row is still there: 377 rows in 41 tables before, the same 377 after, no old column
    changed in any row. Two new empty tables (`staff_meal_slots`, `staff_rice_rates`).
  - 79 of 81 reads are byte-for-byte identical (landing and mixed grid for three dates as admin,
    head chef, management, counter and logged out; count history; month openings; commissary;
    dashboard; history; receipts; allocations; sales; every Settings list; `/api/auth/me` for all
    eleven accounts). The two that differ are `/api/restaurants`, which gained `can_use` (ADR-091).
  - In the browser (`ui/b1-pages.js`, Test Admin at 390x844): Landing, Commissary, History, Roles,
    Stock Receipts, Allocations, Dashboard, Sales and Settings all load with no console error.
  - Going back also works: beta-2's code started on the database the newer code had opened - 81 of
    81 reads identical to the first snapshot. So the launcher's rollback after a failed update does
    not strand the data at this pair of versions.
- **Note 1 (confirms I-15 for the update path):** on the updated database Settings -> Staff meals
  shows "No meal slots yet" and "Rice rate not set"; a fresh install gets five seeded slots. An
  updated site has to type them in. Fine if intended; it should be one line in the update notes.
- **Note 2 (confirms F4's premise):** after the session the main file was still the 292 KB seed
  file with a 1.4 MB `-wal` beside it. Opened alone, the `.db` had 0 counts, 0 openings, 0
  receipts; with its `-wal`, 27 counts, 24 openings, 4 receipts. Every save of the session lived
  only in the `-wal`. The launcher does copy both; anyone copying "the database file" by hand
  (ADR-007's private copy to Drive) takes an empty one.
- **Note 3:** there is no schema version (`PRAGMA user_version` is 0); each start re-runs twelve
  "does this column exist" checks and `schema.sql`. That is why both directions worked here. The
  first migration that changes or drops something (not only adds) will not be reversible by the
  launcher's rollback, and nothing will say so - worth a version number before that day.

### U-17 - P1 - One tap on Roles -> "Deactivate" takes admin rights from every admin, the tapper included, with no question asked (new)

- **Where:** `public/roles.html:177` (the Deactivate button, drawn for the built-in `admin` role
  too); `server/db/permissions.js:291-322` (`updateRole` refuses only the super-admin role).
- **What happens:** Test Admin opens Roles and taps the first "Deactivate" on the page - it is the
  `admin` role's. No confirmation. The page sends `PUT /api/roles/2 {"active":false}` and says
  "admin deactivated." From that moment every person whose role is admin has no rights at all
  (`/api/auth/me`: `can_enter_counts 0, can_finalize 0, can_admin 0`, no sites). The Roles page
  now shows them no buttons; tapping back is impossible: the same person's
  `PUT /api/roles/2 {"active":true}` answers `403 Only an admin can change roles.` and Settings
  answers `403 Only an admin can change settings`. Only the bootstrap super-admin login can switch
  it back on - at a restaurant looked after by one admin who does not code (ADR-097), that is a
  phone call. I hit this by accident: the button pass tapped it once and silently ran its
  remaining pages without admin rights.
- **Repro (ran):** `node a3-roles-lockout.js` in `~/fable-review-5/ui` (it restores the role at the
  end through the super-admin login). Output: `tapped Deactivate -> sent ["PUT /api/roles/2
  {"active":false}"] | confirm pop-ups: 0`, then the two 403 lines above.
- **ADR:** ADR-083 protects the built-in roles' names, ADR-095 allows removing an *extra* role;
  neither says a built-in role may be switched off, and the roles-page spec has no edge state for
  "an admin switches off the role they are using". ADR-097.
- **Smallest fix:** in `updateRole`, refuse `active: false` when the role is the acting user's own
  base role, or when it would leave no active role with admin besides super-admin: "You are using
  this role - ask the super-admin to switch it off." One test. (The page can also hide Deactivate
  on built-in roles.)

### B2 - The workbook import on a database that already has counts

**What it is.** `scripts/import-settings.js` reads four tabs only: Roles, Users, Sheets (side
sheets) and SideItems. Recipes, meats, dishes and their units and costs are not in the workbook at
all: a `Recipes.csv` put in the folder is listed as `Tabs skipped (not part of this slice): Recipes`
and nothing else happens. So "change a recipe quantity, a meat's unit or a meat's cost through the
workbook" cannot be done; those are Settings edits (run 2's I-11 covers what they do to past days).
The nearest workbook equivalents were tested: a side item's conversion quantity, main unit and
cost. Made-up names and sentinel numbers only; workbooks are in `~/fable-review-5/upgrade/wb1`,
`wb3`, `wb4`; table dumps after each run in `upgrade/dump-after-run*.json` (`ui/b2-dump.js`).
The import was run against `dev.db` while the app was running on it: no lock error.

**Under existing counts and history: nothing moved.** Row counts and content hashes of
`ending_actual`, `count_entries`, `opening_stock`, `stock_receipts`, `adjustments`, `sales`,
`prepped`, `recipe_bom`, `meats`, `dishes`, `commissary_meats` and `commissary_ending_actual` were
identical after each of the four runs. (Side items have no counts yet at this commit, so there is
no side history for a changed conversion to re-value. When side-sheets lands, a changed conversion
will re-value old counts unless a count stores its main-unit quantity - a note for that spec.)

| Run | What was in the folder | What happened | What the terminal said |
|---|---|---|---|
| 1 | first import: 1 new role, 3 people, 2 side sheets, 4 items | all added | counts per kind; one WARNING (below) |
| 2 | the same files again | nothing changed (every table identical) | all zeros; the same WARNING |
| 3 | conversion `sack=25` -> `sack=50` | applied; logged with before/after | `Side items: 0 added, 2 updated` - not which, not what |
| 3 | main unit `L` -> `ml` on an item with a conversion | refused | `Oil Sentinel: main unit is l, row 3 says ml - row skipped (use a second item)` - clear |
| 3 | main unit `kg` -> `g` on an item with no conversion and no counts | refused too | the same line (ADR-078 only fixes the unit once there are conversions or counts; harmless, but a typo made on first import cannot be mended by re-importing) |
| 3 | cost 4444.44 -> 9999.99 | applied; logged with before/after | counted in "2 updated" only |
| 3 | a role's flag and a person's role changed | left alone (ADR-082) | `Left as the app has them - change these on the Roles page (2)` with both lines - clear |
| 3 | a person's sites cell `RA, FC` -> `RA` | FC membership removed | `Site memberships: 0 added, 1 removed` - not whose (ADR-047: "the report shows every removal") |
| 4 | a person's row deleted | nothing: still active, still has their site | nothing at all |
| 4 | a role's row deleted | nothing: role stays | nothing |
| 4 | a sheet's row deleted | nothing: sheet stays on | nothing |
| 4 | an item's row deleted | the item is switched off on that sheet (kept in the catalog) | `Side sheet items: ... 1 switched off` - not which |
| 4 | a conversion deleted from a row (`cup=0.2`) | kept (ADR-079) | nothing |
| 4 | a cost cell blanked | cost kept | nothing |

### U-18 - P2 - The import's report says how many, not which; and four kinds of "I removed it" do nothing without a word

- **Where:** `scripts/import-settings.js:640-662` (`formatReport`), and the Users / Roles / Sheets
  passes, which never look for rows that are in the database but not in the file.
- **What happens:** the settled rules hold (ADR-047 "people not in the sheet are untouched",
  ADR-079, ADR-082) - this is about what the non-coder is told. Someone leaves; the admin deletes
  their row from the workbook and imports. Terminal: `Users: 0 inserted, 0 updated`. The person
  still has a name on the login list and their site. The only way to switch them off is
  `active = 0` on a row that must stay in the sheet, and nothing says so. The same silence for a
  deleted role row, a deleted sheet row, a deleted conversion and a blanked cost. And where the
  import does change something (a cost, a conversion, a membership removed, an item switched off)
  the terminal gives a count but not the name or the old and new value, so the admin cannot check
  the result against what they meant.
- **Repro (ran):** runs 3 and 4 above:
  `DB_PATH=server/db/dev.db npm run import:settings -- ../upgrade/wb4` -> every line zero except
  `Side sheet items: 0 added or switched on, 1 switched off`; `ui/b2-dump.js` shows "Worker One"
  still active with site RA, role `runner` still there, sheet Veggies still on, `cup` still 0.2,
  the blanked cost still stored.
- **ADR:** ADR-097 (plain messages that say what to do next); ADR-047 ("the report shows every
  removal"); ADR-082 ("its report lists each value it left alone").
- **Smallest fix:** in the report, (1) name every change: `Tomato Sentinel: cost 4444.44 -> 9999.99`,
  `Worker Two: removed from FC`, `Veggies: Tomato Sentinel switched off`; (2) one closing section
  "In the app but not in these files - left as they are (to switch a person off, keep the row and
  set active to 0)" listing people, roles, sheets and conversions that the file no longer has.

### U-19 - P3 - Smaller things in the import

- **The tool's own export triggers a warning.** `--export` writes the `super-admin` row into
  Roles.csv; importing that file, unchanged, prints `WARNING other rows skipped or adjusted (1):
  Roles row 2: "super-admin" flags are fixed (it can never be locked out) - row ignored` on every
  run. A non-coder sees WARNING on a clean round trip. Fix: stay silent when the row's flags equal
  the stored ones, or leave the row out of the export.
- **Not everything the import changes is logged.** `activity_log` gets rows (actor
  `import-settings`, with before/after) for side items, their conversions and sheet links. The
  role it added, the three people it added and the site membership it removed left no log row.
  Who was given or lost a site is the access change worth a trace.
- **A skipped row moved another row.** In run 3 the skipped Garlic row shifted Tomato's
  `sort_order` from 1 to 0 on the Veggies sheet (logged as an UPDATE of `side_item_sheets`), so two
  items now share position 0. ADR-078 says a skipped row changes nothing. Fix: number positions
  from the file's rows, skipped or not.
- **Which file:** the first line - `Database: ...\server\db\dev.db (DB_PATH from the environment)`
  - is clear and is ADR-081 as decided. A folder that does not exist and a database that does not
  exist are both refused with a plain line (read in the code, not run).

### B3 - `scripts/restaurant-pc.bat update`: what a non-coder meets (read only - the file was not run)

**How it is started.** There is no shortcut for it. Setup's last screen says: "New version: close
the app window, then run `"%USERPROFILE%\InventoryApp\restaurant-pc.bat" update beta-N`". So the
first thing the person meets is a command prompt and a line to type.

**The walk, in order (line numbers are the file's):**

| # | Step | What the person sees | Where it stops | What is left behind |
|---|---|---|---|---|
| 1 | app installed? (276) | - | `[X] The app is not installed yet. Run restaurant-pc.bat once with no word after it.` | nothing |
| 2 | app still running? (283) | `Inventory Audit App - update` | `[X] The app is running. Close its window first, then run the update again.` | nothing |
| 3 | `.env` points at beta.db? (285) | - | `[X] The settings file .env is missing...` or `[X] .env does not point at the Beta database... fix .env by hand, or ask Naoki.` | nothing |
| 4 | tracked files edited? (288) | - | `[X] Files in the app folder were edited by hand, so the update stopped. Nothing was changed. Ask Naoki.` | nothing |
| 5 | `git fetch --tags` (290) | - | `[X] Could not reach GitHub. Check the internet; nothing was changed.` | nothing |
| 6 | which tag (292-299) | `Available versions:` + the list, `Which tag (for example beta-2):` | `[X] No tag given` / `[X] There is no tag "x". Nothing was changed. Available: ...` | nothing |
| 7 | remember the current commit (301) | `Now: beta-3    Moving to: beta-4` | `[X] Could not read the current version. Nothing was changed. Tell Naoki.` | nothing |
| 8 | backup (307) | `Data backed up to InventoryApp\backups\beta_<date>_<time>.db` | `[X] Backing up the data failed. Is the disk full?` then `[X] The backup failed, so the update stopped. Nothing was changed. Check the disk space, then tell Naoki.` | maybe a cut-short backup file |
| 9 | `git checkout <tag>` (309) | - | `[X] Could not switch to beta-4. Nothing was changed.` | usually nothing |
| 10 | `npm ci` (312) | `Installing dependencies...` | on failure -> rollback (row 12) | **`node_modules` is deleted first by `npm ci`** |
| 11 | self-test (315) | `Self-test - about a minute...` then the two summary lines | on failure -> rollback (row 12) | `last-verify.log` |
| 12 | rollback (323-335) | `[!] beta-4 failed its check - going back to beta-3. The log is ...\last-verify.log - send it to Naoki.` then `Back on beta-3. Nothing in the data was changed.` | `[X] Could not go back to beta-3 by itself. Do NOT start the app. Send a photo of this window to Naoki.` or `[X] Back on beta-3, but reinstalling its parts failed. Do NOT start the app. Check the internet, then send a photo of this window to Naoki.` | see U-20 |
| 13 | done (319) | `Done: this PC is on beta-4. Start the app with the desktop shortcut.` `The database upgrades itself on the first start.` | - | the desktop launcher is still the old copy (U-22) |

Every stop ends in `pause` ("Press any key to continue"), so the message stays on screen. Steps
1-9 are careful: each one stops before anything is changed, and says so. The data is safe in every
path I could trace: the new code never opens `beta.db` during an update (the self-test made no
database file in `server/db` when I ran `npm run verify` in the clone), there is a backup before
the code moves, and B1 shows the database opens cleanly under the new code and under the old code
again. The problems are in what happens to the *app* when a step fails halfway, and in what the
person is told.

### U-20 - P2 - Network down during `npm ci`: the update takes the app's parts away and cannot put them back

- **Where:** `scripts/restaurant-pc.bat:312-313` and the rollback's second `npm ci` at `:332-333`.
- **What happens (read, not run):** `npm ci` removes `node_modules` before it downloads. If the
  internet drops there, step 10 fails and the rollback starts: it prints "beta-4 failed its
  check" (it did not - no check ran; the log it says to send is the previous run's, or does not
  exist), checks the old commit out, and runs `npm ci` again - with the same dead network. Result:
  `[X] Back on beta-3, but reinstalling its parts failed. Do NOT start the app. Check the
  internet, then send a photo of this window to Naoki.` The PC is on the old code with no
  `node_modules`: the app cannot start that night (`Start Inventory App` would print Node's
  "Cannot find module 'express'" and then "The app stopped."). Nothing tells the person the plain
  remedy - when the internet is back, run the update again - and under ADR-097 "Naoki" may not be
  there to send a photo to.
- **Why it need not happen:** `package-lock.json` has not changed since before beta-1
  (`git diff --stat beta-1..HEAD -- package-lock.json` is empty; the app has one dependency). For
  such an update `npm ci` does nothing useful and is the only step that needs the network after
  the fetch.
- **ADR:** ADR-007 ("the restaurant's internet is unreliable"), ADR-097.
- **Smallest fix:** skip both `npm ci` calls when the lock file is the same in the two versions:
  `git diff --quiet %PREV% %NEWTAG% -- package-lock.json` -> if unchanged, go straight to the
  self-test. And reword the two messages: for a failed install, "Could not download the app's
  parts. Check the internet and run the update again - the app will not start until it finishes."

### U-21 - P2 - PC switched off mid-update: nothing remembers that an update was under way

- **Where:** `scripts/restaurant-pc.bat:309-317` (no marker is written) and `:244-265` (`start`
  checks the port, `.env` and the backup - not the state of the code).
- **What happens (read, not run), by where the power goes:**
  - during the backup: a cut-short `beta_<stamp>.db` stays in `backups`, named like a good one and
    counted among the 14 kept. Code untouched.
  - after the checkout, during `npm ci`: the folder is on the new tag with `node_modules` half
    there. Next evening the desktop shortcut backs up, prints `Version: beta-4` and runs the app:
    either it dies with a Node error and "The app stopped.", or - if enough was installed - it runs.
  - during the self-test: the new tag is fully installed and never passed its check. The shortcut
    starts it, and the first start upgrades `beta.db`. Nobody is told the update was not finished.
  - during the checkout itself: a half-switched folder; the next update stops at "Files in the app
    folder were edited by hand ... Ask Naoki", which is not what happened.
- **ADR:** ADR-007 ("a tag is only ever a main Naoki already phone-checked" - the self-test is the
  PC's own half of that promise), ADR-097.
- **Smallest fix:** write `%APPDIR%\update-in-progress.txt` (holding the previous commit) just
  before the checkout, delete it at "Done" and at "Back on ...". `start` and `update` look for it
  first: "The last update did not finish. Run the update again before starting the app." Give the
  backup a temporary name and rename it when the copy has finished.

### U-22 - P2 - After an update the desktop shortcut and the typed command still run the old launcher

- **Where:** `scripts/restaurant-pc.bat:211-212` (setup copies itself to
  `%APPDIR%\restaurant-pc.bat`, and both the desktop file and the printed update command point at
  that copy); the `update` branch never refreshes it.
- **What happens (read, not run):** beta-4's update is carried out by beta-3's copy of the
  launcher, and after it the daily start is still beta-3's. Any fix to the backup, start or update
  logic shipped in beta-4 (the ones in this report, run 4's F4 restore, auto-start at boot) does
  not take effect until someone runs the repo's own `scripts\restaurant-pc.bat` by hand - the
  11-15 decision block says exactly that for beta-2, and lists it under restaurant-pc-ii. Known,
  but beta-4 is the first update a non-coder runs alone, and this is the step they will not know.
- **ADR:** ADR-097; session-status 2026-11-15 ("PR #47's launcher copy ... -> step restaurant-pc-ii").
- **Smallest fix:** make the copy a one-line stub instead of a copy:
  `@call "%USERPROFILE%\InventoryApp\inventory-audit-app-3rdYr\scripts\restaurant-pc.bat" %*`.
  It can never go stale, and a running .bat is never overwritten.

### U-23 - P3 - Launcher wording and small traps

- **"Naoki" is the remedy in ten messages** (lines 193, 256, 326, 366, 382, 389, 393, 397, 401,
  475). ADR-097 plans for the day nobody is at the other end; each needs a first thing the person
  can do alone ("run it again", "check the internet", "free some disk space").
- **A flaky self-test undoes a good update.** session-status (11-15) notes the login tests failed
  once on unchanged code. One such failure rolls beta-4 back with "failed its check". The message
  could say "Run the update once more; if it fails again, keep using this version."
- **Going backwards is not noticed.** `update beta-2` from beta-3 is accepted like any other tag.
  Safe today (B1's rollback test), not once a migration changes or drops something (B1 note 3).
- **"Could not reach GitHub"** is also what a moved tag or a locked `.git` folder prints
  (`git fetch --tags` fails for those too).
- **The port is fixed in the launcher** (`APP_PORT=3000`, line 25) but the app reads `PORT` from
  `.env`: if `.env` is ever changed, "is the app running?" looks at the wrong port and the backup
  can run while the app is using the database.
- **Setup installs Claude Code and graphify on the restaurant PC** (steps 3 and 4). `graphify-out/`
  is tracked (109 files): one `graphify update` there makes the folder "edited by hand" and blocks
  every later update with "Ask Naoki".
- **The daily start says nothing when the app fails to start** beyond Node's own error and "The
  app stopped." (line 267).

## Earlier claims - confirmed or refuted by this run

| Claim | Verdict from the pages | Where |
|---|---|---|
| I-01 / F2 (a second phone puts back an old count) | **Confirmed**, watched on two phones; the page sends the stale row as `touched:false` and the server writes it. Same with a blind second phone and in the Enter view. | U-01 |
| I-02 (commissary overwrite, notes wiped) | **Confirmed**, including: the Notes box never shows the saved note, and the person's own second save erases it. | U-03 |
| F2's side remark (prepped has no touched check) | **Confirmed and worse than stated**: every full-view Save Day stores prepped = 0 for all dishes and blocks the batch sync. | U-04 |
| I-08 / F5 (half-saved sheet, stack trace) | **Confirmed**; on the phone the stack trace becomes `Unexpected token '<' ... is not valid JSON`. The draft marks the unsaved rows, but only after a reload. | U-05, U-09 |
| F3 (the 5-second lock wait does not cover count saves) | **Confirmed** from the page: the save failed in 0.0 s under a held write lock. | U-05 |
| I-07 (negative and odd numbers accepted) | **Confirmed** from the number boxes. | U-08 |
| F7 (pages take "today" from the phone) | **Confirmed in code, refuted as a visible bug**: at 07:59, 08:00 and 00:30 Manila, on a Manila or a Los Angeles phone, every page shows the date ADR-036 wants. What is real: a phone with the wrong date, a tab left open overnight, the Terminal's hidden date, UTC times on screen. | U-15 |
| PERM-03 (what a blind counter can reach) - report not available to me | **Confirmed from the page side**: the landing is clean, but Stock Receipts, Allocations, Sales, History and Kitchen Sales show the counter what the landing hides. | U-10 |
| C-13 (costs readable without see_costs) - report not available to me | **Confirmed from the page side**: cost and budget boxes in Settings for every role and logged out; History prints costs even where the read is guarded. | U-11 |
| F4 (backup is two files; restore) | Premise **confirmed**: after a session every save was in the `-wal`; the `.db` alone held none. | B1 note 2 |
| I-15 (seeded things with no server-start path) | **Confirmed** for the update path: no meal slots after updating a beta-2 database. | B1 note 1 |

## Checked and found clean

- **Setup:** `npm ci`, `npm run verify` (40 files, 748 passed, SUITE GREEN, AUDIT CLEAN).
- **The blind landing itself:** as Test Counter RA and logged out, none of the planted numbers
  (new stock, adjustment, sales, opening) is on screen, in the DOM, or in any answer the landing
  fetched; the month-opening panel is refused with a plain line.
- **Drafts on the landing:** a reload, a failed save, a save with no network and a server that
  comes back all bring the unsaved numbers back, tagged "(unsaved)", and only the rows that were
  really not saved. "Discard" works. (Per phone, not per person - U-06.)
- **A blocked row** (no month opening) keeps its input disabled in the blind list, Review and Enter.
- **Layout at 390x844:** no page scrolls sideways on load for any of the six roles (ADR-077); no
  dead link on any page; no browser pop-up on load; the login page lists the accounts and logs in.
- **Console:** no error on any page for Test Admin and Test Management. (Other roles: U-13.)
- **Dates:** the default date on Landing, Commissary, Shipments, Stock Receipts, Allocations,
  Dashboard and Kitchen Sales, and the Sales month, are right at 07:59 / 08:00 / 00:30 Manila and
  do not depend on the phone's time zone.
- **Migrations beta-2 -> this commit:** integrity ok, no foreign-key violations, all 377 rows
  kept, 79 of 81 reads identical (the other two gained `can_use`), pages load without errors, and
  beta-2's code still reads the upgraded database identically (81 of 81).
- **The import:** a second run of unchanged files changes nothing; existing counts, history,
  recipes, meats and dishes are untouched by any run; a unit change is refused with a clear line;
  role flags and base roles are left to the Roles page and listed (ADR-082); a removed conversion
  is kept (ADR-079); the first line names the database file (ADR-081); it runs safely while the
  app is running.
- **The launcher's update, steps 1-9:** each stops before changing anything and says so; the app
  must be closed; a backup comes before the code moves; the self-test does not touch `beta.db`.
- **Both clones:** `git status` clean at the end; nothing committed, no branch made.

## Did not get to

- **Real phones and Safari.** Everything ran in Chromium with phone size and touch emulated. iOS
  Safari's number keyboard, its date box and its habit of dropping background tabs were not seen.
- **Other roles:** Test Counter FC, Test Head Chef FC, Test Supervisor RA, Test Floater (pages),
  Test No Sites. Only the six asked for were crawled.
- **Deep flows on each page.** The button pass tapped what is visible on load. Not walked: Edit /
  Delete in the lists, the month-opening panel's Recount / Correct / Clear / Copy all, ordering a
  recount from the history panel, the shipment form and presets, Terminal commands, the Roles
  page's switches and assignments (beyond Deactivate), Settings' thirteen tabs row by row.
- **The two-phone test for dish rows** (`portion_actual`) - meat rows only; and the recount case
  (the first counter's stale phone undoing a recount).
- **Kitchen Sales with real data** - the three tokens were empty by instruction, so the page was
  seen only in its "token not set" state.
- **Month and year edges** (30 Nov -> 1 Dec at 07:59 for the Sales month and the month-opening
  panel) and a wrong clock on the server PC itself (only the phone's clock was moved).
- **`restaurant-pc.bat` was read, not run** (by instruction): U-20 to U-23 and the B3 table are
  from the file's text. The setup branch (first install) was read but not reviewed step by step.
- **Updates other than beta-2 -> this commit.** beta-1 -> this commit was not run. The repo has no
  `beta-3` tag at this commit (tags: beta-1, beta-2); this commit was taken as the beta-3 state.
- **Large or old databases through the update** (run 4 measured size; this run used a small one).

## Short design notes (settled - not arguing)

- ADR-047 leaves people who are not in the workbook untouched. Deleting the row is what a
  non-coder will do when someone leaves; U-18 only asks that the report say so.
- The pick-your-name login lists `superadmin` beside everyone else, with no password (ADR-040,
  real passwords before Live). It is also the only way back from U-17.
- ADR-015's "last save wins" is kept in every fix proposed here; U-01 and U-03 are about rows
  nobody saved.

## Where the scripts and evidence are

`~/fable-review-5/ui` (outside both clones): `lib.js`; Part A - `a1-landing.js`,
`a1-commissary.js`, `a2-failures.js`, `a2-midsave.js`, `a2-prepped-zero.js`, `tmp-sync.js`,
`hold-lock.js`, `a3-setup.js`, `a3-crawl.js`, `a3-details.js`, `a3-buttons.js`,
`a3-roles-lockout.js`, `a4-dates.js`; Part B - `b1-drive-old.js`, `b1-snapshot.js`,
`b1-compare.js`, `b1-pages.js`, `b2-dump.js`. Output: `ui/shots/` (screenshots, `a3-report.json`,
`a3-summary.txt`, `a3-buttons.json`, `a4-dates.json`). Update evidence: `~/fable-review-5/upgrade/`
(`before.json`, `after.json`, `rollback.json`, the database copy, workbooks `wb1` `wb3` `wb4`, the
dumps). The beta-2 clone is `~/fable-review-5/old`. Servers on 3010 and 3011 were stopped at the end.
