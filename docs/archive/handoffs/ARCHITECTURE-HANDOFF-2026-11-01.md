> **ARCHIVED 2026-11-02 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/` (the item map in its
> README shows where each numbered decision went). Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - 11-02: business-day (3zi) and warn-ink (3z) merged, PRs #55 and #58. The `beta-1` tag exists.
> - A0 done 11-02: issues #53, #54 and #57 answered; ADR-039 to ADR-042 (testing and fake test accounts, logged-out visitors until write-permission, one owner site per request, Settings changes need an admin); new steps 3zs site-filter-ii, 3zt test-accounts, 3zu settings-guard.

# Architecture Handoff - 2026-11-01 (after A6)

**Lead, not source.** Checked against `origin/main` at `6de85ac` (521/521, audit clean); the A6
drop-in (`dropin-a6-roster.py`) was dry-run on that HEAD: applied, verify passed, a second run
refused. Replaces `ARCHITECTURE-HANDOFF-2026-10-28.md` (archived word for word by this drop-in).
Session-status still wins.

## State

- On main: `6de85ac` (10-30: Kitchen Sales finished - 3zf, 3zg, 3zh; ADR-033). After the A6
  push: ADR-034 to ADR-038, the roster family specced and queued as 3zi to 3zr, the areas updated
  (roster, who-does-what, meat-landing, likod-grill, commissary, staff-meals, map).
- **Runnable now:** 3za blind-count (first; its spec gained a one-line note: isBlind(user,
  siteCode)), 3z warn-ink, 3q autopilot-preview, 3zb self-host-font, 3u sheets-tier1 then 3j
  import-identity, **3zi business-day** (no shared file). After 3za: 3m (spec note: one
  canUseSite() helper) -> 3l -> then 3zc and 3zj one at a time (both touch schema.sql). 3zd after
  3u. 3ze is Naoki's own PR.
- **Roster family order:** 3zj role-assignments -> 3zk roles-page; 3zl roster-stations (after 3u,
  3j, 3zj) -> 3zm roster-staff -> 3zn roster-week (also after 3zi) -> 3zo roster-day-status -> 3zp
  tonight-picks -> 3zq login-tonight -> 3zr write-permission (also after 3m).
- No `beta-1` tag yet: tag a phone-checked main before the weekend session (ideally with 3za).

## Decided in A6 (all recorded as ADRs - nothing pending)

- ADR-034 roles per site + switches as rows (login unchanged; supervisor role; blocking = a role
  without the roster switch; per-person overrides later).
- ADR-035 the landing = the head-chef role at that site (appointing = giving it, optionally until a
  date); supersedes ADR-014's landing line.
- ADR-036 one 8am business day everywhere (widens ADR-033).
- ADR-037 stations as data, kitchen = pick-only, one placement a day, sub-stations vs standing
  access, copy last week, who edits, picks, login list, OJT off the roster, head count.
- ADR-038 blind = no "sees expected" switch at the site; Likod's grillers count blind; supersedes
  ADR-015's derivation and Likod lines.
- **A14 (the harvest) confirmed**, split: A14a (M) reversal ADR pairs for the older swings; A14b
  (L) group "Things NOT to re-litigate" into about 10-12 topic ADRs and slim session-status (closed
  step sections to session-history). Place: after the A10 specs, before A5. Run A14b on a quiet
  day: no PR about to close, no other drop-in waiting, push the same day it is dry-run (it rewrites
  the text every other drop-in anchors to).

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

## Architect queue

| ID | Item | Status |
|---|---|---|
| A0 | Decision triage (recurring) | Last: 3j/3m role check, 10-28 |
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

Keep: this handoff, `architect-notes-PRIVATE.md` (refreshed 11-01), the AREAS-PRIVATE-NOTES files
(10-24, 10-28 and 11-01), and the Excel workbooks. Remove: `ARCHITECTURE-HANDOFF-2026-10-28.md`
(archived in the repo by the A6 drop-in).

The reasoning is in the 11-01 architect conversation in this project (search "lego", "roles per
site", "standing access", "Kitchen Window", "8am").
