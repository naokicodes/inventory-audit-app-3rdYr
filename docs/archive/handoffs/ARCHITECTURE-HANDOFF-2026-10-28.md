> **ARCHIVED 2026-11-01 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/` (the item map in its
> README shows where each numbered decision went). Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - 10-30: Kitchen Sales finished (3zf to 3zh); ADR-033 (the sales day turns at 8am), widened to every business date by ADR-036 on 11-01.
> - A6 done 11-01: the roster family is specced (queue 3zi to 3zr); ADR-034 to ADR-038. Its "Not yet in the repo" section (the roster round's area wording) is now in `docs/areas/`.
> - Superseded 11-01: ADR-014's landing line (ADR-035); ADR-015's derivation and Likod lines (ADR-038); stub-login's "per-site roles are not modelled" (ADR-034).
> - A14 (the harvest, open question 10) confirmed 11-01 and split into A14a / A14b; see the latest handoff.

# Architecture Handoff - 2026-10-28 (consolidated, after A1)

**Lead, not source.** Checked against `origin/main` at `2308d0a` (505/505, audit clean); the A1
drop-in was dry-run on that HEAD and verify passed. Replaces the earlier 10-28 handoff and its
roster addendum, and the 10-21 / 10-22 / 10-25 handoffs (archived in the repo by A1).
Session-status still wins.

## State

- On main: `2308d0a` (A7 specs, A3 Beta setup, A4 queue entries, areas). After the A1 push:
  ADR-005 to ADR-032, the item map in `docs/decisions/README.md`, three archived handoffs.
- **Every numbered decision (1-94) and the 10-21 list is now an ADR.** Nothing is "decided, not
  recorded". Find a decision by its old number in the item map.
- **Runnable:** 3za blind-count (first), 3z warn-ink, 3q autopilot-preview, 3zb self-host-font,
  3u sheets-tier1 then 3j import-identity. After 3za: 3m -> 3l -> 3zc. 3zd after 3u. 3ze is
  Naoki's own PR (`restaurant-pc.bat`).
- No `beta-1` tag yet: tag a phone-checked main before the weekend session (ideally with 3za).
- Open PRs not checked since 10-28 morning: run `/naoki-qpr` before the first run.
- The 10-20 handoff is archived too (drop-in A1b), so every handoff from 09-24 on is in
  `docs/archive/handoffs/`.

## Not yet in the repo (goes into the A6 drop-in)

- The roster round (ADR-013, ADR-014) is recorded as ADRs, but `docs/areas/` (roster,
  who-does-what, meat-landing) still shows the older wording: the counter is the Kitchen
  Window dispatcher; the paper roster's structure; map statuses (roster IRL -> Confirmed,
  who-does-what IRL -> Confirmed, Likod grill APP -> partly Decided).

## Open questions

1. Rice in the staff-meal budget (Naoki asks the head chef).
2. Likod's non-meat staff-meal ingredients: proposed name + estimate lines until Likod's sheets
   open. Naoki to confirm.
3. Pizza: whose stock is the shared station's; which pantry it draws from (A11).
4. Staff orders: which Loyverse field carries the staff name.
5. Likod bottles & cans: what OUT records (low priority).
6. Photos still to come: the waste paper, the podium logbook.
7. #40 follow-up 2: labels are created by hand from autopilot-guide; fold into the installer?
8. Roadmap order after Beta week 1 (roster + meals vs sides / supply).
10. **The 10-20 "harvest" was never done** (proposed as A14, Naoki to confirm): reversal ADR
    pairs for the older swings (intake weigh-in, yield Path 1, three-stage staging, MySQL ->
    hybrid A, "all money in SPOS" rejected, the 10-03 leans), one ADR per "Things NOT to
    re-litigate" line, and slimming session-status to state plus the ADR index.
9. Still open: operating expenses (A13); who maintains the app after the school project.

## Architect queue

| ID | Item | Status |
|---|---|---|
| A0 | Decision triage (recurring) | Last: 3j/3m role check, 10-28 |
| A1 | ADRs + archive old handoffs | **DONE 10-28** (ADR-005 to ADR-032) |
| A2 | `docs/areas/` | DONE 10-25 |
| A3 | Beta runbook | DONE 10-28 |
| A4 | Small docs + queue entries | DONE 10-28, except open Q7 |
| A5 | `scope.md` rewrite | Not started (M) - before the first sides or supply step |
| A6 | Roster + who-does-what -> specs | IRL and decisions done (ADR-010, 013, 014); **specs next** (L) |
| A7 | Blind count + recount | DONE 10-28 |
| A8 | Veggies, pantry, bar sheets | Not started (L); ADR-024, 025 |
| A9 | Orders, arrivals, bills, prices | Not started (L); ADR-020 to 023 |
| A10 | Staff meals + management view | Decided (ADR-027, 018, 028, 029); open Q1-Q2; specs (L) |
| A11 | Pizza station | Not started (M); ADR-031 |
| A12 | Likod as a site | Not started (L); ADR-030, 017, 018 |
| A13 | Money and operating expenses | Not started (M); gas/butane input in ADR-027 |
| A14 | The 10-20 harvest (open Q10) | **Proposed** (L) - confirm before queuing |

Suggested next: **A6 specs** (a fresh chat: "Batch: A6"), then A10 specs, then A5 before the
first sides or supply step.

## Project files after this

Keep: this handoff, `architect-notes-PRIVATE.md` (refreshed 10-28), the AREAS-PRIVATE-NOTES files
(10-24 and 10-28), and the Excel workbooks. Remove: the 10-21, 10-22 and 10-25 handoffs and the
10-28 addendum (all in the repo or merged here).

The reasoning is in the 10-28 architect conversation in this project (search "blind count",
"miscut", "restaurant-pc", "meal slots", "roster", "Kitchen Window").
