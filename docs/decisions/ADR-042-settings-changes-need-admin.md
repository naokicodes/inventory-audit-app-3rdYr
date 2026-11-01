# ADR-042 Settings changes need an admin

- Status: Accepted 2026-11-02
- Decided by: Naoki
- Supersedes: none

## Context

None of the Settings routes checks `can_admin`. Anyone, logged out included, can change meats,
locations, conversions, restaurants and commissaries.

## Decision

- Every Settings change (POST, PUT, PATCH, DELETE under `/api/settings`) needs a logged-in user
  with `can_admin` (super-admin, admin). Logged out -> 401; anyone else -> 403.
- Reads stay open: other pages fill their dropdowns from them.
- Sheet setup is part of Settings: admins only, switched-off sites included (issue #53).
- A stopgap: once role-assignments exists, the check moves into `permissions.js` (`can`, ADR-034)
  without touching the Settings routes again.

## Why

It is the biggest open hole, and the fix is one middleware.

## Consequences

Settings tests log in as an admin. At Beta only Naoki changes Settings.

## Reopen only if

A job that is not admin needs to change a setting (then it gets a switch, ADR-034).

## Sources

Issue #54, item 2 (group e); issue #53, item 1. Architect chat 2026-11-02 (A0), items 7, 16.
