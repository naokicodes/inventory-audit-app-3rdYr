> **ARCHIVED 2026-11-12 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/` (the item map in its
> README shows where each numbered decision went). Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - 11-11: PR #56 (3q autopilot-preview) and PR #52 (3u sheets-tier1) merged.
> - 11-11/12 (A10 + triage): issues #60 and #62 answered; ADR-043 to ADR-046 (catalog reads, staff rice, logging and checking, typed non-meat lines); new steps 3zv sign-the-cookie and 3zw to 3zz (staff meals); table-scroll specced. Its open questions 1 (rice) and 2 (Likod's non-meat ingredients) are answered.

# Architecture Handoff - 2026-11-02 (after A0)

**Lead, not source.** Checked against `origin/main` at `6786c95` (544/544, audit clean); the A0
drop-in (`dropin-a0-triage.py`) was dry-run on that HEAD: applied, verify passed, a second run
refused. Replaces `ARCHITECTURE-HANDOFF-2026-11-01.md` (archived word for word by this drop-in).
Session-status still wins.

## State

- On main: `6786c95` (11-02: business-day 3zi and warn-ink 3z merged, PRs #55 and #58). The
  `beta-1` tag exists. After the A0 push: ADR-039 to ADR-042; decision blocks for issues #53, #54
  and #57 in their steps; new steps 3zs site-filter-ii, 3zt test-accounts, 3zu settings-guard; the
  click-through guide (Claude checks / You check, the test accounts, the Beta smoke list); the
  people workbook format (in import-identity's spec).
- After the push, close issues #53, #54 and #57 so `/naoki-qs` picks the PRs back up.
- **Runnable then:** PR #52 (3u) and PR #56 (3q), both as built; 3m site-filter; 3zb
  self-host-font; 3zu settings-guard (one at a time with 3zd, and with 3l if 3l touches
  settings.js). After 3q: 3zt test-accounts. After 3u: 3j import-identity, then 3zd sheet-close.
  After 3m: 3l, then 3zc and 3zj one at a time (schema.sql); 3zs after 3l, one at a time with 3zc
  (allocations.js). The roster family keeps the 11-01 order.
- **PR #47 (3ze, Naoki's own) is not mergeable yet:** the second firewall rule lost
  `localport=%APP_PORT%` (it would open 3100 too); cubic's P0 (an existing `.env` is accepted
  without checking `DB_PATH`); the PR template is unfilled; review questions e-h (open Q12).

## Decided in A0 (all recorded as ADRs - nothing pending)

- ADR-039 testing: Claude in Chrome checks the logic on the preview, people check the looks; fake
  "Test ..." accounts from `npm run seed:test`, never on `beta.db`; each new role or access rule
  brings its test account; the Beta smoke list before each tag.
- ADR-040 logged-out visitors pass the site checks (and stay blind) until 3zr write-permission;
  admin-only actions need a logged-in admin.
- ADR-041 one owner site per request (commi for shipments, the restaurant for conversion standards
  and allocations); the picker and the rollup trim to your sites; admin commands need a bypass
  role; history and Kitchen Sales stay open. ADR-011's "anyone may view" = anyone who may use
  that site.
- ADR-042 Settings changes need a logged-in admin; reads stay open.
- Issue answers: #53 Reading A for both (sheet setup admin-only; 3zd calls ensureDefaultSheets() at
  start and when Settings adds a site); #54 Reading B, groups (a) and (b) in 3m; #57 Reading A for
  both, cubic's two notes need no change.

## Open questions

1. Rice in the staff-meal budget (Naoki asks the head chef).
2. Likod's non-meat staff-meal ingredients: name + estimate lines until Likod's sheets open.
3. Pizza: whose stock is the shared station's; which pantry it draws from (A11).
4. Staff orders: which Loyverse field carries the staff name.
5. Likod bottles & cans: what OUT records (low priority).
6. Photos still to come: the waste paper, the podium logbook.
7. #40 follow-up 2: labels are created by hand from autopilot-guide; fold into the installer?
8. Roadmap order after Beta week 1 (roster + meals vs sides / supply).
9. Operating expenses (A13); who maintains the app after the school project.
10. Likod's own kitchen opens around the new year: its cooks and kitchen stations then join the
    roster (data only), and A12 decides Likod's landing sheets.
11. Per-person switch overrides (Discord's member overrides, ADR-034): a later Settings step;
    not queued.

12. PR #47: e. backups never pruned; f. only two Loyverse tokens (Silingan, Likod); g. every
    network set to Private, port 3000 opened, no sleep; h. VS Code, Claude Code and graphify on the
    restaurant PC. Plus the firewall and cubic P0 fixes (see State).
13. The people workbook: Naoki sends Users first (Stations and Staff when the roster steps land);
    it is imported on the restaurant PC once a tag has 3j. Format: import-identity's 11-02 note.
14. Marble and previews: until he has Tailscale, Claude in Chrome runs in Naoki's browser.
15. Does history show a blind user hidden numbers? 3zs checks and parks an issue if so.

## Architect queue

| ID | Item | Status |
|---|---|---|
| A0 | Decision triage (recurring) | **Last: 11-02** (#53, #54, #57; ADR-039 to ADR-042; 3zs-3zu) |
| A1 | ADRs + archive old handoffs | DONE 10-28 |
| A2 | `docs/areas/` | DONE 10-25 |
| A3 | Beta runbook | DONE 10-28 |
| A4 | Small docs + queue entries | DONE 10-28, except open Q7 |
| A5 | `scope.md` rewrite | Not started (M) - after A14, before the first sides or supply step |
| A6 | Roster + who-does-what -> specs | **DONE 11-01** (3zi to 3zr; ADR-034 to ADR-038) |
| A7 | Blind count + recount | DONE 10-28 |
| A8 | Veggies, pantry, bar sheets | Not started (L); ADR-024, 025 |
| A9 | Orders, arrivals, bills, prices | Not started (L); ADR-020 to 023 |
| A10 | Staff meals + management view | Decided (ADR-027, 018, 028, 029); open Q1-Q2; specs (L). The head-count prefill is 3zo's headCount() |
| A11 | Pizza station | Not started (M); ADR-031 |
| A12 | Likod as a site | Not started (L); ADR-030, 017, 018, 035, 038 |
| A13 | Money and operating expenses | Not started (M); gas/butane input in ADR-027 |
| A14a | Harvest: reversal ADR pairs | **Queued** (M) - after A10 specs |
| A14b | Harvest: topic ADRs + slim session-status | **Queued** (L) - after A14a, on a quiet day |

Suggested next: **A10 specs** (a fresh chat: "Batch: A10"), then A14a, A14b, then A5.

## Project files after this

Keep: this handoff, `architect-notes-PRIVATE.md` (refreshed 11-02), the AREAS-PRIVATE-NOTES files
(10-24, 10-28 and 11-01), and the Excel workbooks. Remove: `ARCHITECTURE-HANDOFF-2026-11-01.md`
(archived in the repo by the A0 drop-in).

The reasoning is in the 11-02 architect conversation in this project (search "test accounts",
"logged out", "owner site", "settings guard", "Claude checks").
