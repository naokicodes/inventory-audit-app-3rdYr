# ADR-096 Roster: shift rows, day offs first, and Fill

- Status: Accepted 2026-11-16
- Decided by: Naoki
- Supersedes: ADR-013 in part (a new week as a full copy of last week; one placement per person per day)

## Context

Silingan's supervisor builds the weekly roster in Excel, and it takes him a long time. His sheet
(Nov 16-22, transcribed in docs/areas/roster.md) splits Kitchen, Dining and Bus into opener / mid /
closer rows with the times in the row names, gives each person a break, keeps day offs to Monday
to Thursday, and has the commissary person also closing in the kitchen. He works in this order:
day offs, then leave slips, then placing people by their main station and the stations they cover.
Nobody opens the day after closing.

## Decision

- Each station can have shift rows: a name (times inside it, as on paper), a kind (opener, mid,
  closer or none) and a minimum number of people. A station without rows is one row with its own
  minimum (default 1).
- Times are labels only: no clock-in, no hours, nothing computed from them. ADR-013's "no shift
  times" stands.
- A person can hold two placements a day (the commissary person's kitchen closing; a head chef's
  "opener-closer" cover). Head counts and staff meals count a person once. A person can have a
  regular second job ("also works") that Fill places with the first.
- Each placement carries a break as text, prefilled from the person's usual break. No break
  planning.
- A new week starts with last week's day offs and nothing else. Leave is entered as from-to dates,
  a type (leave or sick) and a note; no approval (ADR-013).
- **Fill** places people day by day from Monday: everyone not off or on leave at their own station;
  each keeps yesterday's kind (closers keep closing, openers keep opening); after a day off anyone
  can open; nobody goes on an opener row the day after a closer row (Monday looks at last Sunday);
  each row gets at least its minimum, and extras go where it is thinnest; a station row still short
  takes someone who covers that station (a sub-station) and is not needed at home, marked
  covering; what cannot be filled shows red. Fill only fills empty days, never changes an entry
  already there, and "Undo Fill" removes what it made that nobody changed since.
- A hand edit that puts yesterday's closer on an opener row warns and still saves.
- On a computer the week view looks like the paper: stations and their rows down the side, Monday
  to Sunday across, then the day-off, leave and floater blocks and the totals (Present, Day offs,
  Leave, Head count), counted by the app. Phones keep day tabs. It prints.
- People without a login (waiters, for now) are staff with no login; supervisors add them from the
  Roster page.
- FC (the main supervisor) gets the same features; Likod's roster waits for A12.

## Why

Placing people is what keeps the supervisor late; Fill does the first pass and he fixes it, the
way he already works on paper.

## Consequences

roster-stations, roster-staff, roster-week and roster-day-status change before they are built (their
2026-11-15 holds lift); new step roster-fill. The roster steps go ahead of cost-guard, side-sheets
and supply-tags for the builders.

## Reopen only if

Payroll needs hours, or a rest rule becomes company policy the app must enforce.

## Sources

Architect chat 2026-11-15/16: Silingan's supervisor's roster workbook (four weekly tabs), Naoki's
account of his flow, questions 1-14 and "recs".
