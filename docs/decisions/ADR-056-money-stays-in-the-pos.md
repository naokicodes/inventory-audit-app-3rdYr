# ADR-056 Money stays in the POS

- Status: Superseded in part by ADR-057 (accepted 2026-09-28; money in stays in SPOS)
- Decided by: Naoki
- Supersedes: -

## Context

SPOS is the POS; the cashier handles the money receipt.

## Decision

The POS is the source of truth for money and sales: this app hands information out to the POS
and pulls sales in. The money receipt is the cashier's, outside this app.

## Why

No separate reason is recorded.

## Consequences

"The cashier is not an inventory-app user" (one exception later: the Bills page, ADR-059).

## Reopen only if

Superseded in part: reopen ADR-057 instead.

## Sources

session-status "POS integration target = SPOS"; `ARCHITECTURE-HANDOFF-2026-09-26` (archived,
"the money receipt is the cashier's, outside this app"). Recorded 2026-11-12 (A14a).
