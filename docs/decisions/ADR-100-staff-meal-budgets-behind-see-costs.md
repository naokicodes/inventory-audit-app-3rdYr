# ADR-100 Staff-meal budgets and rates: on the cook's page, behind see_costs in Settings, never logged out

- Status: Accepted 2026-11-17
- Decided by: Naoki
- Supersedes: none (refines ADR-060)

## Context

Fable PERM-06, C-03, C-04 and U-11: the Settings reads of meal-slot budgets, per-head rates and the
rice price per kg answer everyone, logged out included, and History returns the same figures from
its before/after snapshots. ADR-060 kept the cook's staff-meal totals visible but did not say who
reads these figures in Settings.

## Decision

- The staff-meal page shows a meal's budget and per-head rate to the people who log that meal.
- Settings reads of budgets, per-head rates and the rice price need see_costs at that site. The rice
  price counts as a unit price.
- History leaves cost and budget fields out of its snapshots for anyone without see_costs.
- None of these figures ever goes to a logged-out request.

## Why

Budgets are the owners' figures (ADR-009). The cook needs the budget for the meal in front of them,
not the Settings table.

## Consequences

cost-guard gains a 2026-11-17 decision block: price_per_kg joins the cost fields; the two staff-meal
Settings reads and History are covered; a save that leaves a key out keeps the stored value.

## Reopen only if

The owners want budgets hidden from the cooks too.

## Sources

docs/reviews/fable-2026-11-17-1-permissions.md (PERM-06); -3-consistency.md (C-03, C-04);
-5-pages-updates.md (U-11); architect chat 2026-11-17 (answer 15).
