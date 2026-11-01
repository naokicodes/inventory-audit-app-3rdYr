# ADR-037 Roster placements, copying, picks and access

- Status: Accepted 2026-11-01
- Decided by: Naoki
- Supersedes: none (refines ADR-011, ADR-012, ADR-013, ADR-014, ADR-017)

## Context

ADR-013 settled the roster's shape. The A6 spec chat settled how it works in detail.

## Decision

- **Stations are data per site** (imported or edited, never seeded in the repo): station lists
  differ per site and change over time. A station opens sheets, possibly at another site:
  Silingan's Commissary station opens the commissary's Commi sheet (the commi stock stays its own
  site; the station only says who works there today).
- **Kitchen-flagged stations** are the head chef's rows, and their sheets are pick-only: one live
  pick per station per night (the Kitchen Window dispatcher, ADR-014). Other stations: whoever is
  placed there, plus any number of picks (the head chef's commi pick, ADR-017).
- **One placement per person per day.** A placement at another restaurant = working there that day.
- Each person has a **main station**. **Sub-stations** are hints (pickers, copying) and grant
  nothing. **Standing access** is a separate per-person setting: it grants a station's sheets on
  days the person is on duty at that site (Likod grillers -> Commissary; Likod's cashier -> Podium),
  never on a kitchen station.
- **Copy last week:** rest days and home-site placements stay; one-offs (leave, sick, absent,
  floater, covers, a day elsewhere) go back to the main station; new people get their main station.
  Copying into a week with entries is refused.
- **Who edits:** the head chef sets her kitchen people's days (who works, rest days); supervisors
  edit everything.
- **Picks:** by the head chef or a supervisor, any time, for today or later; anyone on duty at the
  site with a login (a warning if not on a kitchen station). A replaced pick ends; saves keep their
  author.
- **Login list:** tonight's people first, then always-listed people (admins, management,
  supervisors), then a collapsed "Everyone else".
- **OJT are never on the roster**; the staff-meal head count is prefilled with the day's Present
  (on duty + floater at the site) and the cook types the OJT count.
- Until a site has roster entries for a date, anyone with count permission there may count
  (ADR-015).

## Why

It mirrors the paper (a main place, covers on top), keeps the kitchen strict, and keeps every grant
a separate, switchable piece.

## Consequences

Steps roster-stations to write-permission (3zl to 3zr).

## Reopen only if

People routinely work two stations in one day, or standing access is abused.

## Sources

Architect chat 2026-11-01 (A6), questions 5-10, 13, 14 and answers C, 2, 8.
