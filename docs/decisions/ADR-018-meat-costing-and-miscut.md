# ADR-018 Counted-meat costing and miscut as stock

- Status: Accepted 2026-10-28
- Decided by: Naoki
- Supersedes: the 10-21 costing note "backed cost per kg = batch / backed kg" (generalised, not reversed)

## Context

Since 24d the yield records miscut kg as analytics only, never as stock. At the Likod grill a
whole chicken gives roughly half portions and half miscut (trim and bones), and staff meals
centre on the miscut.

## Decision

- Batch cost = input quantity x unit cost.
- **Portions and miscut share one cost per kg** = batch cost / (backed kg + miscut kg). With no
  miscut this is batch / backed kg, the earlier rule.
- Shrinkage pesos (reporting) = batch x (raw - backed) / raw.
- Loss %, Status and Excess Loss stay raw vs backed: miscut never softens the judgment.
- **Miscut becomes a counted kg item**, filled by the yield's miscut weight and carried over
  until announced as waste. Staff meals draw grams from it; the rest (bones) closes out as
  Wastage.

## Why

Staff meals from miscut get a real cost without counting the batch twice.

## Consequences

The prices area's costing line is amended. Built with staff meals (A10) and Likod (A12).

## Reopen only if

Miscut weights prove unreliable in practice.

## Sources

ARCHITECTURE-HANDOFF-2026-10-21 (archived), spec notes (costing); the 2026-10-28 architect conversation (handoff 2026-10-28 and its roster addendum), item 83; session-status steps 24d-i to 24d-iii.
