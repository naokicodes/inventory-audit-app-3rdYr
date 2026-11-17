2cb16eeddc30cf766e07ca5bd58c54a7da2168f0

# Fable review 4-scale - inventory-audit-app (read-only)

Status: COMPLETE. 10 findings (1 P0, 1 P1, 8 P2), then the answer ("what breaks first"), the
decisions D1-D8, what was found clean and what was not covered. Every finding was run, not only read.

Run: 4-scale - what breaks first as the business grows, and when.
Reviewed commit: the hash on line 1 (main, cloned 2026-11-16 into ~/fable-review-4/review).
`npm ci` then `npm run verify`: 40 files, 748 passed, 0 failed, SUITE GREEN, AUDIT CLEAN.

## How the numbers were measured

- Throwaway server: `DB_PATH=server/db/dev.db`, `PORT=3010`, the three Loyverse tokens empty,
  `npm run reseed`, `npm run seed:test`, `npm run dev`. Never beta.db, never .env.
- Load script (outside the repo): `~/fable-review-4/load/load.js <phones> <saves per phone>`.
  Each "phone" is a Test Counter doing exactly what the count page does on Save:
  `POST /api/daily-audit` (every meat row) -> `POST /api/daily-audit/portions` (every dish row) ->
  `GET /api/daily-audit/mixed` (the page reloads). All phones start at the same instant.
  A side probe calls `GET /api/auth/me` every 20 ms to show how long every other page waits.
- History filler (outside the repo): `~/fable-review-4/load/fill.js` writes synthetic days into the
  throwaway database: per restaurant per day, one count per meat, one portion count per prepped
  dish, one sales row per dish, 4 stock receipts, 3 adjustments, 10 activity-log rows.
- The seed has 2 restaurants (11 and 13 meats, 39 and 34 dishes). The real group has 3 plus a
  commissary, and side sheets will add many more items, so real growth is faster than these
  figures, not slower.
- The test machine is a developer PC with a fast disk. The restaurant PC is older. Anything that
  waits on the disk (every saved row is its own disk flush, see F3) will be slower there.

## Findings

### F1 - P2 - The count page gets slower every month until saves fail (no indexes on the daily logs)

- **Where:** `server/db/schema.sql` (tables `sales`, `stock_receipts`, `adjustments`,
  `count_entries`, `recount_orders` have no index on the columns every lookup uses);
  read by `server/engines/auditEngine.js:146-194` (getNewStock, getUsage, getAdjustmentsTotal) and
  `server/engines/blindCount.js:40-55,117-119`. Route: `GET /api/daily-audit/mixed`, and every Save
  (the page reloads the grid after each save).
- **What happens:** to show one count sheet the server reads the whole `sales` table once per
  recipe line (75 times for the two seeded sites), and the whole `stock_receipts` and `adjustments`
  tables once or twice per meat. The time grows with every day of history. The server answers one
  request at a time, so a slow page for one phone is a frozen app for all of them.
- **Measured (2 seeded restaurants, this PC):**

  | History in the database | One phone: page load | 30 phones saving at once: tap -> reloaded (middle / worst) | Saves per second | Failed requests |
  |---|---|---|---|---|
  | fresh | 18 ms | 0.8 s / 1.1 s | 35-38 | 0 |
  | 30 days | 19 ms | 0.8 s / 1.1 s | 38 | 0 |
  | 1 year (27k sales rows) | 51 ms | 1.8 s / 2.1 s | 17 | 0 |
  | 3 years (80k sales rows) | 216 ms | 6.7 s / 7.2 s | 4.5 | 0 |
  | 5 years (133k sales rows) | 358 ms | 7.8 s / 17.3 s | 3 | 18 of 270 (ECONNRESET) |

  At 5 years the other pages wait up to 9.7 s (the probe), and 16 of 90 count POSTs fail outright:
  the server is busy so long that Node closes idle connections under the phones. On a phone that
  is "Error saving".
- **When for the real business:** the cost is rows in `sales`, not calendar time. The synthetic
  data has 73 sales rows a day. Three restaurants with one row per dish per day is roughly 2-3x
  that; a Loyverse/SPOS port that stores one row per receipt line (schema.sql:153-158 allows it) is
  10x or more. So the "1 year" line above is reached in about 4-6 months after the real sales port,
  and the "3 years" line (a 7 s save at closing) inside the second year - sooner with a second
  branch. This is the first thing that breaks.
