# ADR-126 The run's cash-out lines; a receipt shared by two restaurants is two receipts

- Status: Accepted 2026-11-26
- Decided by: Naoki
- Supersedes: none (adds to ADR-122's lines)

## Context

The purchaser's logbook has "cash out <person>" lines (photos 2026-11-13 to 11-15): a head chef, a
supervisor or the COO takes some of the purchaser's cash to buy something needed (one reads "palit
tape", buy tape). Naoki will look further; this is the working reading. A store's receipt sometimes
covers two restaurants; the purchasers already split it between them on paper.

## Decision

- "+ Cash out" in the run: who (a typed name; the box suggests active people), the amount, what for
  (optional). No restaurant (the logbook gives none). It counts in Spent, in its own "Cash out" group,
  not in a restaurant's subtotal.
- A receipt for two restaurants is two receipts, one per restaurant with its share, as the purchasers
  split it today; a photo on one of them is enough.
- Both are lines the purchasers already write: no new work (ADR-122).

## Why

The run replaces the logbook page (ADR-122), so it needs every kind of line the page has; the
split is already done by the people who know the receipt.

## Consequences

purchaser-run's 2026-11-26 block: kind CASH_OUT with `person`, `for_site` NULL for it only.

## Reopen only if

The cash-out lines turn out to be something else (for example the COO's money paid back).

## Sources

Architect chat 2026-11-26 (questions 10, 10a and 12; Naoki: "Recs?", "Okay", "the purchasers already
split them").
