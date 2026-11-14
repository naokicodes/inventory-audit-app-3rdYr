# ADR-077 No page scrolls sideways: rows of tabs stay in their own strip

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: -

## Context

Issue #70 (PR #69, table-scroll). With every wide table in its own box, Settings still scrolled
sideways at 390px because of its row of tab buttons, which neither wraps nor scrolls. The step's
spec allowed no style change, and ui-conventions covered the nav and tables, not tabs.

## Decision

- table-scroll merges as built: its job is tables.
- Any row of tabs follows the nav's rule (ui-conventions, Navigation): one non-wrapping row inside
  the viewport that scrolls sideways itself (`overflow-x: auto`); the page body never scrolls
  sideways. A small step, settings-tabs, does this for Settings.

## Why

One rule for anything wider than a phone: it scrolls in its own box, the page stays still.

## Consequences

Step settings-tabs (after table-scroll; settings.html, so one at a time with staff-meal-settings,
side-items and sheet-close).

## Reopen only if

Settings' tabs become a menu or move into grouped navigation.

## Sources

Issue #70, PR #69 (2026-11-14); architect chat 2026-11-14.
