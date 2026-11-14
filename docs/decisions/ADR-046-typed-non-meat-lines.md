# ADR-046 Typed non-meat lines until the item lists exist

- Status: Accepted 2026-11-12
- Decided by: Naoki
- Supersedes: ADR-003's "Sides: an approximate kg per item" line, for staff meals, until the item
  lists exist (A8)

## Context

ADR-003 records staff-meal sides as an approximate kg per item. The app has no veggie or pantry
item list at any site yet (A8 not started; `schema.sql` holds only meats), so a cook would have
nothing to pick, and a kg on a typed name has no price behind it.

## Decision

- Until a site's veggie and pantry items exist in the app, a staff meal's **non-meat lines are
  typed**: a name and an estimated peso amount, as the paper log does today. At every site, not
  only Likod.
- They are labelled "estimated" wherever shown, and they count in the meal's cost against the
  budget.
- When the item lists exist, non-meat lines pick an item and an approximate kg (ADR-003 resumes).
  Typed lines already saved stay as they are.
- Meat lines stay quantities (grams or units), priced by the cost rule.

## Why

Management needs "spent against budget" now. A typed peso amount never changes later, so it keeps
ADR-003's reason (history stays stable). No side sheet exists yet whose "other usage" would need
kg.

## Consequences

staff-meal-log's "other" line. Answers ADR-027's open question on Likod's non-meat ingredients.

## Reopen only if

The item lists land (this ends), or management wants kg for sides before then.

## Sources

Architect chat 2026-11-11 (item 16, Likod); architect chat 2026-11-12 (questions 2-3, "recs").
