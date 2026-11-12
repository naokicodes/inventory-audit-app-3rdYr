# ADR-043 Catalog reads stay open

- Status: Accepted 2026-11-11
- Decided by: Naoki
- Supersedes: none

## Context

site-filter (PR #59) guarded `GET /stock-receipts/meats?restaurant_id=` as a group (a) route
(issue #54). The destination dropdowns on the shipment and allocation pages, and the terminal's
`ship` command, call it for the restaurant being shipped TO, so a commissary-only checker got 403
there (issue #60, Q4). Issue #60 Q3 also showed pages that list every commissary's meats.

## Decision

- A **catalog read** lists what exists - id, code, name, unit - with no stock and no money. It
  needs no site access and no login.
- `GET /stock-receipts/meats` is a catalog read. It leaves site-filter's guard for good.
- `GET /commissary/meats` with no `commissary_id` keeps listing every commissary's meats
  (stock-receipts.html, terminal.html and settings.html need them all); site-filter-ii does not
  narrow it. It is not a pure catalog read - it also returns `cost_per_unit` and
  `allowed_leeway_pct` - so it keeps site-filter's check when a commissary is named.
- Whether non-admins should see those two fields is open. They are readable through the Settings
  reads too (ADR-042: reads stay open).

## Why

Picking the destination's meat is part of shipping, and the shipping site is the one checked
(ADR-041). A list of meat names shows nothing a counter does not already see on paper.

## Consequences

site-filter drops `/stock-receipts/meats` from group (a). A new read that adds stock or money is
not a catalog read and is scoped like any other.

## Reopen only if

A catalog read starts returning stock or money, or a site's meat list itself becomes private.

## Sources

Issue #60 (Q3, Q4). Architect chat 2026-11-11 (triage items 3-4), recorded 2026-11-12 (A10 drop-in).
