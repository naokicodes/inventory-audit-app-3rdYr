# ADR-083 Built-in roles keep their names

- Status: Accepted 2026-11-15
- Decided by: Naoki
- Supersedes: roles-page's "Rename", for the built-in roles only

## Context

roles-page (3zk) has a Rename action. The code finds the built-in roles by name: seed.js, the
default switch sets ensureRoleDefaults applies (role-assignments), the test accounts, and the
import's super-admin rule. ADR-047 already says the import never renames a role.

## Decision

- The six built-in roles - super-admin, admin, management, head-chef, checker, supervisor - cannot
  be renamed. The page shows their names without Rename; the server refuses a new name for one.
- Any other role can be renamed, still unique by the name key (ADR-073).
- A built-in role added later (for example cashier or buyer, with the supply family) joins the list
  in the step that seeds it.

## Why

A renamed built-in role would quietly fall out of the code that finds it by name, and the next
reseed or default set would bring a second copy back.

## Consequences

roles-page: one list of built-in names in server/db/permissions.js; PUT /api/roles/:id refuses a
changed name for them; tests.

## Reopen only if

Roles get a fixed key separate from their shown name.

## Sources

ARCHITECTURE-HANDOFF-2026-11-14 (archived), open questions ("roles-page renames"); architect chat
2026-11-15 (A0, "recs").
