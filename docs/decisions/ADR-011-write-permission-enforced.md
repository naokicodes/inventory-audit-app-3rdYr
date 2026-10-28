# ADR-011 Write permission is enforced; process is not

- Status: Accepted 2026-10-22
- Decided by: Naoki
- Supersedes: none (sharpens scope.md's "assists, not enforces")

## Context

The app must stop wrong-person writes without blocking a night when reality differs from the
plan.

## Decision

- Anyone may view. Only tonight's assigned person, or someone rostered on that station, may
  write. The kitchen is strict: only the person the head chef picked (ADR-014).
- Once the roster exists, the login list is tonight's roster; someone with nothing assigned sees
  "No work for you tonight". PINs before Live: decided later.
- The app guides against human error (one row per item, unit picker, warnings) - that is the
  problem it exists to fix - but it does not enforce the order of the process.

## Why

Permission is about trust; process varies night to night.

## Consequences

Reassignment covers absences (ADR-014).

## Reopen only if

Wrong-person writes keep happening despite the rule.

## Sources

ARCHITECTURE-HANDOFF-2026-10-22 (archived) items 4 and 12; ARCHITECTURE-HANDOFF-2026-10-25 (archived) item 44.
