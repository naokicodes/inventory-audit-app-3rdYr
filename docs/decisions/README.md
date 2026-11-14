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
| ADR-003 | Staff meals recorded as quantities, not prices | Accepted 2026-10-20; the sides line, for staff meals, superseded by ADR-046 until the item lists exist |
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
| ADR-014 | Kitchen dispatch and tonight's kitchen counter | Accepted 2026-10-28; landing line superseded by ADR-035 |
| ADR-015 | Blind counting and the quiet recount | Accepted 2026-10-28; derivation and Likod lines superseded by ADR-038 |
| ADR-016 | One unit per meat on the landing | Accepted 2026-10-28 |
| ADR-017 | Commi access, not a sub-commi | Accepted 2026-10-28; superseded in part by ADR-067 (FC's direct meats) |
| ADR-018 | Counted-meat costing and miscut as stock | Accepted 2026-10-28 |
| ADR-019 | Allocation requests | Accepted 2026-10-28 |
| ADR-020 | Prices: the last billed unit price | Accepted 2026-10-22 |
| ADR-021 | Supplier orders (POs) | Accepted 2026-10-28 |
| ADR-022 | Buying: shop runs, tags and the buyer's list | Accepted 2026-10-25 |
| ADR-023 | Receiving and arrivals | Accepted 2026-10-24 |
| ADR-024 | Side sheets: separate sheets, flexible units | Accepted 2026-10-24 |
| ADR-025 | Bar: exact sales check, not blind | Accepted 2026-10-25 |
| ADR-026 | Waste is its own entry | Accepted 2026-10-25; superseded in part by ADR-064 (side waste after endings) |
| ADR-027 | Staff meals: slots, budgets and head count | Accepted 2026-10-28; who logs superseded by ADR-045; rice answered by ADR-044 |
| ADR-028 | In-house: staff meals and staff orders | Accepted 2026-10-25 |
| ADR-029 | Management view: Spent and Used | Accepted 2026-10-24 |
| ADR-030 | Likod is its own site | Accepted 2026-10-25 |
| ADR-031 | Pizza: dough first (partly decided) | Accepted 2026-10-25 |
| ADR-032 | Grouped navigation, after table-scroll | Accepted 2026-10-21 |
| ADR-033 | The sales day turns at 8am | Accepted 2026-10-30; scope widened by ADR-036 |
| ADR-034 | Roles per site and role switches | Accepted 2026-11-01 |
| ADR-035 | The landing belongs to the head-chef role at that site | Accepted 2026-11-01 |
| ADR-036 | The business day turns at 8am everywhere | Accepted 2026-11-01 |
| ADR-037 | Roster placements, copying, picks and access | Accepted 2026-11-01 |
| ADR-038 | Blind counting follows the site's roles; Likod counts blind | Accepted 2026-11-01 |
| ADR-039 | Testing: Claude checks the logic, people check the looks; fake test accounts | Accepted 2026-11-02 |
| ADR-040 | Logged-out visitors keep working until write-permission | Accepted 2026-11-02 |
| ADR-041 | Site scoping: one owner site per request | Accepted 2026-11-02 |
| ADR-042 | Settings changes need an admin | Accepted 2026-11-02 |
| ADR-043 | Catalog reads stay open | Accepted 2026-11-11; its cost question answered by ADR-060 |
| ADR-044 | Staff rice is an estimate line, never in the meal budget | Accepted 2026-11-11 |
| ADR-045 | Staff meals: any cook logs, the head chef checks | Accepted 2026-11-11 |
| ADR-046 | Typed non-meat lines until the item lists exist | Accepted 2026-11-12 |
| ADR-047 | People import: held duplicates, loose names, full site lists | Accepted 2026-11-12 |
| ADR-048 | Every intake records a count and a weight | Superseded by ADR-049 |
| ADR-049 | Intake is quantity-only; kg is weighed at production | Accepted 2026-09-28 |
| ADR-050 | Counted yield outputs and a closing weight flow | Superseded by ADR-051 |
| ADR-051 | Yield output is always kg (Path 1) | Accepted 2026-09-28 |
| ADR-052 | Two-stage staging: the commi converts and ships | Superseded by ADR-053 |
| ADR-053 | Three-stage staging: the ratio is the restaurant's | Accepted 2026-09-28 |
| ADR-054 | MySQL as the database target on a merge with SPOS | Superseded by ADR-055 |
| ADR-055 | Hybrid A: two apps, two databases; this web app is the core | Accepted 2026-10-03 |
| ADR-056 | Money stays in the POS | Superseded in part by ADR-057 |
| ADR-057 | Separate apps: stock and losses in pesos are computed here (D3) | Accepted 2026-10-19 |
| ADR-058 | The 10-03 leans: SPOS owns supplier POs and cost prices | Superseded by ADR-059 |
| ADR-059 | Supplier orders, arrivals and bills are ours | Accepted 2026-10-19; frozen-SPOS assumption superseded by ADR-005, unit-cost line by ADR-020 |
| ADR-060 | Unit costs need a "see costs" switch | Accepted 2026-11-14 |
| ADR-061 | Queue steps are named, not numbered | Accepted 2026-11-14 |
| ADR-062 | Side items: one imported catalog with units | Accepted 2026-11-14 |
| ADR-063 | Side sheets show usage while counting | Accepted 2026-11-14 |
| ADR-064 | Side waste: a prompt after endings | Accepted 2026-11-14 |
| ADR-065 | FC: kitchen sheets in the app, the rest on paper | Accepted 2026-11-14 |
| ADR-066 | FC on Loyverse; Kitchen Sales switches between POS groups | Accepted 2026-11-14 |
| ADR-067 | How it's bought: from the commi; FC's direct meats | Accepted 2026-11-14 |
| ADR-068 | Buyer runs: ticks and receipt photos | Accepted 2026-11-14 |
| ADR-069 | Scope: every inventory sheet, not meat only | Accepted 2026-11-14 |
| ADR-070 | Remote access through Tailscale | Accepted 2026-11-14 |
| ADR-071 | cubic's findings are sorted by the builder | Accepted 2026-11-14; its wait superseded by ADR-075 |
| ADR-072 | A PR is reviewed against main's spec, by the pr-reviewer agent | Accepted 2026-11-14 |
| ADR-073 | Role names are unique by the name key | Accepted 2026-11-14 |
| ADR-074 | The site guard refuses malformed ids; a receipt with no restaurant is its commissary's | Accepted 2026-11-14 |
| ADR-075 | cubic is optional; late findings are swept up after merge | Accepted 2026-11-14 |
| ADR-076 | FC's sales side: refunds subtract, deleted items keep their category | Accepted 2026-11-14 |
| ADR-077 | No page scrolls sideways: rows of tabs stay in their own strip | Accepted 2026-11-14 |

**Reversal pairs (A14a, recorded 2026-11-12).** ADR-048 to ADR-059 record swings decided before
these records existed, in pairs: each older record is marked superseded by the one after it, and
keeps its reasoning. They are numbered in the order recorded, so their dates are earlier than
ADR-047's.

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
