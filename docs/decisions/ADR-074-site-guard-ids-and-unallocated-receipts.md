# ADR-074 The site guard refuses malformed ids; a receipt with no restaurant is its commissary's

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: site-filter's "an id that finds no site (missing row, bad input) passes through",
  for malformed input only

## Context

Issue #68 (PR #59). The guard turns an id into a site and lets through any id that finds no site,
so the route can answer 400 or 404. But some routes read a malformed id as "no filter": a checker
of commissary B, refused for A, got A's counts by writing the id as `abc` or naming it twice. And a
stock receipt with no restaurant (the "Unallocated" commissary receipt) finds no site, so any
checker could edit or delete it. That kind of receipt was retired on 2026-08-29: no route creates
one now, so only leftovers could exist.

## Decision

- Every id the guard reads (query string, body, `rows[]`, `:id`) that is present and not empty must
  be one whole number above 0: a JSON integer or a string of digits only. Anything else ("abc",
  "1abc", "1.5", 0, a negative, the field given twice) gets 400 before the route runs, logged in or
  not. A well-formed id that finds no row still passes through to the route's 404.
- A stock receipt with no restaurant belongs to the commissary of its `commissary_meat_id`; editing
  or deleting it needs that commissary's site (the shipping site, as ADR-041). With no commissary
  either, only admins.

## Why

The guard and the route must read an id the same way, and the only safe way is to refuse what both
cannot read the same. An unassigned commissary receipt came from the commissary that shipped it.

## Consequences

PR #59 (site-filter) changes in its own files: one id check in requireSiteAccess.js, the
stock-receipt fallback in siteAccess.js, and tests. site-filter-ii uses the same id check.

## Reopen only if

A page needs to send several ids in one field (then the route and the guard both learn lists).

## Sources

Issue #68 (PR #59, 2026-11-14); architect chat 2026-11-14.
