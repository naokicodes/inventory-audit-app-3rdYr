# ADR-069 Scope: every inventory sheet, not meat only

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: scope.md's "Not a full restaurant inventory system" (2026-08)

## Context

scope.md still said the app tracks meat only, so a builder would meet a contradiction on side and
supply steps.

## Decision

The app covers the inventory sheets each site keeps in it (meat, veggies, pantry, bar, later pizza;
FC per ADR-065) and the supply around them: supplier orders, arrivals and bills. Still not a POS,
not money in (ADR-057), not recipe costing or menu engineering.

## Why

Naoki: "we upgraded from meats only to all sheets".

## Consequences

scope.md's bullet is replaced; its full rewrite stays A5.

## Reopen only if

The app goes back to meat only.

## Sources

Architect chat 2026-11-14 (Q15).
