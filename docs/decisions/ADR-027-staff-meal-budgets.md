# ADR-027 Staff meals: slots, budgets and head count

- Status: Accepted 2026-10-28
- Decided by: Naoki, with the head chef
- Supersedes: the 10-25 item 40 (keep the paper's figure as the maximum reference)

## Context

ADR-003 records staff meals as quantities and left one check open. Management judges meals
against a budget, and each restaurant eats a different number of times a day.

## Decision

- **Extends ADR-003**: quantities stay the record; pesos are computed. The side sheet's inhouse
  column is unused; staff meals live on their own page; pantry stays out (answers ADR-003's
  check).
- **Meal slots per restaurant are settings** (today: Silingan 2, Likod 2, FC 3).
- **Each slot has a budget mode**: a fixed amount, head count x a per-head rate, or none. Every
  value is an editable setting, never in the repo. Budgets are per meal: the fixed amount is the
  budget and head count x rate is the maximum.
- **Head count**: one field per meal, prefilled from the people on duty at that restaurant
  (ADR-013), editable by the cook for late arrivals.
- **OJT** is counted separately, with no budget (they use their own money): an optional OJT part
  on each slot.
- One cook per meal logs right after cooking: meat in grams, sides estimated. A logged meal
  stands alone (date, site, slot, cook, lines). Leftovers are out of scope.
- **The meal planner** (four cooks a month, each planning a week; a plan can be voided with a
  reason and stays in history) is a later, separate feature; a logged meal can later link to a
  plan entry.
- **Gas and butane stay out of meal cost**: they are operating expenses (money, A13).
- Likod cooks its own staff meals; its meat reaches it through the commi. Miscut meals follow
  ADR-018.

## Why

Budgets are how management judges meals; quantities keep history stable.

## Consequences

Staff-meals family (A10). Open: whether the budget also pays for rice; Likod's non-meat
ingredients.

## Reopen only if

Management stops using a per-meal budget.

## Sources

ARCHITECTURE-HANDOFF-2026-10-22 (archived) item 13; ARCHITECTURE-HANDOFF-2026-10-25 (archived) items 32, 40, 52; the 2026-10-28 architect conversation (handoff 2026-10-28 and its roster addendum), items 60-66 and 93.
