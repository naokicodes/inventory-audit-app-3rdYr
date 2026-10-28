# ADR-028 In-house: staff meals and staff orders

- Status: Accepted 2026-10-25
- Decided by: Naoki
- Supersedes: none

## Context

"In-house" on paper means two things.

## Decision

- In-house = staff meals (ADR-027) + staff orders.
- Staff orders are rung up in Loyverse (sales already remove the stock) and recognised by the
  staff member's name. The landing shows an in-house summary for management.
- In-house and cash-advance slips go to the weekly payroll (money, A13), not inventory.

## Why

Stock is already handled by the sale; only the money side remains.

## Consequences

Open: which Loyverse field carries the staff name.

## Reopen only if

Staff orders stop going through Loyverse.

## Sources

ARCHITECTURE-HANDOFF-2026-10-25 (archived) items 18, 33, 53.
