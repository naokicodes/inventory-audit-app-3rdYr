# ADR-052 Two-stage staging: the commi converts and ships

- Status: Superseded by ADR-053 (held 2026-09-24 to 2026-09-28)
- Decided by: Naoki
- Supersedes: -

## Context

Commi meat has to become restaurant meat, and someone applies the kg-to-units ratio.

## Decision

The commi is the source of truth for meat: it processes, converts to the restaurant's form
(applying the ratio) and ships, weighing (no ice) and photographing. The restaurant only
acknowledges.

## Why

No separate reason is recorded; the 2026-09-26 handoff gives the shape only.

## Consequences

Never built.

## Reopen only if

Superseded: reopen ADR-053 instead.

## Sources

`architecture-decisions-DRAFT-2026-09-24` and `ARCHITECTURE-HANDOFF-2026-09-26` (archived);
session-status "Commissary staging + restaurant conversion model" ("Earlier version wrongly put
the ratio-conversion at the commi"). Recorded 2026-11-12 (A14a).
