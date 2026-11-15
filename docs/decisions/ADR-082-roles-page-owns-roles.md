# ADR-082 Roles are changed on the Roles page; the people workbook adds people and sets their sites

- Status: Accepted 2026-11-15
- Decided by: Naoki
- Supersedes: import-identity's "the import updates an existing role's four flags and an existing
  user's default role" (ADR-047's other rules are unchanged)

## Context

roles-page (3zk) lets an admin turn a role's switches on and off (the four legacy flags included)
and change a person's base role. The people workbook's Roles tab also sets the four flags, and its
Users tab sets each person's default role. The import wrote the sheet over the app and its report
gave only counts, so an import run to add one new person silently put back any role change made on
the page. ADR-047 asks any screen that edits people to say how it shares the truth with the sheet.

## Decision

- Once a role or a person exists, the Roles page owns its roles: a role's switches (the four flags
  too) and a person's base role. The import compares those cells and never writes them.
- The sheet still adds new roles (with their flags) and new people (with their base role), and
  still owns people's sites (ADR-047's full list) and active.
- The import report lists every sheet value it left alone, with what the app has, and says to
  change it on the Roles page. For an existing person an unknown role name is listed the same way
  and no longer skips the row: their sites and active still apply.
- The export keeps writing the app's current values, so export -> edit -> import stays in step.
- The page says how the two share the truth.

## Why

Naoki changes roles from his phone; the workbook stays the bulk tool for adding people. Roles decide
blind counting and the landing (ADR-035, ADR-038), so a silent revert of one is the worst kind of
surprise.

## Consequences

Built in roles-page: its Touches gain scripts/import-settings.js and server/db/importSettings.test.js,
so it runs after import-settings-env (same file). Until roles-page merges the import still changes
them (there is no other way to fix a role). Later import tabs (role assignments, Stations, Staff) say
in their own specs who owns what.

## Reopen only if

Roles need bulk edits from the sheet again, or someone without the page maintains roles.

## Sources

ARCHITECTURE-HANDOFF-2026-11-14 (archived), open questions from 11-12; ADR-047; architect chat
2026-11-15 (A0, "recs").
