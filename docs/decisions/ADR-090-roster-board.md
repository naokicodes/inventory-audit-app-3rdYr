# ADR-090 A roster board across sites

- Status: Accepted 2026-11-15
- Decided by: Naoki
- Supersedes: none

## Context

The main supervisor runs FC's and Likod's schedules and lends Silingan staff to them; a Silingan
supervisor makes Silingan's roster. She needs to see who is off across sites without opening each
roster.

## Decision

- A read-only board, Monday to Sunday, for every site the viewer can use: rows are people grouped by
  home site; each cell is the station (with the site when away) or the status (rest day, leave, sick
  leave, absent, floater). A toggle shows only the days off; tapping a person shows their week.
- Supervisors (roster_all at a site) and management see it. Edits stay on the Roster page.
- It is the first card (ADR-089).

## Why

Lending people needs one view across sites; the roster pages are one site each.

## Consequences

Planned step roster-board, after roster-day-status, specced when that lands. No schema change.

## Reopen only if

Lending is planned in the app (a request to borrow someone), not just seen.

## Sources

Architect chat 2026-11-15 (A8 part 2, round 3).