- **Repro:** `node fill.js server/db/dev.db 1825 0` then `node load.js 30 3` (both in
  `~/fable-review-4/load/`). `node profile.js <repo>` prints where the time goes: 537 of ~620 ms is
  `SELECT SUM(quantity) FROM sales WHERE restaurant_id = ? AND dish_id = ? AND business_date = ?`,
  and `EXPLAIN QUERY PLAN` says `SCAN sales`, `SCAN stock_receipts`, `SCAN adjustments`,
  `SCAN count_entries`, `SCAN recount_orders`.
- **ADR:** none broken. It bears on ADR-097 (nobody will be there to notice the slow creep) and
  ADR-055 (SPOS as a second sales source multiplies `sales` rows).
- **Smallest fix (proved on the throwaway database):** five lines at the end of `schema.sql`
  (it runs at every start, so the restaurant PC gets them at the next update, no migration):

  ```sql
  CREATE INDEX IF NOT EXISTS idx_sales_lookup ON sales (restaurant_id, dish_id, business_date);
  CREATE INDEX IF NOT EXISTS idx_stock_receipts_lookup ON stock_receipts (restaurant_id, meat_id, business_date);
  CREATE INDEX IF NOT EXISTS idx_adjustments_lookup ON adjustments (restaurant_id, meat_id, business_date);
  CREATE INDEX IF NOT EXISTS idx_count_entries_lookup ON count_entries (restaurant_id, business_date, kind, item_id);
  CREATE INDEX IF NOT EXISTS idx_recount_orders_lookup ON recount_orders (restaurant_id, business_date);
  ```

  With them, on the same 5-year database: page load 358 ms -> 8 ms; 30 phones 0.8 s per save,
  38 saves a second, 0 failures; 100 phones at once 2.6 s per save, 0 failures. Building the five
  indexes on 5 years of data took 0.2 s and added 3 MB to a 49 MB file.

### F2 - P1 - A second phone on the same sheet silently puts back an old count it never touched

- **Where:** `server/engines/blindCount.js:109-112` (saveCount) with `public/daily-audit.html:699-704`
  (the page posts every row, with the value it loaded). Routes: `POST /api/daily-audit`,
  `POST /api/daily-audit/portions` (the same for `portion_actual`, and for `prepped` at
  `server/routes/dailyAudit.js:306-313`, which has no touched check at all).
- **What happens:** phone B opens a sheet. Counter A then corrects an item. B types a different
  item and taps Save. B's page still holds the old number for A's item and posts it, marked
  `touched: false`. The server sees "different from what is stored", writes it, and credits B with
  an edit B never made. A's correction is gone from the sheet (it survives only in the history).
  The more phones share a sheet, the more often this happens; with one phone per sheet it never does.
- **Repro (run against the throwaway server, restaurant 1, date 2026-11-20):**
  1. As Test Counter RA: `POST /api/daily-audit` rows `meat 1 = 5 (touched)`, `meat 2 = 8 (touched)`.
  2. As Test Counter RA: rows `meat 1 = 7 (touched)`, `meat 2 = 8 (untouched)`.
  3. As Test Floater: rows `meat 1 = 5 (touched: false)`, `meat 2 = 9 (touched)`.
  Result: `ending_actual` meat 1 = **5**, created_by Test Floater; `count_entries` has
  `meat 1: 5 COUNT (Counter RA), 7 EDIT (Counter RA), 5 EDIT (Test Floater)`.
- **ADR:** ADR-015 ("Two devices: last save wins, both are kept"). That line is about two people
  saving the same item. Here the second person did not save that item, so it is a bug inside the
  settled rule, not an argument with it.
- **Smallest fix:** in `saveCount`, an untouched row never replaces a stored value:
  add `if (!touched && current) return null;` above line 112. The page already marks
  every typed or draft-restored row as touched; tests that post a changed value without
  `touched: true` need the flag. Same guard for `prepped` (skip a row the page did
  not mark touched). One test: the three requests above must leave meat 1 at 7.

### F3 - P2 - The 5-second lock wait does not cover count saves, and while it does wait the whole app is frozen

- **Where:** `server/db/activityLog.js:16` (`withTransaction` runs a plain `BEGIN`);
  `server/db/connection.js:27` (busy_timeout 5000). Every route that writes through
  `withTransaction` after reading: counts and portions (blindCount.js:114-132), stock receipts,
  yield, shipments, adjustments, roles.
- **What happens:**
  1. SQLite only waits for a lock when a transaction *starts* by writing. `withTransaction` starts
     with `BEGIN`, reads first, then writes - so when another process holds the write lock the save
     fails at once, not after 5 seconds. Step busy-timeout's promise ("waits up to 5s instead of
     failing at once") is not kept for the saves that matter most.
  2. The phone gets Express's default error page: HTTP 500, HTML, with a stack trace and the PC's
     folder paths. The count page then shows "Error saving: Unexpected token '<'..." - not a plain
     message (ADR-097).
  3. Where the wait does work (a plain write outside the helper), it is a synchronous wait: no
     other request is answered until it ends.
