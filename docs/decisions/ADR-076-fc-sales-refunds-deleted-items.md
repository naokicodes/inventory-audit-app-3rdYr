# ADR-076 FC's sales side: refunds subtract, deleted items keep their category

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: -

## Context

Issue #73 (PR #71, loyverse-fc). The spec said FC's side uses "the same refund handling" as the
Silingan + Likod side, where a refund is still counted like a sale (a stopgap copied from the old
Google Apps Script, waiting for the real port), and also tested "refunds subtract". It did not say
where an item deleted in Loyverse after the sale goes, or what happens to variants.

## Decision

- FC's side subtracts refunds: a sale of 4 and a refund of 1 shows 3. The Silingan + Likod side
  stays as it is until the real Loyverse port, which subtracts refunds too.
- An item deleted from FC's Loyverse since the sale keeps its old category (`show_deleted=true`):
  a deleted pizza still shows under Pizza.
- Rows are by item name. FC sells no variants today (its item list has none); if it adds some,
  revisit.

## Why

The pizzaman copies these numbers onto paper: they must be what was really sold, under the card he
looks at.

## Consequences

PR #71 is complete as built. The real port's spec carries the refund rule for every account.

## Reopen only if

FC starts selling variants, or the kitchen needs refunds shown separately.

## Sources

Issue #73, PR #71 (2026-11-14); architect chat 2026-11-14.
