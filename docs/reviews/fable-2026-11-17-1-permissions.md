2cb16eeddc30cf766e07ca5bd58c54a7da2168f0

# Review run 1-permissions (fable, 2026-11-17)

Read-only review of `main` at the hash above. Nothing was committed, branched or pushed; the only
file written is this report. Every finding below was run against a throwaway server
(`DB_PATH=server/db/dev.db`, `PORT=3010`, the three Loyverse tokens empty, `npm run reseed` then
`npm run seed:test`), never `beta.db`, `inventory.db` or `.env`.

- `npm ci`: installed. It prints "3 vulnerabilities (1 moderate, 1 high, 1 critical)" for the
  dependency tree (see N-1, after the findings).
- Second session, 2026-11-17: the same clone and the same `dev.db`, not reseeded, the same server
  command. PERM-15 also used a second throwaway server on port 3011 (same `dev.db`) with the network
  call replaced by a stub and three made-up tokens; no request left the machine and no real token
  was read. `npm run verify` was not run again (no code changed).
- `npm run verify`: **SUITE GREEN** (40 files, 748 passed, 0 failed) and **AUDIT CLEAN**.

Accounts used (from `npm run seed:test`; ids on the throwaway database): 1 the bootstrap
super-admin, 2 Test Admin, 3 Test Management, 4 Test Head Chef RA, 5 Test Head Chef FC, 6 Test
Counter RA, 7 Test Counter FC, 8 Test Commi, 9 Test Floater, 10 Test No Sites, 11 Test Supervisor
RA. Sites: restaurants RA (id 1) and FC (id 2), commissary COM-A (id 1).

In the repros, `u=6` means the request carried `Cookie: user_id=6`; `u=-` means no cookie (logged
out). Requests go to `http://localhost:3010`.

Severity: P0 = data loss or a security hole; P1 = a wrong number or wrong access; P2 = fragile or
confusing; P3 = polish.

## Findings

(Written as each one was confirmed. The summary table is at the end.)

### PERM-01 - P1 - The allocations list with no restaurant shows every site's rows

- **Where:** `GET /api/allocations` - `server/routes/allocations.js:37-70`; the guard at
  `server/middleware/requireSiteAccess.js:128` only checks a `restaurant_id` that is present.
- **What happens:** with `restaurant_id` in the query the guard refuses another site (403). Leave
  it out (or filter by `meat_id` or `business_date` instead) and the route returns every
  restaurant's adjustments - quantities, types, notes, `created_by` - to any logged-in person,
  including an account with no sites at all. The other "list with no site id" reads
  (`/stock-receipts`, `/commissary/daily-audit`, `/commissary/yield-log`,
  `/commissary/adjustments`) narrow to the person's sites through `listSiteCodes`; this one was
  never given the same narrowing.
- **Repro** (admin first creates one FC row; Test Counter RA is a member of RA only):
  ```
  POST /api/allocations  u=2  {"restaurant_id":2,"meat_id":12,"business_date":"2026-11-16","adjustment_type_id":1,"quantity":3,"notes":"FC-only row"}  -> 200 {"ok":true,"id":1}
  GET  /api/allocations?restaurant_id=2  u=6   -> 403 {"error":"No access to site FC"}
  GET  /api/allocations                  u=6   -> 200 [{"id":1,"restaurant_id":2,"restaurant_name":"FC", ... "quantity":3, ... "notes":"FC-only row"}]
  GET  /api/allocations?meat_id=12       u=6   -> 200 (the same FC row)
  GET  /api/allocations?business_date=2026-11-16  u=10 (Test No Sites) -> 200 (the same FC row)
  GET  /api/stock-receipts               u=6   -> 200 []   (the same shape of list, correctly narrowed)
  ```
- **ADR:** ADR-041 ("Allocations -> the entry's restaurant"), ADR-091 ("your sites" follow the
  guard everywhere). The site-filter-ii "Added 2026-11-11" list of narrowed reads names four routes
  and leaves this one out, so the code matches the spec's list; the spec's list has the hole.
- **Smallest fix:** in `GET /allocations`, when `restaurant_id` is absent, add the same clause
  `GET /stock-receipts` uses: `const codes = listSiteCodes(db, req.user); if (codes !== null) {
  siteCodeIn('r.code', codes) }` (the query already joins `restaurants r`). One test: a checker's
  unfiltered list holds only their sites' rows; management's holds every site.

### PERM-02 - P1 - The stock rollup shows commissary balances to people who cannot use the commissary, and hides them from the commissary's own people

- **Where:** `GET /api/dashboard/stock-rollup` - `server/routes/dashboard.js:103-134` (the trim
  looks at restaurants only; `commissaryMeats` at 114-120 is every active commissary meat).
- **What happens:** the route drops restaurants the person may not use, then returns the balance of
  every commissary meat of every commissary (`commissary_balance`, `by_commissary[].balance`,
  `grand_total`) to anyone who has at least one restaurant left. A restaurant-only counter, who is
  refused on `/commissary/daily-audit?commissary_id=1`, reads the commissary's stock here. The
  opposite case is also wrong: a commissary-only person has no restaurant left, so they get an empty
  rollup and cannot see their own commissary's balances.
- **Repro** (admin opened COM-A meats 1-3 at 30 each for the month):
  ```
  GET /api/commissary/daily-audit?date=2026-11-16&commissary_meat_id=1  u=6 (Test Counter RA) -> 403 {"error":"No access to site COM-A"}
  GET /api/dashboard/stock-rollup?date=2026-11-16  u=6 -> 200 ... {"name":"Whole Chicken","commissary_balance":60,
       "by_commissary":[{"code":"COM-A","commissary_meat_id":1,"balance":30},{"code":"COM-A","commissary_meat_id":2,"balance":30}], "grand_total":60}
  GET /api/dashboard/stock-rollup?date=2026-11-16  u=8 (Test Commi, COM-A only) -> 200 {"date":"2026-11-16","restaurants":[],"rows":[]}
  ```
- **ADR:** ADR-041 ("the dashboard stock rollup trim to the user's sites"), ADR-091 (one rule for
  "your sites"), ADR-037 (the commi stock stays its own site).
- **Smallest fix:** apply the same `codes` to the commissary side: keep a `by_commissary` entry only
  when `codes === null || codes.includes(m.commissary_code)`, sum `commissary_balance` from the kept
  entries, and return the empty result only when no restaurant AND no commissary is left. Test: a
  restaurant-only checker's rollup has no commissary balance; a commi-only checker's has COM-A's.

### PERM-03 - P1 - A blind counter (and a logged-out visitor) can read the numbers the landing hides, from three other reads

- **Where:** `GET /api/dashboard/stock-rollup` (`server/routes/dashboard.js:38-65`, `currentBalance`
  falls back to `endingCalculated`), `GET /api/stock-receipts` (`server/routes/stockReceipts.js:66`),
  `GET /api/allocations` (`server/routes/allocations.js:37`). `isBlind` is only asked in
  `server/routes/dailyAudit.js` (lines 111, 145, 216, 364).
- **What happens:** the landing strips beginning, new stock, adjustments, expected and variance for
  a blind counter, and refuses the month opening ("Counters do not see month openings."). The same
  login, at the same site, gets those numbers from other routes: the rollup returns, per restaurant,
  the count if there is one and otherwise the EXPECTED ending; the stock-receipts list returns every
  delivery quantity (new stock); the allocations list returns every adjustment. Logged out is
  "blind" too (ADR-040) and gets the same, for every site.
- **Repro** (RA meat 1 opened at 10; admin saved one conversion standard for it, ratio 1, and one
  delivery of 5; Test Counter RA is a checker = blind at RA):
  ```
  GET /api/daily-audit?restaurant_id=1&date=2026-11-16  u=6 -> 200 {"blind":true,"rows":[{"type":"MEAT","item_id":1,...,"count":null,...}]}   (no numbers)
  GET /api/daily-audit/month-opening?restaurant_id=1&date=2026-11-16  u=6 -> 403 {"error":"Counters do not see month openings."}
  GET /api/dashboard/stock-rollup?date=2026-11-16  u=6 -> 200 ... "by_restaurant":{"1":{"total":15,"hasData":true,"standardCount":1}}
       (15 = beginning 10 + new stock 5 = the head chef's ending_calculated for that meat, before anything was counted)
  GET /api/stock-receipts?restaurant_id=1&business_date=2026-11-16  u=6 -> 200 [{"id":2,...,"meat_name":"Whole Chicken Raw",...,"quantity":5,"source":"DIRECT",...}]
  GET /api/dashboard/stock-rollup?date=2026-11-16  u=-  -> 200, same by_restaurant total, every restaurant and commissary
  ```
  The rollup number is exact for a meat with one conversion standard; with several it is their sum.
- **ADR:** ADR-015 ("The server strips the numbers, never only the page"; counters see endings and
  remarks only), ADR-038, ADR-040 ("It stays blind"). ADR-091 already plans blind-history for the
  History feed; these three reads are the same hole and are not in that plan. The blind-count spec
  scoped the rule to "the daily-audit routes", so the code follows its spec; the spec is one route
  wide.
