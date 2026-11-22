# Dispatch queue — what to work on next

The ordered list of what's next. This replaces the local-only handoff
file, which lived on one machine and could not travel to a collaborator's
clone.

**Only an architect adds to this queue.** If it is empty, stop and wait.
See `docs/engineer-role.md`.

**`Touches:` lines.** A runnable step lists the files it will change, so
`/start` and the queue runner can skip it while an open PR touches the same
files. The architect adds the line when a step becomes runnable.

**Edge states line (2026-10-22).** Every step spec in `session-status.md` ends with an "Edge
states:" line covering failure, partial, empty, stale, blocked, inactive and two devices
(whichever apply; "none" is an answer). A spec without one is not runnable.

`docs/session-status.md` remains the authoritative description of each
step. This file says *what order* and *which lane* — not what the work
is. Read the step's own section in `session-status.md` before starting.

> **2026-09-15 — read alongside the pivot.** The app is moving to multi-user
> with roles. The decisions are recorded in `session-status.md` -> "Things NOT
> to re-litigate" (2026-09-15 block); fuller reasoning is in the architect-held
> `ARCHITECTURE-HANDOFF-2026-09-15.md` (local / gitignored — ask the architect).
> The steps below are the still-valid CORRECTNESS backbone and mostly stand, but
> **two now carry a reconciliation flag** (25a and 25d-i/iii), and the new
> multi-user surface is listed under "Planned" at the bottom as **NOT yet
> specified.** The launch model is now a phased beta (P0 open -> P1
> identity+roles -> P2 passwords) and the definition-of-done is still owed, so
> the "before soft-launch" tags below are under revision.

---

## Queue

> **Beta week (2026-10-19 -> 2026-10-26).** Beta starts Monday 2026-10-26 on the restaurant's
> Wi-Fi; the completed UI is shown Sunday 2026-10-25. Order this week: **3x ui-pass and 3v
> count-drafts (parallel), then 3y ui-pass-ii, then 3k stub-login (optional)**. Everything else
> at normal pace. See session-status "Beta date + UI pass".

