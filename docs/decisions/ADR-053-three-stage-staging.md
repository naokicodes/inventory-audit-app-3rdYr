# ADR-053 Three-stage staging: the ratio is the restaurant's

- Status: Accepted 2026-09-28
- Decided by: Naoki
- Supersedes: ADR-052 (the ratio at the commi, and "the restaurant only acknowledges"; the
  commi's weight and photo on shipments stand)

## Context

`commissary_conversion_standards` is restaurant-scoped, and the conversion allocation already
exists restaurant-side.

## Decision

Three stages:
1. **Commi processing (yield):** raw to backed-up, kg out (ADR-051).
2. **Commi staging and packing:** commi meat to ready-to-ship restaurant meat through
   `commissary_meat_map`, a direct correspondence with no ratio. Held staged at the commi and
   released by a shipment; delivered in kg or as a reported piece count. No transit shrinkage:
   transit loss is an allocation.
3. **Restaurant conversion, optional and on the spot:** received meat to portions against a ratio
   standard; variance from the standard is shrinkage (an allocation). Standards live in
   settings, can be overridden per log, and a conversion may have several, one of them the
   costing default.

## Why

Most goods are received ready and used as they are; conversion is the exception (Silingan
converts on the spot, FC batch-preps), and the data already placed the ratio at the restaurant.
Putting it at the commi was the same class of error as #16.

## Consequences

Stage 2 extends `commissary_shipments` (staged -> released) with the commi's weight, photo and an
acknowledgement (round-2 D1-D2); stage 3 reuses the restaurant's allocation machinery (D4).

## Reopen only if

A commi starts converting by ratio for a restaurant, or a restaurant receives meat in a form the
map cannot express.

## Sources

session-status "Commissary staging + restaurant conversion model - settled 2026-09-28" and
"Architecture decisions round 2" (Staging); `ARCHITECTURE-HANDOFF-2026-09-28` section 2
(archived). Recorded 2026-11-12 (A14a).
