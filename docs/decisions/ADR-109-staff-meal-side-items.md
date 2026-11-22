# ADR-109 Staff-meal lines may name a side item, with an approximate quantity

- Status: Accepted 2026-11-17 (recorded 2026-11-22)
- Decided by: Naoki
- Supersedes: ADR-046 in part (non-meat lines typed only, until the item lists exist)

## Context

ADR-046 kept a staff meal's non-meat lines as a typed name with an estimated peso amount until A8's
item lists existed. The side-item catalog merged on 2026-11-14 (side-items, PR #74), so that end
condition has arrived (Fable C-17), and ADR-063's COOKED column needs what staff meals used.

## Decision

- In staff-meal-log, a non-meat line can pick a side item from its site's catalog, with an
  approximate quantity in one of the item's units. A typed name with an estimated peso amount stays
  for anything not in the catalog.
- staff_meal_lines gets the optional side item, quantity and unit in staff-meal-log itself, so
  nothing is migrated later.
- Meat lines stay quantities (ADR-003). Staff rice stays an estimate line (ADR-044).

## Why

The catalog exists now. Picking the item lets COOKED subtract what the staff ate, without a second
migration.

## Consequences

staff-meal-log gains a 2026-11-17 block.

## Reopen only if

The cooks find picking slower than typing.

## Sources

docs/reviews/fable-2026-11-17-3-consistency.md (C-17); session-status 2026-11-17 architect block
("Also accepted").
