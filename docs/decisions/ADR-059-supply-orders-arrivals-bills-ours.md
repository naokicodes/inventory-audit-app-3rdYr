# ADR-059 Supplier orders, arrivals and bills are ours

- Status: Accepted 2026-10-19; the frozen-SPOS assumption superseded by ADR-005, the unit-cost
  line by ADR-020; detailed by ADR-021 to ADR-023
- Decided by: Naoki
- Supersedes: ADR-058

## Context

SPOS was treated as frozen at the copy Naoki was handed (`5950238`), so anything needing SPOS
changes had to be written here. Pesos are computed here (ADR-057), so costs have to be here too.

## Decision

- Supplier orders are made here: the commi for raw meat, the podium for side items. Supplier,
  lines (item, quantity, unit), date needed, no prices; one supplier catalog for meat and sides.
  Sent as a picture plus text.
- Arrivals are recorded against the order: quantity-only (ADR-049), a photo of the supplier's
  receipt, off-list lines tagged, lines that never came cancelled.
- The bill: the cashier enters what was paid against an arrival, on a narrow Bills page in this
  app behind a bills-only role (an exception to "the cashier is not an app user"). How and when
  the supplier was paid is never stored here.
- This app owns cost prices: valuation uses the item's last billed arrival unit cost; the settings
  cost is the fallback and the only source until bills exist.
- SPOS's Suppliers, Purchase Orders and inventory screens go unused at these sites.

## Why

SPOS was frozen, and the valuation computed here needs the costs here.

## Consequences

Areas: supplier orders, arrivals and bills, prices. ADR-020 replaced "unit cost = paid / received"
with the last billed unit price; ADR-004 keeps the Bills page in this app.

## Reopen only if

Supplier payments must be tracked, or the Bills page moves into SPOS.

## Sources

session-status "Supply, cost and SPOS integration - settled 2026-10-19"; ADR-020 (its
Supersedes line). Recorded 2026-11-12 (A14a).
