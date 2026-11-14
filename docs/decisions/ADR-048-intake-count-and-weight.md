# ADR-048 Every intake records a count and a weight

- Status: Superseded by ADR-049 (accepted 2026-09-02)
- Decided by: Naoki
- Supersedes: -

## Context

Meat arrives boxed and is paid for on total kg; the commissary weighs the box, then opens it and
counts. `commissary_stock_receipts` had a single quantity column. Processing already recorded
both numbers (`input_quantity` and `raw_weight_in` on the yield log).

## Decision

Every intake of a unit-tracked meat records both a count and a weight: the count drives the
stock balance, the weight drives the money and the yield percentage. Step 25a would give
commissary receipts the weight.

## Why

Both are real measurements of one event. With one column, either the purchase weight is lost or
kg are debited against a count (the 24b-v corruption arriving by another door).

## Consequences

Step 25a was first specced with a weigh-in at intake.

## Reopen only if

Superseded: reopen ADR-049 instead.

## Sources

session-status "Things NOT to re-litigate" (the count-and-weight entry, marked superseded
2026-10-13) and "Steps 25a / 25b"; `architecture-decisions-DRAFT-2026-09-24` section 8
(archived). Recorded 2026-11-12 (A14a).
