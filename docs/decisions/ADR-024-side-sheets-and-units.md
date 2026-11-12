# ADR-024 Side sheets: separate sheets, flexible units

- Status: Accepted 2026-10-24
- Decided by: Naoki
- Supersedes: none

## Context

Paper side sheets mix units ("1/2", sacks, kg, pieces).

## Decision

- Kitchen Veggies and Pantry are separate sheets, separately assignable (one person may hold
  both; normally the kitchen dispatcher, ADR-014). Staff fill only beginning and ending.
- Each item has a main unit plus optional conversions (1 sack = 25 kg). A count may be entered
  in any unit, fractions allowed ("1 1/2"). A row mixing units with no conversion shows what was
  entered and "add a conversion", never a guessed usage.
- Likod gets Veggies and Pantry sheets copied from Silingan's lists, starting closed.

## Why

Flexibility without wrong numbers.

## Consequences

Sides family (A8). Meat on the landing stays one unit (ADR-016).

## Reopen only if

Conversions prove too much to maintain.

## Sources

ARCHITECTURE-HANDOFF-2026-10-22 (archived) item 7; ARCHITECTURE-HANDOFF-2026-10-25 (archived) items 16, 17, 43.