- **Smallest fix:** in blind-history's step (or its own), ask `isBlind(req.user, siteCode)` in these
  three reads: the rollup leaves a blind site's `by_restaurant` entry out of the response (and out of
  `grand_total`); `/stock-receipts` and `/allocations` answer 403 for a `restaurant_id` where the
  requester is blind, and drop blind sites' rows from the unfiltered list. Naoki to confirm first
  whether counters use the Stock Receipts page at all (if they enter deliveries, they need the write
  but not the list of other people's).

### PERM-04 - P1 (accepted until write-permission; listed as its input) - What a logged-out caller and a read-only login can write today

Not a new decision to argue: ADR-040 keeps the logged-out pass and ADR-084 places the read-only
refusal in write-permission. This is the exact map the task asked for, from real requests (one
write per route, per account; the full grid is in "Matrices" at the end).

**A logged-out caller (no cookie) can write, at every site - 22 site-scoped routes, plus login and
logout:**

| Area | Routes that answer 200 with no cookie |
|---|---|
| Restaurant landing | `POST /daily-audit`, `POST /daily-audit/portions`, `POST /daily-audit/month-opening`, `POST /daily-audit/month-opening/copy-all`, `PATCH /daily-audit/opening-stock` (a null quantity hard-deletes the opening, no log row) |
| Stock receipts | `POST /stock-receipts`, `PATCH /stock-receipts/:id`, `DELETE /stock-receipts/:id` |
| Sales | `PATCH /sales` (set or clear a MANUAL cell) |
| Allocations | `POST /allocations`, `POST /allocations/conversion` |
| Commissary | `POST /commissary/daily-audit`, `POST /commissary/month-opening`, `POST /commissary/month-opening/copy-all`, `PATCH /commissary/opening-stock`, `POST /commissary/shipments`, `POST|PATCH|DELETE /commissary/yield-log[/:id]`, `POST|PATCH|DELETE /commissary/adjustments[/:id]` |
| Login | `POST /auth/login`, `POST /auth/logout` |

Refused logged out (checked): recount orders and their cancel (403, no user = blind); every
`/api/settings` write, the side-item writes, shipment presets and conversion standards saves, both
admin commands (`/commands/oversold-check` is a read) and every Roles-page write (401).

**A logged-out caller can read:** everything in the read matrix except the Roles page
(`/roles`, `/users/:id/roles`: 401), `/commands/oversold-check` (401), and the two blind refusals
(`/daily-audit/month-opening`, `/daily-audit/count-history`: 403). The landing reads come back
stripped (blind). Everything else answers in full for every site: stock receipts, sales,
allocations, all commissary reads (never blind), the stock rollup (PERM-03), History, Kitchen
Sales, every Settings read (PERM-06: with unit costs), side sheets, the name list for login.

**A read-only login (Test Management, base role `management`) can write - the same 22 site-scoped
routes above, at every site** (it bypasses the site check, `siteAccess.js:42`), plus login and
logout. Each answered 200 as `u=3`:
`POST /daily-audit` (RA and FC), `POST /daily-audit/portions`, `POST /daily-audit/month-opening`,
`.../copy-all`, `PATCH /daily-audit/opening-stock`, `POST|PATCH|DELETE /stock-receipts`,
`PATCH /sales`, `POST /allocations`, `POST /allocations/conversion`, `POST /commissary/daily-audit`,
`POST /commissary/month-opening`, `.../copy-all`, `PATCH /commissary/opening-stock`,
`POST /commissary/shipments`, `POST|PATCH|DELETE /commissary/yield-log`,
`POST|PATCH|DELETE /commissary/adjustments`. Refused for management (403): recount orders,
Settings, side items, presets and standards, `sync-batch-stock`, the Roles page.

- **Repro:** each route was sent once per account (the grid under "Matrices"), e.g.
  `POST /api/daily-audit u=- {"restaurant_id":2,"business_date":"2026-11-16","rows":[{"meat_id":12,"ending_actual":19,"touched":true}]} -> 200`;
  the same body as `u=3` -> 200.
- **ADR:** ADR-040, ADR-084, ADR-010 ("management: read-only, with no exception").
- **Notes for write-permission's builder** (the smallest fix is that step as specced; three things
  to carry into it):
  1. ADR-084's refusal keys on "base role is read_only". `refuseReadOnly` must read the base role
     the way `loadUser` does (an inactive role reads 0). A person whose read-only comes from a role
     ASSIGNMENT is not covered by the ADR's wording - see PERM-08.
  2. After the step, a site member with any role still has no role check on: month opening
     (`POST`, `copy-all`), `PATCH /daily-audit/opening-stock`, the three stock-receipt writes,
     `PATCH /sales`, both allocation writes, `PATCH /commissary/opening-stock` and the commissary
     month opening. The spec lists only count saves and "endings, yields, shipments, adjustments".
     See PERM-05.
  3. ADR-040's "Reopen only if" (reachable beyond the restaurant's Wi-Fi before write-permission)
     is met by ADR-070 (Tailscale, accepted 11-14): see PERM-13.

### PERM-05 - P1 - No write asks a role switch except recount orders and the Roles page; a blind counter can delete the month's opening, and a supervisor ("never counts") can save counts

- **Where:** every write in `server/routes/dailyAudit.js`, `stockReceipts.js`, `sales.js`,
  `allocations.js`, `commissary.js`. `can()` is reached only through `canOrderRecount`
  (`dailyAudit.js:379,392`) and `permissions.isAdmin` (the Roles page). `enter_counts` and
  `finalize` are never asked on a save.
- **What happens:** the site guard answers "may this person use this site"; nothing answers "may
  this role do this here". So, at their own site:
  - Test Supervisor RA (role supervisor: `enter_counts` 0; ADR-010 and ADR-034 "never counts")
    saves counts: `POST /daily-audit` -> 200, and the count is stamped with their name.
  - Test Counter RA (checker, blind) rewrites or deletes the beginning number the landing hides
    from them: `PATCH /daily-audit/opening-stock` with `quantity: null` deletes the row (a hard
    `DELETE`, `dailyAudit.js:434`, no activity_log row, no author), which blocks the month for that
    meat again; they can also re-declare any opening (`POST /daily-audit/month-opening`), run
    Copy all, edit or delete any stock receipt, change sales cells and post allocations.
- **Repro:**
  ```
  POST  /api/daily-audit  u=11 {"restaurant_id":1,"business_date":"2026-11-16","rows":[{"meat_id":1,"ending_actual":9,"touched":true}]} -> 200 {"ok":true,"saved":1,"refused":[]}
  PATCH /api/daily-audit/opening-stock  u=6 {"restaurant_id":1,"meat_id":2,"business_date":"2026-11-16","quantity":10} -> 200 {"ok":true,"cleared":false,"quantity":10}
  PATCH /api/daily-audit/opening-stock  u=6 {"restaurant_id":1,"meat_id":2,"business_date":"2026-11-16"}               -> 200 {"ok":true,"cleared":true}
  GET   /api/history?entity_type=opening_stock  -> []   (nothing recorded)
  ```
- **ADR:** ADR-034 (switches decide what a role may do at a site), ADR-010 (supervisor never
  counts), ADR-015 / ADR-038 (a blind counter does not see, let alone set, the beginning), ADR-011.
  write-permission (not built) covers count saves and the commissary sheet only.
