# ADR-022 Buying: shop runs, tags and the buyer's list

- Status: Accepted 2026-10-25
- Decided by: Naoki
- Supersedes: none

## Context

About 70% of buying is shop runs; about 30% is supplier delivery.

## Decision

- Shop runs are done by the buyer with a floor supervisor; the buyer is a job (ADR-010).
- Items are tagged by how they are bought; an admin sets the tags in Settings and the landing
  person can suggest changes.
- The buyer sees one list: items and quantities, no prices.
- Buyer receipts: one bill per receipt, grouped under the day's run.
- Unplanned buys are recorded against items (the receipt goes to the cashier, with who bought
  it); shortfalls go onto the buyer's list.

## Why

It matches how buying actually happens.

## Consequences

Supply family (A9).

## Reopen only if

Most buying moves to supplier delivery.

## Sources

ARCHITECTURE-HANDOFF-2026-10-25 (archived) items 27, 28, 56, 57; the 2026-10-28 architect conversation (handoff 2026-10-28 and its roster addendum), item 91.
