# ADR-035 The landing belongs to the head-chef role at that site

- Status: Accepted 2026-11-01
- Decided by: Naoki
- Supersedes: ADR-014 (its line "the landing can be assigned to anyone, a supervisor as fallback"
  only)

## Context

ADR-014 let the landing be assigned to anyone. Naoki clarified on 2026-11-01: the landing is the
head chef's page, and a cook never does it.

## Decision

- The landing (the review page: expected vs counted, allocations, recount orders) belongs to
  whoever holds the head-chef role at that site, as a base role or an assignment (ADR-034).
- **Appointing** someone = giving them head-chef at that site, optionally until a date. It may be a
  supervisor, Naoki, or very rarely a cook.
- House rule at Silingan: an original head chef is always on duty, unless both are out for medical
  reasons; appointment covers that case. FC and Likod have no head-chef row: Naoki appoints a
  trusted person at each, with a backup.
- There is no nightly landing pick.

## Why

The landing is a head chef's judgment; access follows the role, so appointing is one action.

## Consequences

Role-assignments (3zj) carries it. The Kitchen Window dispatcher still counts (ADR-014).

## Reopen only if

The landing routinely needs someone who should not hold head-chef rights.

## Sources

Architect chat 2026-11-01 (A6), answers 4 and confirmation 2.