> **2026-10-28 - order for the 11-01 inventory demo.** **3za blind-count first** (it and 3m / 3l
> all touch dailyAudit.js; 3m and 3l wait for it). Any time, in parallel: 3z warn-ink, 3q
> autopilot-preview, 3zb self-host-font, and 3u sheets-tier1 then 3j import-identity (they share
> seed.js). After 3za: 3m site-filter, then 3l user-id-authorship, then 3zc allocation-requests.
> 3zd sheet-close after 3u. 3ze is Naoki's own PR.
> **2026-10-30:** 3zh name-map-refresh first (Likod sales are undercounted until it lands). 3zf loyverse-preview-iv any time, ahead of the rest (it shares no file with
> another runnable step). 3zg lan-address any time too (server only, no shared file).
> **2026-11-01 (A6, roster family):** 3zi business-day any time (no shared file). The rest waits for
> the identity chain: 3za -> 3m -> 3l, then 3zj role-assignments (shares schema.sql with 3zc: one at
> a time) -> 3zk roles-page; 3u and 3j before 3zl. Then in order (shared files): 3zl roster-stations
> -> 3zm roster-staff -> 3zn roster-week -> 3zo roster-day-status -> 3zp tonight-picks -> 3zq
> login-tonight -> 3zr write-permission.
> **2026-11-02 (A0):** issues #53, #54 and #57 answered (see their steps). PR #52 (3u) and PR #56
> (3q) stand as built. 3m site-filter is next in the identity chain. Any time: 3zb self-host-font;
> 3zu settings-guard (one at a time with 3zd, and with 3l if 3l touches settings.js). After 3q:
> 3zt test-accounts. After 3l: 3zs site-filter-ii (one at a time with 3zc: allocations.js).
> **2026-11-12 (A10 + triage):** issues #60 and #62 answered (see their steps): PR #59 (3m)
> changes to match; PR #61 (3zu) stands as built. Runnable now: 3zt, 3j, and table-scroll (markup
> only, any time; one at a time with other PRs on its pages). 3zs also waits for 3zu now
> (requireAdmin). 3zv sign-the-cookie after 3zr. Staff meals: 3zw staff-meal-settings after 3zu
> (schema.sql: one schema step at a time), 3zx staff-meal-log after 3zw and 3zj, then 3zy
> staff-meal-check, then 3zz staff-meal-view.
> **2026-11-14 (A0, A8, A9 part 1):** new steps are named, not numbered (ADR-061). Runnable now:
> busy-timeout and loyverse-fc (no file shared with an open PR). PR #65 (3j) first; side-items
> needs it and PR #61 (3zu); side-sheets needs side-items and PR #59 (3m). cost-guard after 3zj
> role-assignments. 3ze (#47): Naoki commits the architect-provided file (Tailscale range, FC
> token) before merging. The rest of A8 and A9 is under "Planned - sides and supply".
> **2026-11-14 (later):** PR #47 (3ze) merged. Order now: #61 (3zu), #65 (3j), #59 (3m), then
> busy-timeout, loyverse-fc, #63 (3zb), table-scroll, 3zw staff-meal-settings, side-items, 3l
> user-id-authorship, side-sheets. Tag beta-2 after #61, #65 and #59 merge (smoke list first,
> ADR-039).
> **2026-11-14 (after #59):** PRs #61, #65, #59 merged; beta-2 is due (smoke list first). Order:
> busy-timeout; 3l user-id-authorship; 3zj role-assignments; loyverse-fc, #63 (3zb) and
> table-scroll together when Naoki can phone-check; 3zw staff-meal-settings; side-items; then
> cost-guard, 3zx staff-meal-log, side-sheets, 3zs, 3zk, 3zd. Schema steps one at a time.
> **2026-11-15 (A0):** PRs #76 (3l) and #78 (3zj) merged. Tag beta-2 now (smoke list first).
> Runnable: Marble 3zw staff-meal-settings and 3zs site-filter-ii; Naoki import-settings-env and
> preview-pid (no file shared with those). 3zk roles-page after import-settings-env (both change
> scripts/import-settings.js, ADR-082). 3zr write-permission gains the read-only refusal
> (ADR-084).
> **2026-11-15 (A8 part 2):** ADR-085 to ADR-090. side-waste, bar-links, bar-check, bar-shorts and
> roster-board are planned (see "Planned - sides and supply"), specced as side-sheets and
> roster-day-status land.
> **2026-11-15 (commissary and POs):** ADR-092, ADR-093. supply-tags specced (Queue -> Supply; after
> 3zw and cost-guard). meat-request and no-popups planned.
> **2026-11-15 (A0 #84, FC map, beta-3):** ADR-094, ADR-095. Naoki: PR #83 (3zk) changes to match
> ADR-095, then its phone check; landing-sales (runnable: no file shared with an open PR);
> restaurant-pc-ii; preview-pid. Tag beta-3 once #83, landing-sales and restaurant-pc-ii are merged
> and the smoke list passes; the restaurant PC installs fresh then (nothing is installed there
> yet). Marble: 3zw staff-meal-settings as planned. **On hold:** 3zl to 3zo (shift rows, two
> placements a day, breaks, Fill: the next drop-in).
> **2026-11-16 (roster, ADR-096, ADR-097; A5):** the roster holds are lifted. Builders, roster first:
> 3zi business-day (runnable, no shared file) any time; then 3zl roster-stations -> 3zm roster-staff
> -> 3zn roster-week (also needs 3zi) -> 3zo roster-day-status -> roster-fill -> 3zp tonight-picks.
> One schema step at a time (3zl, 3zm and 3zn each change schema.sql). cost-guard, side-sheets
> and supply-tags wait until roster-fill. Naoki: landing-sales, restaurant-pc-ii (now with
> auto-start at boot), preview-pid; beta-3 after them.
> **2026-11-17 (Fable fixes; ADR-098 to ADR-105) - Order now. This note replaces the order in the
> notes above.** Nothing was built overnight; business-day had closed on 11-02 (PR #55). The Fable
> P0/P1 fixes go ahead of the roster; session-status' 2026-11-17 block places every finding.
> **Before beta-3.** Marble: stale-saves (runnable) -> sign-the-cookie (widened, ADR-098) ->
> roles-guard -> save-safety -> cost-guard (widened, ADR-100). Naoki: preview-pid -> landing-sales
> -> npm-audit -> db-start -> backup-restore -> restaurant-pc-ii (respecced). Each spec lands one
> step ahead of its build (see "Planned - Fable fixes"). Tag beta-3 when all of these are merged and
> the smoke list passes.
> **After beta-3.** Marble: roster-stations -> roster-staff -> roster-week -> roster-day-status ->
> roster-fill -> tonight-picks (each spec's 2026-11-17 block first). Naoki: stock-math ->
> settings-safety. blind-reads and write-switches in whichever lane is free (no file shared with
> the roster steps). The P2 Fable steps go between roster steps. Parked until after roster-fill:
> allocation-requests, sheet-close, staff-meal-log to staff-meal-view, side-sheets, supply-tags.
> One schema step at a time (db-start adds indexes to schema.sql).
> **2026-11-18:** npm-audit and db-start are runnable now: the overnight runner (scripts/run-queue.ps1,
> started on Naoki's laptop) may build them, after stale-saves and before preview-pid and
> landing-sales (no shared files). Naoki reviews and merges.
> **2026-11-22 (Marble is offline today) - Order now for the beta-3 lane.** Naoki builds it all
> himself, in this order: stale-saves -> sign-the-cookie -> landing-sales -> backup-restore ->
> restaurant-pc-ii (respecced) -> roles-guard -> save-safety -> cost-guard (widened) ->
> preview-pid. What the restaurant PC's first install needs comes first. PR #87 (db-start) merges
> as built; PR #85 (npm-audit) gets one more audit pass (ADR-106), then merges; issue #86 is
> answered. The specs for backup-restore, restaurant-pc-ii, roles-guard, save-safety and
> cost-guard's block land in today's drop-ins, each before its build. Marble picks up wherever the
> lane stands when he is back.

#### Fable fixes (2026-11-17)

### Step stale-saves - a row nobody touched never saves  [runnable]
Touches: server/engines/blindCount.js, server/engines/blindCount.test.js, server/routes/dailyAudit.js, server/routes/dailyAudit.test.js, server/routes/commissary.js, server/routes/commissary.test.js, server/routes/commands.test.js, public/daily-audit.html, public/commissary.html
ADR-104 (Fable I-01 = F2 = U-01, U-04, I-02 = U-03): a phone's Save no longer puts back numbers its
person never typed - landing counts, portions and prepped, and the commissary count, which also
keeps and shows its notes. No schema change. PUBLIC -> click-through. Full spec:
session-status.md -> "Step stale-saves".

### Step npm-audit - npm audit fix, lockfile only  [runnable]
**CLOSED 2026-11-22, PR #85 (`cd7054c`).**
Touches: package-lock.json
Fable N-1: three advisories under express (proxy-addr, body-parser, qs); `npm audit fix` changes the
lockfile only. Server-only. Full spec: session-status.md -> "Step npm-audit".
**2026-11-18:** runnable for the overnight runner; Naoki reviews and merges.
**2026-11-22 (ADR-106, issue #86):** PR #85 gets one more `npm audit fix` pass (express 4.22.2 ->
4.22.3, lockfile only), then it is ready to merge. See the spec's 2026-11-22 block.

### Step db-start - the database at start: indexes, the right file, safer guards  [runnable]
**CLOSED 2026-11-22, PR #87 (`8a74e8a`).**
Touches: server/db/schema.sql, server/db/dbPath.js, server/db/testAccounts.js, server/db/connection.js, server/db/seed.js, scripts/seed-test-accounts.js, server/index.js, server/db/reseed.test.js, server/db/testAccounts.test.js, server/db/connection.test.js
ADR-105, Fable F1, F10, PERM-18, I-15: five indexes (the first thing to slow down), DB_PATH read from
the repo root and a missing file refused, both seed guards check the real file and reseed refuses
beta.db, sheet definitions at start, a schema version. Schema step (indexes). Server-only. Full
spec: session-status.md -> "Step db-start".
**2026-11-18:** runnable for the overnight runner; Naoki reviews and merges.

### 0. Step archive-pass — CLOSED 2026-09-03, PR #2.

### 1. Step 25d-ii — CLOSED 2026-09-22, PR #5 (`6c21238`).

### 2. Step 26a — CLOSED 2026-09-23, PR #7 (`c8fb7e0`).

### 2b. Step 26a-ii — CLOSED 2026-09-24, PR #8 (`769a110`).

### 2c. Step 26a-iii — CLOSED 2026-09-25, PR #9 (`de82714`).

### 2d. Step ui-viewport — CLOSED 2026-09-25, PR #10 (`4d92634`).

### 3a. Step daily-audit-mobile — CLOSED 2026-09-28, PR #14 (`c3c9575`).

### 3b. Step reseed-beta-db — CLOSED 2026-09-28, PR #15 (`9786dad`).

### 3c. Step 24d-i — CLOSED 2026-09-28, PR #20 (`17cad2c`).

### 3d. Step nav-mobile — CLOSED 2026-09-28, PR #17 (`39dfcc6`).

### 3e. Step 24d-ii — CLOSED 2026-09-28, PR #21 (`546386d`).

### 3f. Step 24d-iii — CLOSED 2026-10-13, PR #23 (`f20aefd`).

### 3g. Step archive-pass-2 — CLOSED 2026-09-28, PR #18 (`971bf9c`).

### 3h. Step users-roles — CLOSED 2026-10-13, PR #24 (`74ea2ba`).

### 3i. Step user-sites - membership table + site resolver  [runnable]
**CLOSED 2026-10-26, PR #35 (`9a88add`).**
Touches: server/db/schema.sql, server/db/siteAccess.js
Membership model B (site_code text) + a resolver (getUserSiteCodes / userHasSite /
resolveSiteCode). Data layer only, NO enforcement yet. Depends on users-roles (users table);
overlaps schema.sql with 24d-i + users-roles -> sequence. Server-only, no click-through. Full
spec: session-status.md -> "Step user-sites".

### 3j. Step import-identity - import-settings.js identity slice (Roles/Users/memberships)  [runnable: after 3u, shares seed.js]
**CLOSED 2026-11-14, PR #65 (`19e285e`).**
Touches: scripts/import-settings.js, server/db/seed.js, package.json
**2026-10-13:** + the seed.js bootstrap guard (one super-admin). Shares seed.js with 3u -> sequence.
Standalone importer (decision A), identity tabs only, UPSERT/idempotent, uses siteAccess.js to
validate memberships. Depends on users-roles + user-sites. DECIDED 2026-09-28: reader = B (CSV, zero-dep) behind a loadTab() adapter; PLUS an export mode (dump the DB to the template shape) so it round-trips export->edit->import. Server/scripts only, no
click-through. Full spec: session-status.md -> "Step import-identity".
**2026-11-14 (issue #67, ADR-073):** a role name matching two existing roles by the key is
skipped and reported; PR #65 is complete as built on that point. `/naoki-qs 65` merges it.
**2026-11-12 (issue #66, ADR-047):** a duplicated name imports no row; names compare ignoring
capitals and extra spaces; site_memberships is the person's full list (removals too). See the
spec's 2026-11-12 decision block. PR #65 resumes (`/naoki-qs 65`).

### 3k. Step stub-login - pick-your-name login + currentUser middleware  [runnable]
**CLOSED 2026-10-25, PR #33 (`ee0801f`).**
Touches: public/login.html, server/routes/auth.js, server/index.js
Phase-1 identity, no passwords: pick-your-name -> cookie -> req.user with capability flags. No
enforcement yet. LEAN: plain cookie, no new dep (flag). Needs users present (import-identity or a
dev seed). PUBLIC -> click-through. Full spec: session-status.md -> "Step stub-login".

### 3l. Step user-id-authorship - new writes carry user_id  [blocked: blind-count, then site-filter]
**CLOSED 2026-11-14, PR #76 (`2e52542`).**
Touches: server/db/schema.sql, server/db/migrate.js, server/db/connection.js, write routes
**2026-11-14:** issue #77 answered (ADR-080): last saver credited, name in the old field, corrector credited; PR #76 complete as built (+ history.html, click-through).
Add created_by_user_id (FK users) to the ~10 created_by tables; stamp it from req.user on new
writes; legacy created_by retired at wipe, no backfill. Invasive (many routes), one pass. Big
migration -> sequences with other schema/migration steps. Full spec: session-status.md ->
"Step user-id-authorship".

### 3m. Step site-filter - query-layer site scoping enforcement  [blocked: blind-count]
**CLOSED 2026-11-14, PR #59 (`8f0fd61`).**
Touches: server/middleware/requireSiteAccess.js, site-scoped routes, server/index.js, server/db/siteAccess.js
**2026-11-01:** goes through one canUseSite() helper (A6) - see the spec's added note.
**2026-11-11:** issue #60 answered: meat ids and body rows are checked; /stock-receipts/meats leaves the guard (ADR-043). See the spec.
**2026-11-14:** issue #68 answered (ADR-074): malformed ids get 400; a receipt with no restaurant is its commissary's. See the spec.
requireSiteAccess middleware: checker scoped to memberships (siteAccess.js), management/admin/
super-admin bypass; one middleware, never a per-query WHERE. Enumerate scoped routes; park
ambiguous ones. Full spec: session-status.md -> "Step site-filter".

### 3n. Step autopilot-runner — CLOSED 2026-10-13, PR #25 (`1cf1c2a`).

### 3o. Step architect-docs-pickup — CLOSED 2026-10-13, PR #26 (`eac8789`).

### 3p. Step autopilot-doorbell - start a run from the phone  [blocked: autopilot-hardening]
**CLOSED 2026-10-26, PR #45 (`2c241b1`).**
Touches: scripts/doorbell.ps1 (new)
A 15-minute poll: a `run-now` label or a new `architect-docs` issue (naokicodes only) starts a
1-step run. Calls no Claude itself. Needs 3n's lock, -Trigger and pause switch. Full spec:
session-status.md -> "Step autopilot-doorbell".

### 3q. Step autopilot-preview - serve a PR on port 3100 for phone click-throughs  [runnable]
**CLOSED 2026-11-11, PR #56 (`fd061a1`).**
Touches: scripts/preview.ps1 (new), scripts/doorbell.ps1
A `preview` label on a PR serves that PR's code from a separate worktree on port 3100 with a
reseeded throwaway DB, reachable over Tailscale. Never port 3000, never the live DB. Full
spec: session-status.md -> "Step autopilot-preview".

### 3r. Step loyverse-preview-i - Loyverse sales preview: engine + route, writes nothing  [runnable]
**CLOSED 2026-10-21, PR #28 (`4592207`).**
Touches: server/engines/loyversePreview.js, server/engines/loyversePreview.test.js, server/routes/loyverse.js, server/routes/loyverse.test.js, server/index.js, .env.example
Read-only dry run of the Loyverse port (decided 2026-10-03, 1b + 2a): both accounts, one business
date, per-dish Silingan / Likod / total + unmatched. Writes nothing, no migration. Tokens via .env
(gitignored, loaded by server/index.js). Server-only, no click-through. Parallel-safe with
users-roles, 24d-iii and autopilot 3n-3q. Full spec: session-status.md -> "Step loyverse-preview-i".
**2026-10-13:** #27 decided (Reading B - see the spec); PR #28 sent back (request changes) to implement it.

### 3s. Step loyverse-preview-ii - Kitchen Sales page (temporary)  [blocked: loyverse-preview-i]
**CLOSED 2026-10-25, PR #37 (`54a28ec`).**
Touches: public/kitchen-sales.html, public/index.html, public/style.css
Dish | Likod | Silingan | Total, an unmatched list, Copy as text with a LAN-safe fallback; a
failed account shows "-", never 0. Linked from Home only. Overlaps 24d-iii on style.css ->
sequence. PUBLIC -> click-through before merge. Full spec: session-status.md -> "Step
loyverse-preview-ii".

### 3t. Step loyverse-preview-iii - wildcard-match report (terminal, you-only)  [blocked: loyverse-preview-i]
**CLOSED 2026-10-24, PR #39 (`2820773`).**
Touches: server/engines/loyverseReport.js, server/engines/loyverseReport.test.js, scripts/loyverse-matches.js, package.json
`npm run loyverse:matches -- --date YYYY-MM-DD`: lists every wildcard pattern's catches (raw
Loyverse names + quantities), unmatched items and account status, by calling the SAME engine as
the route. Writes nothing. Not in the UI. Parallel-safe with loyverse-preview-ii. Full spec:
session-status.md -> "Step loyverse-preview-iii".

### 3u. Step sheets-tier1 - sheet definitions: which sheets each site has (tier 1)  [runnable]
**CLOSED 2026-11-11, PR #52 (`52e9290`).**
Touches: server/db/schema.sql, server/db/seed.js, server/engines/sheetDefinitions.js, server/engines/sheetDefinitions.test.js
First Sheets slice: the sheet_definitions table (site_code, category, engine_type MEAT|SIDE,
active) + a validating module + a seed of one Landing per restaurant and one Commi per
commissary. Config only - no dated instances, owner, finalization, routes or UI. Server-only, no
click-through, no migration. Shares schema.sql + seed.js with 3h/3i -> sequenced after them.
Full spec: session-status.md -> "Step sheets-tier1".

### 3v. Step count-drafts - keep unsaved count entries on the phone  [runnable]
**CLOSED 2026-10-24, PR #31 (`7617088`).**
Touches: public/draft-store.js, public/daily-audit.html, public/month-opening.js
Unsaved count entries on the daily audit (and the month-opening panel) are kept in localStorage
per page + site + date, restored with an "unsaved" tag and a Discard button after a refresh,
and cleared only after Save succeeds. Never auto-submits; server untouched. PUBLIC ->
click-through before merge. Full spec: session-status.md -> "Step count-drafts".

### 3w. Step autopilot-hardening - lock, public log lines, review gates, docs-pickup cleanup  [runnable]
**CLOSED 2026-10-24, PR #40 (`86ba732`).**
Touches: scripts/run-queue.ps1, .claude/commands/review-draft.md, .claude/commands/review.md, .claude/commands/run-step.md
Decided 2026-10-13 (review of #25/#26): a lock two runners can never both win, public run-log
lines without model free text, no merge recommendation on red verify, a click-through must
postdate the last public/ commit, docs-pickup --limit 100 + verify-fail cleanup. Inert until
install. Blocks 3p. No app code, no click-through. Full spec: session-status.md -> "Step
autopilot-hardening".

### 3x. Step ui-pass - restyle the existing pages to the mockup look (style.css only)  [runnable]
**CLOSED 2026-10-21, PR #29 (`e5dc987`).**
Touches: public/style.css
Presentation only: the 2026-09-28 mockup tokens (ui-conventions "Look"), Archivo with a
system-font fallback, quiet buttons with one accent action, tables/inputs/cards/status restyled.
No HTML/JS change, no dependency, light only. PUBLIC -> click-through at 390px and desktop.
Sequence with 3s (style.css). Full spec: session-status.md -> "Step ui-pass".

### 3y. Step ui-pass-ii - page colors onto the Look tokens  [blocked: ui-pass, count-drafts]
**CLOSED 2026-10-26, PR #43 (`1d1b39e`).**
Touches: public/allocations.html, public/commissary-shipments.html, public/commissary.html, public/daily-audit.html, public/dashboard.html, public/history.html, public/sales.html, public/settings.html, public/stock-receipts.html, public/terminal.html
Colors only: each page's own <style> block and style= attributes move from hard-coded colors to
the Look tokens, by meaning. No layout, markup or JS change. PUBLIC -> click-through. Full spec:
session-status.md -> "Step ui-pass-ii".

### 3z. Step warn-ink - darker warn text on the warn tint  [runnable]
**CLOSED 2026-11-02, PR #58 (`d9fc0fc`).**
Touches: public/style.css
Adds --warn-ink (#94570A) for text on --warn-tint so small warn badges reach 4.5:1. Colors only,
style.css only. PUBLIC -> click-through. Full spec: session-status.md -> "Step warn-ink".

### 3za. Step blind-count - meat counters count blind; quiet recount  [runnable]
**CLOSED 2026-11-01, PR #51 (`d4d4245`).**
Touches: server/db/schema.sql, server/engines/blindCount.js, server/engines/blindCount.test.js, server/routes/dailyAudit.js, public/daily-audit.html
The 11-01 demo item. Counters see endings + remarks only (server strips the numbers); head chef
orders recounts; every save kept in count_entries. PUBLIC -> click-through. Full spec:
session-status.md -> "Step blind-count".
**2026-11-01:** isBlind(user, siteCode) and canOrderRecount(user, siteCode) - see the spec's added note.

### 3zb. Step self-host-font - serve Archivo from the app  [runnable]
**CLOSED 2026-11-14, PR #63 (`8ed243e`).**
Touches: public/style.css, public/fonts/
Pages stop waiting on Google Fonts over the restaurant Wi-Fi. PUBLIC -> click-through. Full spec:
session-status.md -> "Step self-host-font".

### 3zc. Step allocation-requests - counters ask, the head chef confirms  [parked: after roster-fill (2026-11-17 note)]
Touches: server/db/schema.sql, server/engines/allocationRequests.js, server/engines/allocationRequests.test.js, server/routes/allocations.js, public/daily-audit.html
PUBLIC -> click-through. Full spec: session-status.md -> "Step allocation-requests".

### 3zd. Step sheet-close - admins close a sheet  [parked: after roster-fill (2026-11-17 note)]
Touches: server/engines/sheetDefinitions.js, server/engines/sheetDefinitions.test.js, server/routes/settings.js, public/settings.html, server/index.js
PUBLIC -> click-through. Full spec: session-status.md -> "Step sheet-close".

### 3ze. Step restaurant-pc - the restaurant PC script, with an update mode  [Naoki's own PR]
**CLOSED 2026-11-14, PR #47 (`310e033`).**
Touches: scripts/restaurant-pc.bat, .gitattributes
Not for /naoki-qs: Naoki opens it with the architect-provided file. Full spec: session-status.md
-> "Step restaurant-pc".
**2026-11-11:** PR #47's review fixes (DB_PATH check, port before backup, errorlevel, PREV, firewall, no hard-coded tag, 14 backups) - see the spec.
**2026-11-14 (ADR-070, ADR-066):** before merge, the firewall rule also admits Tailscale
(100.64.0.0/10, private and public profiles) and setup asks for the FC Loyverse token (once, on a
rerun, if `.env` has no FC line). Naoki commits the architect-provided file on PR #47's branch.

### 3zf. Step loyverse-preview-iv - Kitchen Sales: 8am day, last kitchen receipt, date bar  [runnable]
**CLOSED 2026-10-30, PR #48 (`5852d65`).**
Touches: server/engines/loyversePreview.js, server/engines/loyversePreview.test.js, server/routes/loyverse.js, server/routes/loyverse.test.js, scripts/loyverse-matches.js, public/kitchen-sales.html
The kitchen reads its own sales: the sales day turns at 8am (ADR-033), a "Last kitchen receipt"
time per account, a Loyverse-style date bar (< date >, tap for a picker) and a Sync button.
Read-only, no money. PUBLIC -> click-through. Full spec: session-status.md -> "Step
loyverse-preview-iv".

### 3zg. Step lan-address - the server prints the address phones use  [runnable]
**CLOSED 2026-10-30, PR #49 (`b5a8f5d`).**
Touches: server/index.js, server/lanAddress.js, server/lanAddress.test.js
npm run dev prints the phone address (http://<PC IP>:3000) next to localhost. Server only, no
click-through. Full spec: session-status.md -> "Step lan-address".

### 3zh. Step name-map-refresh - the Loyverse name map catches up with the Sheet  [runnable]
**CLOSED 2026-10-30, PR #50 (`60bdc8b`).**
Touches: server/db/loyverse-name-map.json, docs/loyverse-name-map-2026-10-30.json, server/engines/loyversePreview.js, server/engines/loyversePreview.test.js, public/kitchen-sales.html
Copies the Sheet's 43-dish map into the app, lets one cell hold "old | new" names, and collapses
the Unmatched list. PUBLIC -> click-through. Full spec: session-status.md -> "Step
name-map-refresh".

### 3zi. Step business-day - one 8am business date for the whole app  [runnable]
**CLOSED 2026-11-02, PR #55 (`cd50d51`).**
Touches: server/businessDay.js, server/businessDay.test.js, server/engines/loyversePreview.js
Moves the 8am businessDate (ADR-036) out of the Loyverse engine into a shared module, plus
mondayOf(). No behaviour change. Server-only, no click-through. Full spec: session-status.md ->
"Step business-day".

### 3zj. Step role-assignments - roles per site, role switches, the supervisor role  [blocked: blind-count, site-filter, user-id-authorship]
**CLOSED 2026-11-15, PR #78 (`a9117fa`).**
Touches: server/db/schema.sql, server/db/permissions.js, server/db/permissions.test.js, server/db/siteAccess.js, server/engines/blindCount.js, server/routes/auth.js, server/db/seed.js, server/db/testAccounts.js, server/index.js
ADR-034 / ADR-038: a base role plus role assignments at a site (or all), switches as rows, one
can(); blind = no "sees expected" switch at that site; the supervisor role. Login unchanged.
Server-only, no click-through. Full spec: session-status.md -> "Step role-assignments".
**2026-11-12:** + ensureRoleDefaults() at server start, because beta.db is never reseeded - see the spec.

### 3zk. Step roles-page - switches per role, roles per person  [blocked: role-assignments, import-settings-env]
**CLOSED 2026-11-16, PR #83 (`26b0522`).**
Touches: public/roles.html, public/index.html, server/routes/roles.js, server/routes/roles.test.js, server/index.js, server/db/permissions.js, scripts/import-settings.js, server/db/importSettings.test.js
The first cut of the Discord-style screen. PUBLIC -> click-through. Full spec: session-status.md ->
"Step roles-page".
**2026-11-14 (ADR-073):** create and rename refuse a name another role holds by the name key.
**2026-11-15 (ADR-082, ADR-083):** built-in roles keep their names; the import stops changing an existing role's switches or person's base role and lists what it left alone. After import-settings-env (same file). See the spec.
**2026-11-15 (#84, ADR-095):** the four switch lines stay; Remove works on an inactive role's assignment; Add role copies checker by default. PR #83 changes to match. See the spec.

### 3zl. Step roster-stations - stations as roster rows and the sheets they open  [blocked: beta-3, then its 2026-11-17 block]
**2026-11-16 (ADR-096):** hold lifted. Shift rows (name, kind, minimum) per station, a Shifts import tab. See the spec's decision block.
Touches: server/db/schema.sql, server/engines/stations.js, server/engines/stations.test.js, server/routes/staff.js, server/routes/staff.test.js, server/index.js, scripts/import-settings.js, public/staff.html, public/index.html
Stations per site (data, never seeded), a kitchen flag, links to sheets (also at another site), a
Stations import tab and the Staff page's Stations section. PUBLIC -> click-through. Full spec:
session-status.md -> "Step roster-stations".

### 3zm. Step roster-staff - main station, sub-stations, standing access, login link  [blocked: roster-stations]
**2026-11-16 (ADR-096):** hold lifted. Usual break and "also works". See the spec's decision block.
Touches: server/db/schema.sql, server/engines/staff.js, server/engines/staff.test.js, server/routes/staff.js, server/routes/staff.test.js, scripts/import-settings.js, public/staff.html
PUBLIC -> click-through. Full spec: session-status.md -> "Step roster-staff".

### 3zn. Step roster-week - placements, rest days, copy last week  [blocked: roster-staff, business-day]
**2026-11-16 (ADR-096):** hold lifted. Two placements a day, shift rows, breaks, Start the week (day offs only), "Add person", the paper-like week view. See the spec's decision block.
Touches: server/db/schema.sql, server/engines/roster.js, server/engines/roster.test.js, server/routes/roster.js, server/routes/roster.test.js, server/index.js, public/roster.html, public/index.html
PUBLIC -> click-through. Full spec: session-status.md -> "Step roster-week".

### 3zo. Step roster-day-status - leave, sick, absent, floater, covering; totals and head count  [blocked: roster-week]
**2026-11-16 (ADR-096):** hold lifted. Leave as from-to dates; a person counts once. See the spec's decision block.
Touches: server/engines/roster.js, server/engines/roster.test.js, server/routes/roster.js, server/routes/roster.test.js, public/roster.html
Provides the staff-meal head-count prefill (A10 uses it). PUBLIC -> click-through. Full spec:
session-status.md -> "Step roster-day-status".

### Step roster-fill - Fill places the week  [blocked: roster-day-status]
Touches: server/engines/roster.js, server/engines/roster.test.js, server/routes/roster.js, server/routes/roster.test.js, public/roster.html
ADR-096: places everyone not off by main station and shift (closers never open the next day),
minimums first, covers from sub-stations, shorts in red, Undo Fill. Before tonight-picks (same
files). PUBLIC -> click-through. Full spec: session-status.md -> "Step roster-fill".

### 3zp. Step tonight-picks - tonight's kitchen counter and other picks  [blocked: roster-fill]
Touches: server/db/schema.sql, server/engines/tonightPicks.js, server/engines/tonightPicks.test.js, server/routes/roster.js, server/routes/roster.test.js, public/roster.html
PUBLIC -> click-through. Full spec: session-status.md -> "Step tonight-picks".

### 3zq. Step login-tonight - the login list from tonight's roster; "your work tonight"  [blocked: tonight-picks]
Touches: server/engines/tonightWork.js, server/engines/tonightWork.test.js, server/routes/auth.js, server/routes/auth.test.js, server/routes/roster.js, public/login.html, public/index.html
PUBLIC -> click-through. Full spec: session-status.md -> "Step login-tonight".

### 3zr. Step write-permission - only tonight's people write  [blocked: login-tonight]
Touches: server/db/siteAccess.js, server/engines/tonightWork.js, server/engines/tonightWork.test.js, server/middleware/requireSiteAccess.js, server/routes/dailyAudit.js, server/routes/dailyAudit.test.js, server/routes/commissary.js, server/routes/commissary.test.js, the site-scoped route tests, server/index.js, server/middleware/refuseReadOnly.js, server/middleware/refuseReadOnly.test.js
ADR-011 enforced on the meat landing counts and the commissary writes; canUseSite widened. Click-
through of the refusal message. Full spec: session-status.md -> "Step write-permission".
**2026-11-15 (ADR-084):** + a read-only login is refused every write (cubic on PR #59). See the spec.
**2026-11-17 (ADR-102):** the read-only refusal and the per-write switches move forward to step
write-switches (Planned - Fable fixes); this step keeps "only tonight's people write", and also
guards the side-sheet save (C-11).

### 3zs. Step site-filter-ii - two-site requests and lists across sites  [blocked: site-filter, user-id-authorship]
**CLOSED 2026-11-15, PR #80 (`8a2d8fd`).**
Touches: server/middleware/requireSiteAccess.js, server/db/siteAccess.js, server/routes/commissary.js, server/routes/allocations.js, server/routes/dailyAudit.js, server/routes/dashboard.js, server/routes/commands.js, server/routes/commissary.test.js, server/routes/allocations.test.js, server/routes/dailyAudit.test.js, server/routes/dashboard.test.js, server/routes/commands.test.js, server/routes/stockReceipts.js, server/routes/stockReceipts.test.js
ADR-041: each two-site request checks its owner site only; the picker and the rollup trim to the
user's sites; admin commands need a bypass role. Server-only, no click-through. Full spec:
session-status.md -> "Step site-filter-ii".
**2026-11-15 (issue #81, ADR-091):** the restaurant list stays whole with `can_use` per row; "your sites" follow the site guard (role assignments too); History unchanged. See the spec.
**2026-11-11:** + lists with no site id narrow to the user's sites; saving presets and conversion standards needs an admin (issues #60, #62). Also after 3zu (requireAdmin). See the spec.

### 3zt. Step test-accounts - fake tester accounts for previews and dev databases  [blocked: autopilot-preview]
**CLOSED 2026-11-12, PR #64 (`5e50ddd`).**
Touches: server/db/testAccounts.js, server/db/testAccounts.test.js, scripts/seed-test-accounts.js, package.json, scripts/preview.ps1
ADR-039: `npm run seed:test` makes the "Test ..." accounts; refuses inventory.db and beta.db;
previews run it after the reseed. Server and scripts only, no click-through. Full spec:
session-status.md -> "Step test-accounts".

### 3zu. Step settings-guard - Settings changes need an admin  [runnable]
**CLOSED 2026-11-14, PR #61 (`a7a420f`).**
Touches: server/middleware/requireAdmin.js, server/routes/settings.js, server/routes/settings.test.js
ADR-042: every Settings change needs a logged-in admin; reads stay open. Server-only. Full spec:
session-status.md -> "Step settings-guard".
**2026-11-11:** issue #62 answered (Reading B): PR #61 is complete as built.

### Step table-scroll - wide tables scroll inside their own box on a phone  [runnable]
**CLOSED 2026-11-14, PR #69 (`6e98a93`).**
Touches: public/allocations.html, public/commissary-shipments.html, public/commissary.html, public/dashboard.html, public/history.html, public/sales.html, public/settings.html, public/stock-receipts.html
Issue #30. Markup only: every table not yet inside `.table-scroll` gets the wrapper (daily-audit's
sheet excluded: cards). No style change. PUBLIC -> click-through. Full spec: session-status.md ->
"Step table-scroll".
**2026-11-14:** issue #70 answered (ADR-077): PR #69 merges as built; Settings' tab row is settings-tabs.

### Step settings-tabs - the Settings tab row scrolls in its own strip  [blocked: table-scroll]
**CLOSED 2026-11-14, PR #75 (`2440655`).**
Touches: public/settings.html
Issue #70 (ADR-077): `.tabs` becomes one row that swipes sideways; the page stays still. Style
only, page-local. PUBLIC -> click-through. Full spec: session-status.md -> "Step settings-tabs".

### 3zv. Step sign-the-cookie - the login cookie carries a signature  [blocked: stale-saves]
Touches: server/routes/auth.js, server/routes/auth.test.js, .env.example, public/login.html
cubic's P1 on PR #61: an HMAC on the user_id cookie (node:crypto, COOKIE_SECRET in .env, no
dependency). Server-only, no click-through. Full spec: session-status.md -> "Step sign-the-cookie".
**2026-11-17 (ADR-098):** runs now, after stale-saves; + one shared admin password (ADMIN_PASSWORD in
.env) for accounts whose base role has admin, and whole-number ids only. PUBLIC -> click-through
(the login page). See the spec's 2026-11-17 block.

### 3zw. Step staff-meal-settings - meal slots, budgets and rice rates in Settings  [blocked: settings-guard]
**CLOSED 2026-11-16, PR #82 (`f49e5f4`).**
Touches: server/db/schema.sql, server/db/seed.js, server/engines/staffMealSettings.js, server/engines/staffMealSettings.test.js, server/routes/settings.js, server/routes/settings.test.js, public/settings.html
ADR-027, ADR-044: slots per restaurant with a fixed budget and/or a per-head rate; dated rice
rates. Admin-only writes. PUBLIC -> click-through. Full spec: session-status.md -> "Step
staff-meal-settings".

### 3zx. Step staff-meal-log - the Staff meals page: log today's meals  [parked: after roster-fill (2026-11-17 note)]
Touches: server/db/schema.sql, server/db/permissions.js, server/db/permissions.test.js, server/engines/staffMeals.js, server/engines/staffMeals.test.js, server/routes/staffMeals.js, server/routes/staffMeals.test.js, server/index.js, public/staff-meals.html, public/index.html
ADR-045, ADR-046: one meal per site, day and slot; any cook logs; meat posts through allocations;
typed non-meat lines. PUBLIC -> click-through. Full spec: session-status.md -> "Step
staff-meal-log".

### 3zy. Step staff-meal-check - check, extra meals, late logs, copy a past meal  [blocked: staff-meal-log]
Touches: server/engines/staffMeals.js, server/engines/staffMeals.test.js, server/routes/staffMeals.js, server/routes/staffMeals.test.js, public/staff-meals.html
ADR-045: the head chef checks, never approves; extra meals; 3 days back; copy scaled by head
count. PUBLIC -> click-through. Full spec: session-status.md -> "Step staff-meal-check".

### 3zz. Step staff-meal-view - management's view: budget, spent, rice, unchecked  [blocked: staff-meal-check]
Touches: server/engines/staffMealReport.js, server/engines/staffMealReport.test.js, server/routes/staffMeals.js, server/routes/staffMeals.test.js, public/staff-meal-report.html, public/index.html
ADR-027, ADR-044, ADR-029: per day and 7 days; the rice estimate beside, never inside, the budget.
Read-only. PUBLIC -> click-through. Full spec: session-status.md -> "Step staff-meal-view".

### Step busy-timeout - SQLite waits for a lock instead of failing at once  [runnable]
**CLOSED 2026-11-14, PR #72 (`35c75ef`).**
Touches: server/db/connection.js, server/db/connection.test.js, plus any script that opens its own DatabaseSync
The 2026-09-15 plan's `PRAGMA busy_timeout = 5000`, still missing. Server-only. Full spec:
session-status.md -> "Step busy-timeout".

### Step loyverse-fc - FC's Loyverse account and a Silingan + Likod | FC switch  [runnable]
**CLOSED 2026-11-14, PR #71 (`569a168`).**
Touches: server/db/loyverse-name-map.json, server/engines/loyversePreview.js, server/engines/loyversePreview.test.js, server/routes/loyverse.js, server/routes/loyverse.test.js, public/kitchen-sales.html, .env.example
ADR-066: FC is the third Loyverse account; Kitchen Sales switches between Silingan + Likod and FC,
FC's side grouped by FC's own categories (the pizzaman reads Pizza there). PUBLIC ->
click-through. Full spec: session-status.md -> "Step loyverse-fc".
**2026-11-14:** issue #73 answered (ADR-076): refunds subtract on FC's side, deleted items keep their category; PR #71 complete as built.

### Step landing-sales - Kitchen Sales: FC by landing line, a Pizza table on both sides  [Naoki's own PR]
Touches: server/db/loyverse-name-map.json, server/engines/loyversePreview.js, server/engines/loyversePreview.test.js, server/routes/loyverse.js, server/routes/loyverse.test.js, public/kitchen-sales.html
ADR-094: FC's side is one table of its landing lines in portions (platters folded in), each line
opening to its items and to what other dishes took; a Pizza table on both sides; the rest in "Not
on the landing". Part of beta-3. PUBLIC -> click-through. Full spec: session-status.md -> "Step
landing-sales".
**2026-11-17:** + FC's `PORK 150grms (Add ons)` takes Bagnet 1 (an item on no line). See the spec's
2026-11-17 block.

### Step cost-guard - unit costs need the see_costs switch  [blocked: save-safety, then its 2026-11-17 block (ADR-100)]
Touches: server/db/permissions.js, server/db/permissions.test.js, server/routes/commissary.js, server/routes/commissary.test.js, server/routes/settings.js, server/routes/settings.test.js, public/settings.html
ADR-060: cost fields leave every read for anyone without see_costs, logged out included; adds
edit_side_items (ADR-062). PUBLIC -> click-through. Full spec: session-status.md -> "Step
cost-guard".

### Step import-settings-env - the settings import uses the app's database and says which file  [runnable]
**CLOSED 2026-11-15, PR #79 (`300c87a`).**
Touches: scripts/import-settings.js, server/db/importSettings.test.js
ADR-081: DB_PATH from the environment, else `.env`; prints the file; refuses one that does not
exist. Server-only, no click-through. Full spec: session-status.md -> "Step import-settings-env".

### Step preview-pid - the preview script stops only its own server  [Naoki's own PR]
Touches: scripts/preview.ps1
cubic on PR #56: stop the old PID only if it is node and started before the pid file was written.
Needs Windows; You check only. Full spec: session-status.md -> "Step preview-pid".
**2026-11-15 (later):** + the port check asks Windows who listens; "up" needs the preview's own process; a timeout cleans up. See the spec.

### Step restaurant-pc-ii - update refreshes the launcher; the admin part reports failures  [Naoki's own PR]
Touches: scripts/restaurant-pc.bat
cubic on PR #47: `update` copies the new bat over the desktop launcher's copy; a failed firewall or
power command shows `[!]`. Checked at the PC at beta-3. Full spec: session-status.md -> "Step
restaurant-pc-ii".
**2026-11-17:** respecced before it runs (U-20 to U-23, auto-start after db-start; see Planned -
Fable fixes): do not start.

#### Sides (A8)

### Step side-items - the side-item catalog and its import  [blocked: import-identity, settings-guard]
**CLOSED 2026-11-14, PR #74 (`c3b1777`).**
Touches: server/db/schema.sql, server/engines/sideItems.js, server/engines/sideItems.test.js, scripts/import-settings.js, server/db/importSettings.test.js, server/routes/sideItems.js, server/routes/sideItems.test.js, server/index.js, public/settings.html
ADR-062: Sheets and Side items tabs through import-settings; one catalog, units and conversions;
Settings fixes single items. PUBLIC -> click-through. Full spec: session-status.md -> "Step
side-items".
**2026-11-14:** PR #74's review questions answered (ADR-078): skipped rows change nothing, conflicts are held, item on / off, main unit fixed once it has conversions. PR #74 changes to match.

### Step side-sheets - count a side sheet; usage shows as you type  [parked: after roster-fill (2026-11-17 note)]
Touches: server/db/schema.sql, server/engines/sideCounts.js, server/engines/sideCounts.test.js, server/routes/sideSheets.js, server/routes/sideSheets.test.js, server/index.js, public/side-sheets.html, public/index.html
ADR-063: ending in any unit, out of stock, remark, PO; Used = yesterday + received - ending as you
type. PUBLIC -> click-through. Full spec: session-status.md -> "Step side-sheets".

#### Supply (A9)

### Step supply-tags - how each restaurant meat is bought  [blocked: staff-meal-settings, cost-guard]
Touches: server/db/schema.sql, server/db/migrate.js, server/db/connection.js, server/db/migrate.test.js, server/routes/settings.js, server/routes/settings.test.js, public/settings.html
ADR-067: meats gain how_bought (Supplier / Buyer / Commi, default Commi; side items already have
it); Settings -> Meats gets the select. Schema step. Full spec: session-status.md -> "Step
supply-tags".

### 3. Step 25a — commissary stock receipts (supplier intake)
**REVISED — quantity-only; the intake weigh-in is CANCELLED. Needs the rewritten quantity-only prompt before dispatch.**
**2026-10-19:** the rewrite folds into the supply family (see Planned below): an arrival links to a supplier-order line.

**Note 2026-09-24:** the architecture draft cancels the intake weigh-in
(`weight_kg`) — 25a shrinks to quantity-only receipts. Do not build from the
spec below until it is rewritten.

**Lane: DISPATCH only. Needs an architect-written prompt.**

Not startable on engineer initiative. It adds a weight column alongside
`quantity` via a schema migration, which is red by default. The design is
already settled in `session-status.md` — what's missing is the prompt,
not the decision.

Spec: `session-status.md`, section "Steps 25a / 25b — the commissary
ledger has no way in".

**RECONCILE before the prompt is written (2026-09-15).** Endorsement-as-receipt
makes "confirm an arrival = write a receipt." Before 25a's prompt is authored,
the architect must settle whether commissary supplier-intake and the
endorsement / PO-arrival receipt share ONE receipt shape or stay distinct. This
is a domain reconciliation, still open — not the engineer's call.

### 4. Step 24b-v — the effective yield output must be kg-tracked
**RESOLVED 2026-09-28 (#16 -> Path 1): STANDS and is BUILT by Step 24d-i** (24d-i codes the kg-output guard this step specified). Not superseded - kept and enforced. Close when 24d-i lands.

**Lane: DISPATCH only. Needs an architect-written prompt.**

A live data-corruption guard. It changes what the code rejects, which is
red by default. Must land before soft-launch.

Spec: `session-status.md`, section "Step 24b-v".

### 5. Step 25d-i and 25d-iii — record who did the count
**RETIRED 2026-09-28 — do not dispatch; superseded by the forward-clean users table.**
**Lane: DISPATCH only. Needs no schema change; the columns exist.**

Adds a per-sheet auditor name to both audit pages and writes it to
`ending_actual.created_by` and `portion_ending_actual.created_by`. It is
operator-visible and it makes a blank submission a 400, so it is not
engineer-lane.

Sequenced before soft-launch deliberately: attribution is the one deferred
item that cannot be backfilled later.

Spec: `session-status.md`, section "Step 25d".

**HOLD / RECONCILE (2026-09-15).** This stamps a free-text human name with
`Unknown` as the convention. That free-text identity is SUPERSEDED by the thin
`users` table (identity-now-passwords-later). Do NOT dispatch it as free-text;
it waits for, or folds into, the users-table step, which is not yet written.
(25d-ii — provenance, SYSTEM/NULL — is unaffected and proceeds.)

### 6. Step 25e — restaurant-to-restaurant transfers must credit the receiver
**Lane: DISPATCH only. Queued AFTER soft launch, deliberately. Not startable before then.**

A transfer writes one row today: it subtracts from the sender and credits the
receiver nothing. The fix writes a `stock_receipts` row at the destination,
which needs a third `source` value — and since SQLite cannot widen a CHECK
constraint, that means a full table rebuild in an idempotent migration.

Not before soft launch: `locations` is empty, so the transfer type cannot be
used and nothing wrong can be recorded today. Spending the project's most
invasive migration on a feature with no usage evidence is the wrong order.

One cheap guard IS needed before any site-level locations are created: reject a
transfer whose from- and to-location resolve to the same restaurant. Fold it
into whichever step next touches `allocations.js`.

Spec: `session-status.md`, section "Step 25e".

### 7. No invented steps.
**Updated 2026-10-03.** The "nothing after 24b-v" stop is retired: 24b-v landed (built by
24d-i), and the architect now slices the designed families (identity chain, Loyverse preview and
port, sheets, sides, PO, staging) into this queue. The rule underneath stands: only an architect
adds a step, and an idle assistant costs far less than an invented one.

---

## Planned - Fable fixes (2026-11-17; each specced one step ahead of its build)

From the five Fable reports (docs/reviews/). Order: the 2026-11-17 note at the top of the Queue.
Every finding's place: session-status, 2026-11-17 block.

Specced and in the Queue: stale-saves, sign-the-cookie (3zv), npm-audit, db-start.

Before beta-3:
- **roles-guard** (Marble): the built-in admin role cannot be switched off or lose admin; admin and
  read-only only as base roles (ADR-099); role names too close to a built-in one are refused.
  U-17 = PERM-10, PERM-09 = C-14, PERM-14.
- **save-safety** (Marble): one Save = one transaction; the lock wait works (BEGIN IMMEDIATE); a
  JSON error handler, never a stack trace; counts, receipts and shipments refuse bad numbers, every
  write refuses a bad business date, naming the row; body ids must be numbers. I-08 = F5, F3,
  PERM-12, I-07 = U-08, I-09, run 1's `{}` lead.
- **cost-guard** (queued; Marble; widened by ADR-100): plus History, the rice price and the two
  staff-meal Settings reads; a missing key keeps the stored value (cost, meat type, active); cost
  inputs disabled without see_costs. PERM-06 = C-03 = C-04 = U-11, U-12, I-11 item 4.
- **backup-restore** (Naoki): one-file backups, a `restore` word, kept by age, an optional copy
  folder (ADR-105). F4 (P0), B1 note 2.
- **restaurant-pc-ii** (queued; Naoki; respecced): the desktop launcher becomes a one-line call of
  the repo's copy; an "update unfinished" marker; no `npm ci` when the lockfile is unchanged; every
  message names a first step; auto-start, after db-start. U-20 to U-23, run 4's D7, PR #47's
  leftovers.

After beta-3:
- **blind-reads**: ADR-101 on every page; takes over blind-history. PERM-03 = C-13 = U-10,
  PERM-01, PERM-02.
- **write-switches**: ADR-102's switches; the read-only refusal; opening changes logged. PERM-05,
  PERM-04, U-14 (management writes).
- **stock-math** (Naoki): a yield's input count on a kg meat; shipped receipts locked on Stock
  Receipts; a transfer inside one restaurant refused; the opening day in the covered window; "Sync
  batch stock" follows sales changes; an item must belong to the restaurant; conversion ids
  compared as numbers. I-03, I-05, I-06, I-10, I-12, PERM-17, I-14.
- **settings-safety** (Naoki, after cost-guard): a recipe edit no longer counts twice on its day; a
  meat's unit locked once used; a duplicate recipe line refused; Settings changes logged; seeded
  adjustment types pinned; seeded recipes dated early. I-04, I-11, PERM-16 = C-09, I-14.

P2, between roster steps: **page-errors** (U-05, U-09, U-06, U-07, U-13, U-14's name and Log out on
two pages), **page-dates** (F7 = U-15), **list-limits** (F6; and three commissary indexes, db-start's 2026-11-22 review), **actor-from-login** (PERM-08 = I-13),
**import-report** (U-18, U-19, PERM-11), **loyverse-guard** (Naoki, after landing-sales: PERM-15,
F8, I-14's unused name-map keys).

Planned steps widened: name-map-settings also holds the POS accounts (F9); no-popups (U-16);
grouped navigation (U-14); site-picker (U-02); the shipment void goes with ADR-092's Received
(I-05); write-permission also guards the side-sheet save (C-11).

## Planned — multi-user surface (architect-defined, NOT yet specified)

Decided in scoping (2026-09-15), listed so they are visible — but **none is
dispatchable yet.** Each is gated on still-open items (the recycled auth repo,
the custom POS repo, the written definition-of-done) and must be written into
`session-status.md` one at a time before dispatch. Do NOT start any on engineer
initiative — that is still "inventing a step."

- Thin `users` table + configurable roles/permissions (anchors identity,
  logging, station scoping; supersedes 25d-i/iii free-text identity)
- Endorsement-as-receipt (reconcile with 25a first)
- Side inventory (simple counting, separate from the meat engine)
- Sahog / no-standard-consumption residual (day-close valuation)
- Running-low par-level config
- Finalization flag (mark-and-warn, per site/date sheet)
- Optimistic-concurrency column + `busy_timeout` + hot-query indexes
- Snapshot-then-sync backups
- Source-agnostic sales ingestion (Loyverse-first) + CSV export

Decisions: `session-status.md` -> "Things NOT to re-litigate" (2026-09-15).

---

## Planned — commissary staging + restaurant conversion (architect-defined 2026-09-28, corrected, NOT yet sliced)

Three stages (the kg<->units RATIO conversion is the RESTAURANT's, not the commi's - #16-class
correction). See session-status "Things NOT to re-litigate -> Commissary staging + restaurant
conversion model". Family:
- **Commi staging/packing** (Stage 2): commi meat -> ready-to-ship restaurant meat via
  commissary_meat_map (a MAP, no ratio); staged at the commi; released by a shipment (staged ->
  released). Restaurant-meat balance spans commi-staged vs on-hand. Delivered in kg or a reported
  piece count. No transit shrinkage; transit loss = allocation.
- **Restaurant conversion** (Stage 3, OPTIONAL): received meat -> portions/quarters/skewers/sahog
  vs a ratio standard; variance -> shrinkage. Extends existing allocations/conversion +
  commissary_conversion_standards (multiple standards per conversion + costing-default + per-log
  override). Optional - most goods received proper; conversion is the on-the-spot exception.
Commi yield (Stage 1) is built (24d-i). Leans on commissary_meat_map + allocation machinery already in schema.

## Planned — queued by the architect 2026-10-28 (NOT yet specified)

- **table-scroll** (issue #30): specced 2026-11-12, now in the queue.
- **grouped navigation**: the prototype's Tonight / Supply / Staff / Management groups. Touches
  every page, so after table-scroll. Needs a spec.
- **spos-import**: SPOS moves into `spos/` by `git subtree add` with full history, after Beta, in
  one attended PR (spos/CLAUDE.md, mail secrets to .env, a guard-db rule for SPOS's schema.sql
  DROPs, graphify kept out of spos/, backend/uploads/ untracked, a test forbidding requires
  across spos/). The mail password is already rotated. Autopilot never touches spos/.

## Planned — supply, cost and SPOS sales (architect-defined 2026-10-19, NOT yet sliced)

**2026-11-14:** the supply steps are re-planned under "Planned - sides and supply" below
(ADR-067, ADR-068); the valuation, dashboard and SPOS adapter lines here stand.

Decided in session-status "Supply, cost and SPOS integration" and "Management dashboard".
Family, roughly in order:
- **Suppliers catalog** (one list for meat and sides).
- **Supplier orders** + the PNG / Copy text send (browser canvas, no dependency).
- **Arrivals against an order line** (25a's quantity-only rewrite folds in; sides pre-fill the
  sheet's received field).
- **Bills** (cost in, per arrival) + the bills-only role.
- **Valuation engine** (unit cost: last bill, settings fallback; the peso formulas).
- **Management dashboard** + the sales sneak peek (needs loyverse-preview-i).
- **SPOS sales adapter** (column-limited read-only MySQL user, source SPOS) - after the real
  Loyverse port.

## Planned - sides and supply (A8, A9; architect-defined 2026-11-14, NOT yet specified)

Decided in ADR-062 to ADR-068. Each gets its full spec in session-status as the step before it
lands, so it is written against the code it builds on. Roughly in order:
- **Sides:** side-waste (ADR-064, ADR-086: "Log waste" any time plus the "Waste today?" catch-all;
  check_kitchen / check_bar ticks; charges, ADR-088); bar-links (ADR-087: the settings workbook's
  sales links - Loyverse item, side item, amount per sale - and deals with their free drinks);
  bar-check (ADR-025, ADR-065, ADR-087: expected and the difference for items sold as they are,
  deal drinks entered at closing, each bar against its own Loyverse account); bar-shorts (ADR-087,
  ADR-088: the supervisor's list of differences, explanation or charge); fc-dish-map (FC's dishes
  and recipes in the database for the landing's expected values, from ADR-094's map and takes in
  meat-landing.md; Kitchen Sales' FC side is landing-sales). Full specs once side-sheets lands.
- **Sites (ADR-091):** site-picker (the count pages' pickers show only `can_use` sites; a 403 shows
  its message instead of "Loading..."); blind-history (a blind viewer's History hides the numbers
  the count screen hides; Q15).
- **Roster (ADR-090, not A8):** roster-board (read-only Mon-Sun across the viewer's sites, for
  supervisors and management; the first card, ADR-089), after roster-day-status.
- **Supply:** supply-tags (specced: in the Queue under Supply); suppliers;
  supplier-orders (the landing's consolidation with history, picture plus text, estimated cost
  behind see_costs); buyer-list (ticks, "not found" to tomorrow, receipt photos, ADR-068; a line a
  supplier reports out of stock moves to the buyer's list in one tap); arrivals
  (the receiver's check, including the podium's name-and-quantity log and Misc; moving a line to
  the other restaurant; FC's direct meats onto FC's landing; fills the side sheets' Received);
  bills (the bills-only cashier role, ADR-020, ADR-059); meat-request (ADR-092: the request record;
  from-the-commi PO lines on any count sheet and a "Request meat" button; filled by a shipment,
  Received by the receiver; the commi stays on paper in Beta); sides-valuation (pesos used, wasted
  and on hand, ADR-057).
- **Pages (ADR-093):** no-popups (in-page messages and an in-page "Are you sure?" instead of
  alert / confirm; settings.html 27, commissary.html 5, stock-receipts.html 5, sales.html 1), after
  cost-guard and supply-tags.
- **Admin (ADR-097):** name-map-settings (the Loyverse name map - Silingan's dish names, FC's landing
  map, the pizza categories - edited in Settings instead of a repo file).
- Later: an in-app alert for supervisors when a buyer marks a line "not found"; phone
  notifications once the PC has an HTTPS name (ADR-070).

## Available engineer-lane work

These need no dispatched prompt and can be picked up on initiative. They
are genuinely useful and genuinely safe.

- **Browser click-through of Stock Receipts' Unallocated/Assign flow.**
  Owed and never done. Commissary's own Edit/Delete was click-tested
  during 24c-ii; this flow wasn't. No code change expected — open it,
  click through it, and report what you see. If you find a bug, open an
  issue rather than fixing it, since anything touching those filters is
  red.
- **Test coverage for behaviour that already exists and is correct.**
  Green by definition. Do not change the code to make a test pass — if
  the code seems wrong, that's an issue, not a fix.
- **Doc typos, dead links, stale file paths.** Green.

---

## Not in the queue, and not a task

- **The meat-type tagging pass on the LIVE database.** Live commissary
  meats have `meat_type_id` NULL, which is why every Allocate dropdown is
  empty. Step 25c fixes this for a freshly seeded DB, but it does not
  retro-tag existing rows and deliberately must not. Tagging an existing
  live DB is on-site data entry through the existing Settings UI, not a
  build task, and not a bug. Do not "fix" it in code.
- **Restaurant C (Likod) onboarding.** No workbook exists yet. Blocked on
  real-world data, not on code.
- **MySQL migration.** Not planned: hybrid A (2026-10-03) keeps inventory on
  SQLite and SPOS on MySQL, connected by API. **SPOS integration** comes after
  the Loyverse + inventory web app is finished.
