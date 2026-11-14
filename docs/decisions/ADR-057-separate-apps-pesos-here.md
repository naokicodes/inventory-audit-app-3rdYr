# ADR-057 Separate apps: stock and losses in pesos are computed here (D3)

- Status: Accepted 2026-10-19
- Decided by: Naoki
- Supersedes: ADR-056 (only for stock and losses; sales money stays in SPOS)

## Context

Management wants stock and losses in pesos. SPOS holds sales and payments but has none of this
app's item catalog or loss logic.

## Decision

- Staff use this app; cashiers use the SPOS POS; management uses both: SPOS's back office for
  money in (sales, revenue, receipts) and this app's read-only dashboard for stock and losses in
  pesos. A plain link each way.
- Pesos are computed here, in an engine module: commi shrinkage, backed cost per kg, wastage and
  other allocations, variance, stock value.
- Revenue, margin and profit never enter this app. SPOS holds none of our data; finance may read
  our API later.
- This app keeps its own look and stack.

## Why

Rejected: all money in SPOS. SPOS lacks our item catalog, the loss logic would be duplicated and
drift, and kilos and pesos would sit in different apps.

## Consequences

Unit costs need a source here: the bills (ADR-059, ADR-020). The management view: ADR-029.
ADR-004 changed who controls SPOS, not this boundary.

## Reopen only if

SPOS gains this app's item catalog and loss logic.

## Sources

session-status "Separate apps - settled 2026-10-19 (D3)" and "Supply, cost and SPOS integration"
("Pesos are computed here"). Recorded 2026-11-12 (A14a).
