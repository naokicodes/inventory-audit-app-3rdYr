# ADR-013 The roster

- Status: Accepted 2026-10-28
- Decided by: Naoki
- Supersedes: the unrecorded 10-24 "CEO approves the roster", 10-22 "FC uses the template only" and 10-25 "lent staff on both rosters"

## Context

Each restaurant keeps a paper roster: one sheet per week, rows = stations, columns = days,
built from each person's usual place, with changes written on top. Photos were transcribed on
2026-10-28 (area roster).

## Decision

- One roster per restaurant per week, **Monday to Sunday** (Sunday evening is weekly reports
  and the weekly wage).
- A new week starts as a **copy of last week**. Each person has a **main station** and optional
  sub-stations; any day can place anyone anywhere; a temporary placement shows in the person's
  usual slot.
- **Day statuses**: on duty, rest day, leave (free-text reason), sick leave, absent, floater.
  Covering = a placement at another station marked "covering <name>".
- **Who edits**: the head chef enters the kitchen rows of the week; supervisors can edit
  everything; a specific supervisor can be blocked.
- **No approvals, no shift times, no time-in / time-out.** Word of mouth covers the rest.
- **Working at another restaurant for a day** = placed at that restaurant's station that day.
  They eat and count in that restaurant's head count, can write there, and are not "missing" at
  home. There is no separate "lent" concept.
- Assignments can be set in advance (at closing the night before).
- Receivers are assigned; the roster covers their days off.
- FC uses the same features (it simply edits less).
- **Storage**: a staff table separate from `users` (people who sign in), with an optional link
  for people who are both. During testing every tester gets a password-less account; real auth
  is added to the same accounts before Live.

## Why

It mirrors the paper, and the app is a support system, not an approval system.

## Consequences

Staff-meal head counts (ADR-027) and the login list (ADR-011) come from it.

## Reopen only if

The owners require a recorded approval, or payroll needs shift times.

## Sources

ARCHITECTURE-HANDOFF-2026-10-21 (archived) item 6; ARCHITECTURE-HANDOFF-2026-10-22 (archived) item 11; ARCHITECTURE-HANDOFF-2026-10-25 (archived) items 23, 24, 29, 55; the 2026-10-28 architect conversation (handoff 2026-10-28 and its roster addendum), items 86-89, 92, 94.
