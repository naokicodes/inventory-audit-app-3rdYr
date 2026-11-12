# ADR-026 Waste is its own entry

- Status: Accepted 2026-10-25
- Decided by: Naoki
- Supersedes: none

## Context

On paper, waste is written on a separate sheet.

## Decision

- Waste is recorded as its own entry. Meat waste uses the daily-audit adjustment types
  (Wastage, Spoilage, Damaged); side items extend the same idea.
- COOKED, INHOUSE and WASTE columns on the sheets are computed from their own entries, never
  typed at count time.
- A later addition to an ending ("12+6" on paper) is an edit with history, not a special
  input.

## Why

One place per fact; counting stays counting.

## Consequences

Miscut close-out is a Wastage entry (ADR-018).

## Reopen only if

Staff need to type waste at count time.

## Sources

ARCHITECTURE-HANDOFF-2026-10-25 (archived) items 38, 39, 50.
