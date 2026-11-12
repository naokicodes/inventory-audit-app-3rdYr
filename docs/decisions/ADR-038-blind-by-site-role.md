# ADR-038 Blind counting follows the site's roles; Likod counts blind

- Status: Accepted 2026-11-01
- Decided by: Naoki
- Supersedes: ADR-015 (its derivation line and its "Likod grill landing not blind until it has a
  head" line only)

## Context

ADR-015 derived blindness from role flags until a supervisor role added an explicit flag, and kept
Likod not blind until it had a head. Roles now apply per site (ADR-034), and Likod gets an
appointed head chef (ADR-035).

## Decision

- A person counts blind at a site unless one of their live roles there has the "sees expected"
  switch. No user = blind.
- **Likod's grillers count blind**; Likod's appointed head chef sees. Naoki: Likod's standards are
  not yet reliable enough to compare with Silingan, so blind for now.
- Unchanged from ADR-015: the commissary is never blind, the bar is not blind (ADR-025), side sheets
  have no expected value; the server strips the numbers; recounts as decided.

## Why

One rule per site, switchable without code.

## Consequences

Role-assignments (3zj) replaces the derivation in blindCount.js; blind-count (3za) takes the site
as an argument from the start.

## Reopen only if

Likod's counts become reliable enough that its grillers should see expected figures.

## Sources

Architect chat 2026-11-01 (A6), confirmation 3.
