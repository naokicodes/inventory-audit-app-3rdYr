# ADR-051 Yield output is always kg (Path 1)

- Status: Accepted 2026-09-28
- Decided by: Naoki
- Supersedes: ADR-050

## Context

ADR-050 made a counted output legitimate. That broke the settled 24b-v rule: a unit-tracked
effective output credits kg straight back onto a count balance, a data-corruption bug found
2026-09-02. Issue #16 raised the conflict.

## Decision

- The commi yield output is always kg. No `output_quantity`.
- `miscut_weight` is a field for analytics; it is not subtracted from loss %.
- Guards: a unit-tracked effective output is rejected (24b-v); backed + miscut <= raw; miscut is
  >= 0 and finite.
- The backed-up ledger is unchanged.
- Unit stock at the commi is staged restaurant meat (ADR-053), never a yield output.

## Why

It keeps the settled rule and the ledger intact while making miscut visible. The lesson (#16):
check every new spec against the settled decisions, not only against a handoff.

## Consequences

Built as 24d-i, 24d-ii and 24d-iii. Counted pieces come from staging or the restaurant's
conversion (ADR-053).

## Reopen only if

The commi must stock a counted yield output that staging and restaurant conversion cannot
express.

## Sources

session-status "Step 24b-v" and "Step 24d-i" (2026-09-28); `ARCHITECTURE-HANDOFF-2026-09-28`
section 2 (archived). Recorded 2026-11-12 (A14a).
