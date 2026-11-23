# ADR-117 The purchaser's run records expenses: receipt totals, cash given, the short

- Status: Accepted 2026-11-23; detailed by ADR-122 (fares, tips, the short; the receipt's photo is
  optional)
- Decided by: Naoki
- Supersedes: ADR-059 and ADR-068 in part (the buying money is no longer kept out of the app, for
  the purchaser's run only)

## Context

The purchaser fills a logbook page per run before service: each store's receipt total per
restaurant, fares, tips, the cash given, the total purchased, the cash left, the cash counted and the
short; the main supervisor checks and signs it (money.md). So far the app kept the buying money out
(ADR-059: how and when the supplier was paid is never stored; money.md). Naoki wants the purchaser's
receipt totals in the app, and the podium's count and the purchaser's receipt meet on the receipt.

## Decision

- The purchaser types each receipt's grand total, with the receipt's photo (ADR-068), after the run
  and before service: the time the logbook is filled today. No lines or unit prices from him.
- The run holds the cash given and the cash counted at the end; the app adds up the receipts and
  shows the cash left and the short.
- The main supervisor marks the run checked, as her signature does today.
- These are expenses (money out). Sales money (money in) never enters this app (D3); the cashier's
  till stays out.
- Fares, tips and who covers a short are settled in A9's spec (money.md's open questions).

## Why

Naoki: it records expenses, not sales. Typing a total is faster than the logbook's arithmetic, the
short shows at once, and receipt totals are what the app's costs need later.

## Consequences

A9's spec (the purchaser's test, specced with the podium's) builds the run's page. money.md and
arrivals-and-bills.md change their "not stored" lines. A short can later become a charge (ADR-088).

## Reopen only if

The cashier's till or sales money would have to enter the app, or SPOS takes over expenses.

## Sources

Architect chat 2026-11-23 (A9 round 1, answers 2 to 4).