- **Repro:** `node ~/fable-review-4/load/hold-lock.js server/db/dev.db 8` (a second process holding
  the write lock for 8 s), then `POST /api/daily-audit` with one touched row ->
  `HTTP 500 in 0.002 s`, body `Error: database is locked ... at saveCount`. With the lock held 3 s
  and `PATCH /api/daily-audit/opening-stock` (a plain write): 200 after 2.0 s, and a read-only
  `GET /api/auth/me` from another phone sent during the wait took 1.7 s instead of 1 ms.
- **When it matters:** today only one process writes (the settings import holds its lock for
  milliseconds), so this is quiet. It starts to bite the day anything else writes while the app
  runs: a backup tool, a second app process, an SPOS-side job, someone opening the file in a
  database viewer.
- **ADR:** the busy-timeout step (2026-11-14 block, ADR-060 to ADR-070 "Also"); ADR-097 (plain
  messages).
- **Smallest fix:** `db.exec('BEGIN IMMEDIATE')` in `withTransaction` (one word; then the 5 s wait
  applies). One error handler at the end of `server/index.js` that answers
  `{ error: 'The app is busy. Wait a moment and save again.' }` as JSON with no stack. And keep the
  rule "one process writes": backups must read, never lock (see D1).

### F4 - P0 - The backup cannot be restored safely by a non-coder, and it lives on the same disk

- **Where:** `scripts/restaurant-pc.bat:419-438` (`:backup`), `:244-269` (`start`), and there is no
  `restore` word at all. The app's stop is "close the window" (line 263), which kills Node.
- **What happens:**
  1. *The backup is two files that only work as a pair.* The database runs in WAL mode and the app
     is never closed cleanly, so the newest saves sit in `beta.db-wal`, not in `beta.db`. The
     launcher copies both (`beta_<stamp>.db` and `beta_<stamp>.db-wal`). Nothing tells the admin
     that, and the natural restore - copy the `.db` back over `server\db\beta.db` - gives one of
     two bad results:
     - **Lost saves** if the old `-wal` was removed: everything not yet folded into the main file
       is gone, silently.
     - **A corrupt database** if the newer `beta.db-wal` is still lying in `server\db`: SQLite
       replays the wrong WAL onto the restored file.
  2. *Backups are on the same disk* (`%USERPROFILE%\InventoryApp\backups`). One old PC with one
     disk: a dead disk, theft, or ransomware takes the database and all 14 copies together. ADR-007's
     "private copy after each session" is a person's habit, and ADR-097 says that person may be gone.
  3. *A backup is made only at Start* (and before an update). A PC that is left running - sleep is
     switched off at line 499, and auto-start at boot is planned - makes no backup for as long as
     it stays up. And "keep 14" counts starts, not days: a bad day with 14 restarts pushes out every
     good copy.
  4. The `-wal` file never shrinks (21 MB on the test database after one large write), so every
     backup carries it.
