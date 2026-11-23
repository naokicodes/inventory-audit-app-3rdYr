# ADR-120 A PO line is the amount to buy, typed; a catalog item or a typed name

- Status: Accepted 2026-11-23
- Decided by: Naoki
- Supersedes: none (narrows ADR-021 for the first tests)

## Context

The paper PO lists, per block (meats, veggies, groceries ...), each item, what is on hand (REM) and how
much to buy. Naoki's "proper screen" after the sort: the categories, items, quantities and required
numbers. The first podium test uses a PO Naoki types from photos (ADR-114, podium.md). Side items'
on-hand counts are not in the app until side-sheets.

## Decision

- "Required numbers" = the amount to buy, typed by hand, as on the paper PO. A par (the level an item
  is topped up to, the order worked out from it) comes later, as an optional per-item number that
  fills the amount in.
- A PO line: the restaurant, the day it is for, an item from the catalog or a typed name, the amount
  and its unit, on hand (optional, the paper's REM) and its supplier (the item's main supplier,
  changeable on the line). Lines show in blocks by category, as on the paper.
- A typed name is for things on no sheet (the podium's logbook has many); an admin can make it a
  catalog item later.
- For the tests an admin types the lines. The counters' own lines, the landing's final say with
  history and estimated cost (ADR-021) and the supplier picture come with step supplier-orders.

## Why

The paper already has the number, so typing it is no new work and needs nothing the app lacks. A par
needs on-hand counts first.

## Consequences

Step po-lines. supplier-orders.md. The par: after side-sheets.

## Reopen only if

The app should work out the PO before side-sheets, or the paper PO stops carrying the amount.

## Sources

Architect chat 2026-11-23 (A9 round 2, questions 5 and 8: "recs").
