# ADR-092 Meat requests: where they come from, and a quick request

- Status: Accepted 2026-11-15
- Decided by: Naoki
- Supersedes: ADR-067's "the landing's meat lines ... become the internal meat request already
  built" (in part: the source of the requests, and "already built")

## Context

The internal meat request (requested -> fulfilled -> acknowledged -> cancelled; the commi's shipment
carries the request) was decided on 2026-09-28 but never built. The docs called it built. Naoki
checked the floor on 2026-11-15: at Silingan the kitchen meat ending sheet's QTY column is the
request the commi reads, while the whole landing PO, its MEATS block included, goes to suppliers.
At FC the landing's meat lines are what the commi reads, and FC's direct meats (ADR-067) are ordered
from the supplier. Sudden requests in the day go by word. When the commi's main person is away,
people take meat with no note, and shortages follow.

## Decision

- A meat request is its own record: site, meat, quantity, when it is needed (today or tomorrow),
  who asked. The commi fills it with a shipment that carries the request; the receiver taps
  Received; a request never filled can be cancelled.
- Any count sheet's PO line for an item bought "from the commi" becomes a meat request (Silingan's
  kitchen meat sheet, FC's landing). Lines bought from a supplier or by the buyer go to the landing's
  consolidation (supplier-orders).
- A "Request meat" button, for anyone who counts at a restaurant, makes a request in the day: meat
  and quantity only. Who answers for what comes later.
- No "I took it": the request is the note. If the commi person is on a break he records the shipment
  when he is back, the same day. On his rest days whoever is placed on the Commissary station, the
  head chef's commi pick, or standing access fills it (ADR-017, ADR-037); both Silingan head chefs
  get standing access to the commissary (a per-person setting, data only).
- The commi stays on paper during Beta, so meat-request is planned and specced later.

## Why

The amount asked for is what prevents shortages; a request that takes seconds gets made.

## Consequences

Planned step meat-request (replaces "commi-meat-lines"). The commissary and supplier-orders area
files and ADR-067's wording are corrected: the request and commi staging are decided, not built.

## Reopen only if

The commi wants to approve or refuse requests, or requests need prices.

## Sources

Session-status 2026-09-28 (PO Q4, round 2 C1-C3); ADR-017, ADR-037, ADR-067; architect chat
2026-11-15 (commissary and POs).
