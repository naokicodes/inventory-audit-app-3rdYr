# ADR-023 Receiving and arrivals

- Status: Accepted 2026-10-24
- Decided by: Naoki
- Supersedes: none

## Context

Goods arrive at three places, and each restaurant's cashier handles its own receipts.

## Decision

- Veggies go to the kitchen, which only confirms them (the buyer weighed them); meat goes to
  the commi; everything else goes to the podium (logbook and Misc area, ADR-012).
- Receivers are assigned; the roster covers their days off.
- Each restaurant's cashier gets its own receipts: Silingan and FC on arrival, Likod at shift
  end.
- Moving an arrival line between Silingan and Likod: a logged "move to the other restaurant" on
  the arrival, the same day; after counts, the existing transfer allocation.

## Why

It matches receiving today.

## Consequences

Supply family (A9).

## Reopen only if

Receiving is centralised.

## Sources

ARCHITECTURE-HANDOFF-2026-10-22 (archived) item 9 and "Workflow facts"; ARCHITECTURE-HANDOFF-2026-10-25 (archived) items 26 and 29.