- **Repro (all on the throwaway files; the launcher's two `copy` lines done by hand):**
  1. Saved 11 counts for 2026-11-22, then killed the server (`taskkill /F`, the same as closing its
     window). Copied `dev.db` and `dev.db-wal` as the launcher does.
  2. Opened the copied `.db` alone: `counts for nov 22 = 0`, newest count date 2026-11-16 - the
     saves of 11-20 and 11-22 were all missing. The same `.db` with its `-wal` beside it: 11.
  3. Restarted, saved more, killed again. Put the older backup `.db` in a folder beside the newer
     leftover `-wal` (the "go back to yesterday" restore): `PRAGMA integrity_check` returned
     `btreeInitPage() returns error code 11` on 20 pages and `row ... missing from index`.
- **ADR:** ADR-097 ("installing, updating and backups run from the launcher with plain-language
  messages" - restoring is the half of a backup that is missing); ADR-007 (backups); ADR-068
  ("kept in the daily backup").
- **Smallest fix (the backup half proved on the throwaway database):**
  - Make each backup ONE self-contained file: `VACUUM INTO 'backups\beta_<stamp>.db'` run by a
    three-line Node script from the launcher. Measured: 0.44 s for a 57 MB (5-year) database,
    taken from a second process **while 30 phones were saving**, 0 failed saves, backup
    `integrity_check: ok` and it contained the newest counts. So it can also run on a timer while
    the app is up, not only at Start.
  - Add `restaurant-pc.bat restore`: list the backups, refuse while the app runs, move the current
    `beta.db`, `beta.db-wal` and `beta.db-shm` aside (never delete), copy the chosen file in.
  - Keep by age (for example every backup from the last 14 days plus one per month), not "the
    newest 14".
  - Off the machine: see decision D1.

### F5 - P2 - Every saved row is its own disk flush, and one bad row leaves the sheet half saved

- **Where:** `server/routes/dailyAudit.js:184-198` and `:303-348` (a loop of single-row
  transactions, no transaction around the request); `server/db/connection.js:26-28`
  (WAL with the default `synchronous = FULL`: one disk flush per commit).
- **What happens:**
  1. Saving a sheet of N rows makes N commits, each one a disk flush, and the server answers
     nobody else while it waits for the disk. The first save of the seeded Restaurant A sheet is 33
     commits (11 meats + 22 portion rows). On this PC a commit is 0.6 ms, so it does not show. On a
     spinning disk a flush is typically 10-30 ms: 33 rows = 0.3-1 s of frozen server per save, and
     30 phones saving at closing = 10-30 s for the last one. Side sheets (veggies, pantry, bar) will
     have more rows than the meat landing, so this grows with ADR-069.
  2. If one row fails, the rows before it are already saved and the rows after it are not, and the
     phone gets the HTML error page from F3.
  3. The same route accepts any number: `-5` and `1e308` are stored as counts (an opening already
     refuses a negative, `dailyAudit.js:429`; an ending does not).
- **Measured:** `node ~/fable-review-4/load/fsync.js scratch.db`: 300 single-row commits =
  0.60 ms each; the same 300 rows in one transaction = 0.9 ms in total.
  **Run that script once on the restaurant PC**: its "ms each" times the rows on the longest sheet
  is how long that PC freezes per save.
- **Repro:** `POST /api/daily-audit` for restaurant 1, 2026-11-24, rows
  `meat 1 = "4"`, `meat 2 = "1,5"`, `meat 3 = "6"` -> HTTP 500
  `NOT NULL constraint failed: ending_actual.quantity`; the table has meat 1 only.
  Rows `meat 4 = "-5"`, `meat 5 = "1e308"` -> `{"ok":true,"saved":2}`, both stored.
- **ADR:** none broken (step blind-count's "failure - a failed save writes no history row" holds
  per row). ADR-097: a half-saved sheet with a stack trace is not a plain message.
- **Smallest fix:** wrap each of the two POST loops in one `withTransaction` (make the helper
  pass through when a transaction is already open, `db.isTransaction`), so a save is one flush and
  all-or-nothing; reject a row whose number is not finite or is below zero with a 400 naming the
  item, before writing anything.

### F6 - P2 - Stock Receipts and Allocations download their whole history every time they open

- **Where:** `server/routes/stockReceipts.js:66-104`, `server/routes/allocations.js:37-67`
  (no LIMIT; the date filter is optional), `public/stock-receipts.html:216-227` and
  `public/allocations.html:190-198` (the filter date starts empty). Also unbounded:
  `GET /api/commissary/yield-log`, `/api/commissary/adjustments`. Only `/api/history` has a limit.
- **What happens:** the page asks for every receipt (or every adjustment) ever saved and draws one
  table row for each. It works for months, then the page takes seconds, then a phone gives up.
- **Measured (5 synthetic years, 2 restaurants, 4 receipts and 3 adjustments a day each):**
  `GET /api/stock-receipts` = 14,600 rows, **4.65 MB**; `GET /api/allocations` = 10,950 rows,
  **4.29 MB**. About 320 bytes a row. The server builds it in under 0.1 s; the cost is the
  download (on Tailscale over mobile data) and the phone drawing 14,600 rows.
- **When:** once arrivals for veggies and pantry go through receipts (A9), 50 rows a day is
  realistic: 5,000 rows (1.6 MB, a slow phone) in about 3 months, 18,000 rows in a year.
- **Repro:** `curl -s -o NUL -w "%{size_download}" http://localhost:3010/api/stock-receipts` after
  `node fill.js server/db/dev.db 1825 0`.
- **ADR:** none.
- **Smallest fix:** start both pages with the filter date set to today's business date, and in the
  two routes add `LIMIT 500` when no `business_date` is given (the page already says how many rows
  it shows).

### F1 addendum - skipped days multiply the same cost

Measured on the un-indexed 5-year copy, engine called directly (`computeMixedDailyAudit`,
restaurant 1): a sheet counted yesterday 0.40 s; not counted for 9 days 1.97 s; not counted for 30
days (opening on the 1st, page opened on the 31st) **5.0 s** for one page load, during which no
other phone is answered. With the five indexes the 30-day case is 0.03 s through the live route.

### F7 - P2 - "Today" on seven pages comes from the phone's clock and matches the 8am rule only by coincidence

- **Where:** `public/daily-audit.html:102`, `allocations.html:95`, `commissary.html:167-168`,
  `commissary-shipments.html:113`, `dashboard.html:84`, `stock-receipts.html:122`,
  `terminal.html:784`; also `server/routes/settings.js:306,320,329` (a recipe's start date).
  All use `new Date().toISOString().slice(0, 10)`. None asks `server/businessDay.js`.
  `kitchen-sales.html:209-211` is right, but by keeping its own second copy of the 8am rule.
- **What happens:** that expression is the UTC calendar date. Manila is UTC+8 and the business
  day turns at 8am, so the two are equal today - by arithmetic, not by design. It breaks in three
  ways as the business grows: (1) a site whose day turns at another hour (ADR-036's own reopen
  case: breakfast service, 24 hours) - the pages would still turn at 8am; (2) a branch in another
  time zone; (3) a phone with the wrong date or clock files tonight's counts under another day,
  and nothing on the server notices (a save for any date is accepted).
- **Repro:** `node -e` with `server/businessDay.js`: at 23:30, 07:59, 08:00 and 10:00 Manila the
  server rule and the page expression agree (2026-11-16, -16, -17, -17). With a 5am turn, at 05:30
  and 07:30 Manila the rule says 2026-11-17 and the page expression says 2026-11-16.
  Server side is clean: the full suite passes with `TZ=UTC` and with `TZ=America/Los_Angeles`
  (748 passed, 0 failed each), so a hosted server in another time zone computes the same dates.
- **ADR:** ADR-036 ("One helper, server/businessDay.js").
- **Smallest fix:** add `business_date: businessDate(new Date())` to the answer of
  `GET /api/auth/me` (every page already calls it or can), and have the pages use it for
  their default date (Kitchen Sales too, dropping its copy). Then the rule lives in one place and a per-site hour later is one change.

### F8 - P2 - Kitchen Sales asks Loyverse for a whole week to show one past day, every time, with no memory

- **Where:** `server/engines/loyversePreview.js:31` (`LOOKBACK_DAYS = 7`), `:46-51`
  (`receiptWindow`), `:103-124` (`fetchPaged`); route `GET /api/loyverse/preview`. Nothing is
  cached or stored.
- **What happens:** each view of a date downloads every receipt created from that morning to
  seven days later, from every account in the group, and throws away all but one day. Each viewer
  and each refresh repeats it. When the internet is down the page has nothing to show for any
  date, including days already seen. Steps landing-sales and bar-check will put the same read
  behind counting pages, so it stops being a page for two or three people.
- **Measured (the real handler with a fake Loyverse, 500 receipts a day per account,
  `node ~/fable-review-4/load/loyverse-calls.js <repo> 500`):** today = 4 API calls, 542 receipts.
  A day last week = **28 API calls and 7,000 receipts downloaded** for Silingan + Likod, 16 calls
  and 3,500 receipts for FC.
- **When:** Loyverse limits how many calls an account may make in a few minutes (from memory about
  300 per 5 minutes per account; I could not confirm the figure in this run - check Loyverse's
  developer page). At 14 calls per account per past-day view, about 20 such views inside the
  window from all phones together would reach a 300 limit; then the page shows the account as
  failed.
- **ADR:** ADR-066, ADR-094 (Kitchen Sales reads); the real Loyverse port (nightly sync) is parked
  in scope.md - this finding is the cost of leaving it parked once more pages read sales.
- **Smallest fix:** keep each finished business day's answer in memory (a Map keyed by group and
  date; a past day does not change after its 7-day window), and keep today's for 60 seconds. The
  durable fix is the parked port: store quantities in `sales` once a night and read from there
  (needs the F1 index first).

### F9 - P2 - A second branch's POS cannot be added without editing code

- **Where:** `server/engines/loyversePreview.js:27-28` (`DISH_GROUP`, `POS_GROUPS` fixed),
  `server/routes/loyverse.js:21-29`, `public/kitchen-sales.html:169-189,358-364` (two fixed
  buttons), `server/db/loyverse-name-map.json` (the accounts and their token names, a tracked
  file), `scripts/restaurant-pc.bat:146-160` (asks for exactly three tokens).
- **What happens:** restaurants, commissaries, sheets, roles and people are data (good - a second
  branch with its own commissary fits the tables as they are). The POS side is not: a new
  branch's Loyverse account needs a code change in three files, an edit to a tracked JSON file and
  a hand-edited `.env` line. Editing the tracked file on the restaurant PC also makes the next
  `update` stop ("Files in the app folder were edited by hand").
- **Repro:** `GET /api/loyverse/preview?pos=branch2&date=2026-11-16` ->
  `400 {"error":"pos must be one of: silingan-likod, fc"}`.
- **ADR:** ADR-097 ("what a restaurant changes is data an admin edits"); ADR-085 (new restaurants
  follow Silingan). The planned name-map-settings step moves the name map into Settings; it does
  not yet name the accounts, the groups or the tokens.
- **Smallest fix:** widen name-map-settings by one table: POS accounts (label, group, site,
  token) edited in Settings by an admin, with `POS_GROUPS` and the page's switch read from it.
  Tokens then live in the database, so they are in the backup (and must stay out of any export).

### F10 - P2 - Started from another folder, the app opens a different database - or quietly makes an empty one

- **Where:** `server/db/dbPath.js:15` (`path.resolve(envDbPath)` - a relative `DB_PATH` is
  resolved against the working directory), `server/db/connection.js:23` (opens or creates).
  `.env` itself is found by the code's own location (`server/index.js:15`), so the two disagree.
- **What happens:** `.env` says `DB_PATH=server/db/beta.db`. That only means the real database
  when the process is started inside the app folder, which the launcher's `cd` does today. Any
  other starter - a scheduled task for the planned auto-start at boot (Windows' default start
  folder is System32), a Windows service, a hosting platform's process manager - gets either a
  crash with a stack trace, or, if that folder happens to contain `server\db`, a brand-new empty
  database with the app running normally on top of it. Staff would see an empty app and save
  tonight's counts into the wrong file.
- **Repro (second throwaway instance on port 3011, stopped again):**
  from `~/fable-review-4`: `DB_PATH=server/db/dev.db node review/server/index.js` ->
  `Error: unable to open database file`. From a folder that contains an empty `server/db`:
  the same command prints "Inventory Audit App running" and creates a new 4 KB `dev.db` there.
- **ADR:** ADR-081 (the import "refuses one that does not exist rather than creating it" - the
  server itself does not); ADR-097; step restaurant-pc-ii (auto-start at boot).
- **Smallest fix:** in `resolveDbPath`, resolve a relative path against the repo root
  (`path.resolve(__dirname, '..', '..', envDbPath)`), and in `server/index.js` refuse to start
  with a plain message when `DB_PATH` is set and the file is missing (the seed is what creates it).


## The answer: what breaks first, and at what size

Phones are not the limit. Time and rows are.

| Order | What breaks | At what size | Fix size |
|---|---|---|---|
| 1 | Count page and every save slow down, then saves fail (F1) | About 25,000 rows in `sales`: saves at closing take ~2 s with 30 phones. About 80,000 rows: ~7 s. About 130,000 rows: failed saves. Calendar: 4-6 months after the real sales port for the first line, inside year 2 for the second; sooner with a branch 2 or one row per receipt line | 5 lines of SQL |
| 2 | The first restore, or the PC's disk dying (F4) | Any size. It is the first bad day, not a load level | A one-file backup, a `restore` word, a copy off the PC |
| 3 | A second phone on a sheet puts back an old count (F2) | From 2 phones on one sheet; more often with each phone added | 1 line + 1 test |
| 4 | Each save freezes the server for (rows x one disk flush) (F5) | Unknown until measured on the restaurant PC; on a spinning disk a 33-row sheet is 0.3-1 s per save, 30 phones 10-30 s. Side sheets are longer | One transaction per save |
| 5 | Stock Receipts / Allocations pages too big for a phone (F6) | About 5,000 rows (1.6 MB): ~3 months at 50 receipts a day | A default date + a LIMIT |
| 6 | Loyverse reads (F8) | When landing-sales and bar-check put sales behind counting pages: 14 calls per account per past-day view | A small cache, then the parked port |
| 7 | Branch 2 (F9, F10, D4) | The day it opens: its POS needs code, and its phones cannot reach branch 1's PC | Decisions below |

What does **not** break at this size (measured, after the F1 indexes, 5 years of data):

| Phones saving in the same second | Tap -> sheet reloaded | Failed requests |
|---|---|---|
| 10 | 0.3 s | 0 |
| 30 | 0.8 s | 0 |
| 100 | 2.6 s | 0 |
| 300 | 7.6 s | 0 |

One Node process and one SQLite file handle about 38 whole saves a second on this PC (a whole save
= two POSTs and a reload). Tens of phones bunched at closing is a few saves a second. Memory stayed
at 123 MB. The database grows about 11 MB a year for two meat sheets (57 MB after 5 synthetic
years); with side sheets, call it 100 MB a year. Neither SQLite nor the single process needs
replacing for 3 restaurants, or for 6. Hybrid A holds.

## What to decide now so it stays cheap later

**D1 - Backups off the machine.** Decide whose account and which folder. Cheapest that needs no
coder: the launcher writes its one-file backup (F4) into a folder that a sync program already
mirrors (the owner's Google Drive or OneDrive on that PC), set by one line in `.env`. Three rules
to write down now: (1) the account belongs to the business, not to a student - the file holds staff
names and costs; (2) only finished backup files go in the synced folder, never the live `beta.db`
(a sync program copying a database mid-write corrupts the copy); (3) `.env` is in no backup today,
and it holds the Loyverse tokens - back it up beside the database or move the tokens into the
database (F9). Add a timer backup (for example 3pm and after closing), since F4 showed a backup can
be taken while phones are saving.

**D2 - The single PC.** Load is not the risk; the PC dying is. Decide the "PC died" plan and try it
once before Live: any Windows PC + `setup-dev-environment.bat` + `restaurant-pc.bat` + `restore` of
the newest off-machine backup. Target: running again within an hour, by an admin, from a printed
page in docs/official/. It needs F4's restore, D1, and the tokens (see D1). Also decide: a small
UPS (a power cut mid-closing stops every phone; the data itself is safe - every confirmed save is
flushed to disk); Windows Update active hours so it never restarts during service (auto-start at
boot is already planned); and whether paper stays the fallback at Live (it works today because a
count for a past date is accepted the next morning). One thing nobody will see without a coder:
slow creep and failed backups. A single "Health" line for admins (version, last backup and where,
database size, free disk) is the cheapest watchman.

**D3 - Auth, before any address outside the restaurant.** Measured on the throwaway server, logged
out: `GET /api/auth/users` lists every active person; `POST /api/auth/login {"user_id":1}` (or just
sending `Cookie: user_id=1`) is the bootstrap super-admin; history and the stock rollup can be
read; a count can be written. That is what ADR-040 and stub-login say for Beta on the cashier Wi-Fi
and Tailscale, and write-permission and sign-the-cookie are queued. Decide now: (1) the gate, in
one sentence - no public address until every request needs a real login; (2) PIN or password (it
shapes the login-tonight page; a 4-6 digit PIN with a lockout is what counters will accept on a
shared phone); (3) the login cookie gets `Secure` and an expiry the day HTTPS exists; (4) SPOS will
call by API as a machine, not a person: plan one API key setting for it rather than reusing a
person's login; (5) where the signing secret lives (`.env`, and so in the backup - D1).

**D4 - Hosting.** The app needs one long-lived process and one disk that survives restarts (the
database file and, later, the photos). So: a small server with a real disk, or a platform with a
persistent volume. Not a platform with a throwaway filesystem (the database would be wiped at each
deploy), and never two copies of the app behind a balancer (one SQLite file, one writer process -
F3). Vercel is already ruled out for the same reason. The real decision is *when*: the restaurant
PC works when the internet is down (ADR-007's reason); a hosted server works when the PC is down
but makes closing counts depend on the restaurant's internet. Suggested rule: stay on the PC for
one branch; **branch 2 is the hosting trigger**, because its phones cannot reach branch 1's PC
(Tailscale on every counter's phone is not workable) and two PCs mean two databases with no shared
view. One server, one database, sites as rows - the tables already allow it. Hosting therefore
waits on D3. F10 must be fixed before either auto-start or hosting.

**D5 - The business day per branch.** No decision needed yet; one habit and one fix. The server
rule is in one place and is correct under any server clock (suite green under UTC and US time).
Fix F7 so pages take "today" from the server; from then on a per-site hour is one column on the
site and one argument to `businessDate` (6 server call sites today). Until then, no new
`new Date().toISOString()` defaults on pages.

**D6 - Photo storage (ADR-068).** Decide four things before the first upload is built:
(1) layout: `photos/YYYY/MM/<id>.jpg` beside the database, and store the *relative* path in the
`photo_path` columns that already exist, so a new PC or a hosted server needs no rewrite;
(2) photos are mirrored once, not copied into each dated backup - at 20-40 photos a day of
200-400 KB that is 1.5-6 GB a year, and 14 dated copies of it would fill an old PC's disk inside
two years (a full disk stops every save);
(3) how long they are kept ("kept for now" needs a number - 13 months covers a year-end check), and
a free-space check at Start that warns in plain words below a few GB;
(4) upload as a file, not inside JSON: `express.json()` is at its default 100 KB limit, which a
shrunk photo exceeds.

**D7 - Updates with no coder.** Today an update is a typed command that needs GitHub and the npm
registry, from a repo under a personal account with the school year in its name. Decide: (1) who
owns the repo after the project (move it to an account the business controls; the URL is hardcoded
at `restaurant-pc.bat:23`); (2) a desktop "Update" shortcut that lists the tags and asks, no typing;
(3) skip `npm ci` when `package-lock.json` did not change (one dependency - then an update needs
GitHub only); (4) name the pre-update backup after the version it came from, so "go back" is
`restore` + the old tag - after the first start on a new version the database has been upgraded
and old code on it is untested; (5) accept in writing that with no coder there are no updates, so
the installed Node and Windows simply age: the launcher should never update Node by itself.

**D8 - The Live database's name.** The launcher insists on `beta.db` (`:checkenv`, line 466), and
the backup names say `beta_`. Decide now whether Live keeps that name forever (zero work, slightly
odd) or gets a promote step; changing it later touches the launcher, `.env` and every backup rule.

## Short notes (no argument with settled decisions)

- Everything runs synchronously on one thread. At this size that is the simple, right choice; the
  findings above are about what each request does, not about the model.
- `db.prepare()` is called inside the per-meat loops (the SQL is compiled again each call). It is
  small next to F1 and not worth a change by itself.
- ADR-040's reopen line ("reachable beyond the restaurant's Wi-Fi") and ADR-070 (Tailscale) sit
  close together. Tailscale admits only invited devices, so I read them as consistent; worth one
  sentence in ADR-040 saying so.

## Checked and found clean

- `npm run verify` on the reviewed commit: 748 passed, SUITE GREEN, AUDIT CLEAN. The same suite
  under `TZ=UTC` and `TZ=America/Los_Angeles`: 748 passed each - server dates do not depend on the
  server's clock zone.
- The self-test leaves no `inventory.db` or `beta.db` behind in the clone, so running it on the
  restaurant PC during an update does not touch the app's data.
- No request crashed the server in any run (about 2,000 whole saves, bursts up to 300 phones, malformed
  rows, a locked database). The one async route has its own try/catch.
- After each of two hard kills the database reopened with every confirmed save present (the marker
  counts for 11-22 and 11-23), and a fresh backup gave `integrity_check: ok`. WAL with full
  flushing does its job; the danger is only in how files are copied back (F4).
- A month with no opening, and far-future dates: 5-6 ms. The backward walk for uncounted days is
  bounded by the month opening.
- `/api/history` is capped (200, at most 500 rows): 0.09 s with 36,500 log rows. The stock rollup:
  6 ms at 5 years.
- Start-up with a 57 MB, 5-year database: answering within 2 seconds, migrations included.
- The settings import holds the write lock for one short transaction.
- Sites, commissaries, sheets, roles and people are rows; nothing in those tables assumes three
  restaurants (read, not exercised with a third).
- The launcher refuses to back up or update while the app is running, backs up before an update,
  and goes back to the previous commit when the self-test fails (read, not run).
- The clone is unchanged (`git status` empty); nothing was committed, pushed or edited.

## Did not get to

- The restaurant PC's real disk speed - the number F5 depends on. Run `fsync.js` there.
- The real Loyverse API: tokens were empty by instruction, so its true limits and receipt counts
  are not measured; the 300-per-5-minutes figure is from memory and unconfirmed.
- Running `restaurant-pc.bat` itself (it writes to `%USERPROFILE%\InventoryApp`, the firewall and
  power settings). Its backup lines were reproduced by hand on the throwaway files.
- The commissary pages under load. `commissary_stock_receipts`, `commissary_shipments`,
  `commissary_adjustments` and the yield log have no indexes either (read, not measured).
- Whether F2 also happens on the commissary count page and the month-opening panel.
- Side sheets, the roster, the staff-meal log, the buyer list and photo upload: not built yet.
  They should be checked against F2, F5 and F6 as they land.
- Real phones: drawing time for long tables, drafts in the phone's storage across many sheets,
  Wi-Fi with tens of devices, the Tailscale path, HTTPS.
- A full disk and a power cut on the real hardware; a soak of hours (only minutes here).
- SPOS: no code in the repo yet. A full security pass: out of this run's scope beyond D3's facts.
- The test machine has a fast disk and the seed has 2 restaurants, not 3 plus side sheets: every
  timing here is a best case for the real PC.

## Where the scripts are

`~/fable-review-4/load/` (outside the repo): `load.js` (phones), `fill.js` (synthetic history),
`profile.js` (query times and plans), `add-indexes.js` (the F1 fix on the throwaway database),
`hold-lock.js` (F3), `vacuum-into.js` (F4's one-file backup), `fsync.js` (F5),
`loyverse-calls.js` (F8). The throwaway database is `~/fable-review-4/review/server/db/dev.db`; it
now holds 5 synthetic years and the five indexes. The throwaway server on port 3010 was stopped at
the end of the run.
