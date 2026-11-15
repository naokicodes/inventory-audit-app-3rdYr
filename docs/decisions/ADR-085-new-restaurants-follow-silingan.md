# ADR-085 New restaurants follow Silingan's setup by default

- Status: Accepted 2026-11-15
- Decided by: Naoki
- Supersedes: none

## Context

FC runs a reduced scope in the app (ADR-065): landing, veggies, pantry and a drinks-only bar. Specs
for bars, sides and the roster need a default shape for a restaurant that does not exist yet (a
future branch).

## Decision

- A new restaurant is assumed to work like Silingan: a meat landing, kitchen side sheets, and a full
  bar (items sold as they are, raws, desserts).
- FC stays the exception, with the scope ADR-065 gives it.
- Specs design for Silingan's shape; a smaller restaurant switches sheets off (ADR-065's switched-off
  sheets).

## Why

Silingan is the headquarters and the fullest system; designing for it means a smaller site is a
subset, never a rebuild.

## Consequences

bar-check and side-waste are designed for Silingan's full bar. Nothing changes for FC.

## Reopen only if

A new branch is set up differently on purpose (for example a kiosk with no kitchen).

## Sources

Architect chat 2026-11-15 (A8 part 2).
