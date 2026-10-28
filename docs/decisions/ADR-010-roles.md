# ADR-010 Roles and site scope

- Status: Accepted 2026-10-28
- Decided by: Naoki
- Supersedes: none

## Context

The five seeded roles predate the supply, roster and buying work.

## Decision

- **super-admin** (Naoki); **admin** (full power for a trusted helper; none yet).
- **head-chef**: the landing person (the FOH counter, ADR-014).
- **supervisor**: makes and edits the roster, sees everything including variance, edits POs,
  never counts.
- **checker**: station staff.
- **management**: read-only, with no exception (the roster has no approval step, ADR-013).
- **cashier**: bills only; one per restaurant.
- **buyer**: a job held by named people (a main and a sub), not a roster station or a daily
  pick; anyone holding it sees the buyer list at any time.
- **Site scope is by membership.** People who work across restaurants (the buyer, some
  supervisors) hold several memberships. No new role bypasses site scoping; only the existing
  admin and management bypasses remain.

## Why

Roles follow real jobs, and memberships keep scoping to one mechanism.

## Consequences

- import-identity and site-filter run as specced.
- The supervisor role and the buyer job arrive with the roster and supply families.
- Until supervisor exists, blindness is derived from role flags (ADR-015).

## Reopen only if

A job needs every site's data without being management.

## Sources

ARCHITECTURE-HANDOFF-2026-10-22 (archived) item 5; ARCHITECTURE-HANDOFF-2026-10-25 (archived) item 27; the 2026-10-28 architect conversation (handoff 2026-10-28 and its roster addendum), items 79, 88, 91.
