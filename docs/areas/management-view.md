# Management view

Status: IRL Written - FLOW Drafted - APP Partly built

## IRL - how it works today
- Management wants to know how much is spent each day, week and month, and
  looks at night. Supervisors need the same view.
- Sources: chat 2026-10-24.

## FLOW - how they will use the app (drafted)
1. At night, management opens the view: today's totals, then week and month.
2. Two numbers, clearly labeled: **Spent** (purchases paid, from bills) and
   **Used** (cost of stock consumed or lost: usage, staff meals, losses).

## APP
- Built: a stock rollup across sites, in quantities (no pesos yet; until 2026-11-22 this line said
  "dashboard with losses and stock value", Fable C-08).
- Decided: management + supervisors see it (34); Spent vs Used shown separately
  (chat 2026-10-24); management read-only, with no exception (ADR-010, ADR-013: no approvals in
  the app; until 2026-11-15 this line said "except approving the weekly roster").
- Supervisors work on site (roster, checks, POs, variance; they never count); management (the
  owners) only reads (2026-11-15).
- 2026-11-15 (ADR-089): new views are cards; a dashboard builder (A15) once there are about five.
- Not specced. Queue item A15 (the dashboard builder).

## Open questions
- None open.
