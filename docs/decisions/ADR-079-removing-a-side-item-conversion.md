# ADR-079 A side-item conversion is removed only in Settings

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: -

## Context

PR #74's review: conversions can be added or changed but never removed. ADR-078 made a blank cell
"no opinion" in the import, so the import cannot express a removal.

## Decision

- The import never removes a conversion (a missing or blank one has no opinion, ADR-078).
- Settings can remove one, with a confirm, logged in the activity log like any item change.
- Past counts keep their saved main-unit numbers (side-sheets stores them). A later count typed in
  the removed unit shows "Needs a conversion" (ADR-024).

## Why

A typo'd conversion must be fixable, and the sheet must not delete one by leaving a cell empty.

## Consequences

PR #74: a remove control on each conversion in the item form, its route and a test.

## Reopen only if

Conversions start being shared between items.

## Sources

PR #74 review (2026-11-14, the stopped user-id-authorship run's summary); architect chat 2026-11-14.
