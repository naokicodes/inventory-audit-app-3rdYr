# ADR-041 Site scoping: one owner site per request

- Status: Accepted 2026-11-02
- Decided by: Naoki
- Supersedes: none (fills in site-filter's "enumerate which routes")

## Context

Routes name their site in different ways: in the request, only through a row, as two sites at
once, or as a list across sites. Site-filter's spec asked for the list without giving it (issue
#54). ADR-010 keeps site scope by membership, with admin, super-admin and management bypassing.

## Decision

- **site-filter (3m):** routes that name one site (the issue's group a) and routes that reach a
  site only through a row or a meat id (group b: the row's site).
- **Two sites in one request (site-filter-ii):** each route has ONE owner site, the site of the
  people who do the work. Commi shipments, shipment presets and the adjustments destination list
  -> the commissary. Conversion standards -> the restaurant (ratio conversion is the
  restaurant's). Allocations -> the entry's restaurant. Never "both sites".
- **Lists across sites (site-filter-ii):** the restaurant picker and the dashboard stock rollup
  trim to the user's sites. History stays open (activity_log has no site column), but must not
  show a blind user the numbers the landing hides. The admin commands (oversold check, batch stock
  sync) need a bypass role. Kitchen Sales stays open (dish sales, no stock, no money).
- ADR-011's "anyone may view" means anyone who may use that site.

## Why

Requiring both sites would stop commi staff from shipping to a restaurant they are not members
of. The owner is whoever does the work, which is also who the site check should ask about.

## Consequences

- Settings is not a site question; it is gated by ADR-042.
- A new route that names a site joins one of these groups in its own spec.

## Reopen only if

A two-site request has no natural owner, or a job needs to work at a site it is not a member of
(then a role assignment, ADR-034, not a route exception).

## Sources

Issue #54, item 2. Architect chat 2026-11-02 (A0), items 6, 14, 15, 17.
