# ADR-091 Site lists stay open; each row says whether you can use it

- Status: Accepted 2026-11-15
- Decided by: Naoki
- Supersedes: site-filter-ii's "the picker returns only the user's sites" (ADR-041's list part)

## Context

Issue #81 (PR #80, site-filter-ii). GET /restaurants is the site picker on the count pages, but also
the "ship to" list on the shipment page and the terminal, and Settings' list. Trimming it to a
person's own sites leaves a commissary-only person nothing to ship to, against the shipping rules
and against ADR-043 (catalog reads stay open). Since role-assignments, a person can reach a site by
a role assignment without being a member there, but the spec's list filters looked at membership
only. And a blind counter can read, through History, the delivery quantities their count screen
hides (Q15 from 11-02).

## Decision

- GET /restaurants keeps every active restaurant (names only) and adds `can_use` per row for the
  requester. It is true for logged-out requests (ADR-040) and bypass roles.
- "Your sites" follow the site guard everywhere: membership, a live role assignment at that site, or
  a bypass role. One helper in siteAccess.js serves the list filters and `can_use`, built on the same
  rule as canUseSite.
- The count pages' pickers show only `can_use` sites, and a 403 shows its message instead of
  "Loading..." (planned step site-picker). The shipment page, the terminal and Settings keep the
  full list.
- History is unchanged in site-filter-ii. A blind viewer's History hides the numbers the count
  screen hides (planned step blind-history; Naoki to confirm, Q15).

## Why

A name list is a catalog; whether a person may act at a site is the guard's question, asked in one
place.

## Consequences

site-filter-ii as amended (server-only); new planned steps site-picker (pages) and blind-history
(server).

## Reopen only if

A site's name itself becomes private.

## Sources

Issue #81 (PR #80); ADR-040, ADR-041, ADR-043; architect chat 2026-11-15.
