# ADR-062 Side items: one imported catalog with units

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: -

## Context

Paper side sheets are printed once and then crossed out and written in. ADR-024 settled separate
sheets and flexible units; the 2026-09-28 decisions settled one side-item catalog with a per-site
join (B1).

## Decision

- Side items come from the settings workbook through import-settings: a Sheets tab (site, sheet,
  on or off) and a Side items tab (site, sheet, item, main unit, conversions, how it is bought,
  cost). Never seeded in the repo. Settings fixes single items later.
- One catalog: an item exists once and a sheet lists the items it counts. An item has one main
  unit. A site that counts it in a unit with no fixed conversion (pesos at one site, grams at
  another) uses a second item.
- "Peso" is a unit; an item counted in pesos is valued at face.
- A sheet named in the tab gets exactly the items listed, in that order. Items no longer listed are
  switched off on that sheet, never deleted. Sheets not in the tab are untouched. The people
  import's rules apply (ADR-047): a duplicated row is held, and names match ignoring capitals and
  extra spaces.
- Adding a conversion: an `edit_side_items` switch, on for head-chef by default (admin through
  admin). Until the switches exist, admins only.

## Why

Lists change often; one tab is how the owner keeps them, and switching off keeps the history.

## Consequences

Steps side-items and side-sheets; cost-guard adds the switch.

## Reopen only if

A sheet's list must differ from day to day.

## Sources

Architect chat 2026-11-14 (A8 Q3, Q4); ADR-024; session-status 2026-09-28 (B1).
