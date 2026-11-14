# ADR-078 Side items: a skipped row changes nothing; conflicts are held; the main unit is fixed

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: -

## Context

PR #74 (side-items) review questions. The spec said a sheet named in SideItems.csv gets "exactly
its listed items active", but also that some rows are skipped. It did not say what happens when one
item's rows (on different sheets) disagree on how it is bought, its cost or a conversion, and cubic
found that changing an item's main unit in Settings left its conversion factors unchanged (so every
conversion would silently mean something else).

## Decision

- A skipped SideItems row (held duplicate, unit clash, bad value) changes nothing: the item's
  existing link on that sheet stays as it was, on or off. Only items left off the tab are switched
  off.
- An item's own fields (main unit, conversions, how it is bought, cost) must agree across all its
  rows; a blank cell has no opinion. When two non-blank values differ, that field keeps its stored
  value and the report lists the conflict. A conversion for the same unit with two different
  factors is a conflict too; conversions that do not clash are merged. The item's links still
  apply. The import never picks a winner (ADR-047's spirit).
- Settings shows an on / off switch for the item itself (off: it leaves every sheet's counting
  page; history stays), as the spec's Page line says.
- An item's main unit can be changed only while it has no conversions (and, once side-sheets
  exists, no counts). Otherwise Settings refuses: "Make a new item instead" (ADR-062).

## Why

Every guess here would change what a count means without anyone seeing it.

## Consequences

PR #74 changes in its own files. side-sheets adds the "no counts" check to the main-unit rule.

## Reopen only if

Items start needing per-sheet prices or per-sheet units.

## Sources

PR #74 review and cubic findings (qpr 2026-11-14 21:48); architect chat 2026-11-14.
