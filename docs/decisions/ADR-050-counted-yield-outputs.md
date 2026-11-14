# ADR-050 Counted yield outputs and a closing weight flow

- Status: Superseded by ADR-051 (accepted 2026-09-26)
- Decided by: Naoki
- Supersedes: -

## Context

Miscut hid in the raw - backed gap, mixing true loss with reusable trim. The yield log measured
the output in kg only.

## Decision

Build the full yield model at once: every combination a commi can yield (unit to unit, unit to
kg, and the kg-input variants), an output quantity in the output's own unit, and miscut as a
first-class weight wired into allocations. 24b-v is redefined from "the output must be
kg-tracked" to "the weight flow must close" (raw in = output weight + miscut + true loss), with a
hard block only for configurations that cannot close.

## Why

Cover every combination once, as a solid core. The commi is strict yet flexible: block only what
would silently corrupt.

## Consequences

Never built: reversed two days later.

## Reopen only if

Superseded: reopen ADR-051 instead.

## Sources

`ARCHITECTURE-HANDOFF-2026-09-26` section 4 (archived); `docs/archive/handoffs/README.md`, "How
the decisions changed - Yield". Recorded 2026-11-12 (A14a).
