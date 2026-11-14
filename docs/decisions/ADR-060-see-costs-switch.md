# ADR-060 Unit costs need a "see costs" switch

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: -

## Context

ADR-043 left open whether non-admins should see `cost_per_unit` on the commissary meat list. The
Settings reads return it too (ADR-042: reads stay open), to anyone on the restaurant Wi-Fi, logged
in or not (ADR-040). Counters are not meant to see costs (ADR-021), and bills (A9) will add real
billed prices.

## Decision

- A switch, `see_costs` (ADR-034). On by default for head-chef, supervisor and management; admin
  and super-admin have it through admin.
- A read that returns a unit cost or price leaves those fields out for anyone without `see_costs`
  at that site, logged out included (no logged-out pass for money).
- Covered now: `cost_per_unit` and `cost_per_portion` on the commissary meat list and the Settings
  meat and dish reads. Every later read with a unit cost or price (side items, bills, a PO's
  estimated cost) uses the same check.
- `allowed_leeway_pct` stays visible: it is not money.
- Totals a feature is built to show stay: the cook's staff-meal running cost and budget (ADR-027).

## Why

Prices are the owners' figures, and counters never needed them to count.

## Consequences

Step cost-guard, after role-assignments (a named default set). This answers ADR-043's open
question. A cook can still work out one meat's cost from a one-line staff meal; accepted, because
the budget needs pesos.

## Reopen only if

Counters need costs to do their work.

## Sources

Architect chat 2026-11-14 (A0 Q1, "Rec").
