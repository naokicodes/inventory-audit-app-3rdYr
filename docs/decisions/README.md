# Decision records

One file per decision. **The why lives here.** `docs/session-status.md` holds the
current state plus an index of these records; a handoff carries only what is in
flight. (ADR-001 explains the split.)

## Rules

1. **One decision per file**, named `ADR-###-short-slug.md`, numbered in the order
   it was recorded (not decided). The `ADR-` prefix avoids collisions with queue
   ids (`3u`) and the round-2 letters (`D3`, `D2-c`).
2. **Never rewrite an accepted record.** Only its Status and Superseded-by lines
   change. A reversal is a NEW record with `Supersedes: ADR-###`; the old one is
   marked `Superseded by ADR-###`. Wrong decisions keep their reasoning.
3. **Every record has "Reopen only if"**, so nobody reopens it by accident.
4. **Sources** point to where the full reasoning lives (session-status entry name
   and date, session-history, the chat date).
5. **If a record and session-status disagree, that is a bug.** Stop, ask Naoki,
   and fix both the same day.
6. **Public-safe.** The repo is public: no real prices, costs, budgets, credentials
   or staff details. Figures live in settings, off-repo.
7. **Prefer executable.** If a decision can also be a guard plus a test, add one
   and link it here. A test can't drift; a paragraph can.

## Template

```
# ADR-### Title

- Status: Proposed | Accepted YYYY-MM-DD | Superseded by ADR-###
- Decided by:
- Supersedes:

## Context
## Decision
## Why
## Consequences
## Reopen only if
## Sources
```

## Index

| ID | Title | Status |
|---|---|---|
| ADR-001 | Record decisions as decision records | Accepted 2026-10-20 |
| ADR-002 | Definition of done: Beta and Final | Accepted 2026-10-20 |
| ADR-003 | Staff meals recorded as quantities, not prices | Accepted 2026-10-20 |
| ADR-004 | SPOS ownership while Prince is busy | Accepted 2026-10-20 |
| ADR-005 | SPOS moves into this repo after Beta | Accepted 2026-10-21 |
| ADR-006 | /naoki-qs merge policy: gates replace human code review | Accepted 2026-10-21 |
| ADR-007 | Beta runs on the restaurant PC, pinned to tags | Accepted 2026-10-28 |
| ADR-008 | How architect work runs: area docs, a queue, Edge states, ask first | Accepted 2026-10-24 |
| ADR-009 | Public repo, private details | Accepted 2026-10-24 |
| ADR-010 | Roles and site scope | Accepted 2026-10-28 |
| ADR-011 | Write permission is enforced; process is not | Accepted 2026-10-22 |
| ADR-012 | Stations and sheets | Accepted 2026-10-22 |
| ADR-013 | The roster | Accepted 2026-10-28 |
| ADR-014 | Kitchen dispatch and tonight's kitchen counter | Accepted 2026-10-28 |
| ADR-015 | Blind counting and the quiet recount | Accepted 2026-10-28 |
| ADR-016 | One unit per meat on the landing | Accepted 2026-10-28 |
| ADR-017 | Commi access, not a sub-commi | Accepted 2026-10-28 |
| ADR-018 | Counted-meat costing and miscut as stock | Accepted 2026-10-28 |
| ADR-019 | Allocation requests | Accepted 2026-10-28 |
| ADR-020 | Prices: the last billed unit price | Accepted 2026-10-22 |
| ADR-021 | Supplier orders (POs) | Accepted 2026-10-28 |
| ADR-022 | Buying: shop runs, tags and the buyer's list | Accepted 2026-10-25 |
| ADR-023 | Receiving and arrivals | Accepted 2026-10-24 |
| ADR-024 | Side sheets: separate sheets, flexible units | Accepted 2026-10-24 |
| ADR-025 | Bar: exact sales check, not blind | Accepted 2026-10-25 |
| ADR-026 | Waste is its own entry | Accepted 2026-10-25 |
| ADR-027 | Staff meals: slots, budgets and head count | Accepted 2026-10-28 |
| ADR-028 | In-house: staff meals and staff orders | Accepted 2026-10-25 |
| ADR-029 | Management view: Spent and Used | Accepted 2026-10-24 |
| ADR-030 | Likod is its own site | Accepted 2026-10-25 |
| ADR-031 | Pizza: dough first (partly decided) | Accepted 2026-10-25 |
| ADR-032 | Grouped navigation, after table-scroll | Accepted 2026-10-21 |
| ADR-033 | The sales day turns at 8am | Accepted 2026-10-30 |

## Handoff item map

Architect handoffs numbered their decisions. Where each one is recorded (items 1-15 from the
10-22 handoff, 16-59 from 10-25, 60-94 from 10-28; the 10-21 list by name):

| Items | Record |
|---|---|
| 10-21: SPOS into the repo; merge policy; Beta; grouped nav; roster storage | ADR-005; ADR-006; ADR-007; ADR-032; ADR-013 |
| 1, 31 | ADR-020 prices |
| 2, 3, 39, 42, 67-71, 75, 77, 78 | ADR-015 blind counting |
| 4, 12, 44 | ADR-011 write permission |
| 5, 79, 88, 91 | ADR-010 roles |
| 6, 26, 45, 86 | ADR-012 stations and sheets |
| 7, 16, 17, 43 | ADR-024 side sheets |
| 8, 46, 48, 66 | ADR-030 Likod |
| 9, 29 | ADR-023 receiving |
| 10, 76, 84 | ADR-021 POs |
| 11, 23, 24, 55, 86-89, 92, 94 | ADR-013 roster |
| 13, 32, 40, 52, 60-65, 93 | ADR-027 staff meals |
| 14, 21 | ADR-009 public repo |
| 15, 19, 20, 22 | ADR-008 how architect work runs |
| 18, 33, 53 | ADR-028 in-house |
| 25, 54, 84, 85 | ADR-014 kitchen dispatch |
| 27, 28, 56, 57 | ADR-022 buying |
| 30, 47, 73, 90 | ADR-017 commi access |
| 34, 35 | ADR-029 Spent and Used |
| 36 | ADR-025 bar |
| 37, 51 | ADR-031 pizza |
| 38, 50 | ADR-026 waste |
| 41, 72 | ADR-016 one unit per meat |
| 58, 80-82 | ADR-007 Beta |
| 74 | ADR-019 allocation requests |
| 83 | ADR-018 costing and miscut |

Not records: demos and dates (10-21 "Sunday shows", 59), recipe data (49, settings), and the
roadmap order (still open).