- **Smallest fix:** one helper next to `requireSiteAccess`, e.g. `requireSwitch(capability)`, that
  finds the site the same way the guard does and answers 403 unless `can(db, req.user, capability,
  site)`; logged out keeps passing until write-permission (ADR-040). Put `enter_counts` on the two
  count saves, and "not blind" (`sees_expected`) or `finalize` on the opening-stock, month-opening
  and copy-all writes - Naoki to say which switch owns stock receipts, sales edits and allocations
  (ADR-084's note already says "allocations and finalize check none today"). Give the opening
  delete an activity_log row.

### PERM-06 - P1 - Cost leaks: the input list for cost-guard (four reads it names, four it does not)

`withoutCosts` and `see_costs` do not exist yet (cost-guard is not merged), so every money field
below goes to everyone. The values in the repros are made-up sentinels typed in as Test Admin
(7777, 6161, 5151, 8888, 6666, 5555, 4444), never real figures.

**Already in cost-guard's spec - confirmed open today, logged out and as a checker:**

| Read | Field | Repro (u=- and u=6 both 200 with the value) |
|---|---|---|
| `GET /api/settings/meats?restaurant_id=1` (`settings.js:206`) | `cost_per_unit` | `[{"id":1,...,"cost_per_unit":7777,...}]` |
| `GET /api/settings/dishes?restaurant_id=1` (`settings.js:243`) | `cost_per_portion` | `[{"id":1,...,"cost_per_portion":6161,...}]` |
| `GET /api/settings/commissary-meats?commissary_id=1` (`settings.js:160`) | `cost_per_unit` | `[{"id":1,...,"cost_per_unit":5151,...}]` - also to a person with no access to COM-A (Settings reads have no site check, ADR-042) |
| `GET /api/commissary/meats` with or without `commissary_id` (`commissary.js:74`) | `cost_per_unit` | `[{"id":1,...,"cost_per_unit":5151,...}]`; with no `commissary_id` a restaurant-only checker gets every commissary's costs |

**NOT in cost-guard's spec (its COST_FIELDS are `cost_per_unit` and `cost_per_portion`, its route
list is the four above) - new since staff-meal-settings (PR #82) and side-items (PR #74) merged:**

| Read | Field | Repro |
|---|---|---|
| `GET /api/settings/staff-rice-rates` (`settings.js:460`) | `price_per_kg` - a unit price | `u=-` -> 200 `[{"id":1,"effective_from":"2026-11-16","cups_per_head":2,"grams_per_cup":180,"price_per_kg":8888,...}]` |
| `GET /api/settings/staff-meal-slots?site=RA` (`settings.js:448`) | `fixed_budget`, `per_head_rate` | `u=-` -> 200 `[{"id":1,"site_code":"RA","name":"Afternoon",...,"fixed_budget":6666,"per_head_rate":5555,...}]` |
| `GET /api/history` (`history.js:43`) - open to everyone, logged out included | the full before/after row of every logged change: `side_items.cost_per_unit`, `staff_meal_slots.fixed_budget` and `per_head_rate`, `staff_rice_rates.price_per_kg` | `u=-` -> 200 `{"entity_type":"side_items","action":"CREATE","after":{...,"cost_per_unit":4444,...}}`, `{"entity_type":"staff_rice_rates",...,"after":{...,"price_per_kg":8888,...}}`, `{"entity_type":"staff_meal_slots",...,"after":{...,"fixed_budget":6666,"per_head_rate":5555,...}}` |
| The same History feed once bills, POs and prices land (A9) | whatever those tables hold | by construction: `logActivity` stores `SELECT *` snapshots and the feed returns them unfiltered |

**Checked and closed:** `GET /api/side-items?site=RA` returns `cost_per_unit` only to an admin
(`sideItems.js:29`): logged out, checker, head chef, supervisor and management get the item without
it. (After cost-guard, head chef, supervisor and management should see it - that is the step's own
work, not a leak.) Kitchen Sales carries no money (PERM-clean list).

- **ADR:** ADR-060 ("A read that returns a unit cost or price leaves those fields out for anyone
  without see_costs at that site, logged out included (no logged-out pass for money)"; "Every later
  read with a unit cost or price ... uses the same check"), ADR-009 (budgets are private figures),
  ADR-043.
- **Smallest fix (all inside cost-guard):**
  1. COST_FIELDS gains `price_per_kg`. Naoki to say whether `fixed_budget` and `per_head_rate` are
     "totals a feature is built to show" (ADR-060 keeps the cook's budget on the staff-meal page) or
     settings figures that need `see_costs` when read from Settings; either way they should not go
     to a logged-out request.
  2. The two staff-meal Settings reads go through `withoutCosts`.
  3. `GET /history` runs `withoutCosts` over `before` and `after` of every row for a requester
     without `see_costs` (a site-less feed: use `can(user, 'see_costs', null)` or "at any site" -
     Naoki to choose). One line in `history.js` where the JSON is parsed.
  4. Also confirmed, already in the spec: a PUT with no cost key erases the stored cost today
     (`PUT /api/settings/meats/1 {"name":...,"unit":"unit","active":1}` -> `cost_per_unit: null`).
     The same is true for `meat_type_id` on commissary meats, which the spec does not mention
     (`settings.js:197-205`: `meat_type_id || null`). Run on 11-17, as Test Admin, with the cost key
     kept so only the type is missing:
     ```
     GET /api/settings/commissary-meats?commissary_id=1  u=2 -> [{"id":1,"code":"M01","name":"Whole Chicken",...,"cost_per_unit":5151,"meat_type_id":1,...}]
     PUT /api/settings/commissary-meats/1  u=2 {"name":"Whole Chicken","unit":"unit","allowed_leeway_pct":0,"cost_per_unit":5151,"active":1} -> 200 {"ok":true}
     GET /api/settings/commissary-meats?commissary_id=1  u=2 -> [{"id":1,...,"cost_per_unit":5151,"meat_type_id":null,...}]
     GET /api/dashboard/stock-rollup?date=2026-11-16     u=2 -> the "Whole Chicken" row: commissary_balance 59 -> 30, grand_total 68 -> 39, by_commissary loses meat 1; a new row of kind "untagged" appears
     GET /api/history?entity_type=commissary_meats -> []
     ```
     So a caller that leaves the key out (an older page, a script, cost-guard's own "no cost key"
     case) silently takes the meat out of its meat type: its stock leaves the type's rollup row and
     the conversion standards for that type no longer apply to it, with no History row (PERM-16).
     The row was put back afterwards with a second PUT carrying `meat_type_id: 1`; the read then
     matched the first one exactly. cost-guard's "an absent key keeps the stored value" rule should
     cover `meat_type_id` in the same line (`COALESCE`, as `recount_required` already has).

### PERM-07 - P0 by this report's scale (a security hole); known and accepted until sign-the-cookie and passwords - but the reason given for waiting is no longer true

- **Where:** `server/routes/auth.js:23-29` (`cookieUserId`), `:65-71` (login), `:61-63`
  (`/auth/users`); every gate that reads `req.user`: `middleware/requireAdmin.js`,
  `routes/commands.js:14-23`, `db/permissions.js:118` (`isAdmin`), `engines/blindCount.js:23-34`.
- **How identity is carried:** one cookie, `user_id=<the users.id>`, plain and unsigned
  (`HttpOnly; SameSite=Lax; Path=/`, no `Secure`, no `Max-Age`, so it lasts for the browser
  session). Nothing is kept on the server: every request loads the user row for that number.
- **What happens:**
  1. *Forged:* no login is needed. Any request that carries `Cookie: user_id=1` IS the bootstrap
     super-admin; `user_id=2` is whoever has id 2. Ids are small counting numbers and
     `GET /api/auth/users` lists every active account's id and name to anyone.
  2. *Picked:* `POST /api/auth/login {"user_id":1}` logs anyone in as the super-admin with no
     secret. Signing the cookie will not change this: the server will sign whatever name is picked.
  3. *Replayed:* logging out only tells the browser to drop the cookie. The value keeps working
     forever from any device (there is no session to end, no expiry).
  4. *What it gains today:* sign-the-cookie's spec says "until then nothing depends on who you are,
     so a forged cookie gains nothing a logged-out visitor lacks (ADR-040)". That was true on
     11-11. Since settings-guard (11-14), site-filter-ii's commands (11-15) and roles-page (11-16)
     it is not: a typed admin id passes every admin-only gate that a logged-out visitor is refused -
     all `/api/settings` writes (sites, meats, unit costs, recipes, staff-meal budgets, rice price),
     side items, presets and standards, `sync-batch-stock`, and the whole Roles page (make a role
     with admin, change anyone's base role, switch roles off). A typed head-chef or admin id also
     un-blinds the landing, opens count history and orders recounts.
  5. What does hold: a deactivated user's id reads as logged out at once (checked), and a
     deactivated role grants nothing.
- **Repro:**
  ```
  GET  /api/auth/me                      Cookie: user_id=1  (never logged in) -> 200 {"user":{"id":1,...,"role":"super-admin",...,"can_admin":1,...}}
  PUT  /api/settings/restaurants/1       u=-                 {"name":"Restaurant A","active":1} -> 401 {"error":"Log in first"}
  PUT  /api/settings/restaurants/1       Cookie: user_id=1   {"name":"Restaurant A","active":1} -> 200 {"ok":true}
  GET  /api/roles                        Cookie: user_id=1   -> 200 {"can_edit":true,...}
  POST /api/commands/sync-batch-stock    Cookie: user_id=1   -> 200
  POST /api/auth/login  {"user_id":1}    -> 200, Set-Cookie: user_id=1; Path=/; HttpOnly; SameSite=Lax
  POST /api/auth/logout  u=2 -> 200;  then GET /api/auth/me u=2 -> 200 {"user":{"id":2,"name":"Test Admin",...}}   (still logged in)
  ```
- **ADR:** ADR-042 and ADR-040 ("Admin-only actions ... need a logged-in admin ... There is no
  logged-out pass for them"), ADR-082 (the Roles page owns roles). The decision to leave the cookie
  unsigned until after write-permission is settled (2026-11-11 block, sign-the-cookie's spec) and
  is not argued here; the finding is that its stated premise is stale, and that after signing, the
  pick-your-name login still hands out the admin accounts.
- **Smallest fix:** (a) correct the DEPENDS ON sentence of sign-the-cookie so nobody relies on it;
  (b) sign-the-cookie itself is 20 lines in `auth.js` and touches nothing else - it does not need
  write-permission and could go first; (c) for the admin accounts only, the "shared-password gate"
  ADR-040 already names: `POST /auth/login` asks for one secret from `.env` when the picked user's
  base role has admin. Naoki's call (the red-flag rule against building password login stands for
  builders); until then ADR-042's gates stop mistakes, not people.
- **Polish in the same file (P3):** login takes `Number(body.user_id)`, so `true`, `[1]` and `1.0`
  log in as id 1 and `"0x2"` as id 2 (checked); the cookie accepts `user_id=2=6` and, with two
  `user_id` cookies, the first well-formed one. Use the guard's `parseId` rule in both.

### PERM-08 - P2 - The History feed's "who" is a typed name, not the logged-in person

- **Where:** `actor` from the request body in `server/routes/stockReceipts.js:114,128,132`
  (and the PATCH and DELETE below it), `commissary.js` (yield log 796-836 and its PATCH/DELETE,
  shipments 363-429, endings 214-233, adjustments 1029-1069), and `created_by` from the body in
  `allocations.js:84,120,158,186`.
- **What happens:** these routes stamp `created_by_user_id` from the cookie on a CREATE, but the
  name they write - `created_by`, and `activity_log.actor`, the only "who" History shows - is
  whatever text the request sends. A counter can save or delete a delivery under the head chef's
  name. With no `actor` the log row has no name at all, and for an edit or a delete the logged row
  only carries the CREATOR's `created_by_user_id`, so who edited or deleted is not recorded
  anywhere. (The restaurant count saves are right: they use `req.user.name`, and count_entries keeps
  every saver.)
- **Repro:**
  ```
  POST   /api/stock-receipts     u=6 {"restaurant_id":1,"meat_id":3,"business_date":"2026-11-16","quantity":50,"source":"DIRECT","actor":"Test Head Chef RA"} -> 200 {"ok":true,"id":40}
  DELETE /api/stock-receipts/40  u=6 {"actor":"Test Head Chef RA"} -> 200
  GET    /api/history?entity_type=stock_receipts&limit=2 ->
         {"actor":"Test Head Chef RA","action":"DELETE","entity_id":40, row created_by "Test Head Chef RA", created_by_user_id 6}
         {"actor":"Test Head Chef RA","action":"CREATE","entity_id":40, ...}
  POST   /api/stock-receipts     u=2 {...quantity 51...} -> id 41;  DELETE /api/stock-receipts/41 u=6 {} -> 200
  GET    /api/history?entity_type=stock_receipts&limit=1 -> {"actor":null,"action":"DELETE","entity_id":41, row created_by_user_id 2}   (nothing says user 6 deleted it)
  POST   /api/allocations        u=6 {...,"created_by":"Test Head Chef RA"} -> the list shows "created_by":"Test Head Chef RA"
  ```
- **ADR:** ADR-080 (the stamp answers "whose number is this"; the history answers "who touched
  it"). user-id-authorship left the old typed field alone on purpose; that leaves the log's actor
  outside the identity chain, and sign-the-cookie will not reach it.
- **Smallest fix:** in those routes, when `req.user` exists use `req.user.name` for `actor` /
  `created_by` and ignore the body's (keep the typed name only for logged-out requests, until
  write-permission); `logActivity` gains an `actorUserId` so an UPDATE or DELETE records who did it.
  The "Your name (for the activity log)" box on the three pages can then go when logged in.

### PERM-09 - P2 - "Admin" is read two ways: an admin by ASSIGNMENT can edit roles (and promote themselves) but cannot change Settings, run the commands or reach a site

- **Where:** `server/db/permissions.js:118` (`isAdmin` = `can(actor, 'admin', null)`: base role
  plus every-site assignments) against `server/middleware/requireAdmin.js:5`,
  `server/routes/commands.js:22-23`, `server/routes/sideItems.js:29` and
  `server/db/siteAccess.js:42` (`isBypass`), which all read `req.user.can_admin` / `read_only` -
  the BASE role's flags only (`auth.js:34-52`).
- **What happens:** ADR-034 says a role with admin has everything, and ADR-042 calls requireAdmin
  "a stopgap: once role-assignments exists, the check moves into permissions.js (can, ADR-034)".
  role-assignments and roles-page have merged; the move has not happened. So a person given the
  admin role as an extra role at "all their sites" is an admin on the Roles page only: they can
  create roles, toggle switches, change anyone's base role - including their own, to admin, after
  which everything opens - while Settings, the side-item writes, both commands and the site bypass
  still say no. `/api/auth/me` shows them with no capabilities at all (no memberships, and the
  bypass does not see the assignment). The same split applies to read-only: `management` as an
  assignment gives no cross-site reading, and ADR-084's coming refusal (keyed on the base role)
  will not see it either.
- **Repro** (Test No Sites: base role checker, no memberships):
  ```
  POST /api/users/10/roles  u=2  {"role_id":2,"site_code":null} -> 200 {"ok":true,"id":2}
  GET  /api/auth/me         u=10 -> {"user":{...,"role":"checker",...,"can_admin":0,...},"capabilities_by_site":{}}
  GET  /api/roles           u=10 -> {"can_edit":true,...}
  POST /api/roles           u=10 {"name":"Review made by assigned admin","copy_from":5} -> 200
  PUT  /api/settings/restaurants/1  u=10 {"name":"Restaurant A","active":1} -> 403 {"error":"Only an admin can change settings"}
  POST /api/commands/sync-batch-stock u=10 -> 403;  GET /api/daily-audit?restaurant_id=1&date=2026-11-16 u=10 -> 403 {"error":"No access to site RA"}
  PUT  /api/users/10/base-role  u=10 {"role_id":2} -> 200 {"ok":true,"changed":true}
  PUT  /api/settings/restaurants/1  u=10 (same body) -> 200 {"ok":true}
  ```
- **ADR:** ADR-034, ADR-042 (the stopgap line), ADR-084 (base role wording), ADR-010.
- **Smallest fix:** one definition. Either (a) `requireAdmin`, `adminOnly`, `bypassOnly`, the
  side-items cost check and `isBypass` ask `can(db, user, 'admin' | 'read_only', null)`, as ADR-042
  planned; or (b) if admin and management are meant to be base roles only, `assignRole` refuses a
  role with admin or read_only ("give this as the person's base role") and `isAdmin` reads the base
  role. (b) is the smaller change and keeps ADR-084's wording true. Naoki to choose.

### PERM-10 - P3 - An admin can switch the admin role's own admin off (or the whole role off); every admin is then locked out of everything until the super-admin logs in

- **Where:** `PUT /api/roles/:id/capabilities` and `PUT /api/roles/:id` -
  `server/db/permissions.js:291-354` (only the super-admin role is protected).
- **What happens:** one tap on "Admin: changes settings and roles everywhere" on the built-in
  admin role removes admin from every admin at once, the person tapping included. Because admins
  have no memberships (they relied on the bypass), they also lose every site. Only the super-admin
  account can turn it back on. Nothing is lost and it is logged; it is a footgun, not a hole.
- **Repro:**
  ```
  PUT /api/roles/2/capabilities  u=2 {"capability":"admin","on":false} -> 200 {... "can_admin":0 ...}
  GET /api/auth/me  u=2 -> {"user":{...,"role":"admin",...,"can_admin":0,...},"capabilities_by_site":{}}
  PUT /api/roles/2/capabilities  u=2 {"capability":"admin","on":true}  -> 403 {"error":"Only an admin can change roles."}
  PUT /api/roles/2/capabilities  u=1 {"capability":"admin","on":true}  -> 200   (the super-admin undoes it)
  ```
- **ADR:** ADR-082, ADR-083 (built-in roles are found by name; the same reasoning covers the one
  flag that makes the built-in admin role what it is), ADR-095.
- **Smallest fix:** in `setRoleToggle` and `updateRole`, refuse turning `admin` off, or `active`
  off, on the built-in `admin` role ("The admin role keeps admin - make a copy to change it"), the
  way super-admin is refused today. Two lines and two tests.

### PERM-11 - P2 - The people import's access changes leave no History row

- **Where:** `scripts/import-settings.js:206-418` (`importRoles`, `importUsers`,
  `syncMemberships`): no `logActivity` call. The Roles page logs every one of the same kinds of
  change (`permissions.js`), and the side-items half of the same import logs through its engine.
- **What happens:** the import did exactly what ADR-047 and ADR-082 say it may (see the clean
  list): it left an existing role's flags and an existing person's base role alone and reported
  them. What it may still change - a NEW role with any flags including admin, a NEW person with any
  base role including admin, anyone's `active`, and everyone's site list - it changes with no
  activity_log row. A new admin, a deactivated person or a removed site appears in the app with
  no trace of when or from which file; only the terminal's report said so.
- **Repro** (throwaway database; folder with a Roles.csv and a Users.csv):
  ```
  Roles.csv:  checker,1,1,1,0 / super-admin,0,0,0,0 / Review Boss,1,1,1,0
  Users.csv:  Test Counter RA,admin,1,"RA,FC" / Test Counter FC,checker,0,FC / Review New Admin,admin,1, / Review Boss Person,Review Boss,1,RA / Test Floater,no-such-role,1,RA
  DB_PATH=server/db/dev.db node scripts/import-settings.js <folder>
    Roles: 1 inserted   Users: 2 inserted, 1 updated   Site memberships: 2 added, 1 removed
    Left as the app has them (4): checker can_finalize / can_admin; Test Counter RA: sheet says admin, app has checker; Test Floater: no such role
    WARNING: Roles row 3: "super-admin" flags are fixed - row ignored
  After: role "Review Boss" exists with can_admin 1; "Review New Admin" is an admin; Test Counter FC reads as logged out (active 0);
         Test Counter RA gained FC; Test Floater lost FC.
  SELECT ... FROM activity_log WHERE entity_type IN ('users','roles','user_sites','user_roles') -> []   (before any Roles-page action)
  ```
- **ADR:** ADR-047, ADR-082 (who owns what), scope.md ("Changes to stock and settings are kept in an
  activity log"; roles are on the list of logged tables).
- **Smallest fix:** `importRoles` / `importUsers` / `syncMemberships` call `logActivity` (actor
  `import-settings`, source `SYSTEM`, as `IMPORT_CTX` already does for side items) for: role
  inserted, user inserted, `active` changed, membership added or removed. They already run inside
  the import's one transaction.

### PERM-12 - P3 - A query field given twice answers 500 with a stack trace and the server's folder paths, logged out included

- **Where:** `server/routes/dashboard.js:97` (`restaurant_ids.split(',')`, on a value that is an
  array when the field is repeated). The same class, where a repeated `date`, `business_date`,
  `source` or `entity_type` is handed to SQLite as an array: `stockReceipts.js:102`,
  `allocations.js:67`, `history.js:63`, `commissary.js:115` and `:994`,
  `engines/auditEngine.js:149`, `engines/commissaryAuditEngine.js:142`. `server/index.js` has no
  error handler and nothing in the repo sets `NODE_ENV`, so Express's own handler writes the error
  and its stack into the answer.
- **What happens:** ADR-074 made the guard answer 400 for a malformed or repeated id. That covers
  the ids the guard reads (`restaurant_id`, `commissary_id`, `commissary_meat_id`, row ids). Every
  other query field is used as it arrives. Given twice (`a=1&a=2`) or as `a[x]=1`, it reaches the
  route as an array or an object, the route throws, and the caller gets an HTML page with the error
  text, the file and line, and 9 or 10 absolute paths on the server PC (the Windows account's
  folder and where the app is installed). No data comes back and nothing is written. A body that is
  not JSON, or is JSON but not an object, gets the same page as a 400. All of it works logged out.
  Of 25 probes on 16 read routes, 13 answered this way, on 9 routes; the others answered 400 or 200.
- **Repro** (`u=-`; the path is shortened here):
  ```
  GET /api/dashboard/stock-rollup?date=2026-11-16&restaurant_ids=1&restaurant_ids=2 -> 500 text/html
      <pre>TypeError: restaurant_ids.split is not a function
          at C:\Users\...\server\routes\dashboard.js:97:22
          at Layer.handle [as handle_request] (C:\Users\...\node_modules\express\lib\router\layer.js:95:5) ...
  GET /api/dashboard/stock-rollup?date=2026-11-16&restaurant_ids=1,2   -> 200   (the form the page sends)
  GET /api/dashboard/stock-rollup?date=2026-11-16&date=2026-11-16      -> 500   (commissaryAuditEngine.js:142)
  GET /api/daily-audit?restaurant_id=1&date=2026-11-16&date=2026-11-16 -> 500 "TypeError: Provided value cannot be bound to SQLite parameter 3." (auditEngine.js:149)
  GET /api/daily-audit/mixed?restaurant_id=1&date=...&date=...         -> 500
  GET /api/stock-receipts?business_date=2026-11-16&business_date=2026-11-16 -> 500 "Error: Unknown named parameter '0'" (stockReceipts.js:102)
  GET /api/stock-receipts?source=DIRECT&source=DIRECT                  -> 500
  GET /api/allocations?business_date=...&business_date=...             -> 500   (allocations.js:67)
  GET /api/history?entity_type=a&entity_type=b                         -> 500   (history.js:63)
  GET /api/commissary/daily-audit?commissary_id=1&date=...&date=...    -> 500
  GET /api/commissary/yield-log?commissary_id=1&business_date=...&business_date=...   -> 500   (commissary.js:115)
  GET /api/commissary/adjustments?commissary_id=1&business_date=...&business_date=... -> 500   (commissary.js:994)
  POST /api/daily-audit   body: {bad json   -> 400 text/html "SyntaxError: Expected property name or '}' in JSON ..." with the stack
  POST /api/auth/login    body: null        -> 400 text/html, with the stack
  Answer 400 as they should: /daily-audit/month-opening, /daily-audit/count-history, /commissary/month-opening, /sales (repeated date, year or month).
  ```
- **ADR:** ADR-074 (a malformed id is 400 before the route runs - the same reasoning, one field
  wider), ADR-009 (private details stay out of what is public; a path holding a Windows account
  name is that kind of detail on the restaurant PC).
- **Smallest fix:** (1) one error handler, mounted last in `server/index.js`: print the error on
  the console, answer `{ "error": "Bad request" }` for a body-parse error (the error's own
  `status`), otherwise 500 `{ "error": "Something went wrong" }`, never the stack. About ten lines,
  one test. This closes every case above at once. (2) In the rollup, 400 unless `restaurant_ids` is
  one string of whole numbers and commas. (3) If wanted in the same step: a two-line helper that
  answers 400 when a query field that must be one string is not, used for the dates and filters
  listed under Where.

### PERM-13 - P2 - ADR-040's "Reopen only if" has been true since ADR-070 (Tailscale), and neither record names the other

- **Where:** `docs/decisions/ADR-040-logged-out-until-write-permission.md` ("Reopen only if: The app
  is reachable beyond the restaurant's Wi-Fi before write-permission lands (then a login or the
  shared-password gate comes first)"); `docs/decisions/ADR-070-tailscale-remote-access.md` ("Phones
  away from the restaurant reach the restaurant PC through Tailscale: same server, same port");
  `scripts/restaurant-pc.bat:489-495` (the firewall rule lets in `localsubnet,100.64.0.0/10`, on the
  private and public profiles); `docs/dispatch-queue.md:379` (write-permission: blocked on
  login-tonight).
- **What happens:** ADR-040 accepted "a logged-out visitor passes every site check and can write"
  on one written condition: the app is reachable only on the restaurant's Wi-Fi. ADR-070, accepted
  twelve days later, makes the same server reachable from anywhere through Tailscale, and its
  firewall rule is in `main`. write-permission has not landed. So the case in which ADR-040 says "a
  login or the shared-password gate comes first" is today's case, and nothing records that anyone
  weighed it: ADR-070 does not mention ADR-040 in Supersedes, Context or Consequences; ADR-040 was
  not reopened and does not mention Tailscale; the queue has no step for the gate; session-status
  states both facts (lines 250, 367, 417) without joining them. The server listens on every network
  adapter (`app.listen(PORT)` with no address; checked: `0.0.0.0:3010`), so the firewall rule is the
  only thing between a Tailscale device and the app.
- **What it means in practice:** every device on the tailnet, and anyone holding one, gets what
  PERM-04 lists (all 22 site-scoped writes, logged out) and, through PERM-07, every admin action by
  sending `user_id=1`. This finding is about the records, not a new hole: the holes are PERM-04 and
  PERM-07. What is new is that the written reason for accepting them no longer holds.
- **Repro:** read the two records. `grep -n "ADR-040" docs/decisions/ADR-070-*.md` -> nothing.
  `grep -n -i "ADR-070\|tailscale" docs/decisions/ADR-040-*.md` -> nothing.
  `grep -n "100.64" scripts/restaurant-pc.bat` -> lines 490, 494, 495.
- **ADR:** ADR-040 (its Reopen line), ADR-070, ADR-001 (decisions are recorded; a met "Reopen only
  if" is the signal to reopen), ADR-042.
- **Smallest fix:** a decision by Naoki, written into both records. Either (a) "Tailscale counts as
  inside": ADR-070 gains a Consequences line saying ADR-040's condition was weighed and why it is
  acceptable (who is on the tailnet, that nobody shares a device), and ADR-040's Reopen line becomes
  "reachable by a device outside the restaurant's Wi-Fi and the tailnet" - no code; or (b) the
  shared-password gate ADR-040 already names goes in before the next remote use: one secret in
  `.env`, asked once per browser. (b) also narrows PERM-07 for remote devices. If (b) is ever built
  on the caller's address ("local network passes, others are asked"), read N-1's `proxy-addr` row
  first.

### PERM-14 - P3 - A role named "super admin" or "super_admin" can stand next to "super-admin"; the name key only ignores capitals and extra spaces

- **Where:** `server/db/permissions.js:228` (`nameKey`: trim, collapse spaces, lowercase), used by
  `nameTaken` (`:233-236`) for Add role and Rename. The rules that protect the real role compare
  the exact name: `role.name === SUPER_ADMIN` (`:145, 173, 201, 295, 340, 372`) and
  `BUILT_IN_ROLES.includes(...)` (`:302`).
- **What happens:** ADR-073's reason is "two roles one letter-case apart cannot be told apart by
  staff; a role is a permission". The key stops "Super-Admin" and " super-admin ". A space, an
  underscore, a full stop or an unseen character in place of the hyphen gives a different key, so
  the role is created. On the throwaway database "super admin" and "super_admin" now exist beside
  "super-admin", both made by Test Admin as copies of an admin role, so both carry admin. Each is
  an ordinary role: it can be edited, renamed, switched off, given as a base role or as an extra
  role. None of the "never edited / never assigned" rules reach it. On the Roles page and in the
  base-role picker it differs from the real one by a single character. The people import finds a
  sheet's role by the same kind of key, so a Users row whose role reads "super admin" gives a new
  person the look-alike, with admin, where a "super-admin" row can only rename the one seeded
  super-admin (by reading `scripts/import-settings.js:326-371`; not run).
- By the key's own code (called directly, not sent as requests, so no unseen-character role is
  left behind): "head chef", "Head Chef", "checker." and "admin" followed by a zero-width space all
  get a key that no built-in role holds. The last one reads exactly like "admin" on a screen.
- **Repro:**
  ```
  POST /api/roles  u=2 {"name":"super_admin","copy_from":1} -> 200 {"ok":true,"role":{"id":16,"name":"super_admin","can_enter_counts":1,"can_finalize":1,"can_admin":1,"read_only":0,"active":1,"switches":[]}}
  GET  /api/roles  u=2 -> ... {"id":1,"name":"super-admin",...,"built_in":true} ... {"id":12,"name":"super admin","can_admin":1,"built_in":false} ...
       (id 12 was made the same way on 11-16; History: "entity_type":"roles","action":"CREATE","entity_id":12,"after":{"name":"super admin","can_admin":1,...})
  POST /api/roles  u=2 {"name":"Super-Admin"}   -> 409 {"error":"A role with that name already exists"}   (capitals are caught)
  POST /api/roles  u=2 {"name":"SUPER  ADMIN"}  -> 409   (taken - by the look-alike, id 12)
  PUT  /api/roles/1  u=2 {"name":"super admin 2"} -> 400 {"error":"The super-admin role is never edited."}
  PUT  /api/roles/12/capabilities  u=2 {"capability":"admin","on":true} -> 200 {"ok":true,"changed":false,...}   (the look-alike takes edits)
  ```
  Role 16 was switched off again after the test (`PUT /api/roles/16 {"active":false}` -> 200).
- **ADR:** ADR-073 (its Why), ADR-083 (built-in roles are found by name), ADR-047 (the key).
- **Smallest fix:** in `createRole` and `updateRole` only, also refuse a name whose letters and
  digits alone (everything else dropped, lowercased) equal a built-in role's: "superadmin",
  "headchef" and so on - "That name is too close to the built-in role super-admin." The import's key
  stays as ADR-047 has it. Three lines and one test with the five spellings above.

### PERM-15 - P3 - Kitchen Sales: the normal path is clean (no token, no money); an upstream ERROR text is relayed to every caller, and the token is hidden only after that text is cut

- **Where:** `GET /api/loyverse/preview` - `server/engines/loyversePreview.js:113-118` (`fetchPaged`:
  `detail = (await res.text()).slice(0, 200)`, and only then `msg.split(token).join('[redacted]')`),
  `:137-139` (`redact`), and `:160`, `:308`, `:327`, where the text becomes `accounts[].error` or
  `catalogError` in the response.
- **How it was run:** a second throwaway server on port 3011, same `dev.db`, started as
  `node --require stub-fetch.js server/index.js`. The preload replaces the global `fetch` before the
  app loads (the real one is not kept, and any URL other than the three Loyverse list endpoints
  throws), so nothing left the machine: 84 upstream calls, all answered by the stub. The three token
  variables held three made-up 32-character values. The stub's receipts, items and categories have
  the real Loyverse shape, with the sentinel 987654 in every money field (price, cost, totals, taxes,
  discounts, modifiers, payments, tip, surcharge, points) and marker text in note, order, customer,
  employee, store, device, supplier and SKU. Every case was asked logged out, as Test Counter RA
  (`u=6`) and as Test Admin (`u=2`), for both views (the dish table, and `pos=fc`).
- **What holds (proved by those requests):**
  - Real-shaped receipts over two pages (the cursor is followed), with a cancelled receipt, a refund
    and one from the next business day mixed in: the response carries names and quantities only. No
    token, no "Bearer", no 987654, none of the markers. Every key that appears in the dish view:
    `accounts, date, dishes, idCandidates, unmatched; label, ok, error, receiptsScanned, receiptsKept,
    receiptTypes (SALE, REFUND), lastReceiptAt; dish_code, name, silingan, likod, total; account,
    item_id, variant_id, item_name, variant_name, matchedBy, pattern, quantity`. In the FC view:
    `accounts, categories, date, group; label, ok, error, catalogError, receiptsScanned, receiptsKept,
    receiptTypes, lastReceiptAt; name, items, quantity`. None is a money key.
  - The answer is the same, byte for byte, for a logged-out caller, a counter and an admin.
  - An upstream 401 that echoes the Authorization header back, and a network error whose message
    names it: the whole token is replaced by `[redacted]`, in both views. The error's `cause` is not
    relayed.
  - The token travels only in the Authorization header, only to `api.loyverse.com`; it is in no URL.
    The server's own console printed no token and no money.
  - `pos` or `date` given twice, as an object, as an impossible date, as `__proto__` or in the wrong
    case: 400.
- **What does not hold (two edge cases; both need Loyverse to answer in an unusual way):**
  1. *The cut comes before the redaction.* The engine keeps the first 200 characters of an error
     body and then removes the token from what is left. If the token crosses character 200, what is
     left of it is no longer the whole token, is not recognised, and goes to the browser. With the
     error body padded so the token starts at character 170, the response held 31 of the token's 32
     characters, for a logged-out caller. A 200 answer that is not JSON does the same in small:
     Node's parse error quotes the start of the body (11 characters of the token when the body began
     with it).
  2. *An upstream error body is relayed as it came.* The first 200 characters of any non-200 answer
     go to every caller, logged out included. With `/items` answering `500 ... price 987654`, the
     response's `catalogError` carried `price 987654`. The engine's promise "never a price or total
     field" covers the fields it reads from a good answer, not an error's text.
- **Repro** (stub server on 3011, `u=-`; `<token>` stands for the made-up value):
  ```
  stub: real-shaped receipts, 200
    GET /api/loyverse/preview?date=2026-11-16  -> 200 accounts ok (5 scanned, 3 kept); dishes [{"dish_code":"D001",...,"silingan":3,"likod":3,"total":6}, ...]; no token, no 987654
  stub: every call 401, body {"errors":[{"code":"UNAUTHORIZED","details":"bad token, header was Bearer <token> for /v1.0/receipts"}]}
    same GET  -> 200 "error":"Loyverse API returned 401: {...\"details\":\"bad token, header was Bearer [redacted] for /v1.0/receipts\"}]}"
  stub: every call 401, body = 169 x "E", then <token>
    same GET  -> 200 "error":"Loyverse API returned 401: EEE...EEE<the first 31 characters of the token>"
  stub: /items answers 500 "items failed; header was Bearer <token>; price 987654"
    GET /api/loyverse/preview?date=2026-11-16&pos=fc  -> 200 "catalogError":"Loyverse API returned 500: items failed; header was Bearer [redacted]; price 987654"
  ```
- **ADR:** ADR-041 (Kitchen Sales is open to everyone by design - not argued), ADR-060 ("no
  logged-out pass for money"); the code's own promise at `loyversePreview.js:11-13` and
  `loyverse.js:11` ("the token never appears in any output or error text", "never sent to the
  browser").
- **Smallest fix:** in `fetchPaged`, redact first and cut second:
  `detail = (await res.text()).split(token).join('[redacted]').slice(0, 200)`. Just as small and
  better: send the browser only `Loyverse API returned <status>` and print the redacted body on the
  server console, so no upstream text reaches a logged-out caller at all. Two tests: a token that
  crosses character 200 is not in the response; an error body's text is not in the response.
- **Note, not a finding:** the route has no cache and no limit. Every call, logged out included,
  makes at least two (dish view) or three (FC view) upstream requests with the real tokens, over a
  7-day window. Loyverse limits requests per token, so a loop on this open route could make the page
  fail for everyone. Small on a LAN; worth a short cache when the real sync is built.

### PERM-16 - P2 - A Settings change leaves no History row (a unit cost, a recipe, a site switched off, a meat's type)

- **Where:** `server/routes/settings.js` - the file has no `logActivity` call. (Staff-meal slots and
  rice rates are logged by `engines/staffMealSettings.js`, side items by `engines/sideItems.js`.)
- **What happens:** `docs/scope.md` says "Changes to stock and settings are kept in an activity
  log", and its Parked list reads "An activity log on every table (today: stock receipts, yield,
  settings, roles, roster ...)". For the core Settings tables that is not so: restaurants,
  commissaries, meat types, commissary meats, meats, dishes, recipes, adjustment types and locations
  are written with a bare INSERT, UPDATE or DELETE. After an evening of Settings edits as Test Admin
  on the throwaway database (unit costs typed in and erased, a meat's type cleared and put back,
  sites saved), `activity_log` holds ten kinds of row and none is one of those tables. So who
  changed a cost, who rewrote a recipe (which moves every expected number and variance after it) or
  who switched a site off cannot be answered from the app. requireAdmin decides who MAY; nothing
  records who DID. With PERM-07 (any admin's id can be typed) this trail would be the only one.
- **Repro:**
  ```
  PUT /api/settings/commissary-meats/1  u=2 {... no meat_type_id ...} -> 200 {"ok":true}     (PERM-06 item 4)
  GET /api/history?entity_type=commissary_meats -> []
  SELECT entity_type, COUNT(*) FROM activity_log GROUP BY entity_type      (dev.db, opened read-only)
    -> commissary_yield_log 34, prepped 1, roles 9, side_item_sheets 1, side_items 1, staff_meal_slots 1,
       staff_rice_rates 1, stock_receipts 62, user_roles 12, users 2
  ```
- **ADR:** scope.md (the two sentences quoted), ADR-042 (Settings changes need an admin), ADR-080
  (the history answers "who touched it").
- **Smallest fix:** one wrapper in `settings.js` - read the row, run the write, read it again, call
  `logActivity` (actor `req.user.name`, source MANUAL), all in one transaction - used by the nine
  groups of writes. Order matters: these rows will carry `cost_per_unit` and `cost_per_portion`, and
  the History feed is open to everyone today (PERM-06), so this lands with or after cost-guard's
  History rule, not before. Until then, correct scope.md's sentence to name what is logged today.

### PERM-17 - P2 - Two saves take another restaurant's dish or meat: `POST /daily-audit/portions` and `POST /stock-receipts` never check that the row's item belongs to the restaurant

- **Where:** `server/routes/dailyAudit.js:278-351` (no lookup of `row.dish_id` against
  `restaurant_id`; compare `sales.js:119`), `server/routes/stockReceipts.js:113-128` (no lookup of
  `meat_id`; compare `allocations.js:95`, `commissary.js:391`). The site guard checks
  `restaurant_id` only (`requireSiteAccess.js:91-95`).
- **What happens:** the guard answers "may this person use restaurant RA". The route then stores
  whatever dish or meat id the row names. A member of RA (or a logged-out caller) can save a prepped
  quantity and a portion count for FC's dish, and a delivery of FC's meat, all filed under RA.
  - FC's numbers do not move. Every read is keyed on the pair (restaurant, item): FC's landing
    still shows its dish with prepped 0 and no count, and FC's receipt list stays empty
    (`auditEngine.js:148, 180, 332`).
  - RA's landing does not show the rows either (it walks RA's own dishes and meats). They are
    orphans: they sit in `prepped`, `portion_ending_actual`, `count_entries` and `stock_receipts`,
    show in RA's count history (as item 61, which RA does not have), in RA's Stock Receipts list
    (under FC's meat name and its code M01, a code RA also uses for a meat of its own) and in
    History - and count toward nothing. A delivery filed this way looks logged and is in nobody's
    new stock.
  - An id that is no dish or meat at all is stopped only by the database's foreign key: a 500 (for
    portions, the stack-trace page of PERM-12).
- **What is contained (checked):** `POST /daily-audit` with FC's meat is refused
  (`"saved":0,"refused":[12]`) - not by a belongs-check, but because that meat has no month opening
  at RA and no route can make one (month-opening: 404 "No active meat with that id for this
  restaurant/commissary"; opening-stock: 404; Copy all walks RA's own meats). Recount orders (400
  "Unknown item."), `PATCH /sales`, `POST /allocations`, `/allocations/conversion` and commissary
  shipment lines (400 "... is not an active meat belonging to restaurant_id 1") all check the row.
  `PATCH /stock-receipts/:id` cannot move a receipt to another restaurant or meat. Before this run
  the database held no mismatched row in any of the seven tables.
- **Repro** (Test Counter RA is a member of RA only; meat 12 and dish 61 are FC's; 2026-11-12 had
  no rows before):
  ```
  POST /api/daily-audit            u=6 {"restaurant_id":1,"business_date":"2026-11-12","rows":[{"meat_id":12,"ending_actual":77,"touched":true}]} -> 200 {"ok":true,"saved":0,"refused":[12]}
  POST /api/daily-audit/month-opening  u=6 {"restaurant_id":1,"meat_id":12,"business_date":"2026-11-12","quantity":5} -> 404 {"error":"No active meat with that id for this restaurant/commissary"}
  POST /api/daily-audit/portions   u=6 {"restaurant_id":1,"business_date":"2026-11-12","rows":[{"dish_id":61,"prepped":4,"portion_actual":3,"touched":true}]} -> 200 {"ok":true,"saved":1}
       dev.db after: prepped (restaurant 1, dish 61, 4); portion_ending_actual (restaurant 1, dish 61, 3); count_entries (restaurant 1, PORTION, item 61, 3, COUNT, user 6)
  GET  /api/daily-audit/mixed?restaurant_id=2&date=2026-11-12  u=5 -> the row {"type":"DISH","item_id":61,...,"prepped":0,...,"portionActual":null,...}   (FC unchanged)
  GET  /api/daily-audit/count-history?restaurant_id=1&date=2026-11-12  u=4 -> "entries":[{"kind":"PORTION","item_id":61,"quantity":3,"entry_type":"COUNT","user_id":6,...}]
  POST /api/stock-receipts         u=6 {"restaurant_id":1,"meat_id":12,"business_date":"2026-11-12","quantity":5,"source":"DIRECT","notes":"cross-row test"} -> 200 {"ok":true,"id":44}
  GET  /api/stock-receipts?restaurant_id=1&business_date=2026-11-12  u=6 -> [{"id":44,"restaurant_id":1,"restaurant_name":"Restaurant A","meat_id":12,"meat_code":"M01","meat_name":"Whole Chicken",...,"quantity":5,...}]
  GET  /api/stock-receipts?restaurant_id=2&business_date=2026-11-12  u=5 -> []
  POST /api/daily-audit/portions   u=6 ... "rows":[{"dish_id":99999,"prepped":4}] -> 500 text/html "Error: FOREIGN KEY constraint failed", with the stack
  POST /api/stock-receipts         u=6 {"restaurant_id":1,"meat_id":99999,...} -> 500 {"error":"Failed to save receipt: FOREIGN KEY constraint failed"}
  ```
  Receipt 44 was removed afterwards with the app's own soft delete. The three portion rows stay in
  the throwaway database (no route deletes them).
- **ADR:** ADR-041 (a request is checked against its owner site - the row's item is part of the
  request), ADR-074 (ids are checked before the route runs), ADR-080 (a stamp says whose number it
  is; here the number belongs to no item of that site).
- **Smallest fix:** the lookup the sibling routes already have. In `/daily-audit/portions`, for
  every row: an active BATCH_PREPPED dish of this restaurant (blindCount's `itemExists` is exactly
  that query), else 400 naming the dish, before anything is written. In `POST /stock-receipts`: an
  active meat of this restaurant, with the allocations route's message. In `POST /daily-audit`, the
  same meat lookup, so the refusal no longer leans on the month block. One test per route.

### PERM-18 - P2 - The two database guards compare path text: a full stop or a space after the file name passes them, and Windows then opens the real file

- **Where:** `server/db/dbPath.js:19-33` (`samePath`, `reseedRefusal`: the resolved `DB_PATH`
  compared with the live path as text), `server/db/testAccounts.js:31-50` (the same comparison, plus
  `basename === 'beta.db'`). They stand in front of `server/db/seed.js:37-43` (`--reset`, which runs
  `DELETE FROM` on every table, line 60) and `scripts/seed-test-accounts.js:10`.
- **How it came up:** the spot-check of the late cubic finding on PR #64 ("a dev.db symlink passes
  testAccounts' guard"), sorted on 11-15 as "nothing (the guard catches mistakes; a Windows symlink
  needs admin rights)", with "duplicated samePath" as a tidy-up. That reasoning is right for a
  symlink. It does not cover the guard being passed by a mistake, with no link and no rights.
- **What happens:** when a program opens a file, Windows drops a full stop or space at the end of
  the name, and it still answers to a file's short (8.3) name where the drive keeps them. Node
  keeps those characters in the text. So for `DB_PATH=server/db/inventory.db.` the guard compares `...\inventory.db.` with
  `...\inventory.db`, finds them different and lets the run go on; SQLite then opens
  `inventory.db`. Checked in two halves, never against a database of the app:
  - The guards, called as plain functions (they open nothing):

    | `DB_PATH=server/db/...` | `npm run reseed` | `npm run seed:test` |
    |---|---|---|
    | `inventory.db`, `INVENTORY.DB` | refused | refused |
    | `inventory.db.` (full stop), `inventory.db ` (space), `INVENT~1.DB` (short name) | **allowed** | **allowed** |
    | `beta.db`, `Beta.DB` | allowed (by design, see below) | refused |
    | `beta.db.`, `beta.db ` | allowed | **allowed** |

  - Windows and `node:sqlite`, on a scratch file outside the repo: opening `<name>.db.`,
    `<name>.db ` and the file's short name each read back the marker row of the real file, and no
    second file appeared in the folder.

  Put together: `DB_PATH=server/db/inventory.db. npm run reseed` passes the guard and empties every
  table of the live database; `DB_PATH=server/db/beta.db. npm run seed:test` puts the ten Test
  accounts into Beta, one of them an admin anyone can pick at login (PERM-07). A path copied from
  the end of a sentence carries exactly that full stop.
- **A second thing in the same guard:** `reseedRefusal` allows `beta.db` by design, and its own
  message offers it as the example ("Reseed only runs against a non-live database, e.g.
  DB_PATH=server/db/beta.db npm run reseed"; "Point it at a disposable file such as
  server/db/beta.db"). That was written on 09-27, when Beta was a throwaway file. Since ADR-007
  (10-28) `beta.db` on the restaurant PC holds the Beta's data and is "never pulled or reseeded" -
  by habit only: the command the guard itself suggests empties it. (ADR-007's dated copy at every
  start limits the loss to one session, and paper stays the record during Beta.)
- **Repro** (from the clone's folder; `true` = the guard allows the run):
  ```
  node -e "const {reseedRefusal}=require('./server/db/dbPath.js'); console.log(['server/db/inventory.db','server/db/inventory.db.','server/db/inventory.db ','server/db/INVENT~1.DB','server/db/beta.db'].map(p=>reseedRefusal(p,'win32')===null).join(' '))"
      -> false true true true true
  node -e "const {testAccountsRefusal}=require('./server/db/testAccounts.js'); console.log(['server/db/beta.db','server/db/beta.db.','server/db/beta.db ','server/db/inventory.db.'].map(p=>testAccountsRefusal(p,'win32')===null).join(' '))"
      -> false true true true
  In a scratch folder: make inventory-probe.db with one marker row; new DatabaseSync('...\\inventory-probe.db.') -> SELECT returns the marker row; the folder still holds one file.
  ```
  Neither command was run with such a path: that would have touched `inventory.db` or `beta.db`.
- **ADR:** ADR-007 (Beta's data is never reseeded), ADR-039 (test accounts never reach
  `inventory.db` or any `beta.db`), rule 24 as `scripts/guard-db.js` names it (never destroy the
  live database).
- **Smallest fix:** check the file, not the text. (1) Before comparing, drop full stops and spaces
  from the end of the resolved path and refuse a `:` after the drive letter. (2) In `seed.js --reset`
  and `seed-test-accounts.js`, once the database is open and before the first write, ask SQLite
  which file it holds (`PRAGMA database_list`) and compare that file's identity
  (`fs.statSync(file, { bigint: true })`, `dev` and `ino`) with the live file's - and, for
  seed:test, with `beta.db`'s; refuse on a match. Tried on the scratch file: the identity matched
  for the full stop, the space, the short name and different capitals. (Node's own `fs.statSync` on
  the typed path answers "no such file" for the first two, so a check before opening is not
  enough.) (3) Change `reseedRefusal`'s two example paths to `dev.db`; and, Naoki's call, refuse
  `beta.db` without a second word, now that Beta's data lives there.

### N-1 - note - `npm ci`'s three advisories: which packages, and what the app's code reaches

`npm audit` (run 2026-11-17 on the lockfile as committed; nothing was changed or fixed; like
`npm ci`, it sends the lockfile's package names and versions to the npm registry and nothing else)
names three packages. All three come in under `express` 4.22.2, the app's only dependency. The
app's own code does not `require` any of them.

| Package (installed) | Severity | Advisory | Does the app's code reach it? |
|---|---|---|---|
| `proxy-addr` 2.0.7 | critical | GHSA-jqcg-44mw-7w3h, "IP spoofing via IPv4-mapped IPv6 trust subnet"; fixed in 2.0.8 | **No.** Express asks proxy-addr only when `trust proxy` is set and code reads `req.ip`, `req.ips`, `req.protocol`, `req.secure` or `req.hostname`. The app has no `app.set(...)` at all and reads none of those (searched `server/`, `scripts/`, `public/`). It starts to matter the day something trusts the caller's address: a "local network passes" rule (PERM-13 fix b), a login rate limit, or Tailscale Serve in front of the app (ADR-070) with `trust proxy` on. |
| `body-parser` 1.20.6 | high | GHSA-27r3-jxmh-p828, "Denial of Service via trailing bytes after a compressed request body"; fixed in 1.20.9 | **The code path is reached; the crash was not reproduced.** `app.use(express.json())` (`server/index.js:43`) is body-parser with its default `inflate: true`, so every route that takes a body accepts a gzip or deflate body from anyone, logged out included (a gzip-compressed login body was read normally). Six tries on the throwaway server - gzip and deflate bodies with 8 bytes and with 64 KB after them, two gzip members back to back, brotli - answered 400 or 415 and the server stayed up. Only the advisory's title was to hand, not its exact trigger, so this does not show the app is safe from it. |
| `qs` 6.15.3 | moderate | GHSA-4mjr-xmp4-gh2g ("Denial of Service via attacker controlled isBuffer"), GHSA-x5fp-wj9c-mxmx ("array-limit bypass via bracket-key comma parsing"), GHSA-6pq8-jhm2-2vcw (`qs.stringify` with `arrayFormat: 'comma'`); the range npm gives is up to 6.16.0 | **Parsing is reached by every request that has a query string** (Express's query parser is `qs.parse`). The app never calls `qs.stringify`, and neither the app nor Express's call turns comma parsing on, so going by their titles the last two do not apply. For the first, five query shapes (`a[constructor][isBuffer]=1` and variants) and one bracket-and-comma shape answered normally and the server stayed up. Same caveat: tried from the titles. |

- **What a hit would cost here:** the one Node process stops. `scripts/restaurant-pc.bat` runs
  `npm run dev` once and then prints "The app stopped." (lines 265-268); nothing restarts it. Counts
  already saved are safe (SQLite); the app is down until someone at the PC starts it again.
- **Smallest fix:** `npm audit fix`. npm reports a fix for all three inside express's own version
  ranges (`fixAvailable: true`), so only `package-lock.json` changes; then `npm run verify`. One
  small PR, no code. Worth doing before the app is used over Tailscale (PERM-13).

## Summary

The run stopped early on 11-16 at a checkpoint and was finished on 11-17 in a second session, on
the same clone and the same throwaway database (not reseeded: the 11-16 rows and the made-up costs
were kept). PERM-01 to PERM-11 are from the first session; PERM-12 to PERM-18 and N-1 from the
second.

### Summary of findings

| ID | Sev | One line |
|---|---|---|
| PERM-01 | P1 | `GET /allocations` with no restaurant returns every site's rows |
| PERM-02 | P1 | Stock rollup shows commissary balances to restaurant-only people, nothing to commi-only people |
| PERM-03 | P1 | Blind counters and logged-out callers read expected stock, deliveries and adjustments from three other reads |
| PERM-04 | P1 (accepted) | Map: 22 site-scoped writes open logged out and to a read-only login |
| PERM-05 | P1 | No write asks a role switch; a counter can delete an opening unlogged, a supervisor can save counts |
| PERM-06 | P1 | Cost leaks: four reads in cost-guard's spec, plus rice price, meal budgets and History that are not; a PUT without `meat_type_id` clears it (run on 11-17) |
| PERM-07 | P0 (known, accepted) | Unsigned `user_id` cookie and pick-any-name login pass every admin gate; the stated reason to wait is stale |
| PERM-08 | P2 | History's "who" is a typed name; edits and deletes record nobody |
| PERM-09 | P2 | Admin by assignment edits roles but not Settings; two definitions of admin |
| PERM-10 | P3 | An admin can switch admin off on the admin role and lock out all admins |
| PERM-11 | P2 | The people import's access changes write no History row |
| PERM-12 | P3 | A query field given twice answers 500 with a stack trace and server folder paths, logged out included (9 of 16 read routes probed); a bad JSON body does the same as a 400 |
| PERM-13 | P2 | ADR-040's "Reopen only if" is met by ADR-070 (Tailscale; the firewall rule is in `main`); neither record names the other |
| PERM-14 | P3 | "super admin" and "super_admin" can be made next to "super-admin"; the name key ignores only capitals and extra spaces |
| PERM-15 | P3 | Kitchen Sales: no token and no money on the normal path (proved with a stub); an upstream error text is relayed to everyone, and a token that crosses its 200-character cut is not redacted |
| PERM-16 | P2 | A Settings change (a cost, a recipe, a site, a meat's type) leaves no History row; scope.md says it does |
| PERM-17 | P2 | `POST /daily-audit/portions` and `POST /stock-receipts` accept another restaurant's dish or meat; the rows are orphans, the other site's numbers do not move |
| PERM-18 | P2 | The reseed and seed:test guards compare path text: `inventory.db.` or `beta.db.` passes and Windows opens the real file; the reseed guard's own example is `beta.db` |
| N-1 | note | `npm audit`: `proxy-addr` (critical; not reached), `body-parser` (high; path reached, not reproduced), `qs` (moderate; parsing reached, not reproduced). `npm audit fix` changes the lockfile only |

### Late cubic findings (the 2026-11-15 A0 block): spot-check

The block sorts 27 late findings. The ones that touch permissions or the data guards were checked
against the code at this commit; the rest were not (see "Not done").

| Finding, and how it was sorted | At `2cb16eed` |
|---|---|
| PR #59, `siteAccess.js` read_only bypass -> ADR-084, in write-permission | As recorded. `isBypass` (`siteAccess.js:42`) still passes a read-only base role at every site, writes included; write-permission is queued and blocked (queue 3zr). It is PERM-04's second map. |
| PR #61, unsigned cookie and pick-any-id login -> sign-the-cookie (3zv), passwords before Live | Queued, blocked on write-permission; still open as recorded. The "a forged cookie gains nothing" sentence it rests on is stale (PERM-07). |
| PR #61, PATCH not in the test matrix -> nothing ("WRITES covers it") | Holds. The test list (`settings.test.js:491-499`) has no PATCH, but the guard is one line on the method set POST, PUT, PATCH, DELETE (`settings.js:15-16`), and a PATCH and a DELETE to `/api/settings/meats/1` answered 401 logged out and 403 for every non-admin (write grid). |
| PR #64, a symlink passes testAccounts' guard -> nothing (a symlink needs admin rights) | The reason holds for a symlink. The same guard is passed by a typo with no link at all: **PERM-18**. |
| PR #64, duplicated `samePath` -> nothing (tidy-up) | The second copy is the one in `dbPath.js` that guards `npm run reseed`; PERM-18 applies to both. |
| PR #47, "already fixed on main": .env check, port before backup, backup copy check, Private-network scope | Present: `restaurant-pc.bat:249-256` (the port first, then the .env check, then the backup with a failure message) and `:489-495` (one rule, the app's port only, callers limited to the local subnet and Tailscale's range). The rollback name was not checked. |

### Checked and found clean (by real requests)

- Site guard with a named site: every read and write, 11 accounts, RA / FC / COM-A (matrices below).
- ADR-074: malformed, repeated, array, padded, hex and decimal ids get 400, logged in or not; path
  case, trailing slash and double slash do not get past the guard; a receipt with no restaurant is
  its commissary's; with no site, admins only.
- ADR-041 owner site: commi ships to RA and FC, a restaurant-only person cannot; conversion
  standards and allocations follow the restaurant. ADR-091: `can_use` and the narrowed lists follow
  memberships and live assignments; an expired or switched-off assignment gives nothing.
- requireAdmin on every `/api/settings` write including staff-meal slots and rice rates, side items,
  presets, standards, `sync-batch-stock`: 401 logged out, 403 for every non-admin, across path, case
  and method-override variants.
- Roles page: all writes 403 for non-admins, 401 logged out; super-admin role and person cannot be
  edited, assigned, removed or re-based; built-in names kept; name key refuses duplicates; bad site,
  bad or past end date, inactive role, unknown switch all refused; removing an inactive role works.
- People import: existing role flags and base roles left alone and reported; super-admin row ignored.
- `router.use`: only two exist (`settings.js:16`, `roles.js:58`), both path-scoped; neither catches
  another router's requests (a logged-out `POST /stock-receipts` still answers 200).
- Side-item cost goes to admins only. Kitchen Sales live with empty tokens: names and quantities
  only, "token not set", no money key.
- Kitchen Sales again on 11-17, with a stub fetch, made-up tokens and real-shaped receipts carrying
  a money sentinel in every money field: names and quantities only; the same bytes for a logged-out
  caller, a counter and an admin; a whole echoed token is redacted; the token is in no URL and not
  on the server console; a malformed `pos` or `date` gets 400. The two edge cases that do leak are
  PERM-15.
- Cross-row, 11-17: a count for another restaurant's meat is refused (`POST /daily-audit`), and no
  route can create the month opening that would let it through. Recount orders, `PATCH /sales`,
  `POST /allocations`, `/allocations/conversion` and commissary shipment lines all refuse another
  restaurant's meat or dish with 400. `PATCH /stock-receipts/:id` cannot move a receipt to another
  restaurant or meat. The two routes that do not check are PERM-17.
- `proxy-addr`: the app sets no `trust proxy` and reads no caller address, so the critical advisory
  is not reached today (N-1).
- A deactivated user's cookie reads as logged out at once.

### Not done

- The late cubic findings that are not about permissions or the data guards: PR #56's (step
  preview-pid) and PR #47's launcher and admin-part items (step restaurant-pc-ii) - both are queued
  steps, not built; PR #47's rollback name and its "other six"; PR #52's three; PR #59's
  status-only 403 tests; PR #64's partial seed and untested `Test ` guard.
- N-1: the `body-parser` and `qs` advisories were tried from their titles only (six and five
  requests). Their texts were not read, so "not reproduced" is not "not affected".
- A lead, not followed through. With `node:sqlite`, an empty object or empty array given as the
  FIRST bound value is taken as a bag of named parameters, so every later value moves one slot to
  the left and the last slot becomes NULL (checked on an in-memory database:
  `prepare('SELECT ? AS first, ? AS second').get({}, 9)` -> `{"first":9,"second":null}`). A JSON
  body can carry `{}` or `[]`. In the routes read for PERM-17, either a guard-checked id is bound
  first, or the shifted lookup finds nothing and the route answers 400 (`PATCH /sales`,
  `POST /allocations`). The commissary writes, the opening-stock routes and the Roles routes were
  not gone through for it. PERM-12's error handler would not cover this; a "must be a number or a
  string" check on body ids would.
- PERM-14's import sentence is by reading. PERM-18's two destructive commands were shown in two
  halves, not run end to end (that would have touched `inventory.db` or `beta.db`).
- PERM-17: whether the Stock Receipts page or the landing can itself send a mismatched pair (a meat
  picked, then the restaurant switched) was not looked at; only the routes were tested.
- Short notes on settled designs: none written.

## Matrices

Write grid (one request per cell; columns: logged out, Test Admin, Management, Head Chef RA, Head
Chef FC, Counter RA, Counter FC, Commi, Floater, No Sites, Supervisor RA):

```
route                                               out    adm   mgmt   hcRA   hcFC   ctRA   ctFC  commi  float nosite  supRA
POST /daily-audit RA                                200    200    200    200    403    200    403    403    200    403    200
POST /daily-audit FC                                200    200    200    403    200    403    200    403    200    403    403
POST /daily-audit/portions RA                       200    200    200    200    403    200    403    403    200    403    200
POST /daily-audit/month-opening RA                  200    200    200    200    403    200    403    403    200    403    200
POST /daily-audit/month-opening/copy-all RA         200    200    200    200    403    200    403    403    200    403    200
PATCH /daily-audit/opening-stock RA                 200    200    200    200    403    200    403    403    200    403    200
POST /daily-audit/recount-orders RA                 403    200    403    200    403    403    403    403    403    403    403
POST /daily-audit/recount-orders/:id/cancel RA      403    200    403    200    403    403    403    403    403    403    403
POST /stock-receipts RA                             200    200    200    200    403    200    403    403    200    403    200
PATCH /stock-receipts/:id (an RA row)               200    200    200    200    403    200    403    403    200    403    200
DELETE /stock-receipts/:id (an RA row)              200    200    200    200    403    200    403    403    200    403    200
PATCH /sales RA                                     200    200    200    200    403    200    403    403    200    403    200
PATCH /sales FC                                     200    200    200    403    200    403    200    403    200    403    403
POST /allocations RA                                200    200    200    200    403    200    403    403    200    403    200
POST /allocations/conversion RA                     200    200    200    200    403    200    403    403    200    403    200
POST /commissary/daily-audit COM-A                  200    200    200    403    403    403    403    200    403    403    403
POST /commissary/month-opening COM-A                200    200    200    403    403    403    403    200    403    403    403
POST /commissary/month-opening/copy-all COM-A       200    200    200    403    403    403    403    200    403    403    403
PATCH /commissary/opening-stock COM-A               200    200    200    403    403    403    403    200    403    403    403
POST /commissary/shipments COM-A -> RA              200    200    200    403    403    403    403    200    403    403    403
POST /commissary/shipments COM-A -> FC              200    200    200    403    403    403    403    200    403    403    403
POST /commissary/yield-log COM-A                    200    200    200    403    403    403    403    200    403    403    403
PATCH /commissary/yield-log/:id                     200    200    200    403    403    403    403    200    403    403    403
DELETE /commissary/yield-log/:id                    200    200    200    403    403    403    403    200    403    403    403
POST /commissary/adjustments COM-A                  200    200    200    403    403    403    403    200    403    403    403
PATCH /commissary/adjustments/:id                   200    200    200    403    403    403    403    200    403    403    403
DELETE /commissary/adjustments/:id                  200    200    200    403    403    403    403    200    403    403    403
POST /commissary/shipment-presets                   401    200    403    403    403    403    403    403    403    403    403
PUT /commissary/shipment-presets/1                  401    200    403    403    403    403    403    403    403    403    403
POST /commissary/conversion-standards               401    400    403    403    403    403    403    403    403    403    403
PUT /commissary/conversion-standards/1              401    200    403    403    403    403    403    403    403    403    403
POST /commands/sync-batch-stock                     401    200    403    403    403    403    403    403    403    403    403
PUT /settings/restaurants/1                         401    200    403    403    403    403    403    403    403    403    403
PUT /settings/commissaries/1                        401    200    403    403    403    403    403    403    403    403    403
PUT /settings/meat-types/999999                     401    200    403    403    403    403    403    403    403    403    403
PUT /settings/commissary-meats/999999               401    200    403    403    403    403    403    403    403    403    403
PUT /settings/meats/999999                          401    200    403    403    403    403    403    403    403    403    403
PUT /settings/dishes/999999                         401    200    403    403    403    403    403    403    403    403    403
POST /settings/recipes (empty body)                 401    400    403    403    403    403    403    403    403    403    403
PUT /settings/recipes/999999                        401    404    403    403    403    403    403    403    403    403    403
DELETE /settings/recipes/999999                     401    200    403    403    403    403    403    403    403    403    403
PUT /settings/adjustment-types/999999               401    200    403    403    403    403    403    403    403    403    403
PUT /settings/locations/999999                      401    200    403    403    403    403    403    403    403    403    403
POST /settings/staff-meal-slots (empty body)        401    400    403    403    403    403    403    403    403    403    403
PUT /settings/staff-meal-slots/999999               401    404    403    403    403    403    403    403    403    403    403
POST /settings/staff-rice-rates (empty body)        401    400    403    403    403    403    403    403    403    403    403
PATCH /settings/meats/1 (no such route)             401    404    403    403    403    403    403    403    403    403    403
DELETE /settings/meats/1 (no such route)            401    404    403    403    403    403    403    403    403    403    403
POST /side-items (empty body)                       401    400    403    403    403    403    403    403    403    403    403
PUT /side-items/999999                              401    404    403    403    403    403    403    403    403    403    403
POST /side-items/999999/units                       401    404    403    403    403    403    403    403    403    403    403
PUT /side-items/999999/units                        401    404    403    403    403    403    403    403    403    403    403
DELETE /side-items/999999/units/x                   401    404    403    403    403    403    403    403    403    403    403
POST /side-item-links                               401    404    403    403    403    403    403    403    403    403    403
PUT /side-item-links                                401    404    403    403    403    403    403    403    403    403    403
POST /roles (empty name)                            401    400    403    403    403    403    403    403    403    403    403
PUT /roles/999999                                   401    404    403    403    403    403    403    403    403    403    403
PUT /roles/999999/capabilities                      401    404    403    403    403    403    403    403    403    403    403
PUT /users/999999/base-role                         401    404    403    403    403    403    403    403    403    403    403
POST /users/999999/roles                            401    400    403    403    403    403    403    403    403    403    403
DELETE /users/999999/roles                          401    400    403    403    403    403    403    403    403    403    403
```

Read grid: every site-named read answered 200 for members, admin, management and logged out, 403 for
everyone else; blind logins got 403 on month-opening and count-history.
