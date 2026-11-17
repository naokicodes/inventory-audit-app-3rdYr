# ADR-099 Admin and management are base roles only

- Status: Accepted 2026-11-17
- Decided by: Naoki
- Supersedes: ADR-034 in part (a role with admin or read-only given as an extra role); ADR-042 in
  part (its stopgap line: "the check moves into permissions.js once role-assignments exists")

## Context

Fable PERM-09 and C-14: the Roles page accepts the admin role as an extra role at all sites. The
Roles page then treats that person as an admin (they can edit roles, and their own base role), while
Settings, the admin commands and the site bypass read only the base role and refuse them. Two
definitions of "admin" are live; read-only by assignment has the same split.

## Decision

- A role that has admin or read-only can only be a person's base role. The Roles page and the people
  import refuse it as an extra role ("Give this as the person's base role").
- Every admin and read-only check reads the base role, `isAdmin` included.
- Every other switch still comes from the base role and the live extra roles at a site (ADR-034).

## Why

One definition, and the smaller change. ADR-084's "a read-only base role" stays true as written.

## Consequences

Step roles-guard. It lists any existing extra-role row with admin or read-only (none expected on
beta.db) and refuses new ones.

## Reopen only if

Someone needs to be an admin at one site only.

## Sources

docs/reviews/fable-2026-11-17-1-permissions.md (PERM-09); -3-consistency.md (C-14); architect chat
2026-11-17 (answer 16).
