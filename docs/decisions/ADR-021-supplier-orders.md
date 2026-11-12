# ADR-021 Supplier orders (POs)

- Status: Accepted 2026-10-28
- Decided by: Naoki
- Supersedes: the 10-28 item 76 wording "each cook's first PO"

## Context

Every station writes a PO for its items on paper; the landing person copies them and may cut
quantities.

## Decision

- Each sheet's counter writes the first PO lines for their own items (for the kitchen sheets,
  the dispatcher, ADR-014).
- The landing person has the final say; the head chef and supervisors may edit. Every change
  records who and what.
- The landing person, head chef and supervisors see the estimated cost; counters do not. The
  supplier picture never shows prices.
- Supplier deliveries are ordered by Messenger after closing.

## Why

It matches the paper while keeping a history of cuts.

## Consequences

Supply family (A9).

## Reopen only if

Ordering moves to a supplier portal or the POS.

## Sources

ARCHITECTURE-HANDOFF-2026-10-22 (archived) item 10; ARCHITECTURE-HANDOFF-2026-10-25 (archived) item 27; the 2026-10-28 architect conversation (handoff 2026-10-28 and its roster addendum), items 76 and 84.
