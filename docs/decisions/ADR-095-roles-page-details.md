# ADR-095 Roles page: switch wording, removing extra roles, the copy default

- Status: Accepted 2026-11-15
- Decided by: Naoki
- Supersedes: none (fills in roles-page)

## Context

Issue #84 (PR #83, roles-page). The spec left three things open: the one-line meanings of the four
older switches, whether an extra role can be removed while its role is switched off (PR #83 refuses,
server and page), and which role "Add role" copies by default (PR #83 starts on supervisor).

## Decision

- The four lines stay as PR #83 wrote them: "Enters counts", "Finalizes the day", "Admin: changes
  settings and roles everywhere", "Sees every site, changes nothing".
- An extra role can always be removed, whether its role is on or off. Adding a switched-off role
  stays refused.
- "Add role" starts as a copy of checker; the admin picks another role to copy from.

## Why

Removing only ever takes power away, while switching a role back on just to remove one person would
hand its powers back to everyone else holding it in the meantime. A rushed "Add role" should never
hand out supervisor powers by accident.

## Consequences

PR #83 changes to match (permissions.js removeAssignment, roles.html, roles.test.js), then the phone
check (ADR-039).

## Reopen only if

Removing an assignment ever needs a record of who approved it.

## Sources

Issue #84 (PR #83); architect chat 2026-11-15 (A0, "recs").
