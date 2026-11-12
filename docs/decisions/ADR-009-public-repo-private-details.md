# ADR-009 Public repo, private details

- Status: Accepted 2026-10-24
- Decided by: Naoki
- Supersedes: none

## Context

The repo is public. Real names, prices and the owners' figures come up constantly.

## Decision

- The repo keeps invented names. Nicknames go only into the local database through the
  private import.
- Prices, budgets, the owners' figures, money flows, photos and nicknames live in the Claude
  project files or a gitignored `docs/private/`, never in the repo.
- A paper-sheet photo is sent once, in the conversation for that area; its structure is
  transcribed into the area's IRL section, which then stands in for the photo.

## Why

The repo is public (decision-record rule 6).

## Consequences

AREAS-PRIVATE-NOTES files hold the private companion to `docs/areas/`.

## Reopen only if

The repo becomes private.

## Sources

ARCHITECTURE-HANDOFF-2026-10-22 (archived) item 14; ARCHITECTURE-HANDOFF-2026-10-25 (archived) items 19 and 21.
