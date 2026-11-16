# ADR-097 The app runs without a coder

- Status: Accepted 2026-11-16
- Decided by: Naoki
- Supersedes: none

## Context

Asked who looks after the app once the school project ends: no one is lined up. Naoki could, but
may not. The plan is for the app to work on its own for an admin who does not code.

## Decision

- What a restaurant changes is data an admin edits - Settings, the Roles and Staff pages, the
  people workbook - never code: stations and shift rows, sheets and items, recipes, roles, meal
  slots and the like.
- Installing, updating and backups run from the restaurant PC's launcher with plain-language
  messages. Daily use needs no git, Node or Claude Code.
- Every message tells the person what to do next, in plain words. docs/official/ is the admin's
  manual.
- New features still come through the repo; the app keeps running when nobody is coding.

## Why

The restaurants should not depend on one student being around.

## Consequences

- Each spec's edge states say what an admin sees and does, not only what the server returns.
- The Loyverse name map (loyverse-name-map.json: Silingan's dish names, FC's landing map, the pizza
  categories) is a repo file an admin cannot edit: planned name-map-settings moves it into Settings.
- Fable run 4 (scale and hosting) weighs this: backups, updates and the single PC without a coder.

## Reopen only if

A paid maintainer is arranged.

## Sources

Architect chat 2026-11-16 (question 31).
