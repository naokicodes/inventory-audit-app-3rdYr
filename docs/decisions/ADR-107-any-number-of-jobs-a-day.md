# ADR-107 A person can hold any number of jobs a day; Purchaser is a station

- Status: Accepted 2026-11-17 (recorded 2026-11-22)
- Decided by: Naoki
- Supersedes: ADR-096 in part (two placements a day); ADR-037 in part (who edits a kitchen person's
  entries)

## Context

ADR-096 allowed two placements a day, for the commissary person who also closes in the kitchen.
Silingan's daily roster message of 2026-11-17 (docs/areas/roster.md) shows one person holding three
jobs - assistant supervisor, purchaser in the morning, food server in the evening - and writes the
purchaser as a station. Fable run 3 (C-12, C-15, C-16) listed the lines the roster specs left open.

## Decision

- A person can hold any number of placements a day (slots 1, 2, 3 ...). Every slot after the first
  is ON_DUTY at another row or station. Present still counts a person once a day, at the site of
  their first placement.
- Purchaser is a station like any other (data); Function's minimum is 0.
- Whoever covers someone's day off also gets that person's "also works" job that day (on paper the
  commissary person's cover does both jobs).
- Silingan's supervisor sets the whole roster, day offs included; the head chef's list is a
  recommendation. roster_kitchen stays a switch an admin can give (ADR-034's lego bricks): with it a
  person edits any entry at a kitchen station and the day offs of people whose main station is a
  kitchen station.

## Why

The paper does it, and the app's roster should read like the message the staff get every day.

## Consequences

roster-stations, roster-staff, roster-week, roster-day-status and roster-fill gain 2026-11-17
blocks; tonight-picks, login-tonight and write-permission read every placement (any slot).

## Reopen only if

Hours or pay need a cap per person (the app keeps no hours, ADR-013).

## Sources

docs/areas/roster.md (the 11-17 message); docs/reviews/fable-2026-11-17-3-consistency.md (C-12,
C-15, C-16); architect chat 2026-11-17 (second round, answers 1 to 3).
