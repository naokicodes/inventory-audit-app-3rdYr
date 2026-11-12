# ADR-036 The business day turns at 8am everywhere

- Status: Accepted 2026-11-01
- Decided by: Naoki
- Supersedes: ADR-033 (its scope only: the rule is unchanged, now for everything)

## Context

ADR-033 set the sales day to 8:00am - 7:59:59am Manila and left the roster / login rollover open.
FC and Likod count until about 1am, so "tonight" cannot be the calendar date.

## Decision

Every business date in the app - sales, the roster, the login list, tonight's picks, write
permission - is the Manila date of the instant minus 8 hours. One helper, server/businessDay.js.
Anything done between midnight and 8am belongs to the previous night; pages that pick a date
always show and allow choosing it (picks can be made in advance).

## Why

One "tonight" for every page; nothing happens between closing and 8am.

## Consequences

Step business-day (3zi) moves the helper out of the Loyverse engine.

## Reopen only if

A site starts working between midnight and 8am as a new day (breakfast service, 24 hours).

## Sources

Architect chat 2026-11-01 (A6), question 11; ADR-033.
