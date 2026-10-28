# ADR-006 /naoki-qs merge policy: gates replace human code review

- Status: Accepted 2026-10-21
- Decided by: Naoki
- Supersedes: none (an exception to engineer-role's "never merge your own PR")

## Context

One person both builds (through `/naoki-qs`) and reviews. Waiting for a second human reviewer
stalls the queue.

## Decision

- For `/naoki-qs` only, these gates replace human code review: a fresh-context review subagent,
  CI, `npm run verify`, and a phone click-through for any `public/` change.
- Builder runs stop at "Ready to merge". Only `naokicodes` merges (a tap on GitHub, or
  `/naoki-qm` for a batch, which also writes the CLOSED lines).
- This overrides engineer-role's "never merge your own PR" for this command only.

## Why

The gates are consistent and cheaper than a second person, and merging stays a human act.

## Consequences

Session-status's "merge stays human" still holds: nothing autonomous merges.

## Reopen only if

A gated merge ships a regression the gates should have caught, twice; or a second regular
reviewer becomes available.

## Sources

ARCHITECTURE-HANDOFF-2026-10-21 (archived), "Decided" item 2; ARCHITECTURE-HANDOFF-2026-10-22 (archived) (`/naoki-qm`).
