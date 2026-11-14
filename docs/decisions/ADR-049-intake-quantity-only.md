# ADR-049 Intake is quantity-only; kg is weighed at production

- Status: Accepted 2026-09-28 (drafted 2026-09-24)
- Decided by: Naoki
- Supersedes: ADR-048

## Context

The yield event already records `raw_weight_in` (required) and `input_quantity`, so the kg of a
unit-tracked raw is measured where it is used.

## Decision

- Commissary intake receipts (25a) record the quantity only. No weigh-in at intake.
- kg is measured at production, as `raw_weight_in` on the yield log.
- No "estimate kg from a count" either (rejected separately).
- Not affected: the commi's weight on shipments (staging D2, ADR-053), 24b-v (ADR-051) and miscut.

## Why

Kg-to-kg yield is satisfied where the kg is actually used. A unit-tracked raw needs no kg at rest.

## Consequences

25a shrank to a quantity-only receipt; the arrival against a supplier order stays quantity-only
(ADR-059).

## Reopen only if

A report needs the kg of a unit-tracked meat at rest.

## Sources

`architecture-decisions-DRAFT-2026-09-24` section 8 and `ARCHITECTURE-HANDOFF-2026-09-26`
(archived); session-status "Steps 25a / 25b" (revised 2026-09-28). Recorded 2026-11-12 (A14a).
