# ADR-073 Role names are unique by the name key

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: -

## Context

ADR-047 matches names ignoring capitals and extra spaces, and skips a people-sheet row whose key
matches two existing users. It said nothing about a role name, or a user's default_role, matching
two existing roles (for example "Admin" and "admin"), issue #67.

## Decision

- A Roles.csv row, or a Users.csv row's default_role, that matches two or more existing roles by
  the key is skipped and reported, like the user case (PR #65 as built).
- Nothing creates or renames a role to a name whose key another role already holds: the import
  cannot (it matches by key), and roles-page's "Add role" and rename refuse it with a message.
- Role names keep the app's spelling (ADR-047); super-admin's flags stay fixed.

## Why

Two roles one letter-case apart cannot be told apart by staff; a role is a permission, so the
import must not guess. With the second rule the case cannot arise through the app at all.

## Consequences

PR #65 stands as built. roles-page gains the key check on create and rename.

## Reopen only if

Roles need names that differ only in letter case.

## Sources

Issue #67 (PR #65, 2026-11-14); architect chat 2026-11-14.
