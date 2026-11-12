# ADR-040 Logged-out visitors keep working until write-permission

- Status: Accepted 2026-11-02
- Decided by: Naoki
- Supersedes: none (answers stub-login's "routes stay open until slice 5 enforces")

## Context

Site scoping (site-filter) did not say what a request with no logged-in user gets. Beta runs
without per-person accounts: until the people workbook is imported, the only account is the
bootstrap super-admin. Forcing a login now would push counters onto that account, which bypasses
site scoping and is not blind (ADR-038).

## Decision

- Until write-permission (queue 3zr), a request with no logged-in user passes every site check
  (site-filter, site-filter-ii). It stays blind (ADR-038: no user = blind).
- From write-permission on, a logged-out request to a site-scoped route gets 401 "Log in first",
  reads included.
- Admin-only actions (Settings changes, ADR-042; the admin commands, ADR-041) need a logged-in
  admin from the step that adds the check. There is no logged-out pass for them.

## Why

Beta keeps working, and logging out never reveals expected figures. The gap closes when logging
in becomes the norm: tonight's login list (3zq) and only tonight's people writing (3zr).

## Consequences

- site-filter's route tests stay logged out; write-permission's tests log in.
- At Beta, only Naoki changes Settings or runs admin commands, logged in.

## Reopen only if

The app is reachable beyond the restaurant's Wi-Fi before write-permission lands (then a login or
the shared-password gate comes first).

## Sources

Issue #54, item 1. Architect chat 2026-11-02 (A0), items 5, 11, 16.
