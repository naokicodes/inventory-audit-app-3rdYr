# ADR-119 Suppliers: one list, a main and a backup supplier per item, a sort screen

- Status: Accepted 2026-11-23
- Decided by: Naoki
- Supersedes: ADR-022 in part (a sorted item's "how it is bought" tag follows its main supplier, set
  on the sort screen, instead of by an admin in Settings)

## Context

A9 round 1 (2026-11-23): Naoki wants each item to have a main supplier and, optionally, a backup, so a
PO splits itself by supplier and the receive screen groups arrivals the same way. About 30% of buying
is supplier delivery and 70% shop runs (supplier-orders.md). The cold-station head chef knows the
suppliers of about half the items. The purchasers start before dawn and carry the day's runs. Naoki:
never give them more work.

## Decision

- One supplier list for all three restaurants. A supplier has a name and a kind: it delivers, or we
  pick up or buy there (a shop, the market). Suppliers are switched off, never deleted.
- Each side item gets a main supplier and an optional backup. An item with neither is in "Any shop":
  it still goes on the purchaser's list.
- The sort screen: item cards (the name and an icon for the item's category; no numbers) placed into
  supplier boxes. On a phone: tap a card, then tap a box. On the PC and tablet, dragging works too.
  Icons are per category, never per item.
- Who sorts: the cold-station head chef, the supervisors or the podium. Never the purchasers. Naoki
  collects where each remaining item is bought and gives it to them.
- Setting an item's main supplier sets its "how it is bought" tag: a supplier that delivers means
  supplier delivery; one we pick up from or buy at means a buyer run. Items from the commi stay meat
  requests (ADR-092) and are not sorted.
- The A9 steps for the podium and purchaser tests, in order: suppliers, purchaser-run, po-lines,
  receive; one PR each, after the roster chain (ADR-114: the roster is the first staff test).

## Why

Sorting once means every later PO line already knows its group. The people who order and receive
know the suppliers; the purchasers' mornings are full. One list keeps one truth for the tag and the
group.

## Consequences

Step suppliers (switch edit_suppliers, ADR-123). supplier-orders.md, arrivals-and-bills.md. Settings'
how-it-is-bought select stays for unsorted items. A main supplier per restaurant waits until a
restaurant really buys an item elsewhere.

## Reopen only if

The restaurants buy the same item from different suppliers, or the sort needs something only the
purchasers know and nobody can collect from them.

## Sources

Architect chat 2026-11-23 (A9 round 1 and its brainstorm, answer 4; round 2, questions 6 and 7:
"recs, but never give the purchasers any more work ... have the supervisors sort the rest, or the
podium, since I'll be getting the data for them").
