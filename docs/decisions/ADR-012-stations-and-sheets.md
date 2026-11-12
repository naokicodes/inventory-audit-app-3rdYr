# ADR-012 Stations and sheets

- Status: Accepted 2026-10-22
- Decided by: Naoki
- Supersedes: none

## Context

Sheets need an owner for tonight, and the paper roster is organised by station.

## Decision

- Stations are first-class **for who-does-what only**. The roster places people at stations;
  each sheet belongs to a station; a station may own sheets or none (Cold Station owns none).
  The station list is the paper roster's rows.
- **Never station-level stock or transfers.** Stock lives per site.
- **Admins (super-admin, admin) can close a sheet** ("under maintenance"): it cannot be
  assigned, is not counted, never shows as missing, and keeps its history. New Likod sheets
  start closed.
- The podium keeps a logbook and gets a "Misc" area; the inventory holders later move each line
  onto the right item.

## Why

Stations answer "who"; stock is per site.

## Consequences

Steps `sheets-tier1` and `sheet-close`.

## Reopen only if

Two stations at one site must hold separate stock of the same item.

## Sources

ARCHITECTURE-HANDOFF-2026-10-22 (archived) item 6; ARCHITECTURE-HANDOFF-2026-10-25 (archived) items 26 and 45; the 2026-10-28 architect conversation (handoff 2026-10-28 and its roster addendum), item 86.
