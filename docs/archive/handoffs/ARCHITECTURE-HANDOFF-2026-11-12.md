> **ARCHIVED 2026-11-12 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/` (the item map in its
> README shows where each numbered decision went). Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - 11-12: its drop-in landed as `abd87b0` (after 3zt, PR #64: 561 tests).
> - 11-12 (A0): issue #66 answered (ADR-047): the people import holds a duplicated name, matches names ignoring capitals and extra spaces, and treats a person's site list as complete (removals too). PR #65 resumes.
> - 11-12 (A14a): reversal pairs recorded as ADR-048 to ADR-059. A14a is DONE.

# Architecture Handoff - 2026-11-12 (A10 + triage, drop-in built)

**Lead, not source.** Checked against `origin/main` at `2812ffc` (550/550, AUDIT CLEAN); the A10
drop-in (`dropin-a10.py`) was dry-run on that HEAD: applied, verify passed, a second run refused.
It also applies over the CLOSED lines that 3zt, 3j and 3zu would add. Replaces
`ARCHITECTURE-HANDOFF-2026-11-02.md` and `ARCHITECTURE-HANDOFF-2026-11-11.md` (both archived word
for word by this drop-in). Session-status still wins.

## State

- On main: `2812ffc`. After the push: ADR-043 to ADR-046; issue #60's answers in site-filter and
  #62's in settings-guard; site-filter-ii's additions; PR #47's fix list in restaurant-pc;
  ensureRoleDefaults in role-assignments; the head-count prefill note in roster-day-status; new
  steps table-scroll, 3zv sign-the-cookie, 3zw-3zz staff meals; the `/review` trim; staff meals
  APP -> Specced.
- After the push, close #60 so `/naoki-qs` picks PR #59 (3m) back up. #62 is already closed; PR
  #61 (3zu) needs only its gates now.
- **Runnable:** 3zt then 3j (one at a time: package.json); table-scroll any time (one at a time with
  PRs on its pages); PR #59 after #60 closes; PR #61. PR #63 (3zb) needs Naoki's phone check. PR
  #47 (3ze) is Naoki's own: the walkthrough is next.
- Restaurant PC: unchanged from 11-11. Move it to `beta-1` now; `beta-2` after 3zt lands and the
  smoke list passes.
- The 3z queue series is full (3zz). The next new step needs a numbering choice (open Q3).

## Decided 11-11/12 (all recorded - nothing pending)

- ADR-043: catalog reads (id, code, name, unit; no stock, no money) stay open;
  /stock-receipts/meats leaves 3m's guard for good.
- #60: Q1 A, Q2 A, Q3 B (the narrowing goes to 3zs), Q4 B. #62: Reading B; saving presets and
  conversion standards needs an admin, in 3zs. cubic P1: no change; 3zv after 3zr.
- #30: table-scroll specced (20 tables on 8 pages; daily-audit excluded). #47: the full fix list.
  `/review` reads only the step's section plus "Things NOT to re-litigate" and keeps verify's
  summary lines.
- Found while speccing: 3zj seeded its switches in seed.js only, and beta.db is never reseeded.
  Fixed by ensureRoleDefaults() at server start with a defaults_applied marker table.
- ADR-044 rice: never in the budget; a daily estimate from dated settings; OJT counted in.
- ADR-045 logging: one record per site, day and slot; any cook logs (grillers are cooks: they
  hold the checker role, and stations grant nothing); the head chef checks or fixes, never
  approves; extra meals; copying a past meal; late logs up to 3 days back by the head chef;
  cooking for another site is logged at the cooking site.
- ADR-046: until A8's item lists exist, non-meat lines are a typed name and estimated pesos, at
  every site.

## Assumptions made while speccing (Naoki: confirm or flip)

1. The "log staff meals" switch sits on the checker role, so anyone who counts at a site (bar,
   pizza and podium too) can log a meal. The head chef's check catches mistakes. To narrow it
   later, an admin moves the switch to a "cook" role in the Roles page (3zk), with no code.
2. Extra meals add no rice.
3. A cook's change after the head chef checked a meal sends it back to "to check".
4. "To check" shows the last 7 business days; copying lists the last 30 days.
5. Dev and preview seed slot names: RA "Afternoon" and "Evening"; FC "Meal 1" to "Meal 3".
6. Until bills exist (A9), meat pesos use the meat's current settings cost, so changing a cost
   re-prices past meals. Budgets (copied per meal) and rice rates (dated) don't move.

## Open questions

1. `/commissary/meats` returns cost_per_unit and allowed_leeway_pct to anyone, and so do the
   Settings reads. Should non-admins see costs? (ADR-043)
2. #47 review items f (only two Loyverse tokens), h (VS Code, Claude Code and graphify on the PC)
   and the "no sleep" part of g: no change recorded. Confirm them in the walkthrough.
3. Queue numbering after 3zz (the old "### 3." to "### 7." entries are taken).
4. Miscut staff meals (ADR-018) are not in A10; they join when the miscut item exists.
5. Rice grams per cup is a placeholder (private notes). The head chef weighs a served cup once.

Carried from 11-02: Q3 (pizza stock), Q4 (staff-order Loyverse field), Q5 (Likod bottles), Q6
(photos), Q7 (#40 labels), Q8 (roadmap order), Q9 (operating expenses; who maintains the app),
Q10 (Likod's kitchen around the new year), Q11 (per-person overrides), Q13 (people workbook), Q14
(Marble and Tailscale), Q15 (does history show blind numbers?). Q1 and Q2 are answered; Q12 moves
into the #47 walkthrough.

Carried from 11-11: the real Loyverse port (nightly sync, not urgent); restaurant PC checks 4-7
(phones on staff Wi-Fi with a reserved IP, auto-start via shell:startup, the firewall rule's
LocalPort, disk space).

## Architect queue

| ID | Item | Status |
|---|---|---|
| A0 | Decision triage (recurring) | **Last: 11-11** (#60, #62, #30, #47, cubic P1) |
| A1 | ADRs + archive old handoffs | DONE 10-28 |
| A2 | `docs/areas/` | DONE 10-25 |
| A3 | Beta runbook | DONE 10-28 |
| A4 | Small docs + queue entries | DONE 10-28, except open Q7 |
| A5 | `scope.md` rewrite | Not started (M) - after A14, before the first sides or supply step |
| A6 | Roster + who-does-what -> specs | DONE 11-01 |
| A7 | Blind count + recount | DONE 10-28 |
| A8 | Veggies, pantry, bar sheets | Not started (L); ADR-024, 025. Ends ADR-046's typed lines |
| A9 | Orders, arrivals, bills, prices | Not started (L); ADR-020 to 023 |
| A10 | Staff meals + management view | **DONE 11-12** (ADR-044 to 046; 3zw-3zz) |
| A11 | Pizza station | Not started (M); ADR-031 |
| A12 | Likod as a site | Not started (L); ADR-030, 017, 018, 035, 038 |
| A13 | Money and operating expenses | Not started (M); gas/butane input in ADR-027 |
| A14a | Harvest: reversal ADR pairs | **Queued** (M) - next architect batch |
| A14b | Harvest: topic ADRs + slim session-status | Queued (L) - after A14a, on a quiet day |

Suggested next: the #47 walkthrough and the PC checks, then A14a ("Batch: A14a").

## Project files after this

Keep: this handoff, `architect-notes-PRIVATE.md` (refreshed 11-12), the AREAS-PRIVATE-NOTES files
(10-24, 10-28, 11-01 and 11-12) and the Excel workbooks. Remove: `ARCHITECTURE-HANDOFF-2026-11-02.md`
and `ARCHITECTURE-HANDOFF-2026-11-11.md` (archived by this drop-in), and
`ARCHITECTURE-HANDOFF-2026-10-28.md` (archived in the repo since 11-01).

The reasoning is in the 11-11 architect chat ("Subagent token usage and rice cost") and the 11-12
chat (search "grillers are cooks", "typed non-meat", "ensureRoleDefaults", "table-scroll").
