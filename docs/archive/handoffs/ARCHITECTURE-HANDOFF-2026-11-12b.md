> **ARCHIVED 2026-11-14 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/` (the item map in its
> README shows where each numbered decision went). Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - 11-12: its drop-in landed as `1bd3b4b`; issue #66 closed.
> - 11-14 (A0, A8, A9 part 1): ADR-060 to ADR-070. FC is on Loyverse (the third account); FC keeps
>   most sheets on paper; steps are named, not numbered; busy-timeout, loyverse-fc, cost-guard,
>   side-items and side-sheets specced; the rest of A8 and A9 planned. Answers recorded: Wi-Fi and
>   tokens still blank; Tailscale is the remote route (ADR-070).

# Architecture Handoff - 2026-11-12b (A0 #66 + A14a, drop-in built)

**Lead, not source.** Checked against `origin/main` at `abd87b0` (561/561, AUDIT CLEAN). The drop-in
(`dropin-a0-a14a.py`) was dry-run on that HEAD, with LF and with CRLF files: applied, verify passed,
a second run refused. PR #47's open fix commit touches no docs, so the drop-in applies whether or
not #47 merges first. Replaces `ARCHITECTURE-HANDOFF-2026-11-12.md` (archived word for word by this
drop-in). Session-status still wins.

## State

- On main: `abd87b0`. After the push: ADR-047 (people import, #66); ADR-048 to ADR-059 (A14a
  reversal pairs); import-identity's 2026-11-12 decision block; 3j's queue line; the 11-12 handoff
  archived with a timeline row.
- After the push, close #66; then `/clear` and `/naoki-qs 65`. PR #65 (head `da3ba3e`, 574/574 and
  audit clean on its branch, CI green) needs ADR-047's changes in its own two files, then a re-check.
- Other open PRs: #59 (site-filter, #60 closed), #61 (settings-guard, gates only), #63 (self-host-font,
  Naoki's phone check), #47 (restaurant-pc, CI then merge).
- Restaurant PC: no report yet (the 11-12 template line came back blank). `beta-2` after the smoke
  list passes (3zt has landed, PR #64).
- The 3z queue series is full (3zz). The next new step needs a numbering choice (open Q3).

## Decided 11-12 (A0, all recorded)

- #66 (ADR-047): a duplicated name imports no row (Reading B); names compare ignoring capitals and
  extra spaces (people take the sheet's spelling, roles keep the app's); a person's sites cell is
  their full list, with removals, guarded (a skipped row or an unresolved code removes nothing;
  blank = no sites; people missing from the sheet untouched). Super-admin `active = 0` stays ignored.
- A14a DONE: ADR-048/049 intake weigh-in, 050/051 yield Path 1, 052/053 staging, 054/055 hybrid A,
  056/057 pesos computed here (D3), 058/059 supply. Status lines note later refinements (ADR-005,
  ADR-020, ADR-021 to ADR-023). session-status's older entries are unchanged; A14b groups them.

## Read as "recs" (Naoki: say if not)

Naoki's reply ended "Recs". Read as covering the 11-12 template's answers 2 (firewall rule naming
node + port 3000), 3 (a daily start continues when the backup fails) and 4 (the 11-12 handoff's
assumptions 1-6). None changes the repo: 2 and 3 are in #47's fix commit `bdd6050`, and the A10
specs already state 1-6 as rules.

## Still open from Naoki

1. Wi-Fi the counting phones use: Deco main / guest / C64's own Wi-Fi (blank on 11-12).
2. Tokens on the first `/naoki-qs` run with pr-reviewer: main, how many subagents, each (blank).
3. Restaurant PC: done / not yet / any [X] messages (blank).

## Open questions (carried)

From 11-12: Q1 (`/commissary/meats` and Settings reads return costs to anyone; ADR-043), Q2 (#47
items f, h and the "no sleep" part of g, in the walkthrough), Q3 (queue numbering after 3zz), Q4
(miscut staff meals join when the miscut item exists), Q5 (rice grams per cup is a placeholder).
New: when a screen starts editing memberships (roles page, staff page), its spec must say how it
shares the truth with the people workbook (ADR-047's reopen line).

Carried from 11-02: Q3 (pizza stock), Q4 (staff-order Loyverse field), Q5 (Likod bottles), Q6
(photos), Q7 (#40 labels), Q8 (roadmap order), Q9 (operating expenses; who maintains the app), Q10
(Likod's kitchen around the new year), Q11 (per-person overrides), Q13 (people workbook), Q14
(Marble and Tailscale), Q15 (does history show blind numbers?).

Carried from 11-11: the real Loyverse port (nightly sync, not urgent); restaurant PC checks 4-7
(phones on staff Wi-Fi with a reserved IP, auto-start via shell:startup, the firewall rule's
LocalPort, disk space).

## Architect queue

| ID | Item | Status |
|---|---|---|
| A0 | Decision triage (recurring) | **Last: 11-12** (#66) |
| A1 | ADRs + archive old handoffs | DONE 10-28 |
| A2 | `docs/areas/` | DONE 10-25 |
| A3 | Beta runbook | DONE 10-28 |
| A4 | Small docs + queue entries | DONE 10-28, except open Q7 |
| A5 | `scope.md` rewrite | Not started (M) - after A14b, before the first sides or supply step |
| A6 | Roster + who-does-what -> specs | DONE 11-01 |
| A7 | Blind count + recount | DONE 10-28 |
| A8 | Veggies, pantry, bar sheets | Not started (L); ADR-024, 025. Ends ADR-046's typed lines |
| A9 | Orders, arrivals, bills, prices | Not started (L); ADR-020 to 023, ADR-059 |
| A10 | Staff meals + management view | DONE 11-12 (ADR-044 to 046; 3zw-3zz) |
| A11 | Pizza station | Not started (M); ADR-031 |
| A12 | Likod as a site | Not started (L); ADR-030, 017, 018, 035, 038 |
| A13 | Money and operating expenses | Not started (M); gas/butane input in ADR-027 |
| A14a | Harvest: reversal ADR pairs | **DONE 11-12** (ADR-048 to 059) |
| A14b | Harvest: topic ADRs + slim session-status | Queued (L) - on a quiet day: no PR about to close, no other drop-in waiting, push the same day it is dry-run |

Suggested next: PR #65 through `/naoki-qs 65`; the #47 walkthrough and the PC checks; then A14b on a
quiet day ("Batch: A14b").

## Project files after this

Keep: this handoff, `architect-notes-PRIVATE.md` (refreshed 11-12b), the AREAS-PRIVATE-NOTES files
(10-24, 10-28, 11-01 and 11-12) and the Excel workbooks. Remove: `ARCHITECTURE-HANDOFF-2026-11-12.md`
(archived by this drop-in).

The reasoning is in the 11-12 A0 chat (search "issue #66", "Reading B", "full list", "A14a").
