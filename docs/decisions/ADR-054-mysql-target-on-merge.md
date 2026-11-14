# ADR-054 MySQL as the database target on a merge with SPOS

- Status: Superseded by ADR-055 (accepted 2026-09-28)
- Decided by: Naoki
- Supersedes: -

## Context

SPOS (Node/Express + MySQL) became the POS integration target, and this work was expected to
merge onto it.

## Decision

The database target becomes MySQL on the eventual merge. No migration on main until then; a
branch completes the SPOS sales integration. New schema and the settings importer stay portable
(no SQLite-only features in the users and roles layer).

## Why

So the identity layer and the importer would not need rewriting for the merge.

## Consequences

The "Portability (MySQL note)" lines in the user-sites, import-identity, user-id-authorship and
sheets-tier1 specs.

## Reopen only if

Superseded: reopen ADR-055 instead.

## Sources

session-status "POS integration target = SPOS" (marked superseded 2026-10-03) and
"Configure-from-the-ground-up posture"; `ARCHITECTURE-HANDOFF-2026-09-28` (archived). Recorded
2026-11-12 (A14a).
