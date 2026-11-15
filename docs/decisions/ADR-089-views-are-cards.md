# ADR-089 Views are built as cards; a dashboard builder comes later

- Status: Accepted 2026-11-15
- Decided by: Naoki
- Supersedes: none

## Context

Naoki wants dashboards that can be tailored to each person, "like modules". Each module needs its own
permission-checked read; a builder also needs saved layouts per person.

## Decision

- From now on every new view is a self-contained card: one read (an /api endpoint taking a site or
  sites and a date) and one display (public/cards/<name>.js, drawing into a given element). A page
  hosts one or more cards.
- The server checks every card's read (site access, see_costs) as it does any route.
- A builder (each person or role picks and arranges cards) comes once there are about five cards:
  architect item A15.

## Why

A card built this way costs nothing extra now, and the builder later is arranging, not rewriting.

## Consequences

roster-board is the first card; the weekly charges list (A13) and the management view's Spent and
Used follow. Existing pages are not rewritten.

## Reopen only if

Card reuse never happens (each view stays on one page), or the front end moves to a framework.

## Sources

Architect chat 2026-11-15 (A8 part 2, round 3).
