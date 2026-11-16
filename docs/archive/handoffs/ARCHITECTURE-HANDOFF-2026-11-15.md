> **ARCHIVED 2026-11-15 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/` (the item map in its
> README shows where each numbered decision went). Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - 11-15 19:28: PR #80 (site-filter-ii) merged (`8a2d8fd`), closed in `db60714` (723 tests). The
>   3zs queue-tidy items below became moot: closed steps keep their headers and specs as built.
> - 11-15 (A0 #84, FC map, beta-3): "Restaurant PC: still on beta-1" was wrong - nothing was ever
>   installed there. beta-2 is skipped at the PC; it installs fresh at beta-3. FC's sales follow its
>   landing sheet (ADR-094, step landing-sales); the Roles page details (ADR-095, issue #84; PR #83
>   built, waiting on it). Answers to "Still open": 1. two people (Silingan's supervisor; the main
>   supervisor for FC and Likod); 2. nothing ran; 3. the payroll template's structure is in
>   money.md; 4. the PC and the counting phones go on the cashier network; 5. no prices yet; 6.
>   FC's dish list mapped (ADR-094). The roster steps 3zl to 3zo are on hold: Silingan's supervisor
>   wants Fill (shift rows, day offs first), specced in the next drop-in.

# Architecture Handoff - 2026-11-15 (A0, A8 part 2, issue #81, commissary and POs)

**Lead, not source.** Checked against `origin/main` at `6247ae6` (701 tests, AUDIT CLEAN on `853fed1`;
docs only since). Session-status still wins. Replaces `ARCHITECTURE-HANDOFF-2026-11-14.md` (archived in
the repo 11-15, `7eac67d`). The next architect chat's first drop-in archives THIS file word for word
(with its banner and timeline row).

## State

- Merged 11-14 night / 11-15: #76 user-id-authorship, #78 role-assignments (`a9117fa`), #79
  import-settings-env (`300c87a`). No other PR merged.
- **beta-2 tagged on `1e81755`** after the smoke list passed (lines 1-5, 7, 8 at 390px on a throwaway
  dev.db, port 3002). Not yet on the restaurant PC. Smoke notes: a fresh reseed needs a month opening
  (saved as Test Admin) before line 1; line 5 needs the three Loyverse tokens set empty. Both still to
  be written into `docs/click-through.md` (folded into no-popups or the next docs drop-in).
- **In flight:** PR #80 site-filter-ii, draft (the claim). Parked on issue #81; ADR-091 answers it
  (on main). Naoki: close #81, `/clear`, `/naoki-qs 80`.
- Docs on main today: ADR-081 to ADR-084 + cubic sorted (`7eac67d`); ADR-085 to ADR-090 (`1e81755`);
  ADR-091, ADR-092, ADR-093, supply-tags spec, partial supersessions marked on ADR-041/064/067
  (`6247ae6`).
- Fable review plan updated (project doc `claude/FABLE-REVIEW-PLAN-2026-11-15.md`): runs Tue 17 Nov
  morning; run 3 also lists open questions; run 4 is scale and hosting.
- Restaurant PC: still on beta-1. Steps for beta-2 in session-status's 2026-11-15 A0 block: close
  the app; `update beta-2`; run the repo's `scripts\restaurant-pc.bat` once with no word (refreshes
  the launcher, asks the FC token if missing); start; `npm run import:settings -- <folder>` (no
  `$env:DB_PATH` needed: #79 is in beta-2) - check its first line says beta.db.
- Naoki's laptop has two old servers running: port 3000 (`.env` -> beta.db) and 3001 (since 11-14
  21:26). Close them when convenient.

## First drop-in of the next chat (besides archiving this file)

- Queue tidy: 3zs drop "[blocked: site-filter, user-id-authorship]" (both merged); 3zr drop
  site-filter from its blockers (login-tonight still open); the 3zs summary line still says the
  picker trims - point it at the 11-15 ADR-091 note; the spec's first History bullet is replaced by
  "History: unchanged here".
- 3zs Touches gains server/middleware/requireSiteAccess.test.js and
  server/middleware/siteFilterII.test.js (tests sit next to the middleware; accepted 11-15).
- docs/click-through.md smoke list: a month opening after a fresh reseed; blank Loyverse tokens for
  line 5.

## Queue (as of 18:45)

- **Naoki (sequential, `/clear` before each):** `/naoki-qs 80` (site-filter-ii, server-only) ->
  roles-page (3zk, click-through) -> preview-pid (Windows check).
- **Marble (at his reset; stops at Ready):** staff-meal-settings (3zw) -> cost-guard -> side-sheets
  (after roles-page merges: index.js / index.html) -> supply-tags (schema; after 3zw and cost-guard).
- Naoki merges Marble's Ready PRs with `/naoki-qm`. Merge everything before Monday night: the Fable
  hash covers only main.
- Then (planned, specs when their base lands): side-waste, bar-links, bar-check, bar-shorts (after
  side-sheets); supplier-orders (after side-sheets); site-picker, blind-history; no-popups (after
  cost-guard + supply-tags); meat-request (commi on paper in Beta); roster-board (after
  roster-day-status); restaurant-pc-ii (at beta-3).

## Decided 11-15 (all recorded)

- A0: import-settings reads `.env` (ADR-081); the Roles page owns roles (ADR-082); built-in roles
  keep their names (ADR-083); a read-only login refused every write, in write-permission (ADR-084).
  All 27 late cubic findings sorted (session-status 11-15 A0 block).
- A8 part 2: new restaurants follow Silingan (ADR-085); side waste any time, checkers tick
  (ADR-086); how a bar is checked (ADR-087); charges recorded, payroll in the main supervisor's
  Excel (ADR-088); views are cards, builder later = A15 (ADR-089); roster board (ADR-090).
- #81: site lists stay whole with `can_use`; "your sites" follow the site guard (ADR-091).
- Commissary and POs: meat requests (ADR-092 - the internal request and commi staging were decided
  09-28 but NEVER built; docs corrected); no browser pop-ups (ADR-093); supply-tags specced (meats
  only; side items already carry how_bought).
- People by role: project doc `claude/AREAS-PRIVATE-NOTES-2026-11-15.md` (never the repo).

## Read as "recs" (Naoki: say if not)

- Q15: a blind viewer's History hides the numbers the count screen hides (blind-history).
- Both Silingan head chefs get standing commissary access (data, once roster-staff lands).

## Still open from Naoki

1. Rosters: one supervisor for all three (10-28 note) or Silingan's supervisor + the main supervisor
   for FC and Likod (11-15)? Changed, or two people all along?
2. Restaurant PC: did the 11-14 bat run; any [X] messages.
3. Payroll export (A13): what the main supervisor types each Sunday, from where, how long; a photo of
   her template with the figures hidden.
4. Wi-Fi the counting phones use (Deco main / guest / C64).
5. Prices workbook progress.
6. FC's current dish list (for fc-dish-map).

## Info gathering left (the areas map)

- FLOW None: Prices (10), Podium (11), Pizza (12, A11), Likod grill (13, A12), FC scullery (14,
  paper), Sales (16), Money (18, A13). Commissary FLOW is drafted now; the bar's too.
- Carried questions: from 11-12 Q2 (#47 items f, h, "no sleep" in g), Q4 (miscut staff meals), Q5
  (rice grams per cup); from 11-02 Q3 (pizza stock), Q4 (staff-order Loyverse field), Q5 (Likod
  bottles), Q7 (#40 labels), Q9 (operating expenses; who maintains the app), Q10 (Likod's kitchen
  around the new year), Q11 (per-person overrides), Q14 (Marble's Tailscale part); Likod's OUT column;
  the real Loyverse port (nightly sync); restaurant PC checks 4-7.

## Architect queue

| ID | Item | Status |
|---|---|---|
| A0 | Decision triage (recurring) | **Last: 11-15** (#81, cubic all sorted) |
| A5 | `scope.md` rewrite | **Next** (M): still says "meat-cost tool for checkers on one shared PC"; do before Fable run 3 |
| A8 | Veggies, pantry, bar sheets | Part 2 DECIDED 11-15 (ADR-085 to ADR-088); specs once side-sheets lands |
| A9 | Orders, arrivals, bills, prices | Commissary + PO IRL/FLOW 11-15 (ADR-092); supply-tags specced; supplier-orders spec after side-sheets |
| A11 | Pizza station | Not started (M) |
| A12 | Likod as a site | Not started (L) |
| A13 | Money and operating expenses | Charges + payroll direction decided (ADR-088); the Sunday export after the roster |
| A14b | Harvest: topic ADRs + slim session-status | Queued (L), after the Fable reports |
| A15 | Dashboards: cards and a builder | New (ADR-089); after about five cards |
| (done) | A1-A4, A6, A7, A10, A14a | DONE |

**Monday (Fable prep, Opus):** A5; specs for side-waste / bar-links / bar-check / bar-shorts and
supplier-orders once side-sheets lands; the four Fable prompts against the final main; note the hash.

## Project files after this

Keep: this handoff, `architect-notes-PRIVATE.md` (refreshed 11-15), the AREAS-PRIVATE-NOTES files
(10-24, 10-28, 11-01, 11-12, and `claude/` 11-15), the Fable plan (delete after the runs), and the
Excel workbooks.

The reasoning is in the 11-15 chat (search "beta-2", "issue #81", "boodle", "payroll", "Pards",
"pop-ups", "supply-tags").
