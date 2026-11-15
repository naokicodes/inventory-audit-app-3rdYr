# ADR-088 Charges are recorded in the app; payroll stays in the main supervisor's Excel

- Status: Accepted 2026-11-15
- Decided by: Naoki
- Supersedes: none

## Context

A bar short with no proper explanation is charged, split among the waiters, bar and cashier tied to
the drinks; a breakage is charged to whoever broke it. The main supervisor makes the weekly payroll
in Excel. Naoki asked whether the app should do payroll.

## Decision

- The app records charges: on a bar difference or a waste line, the checker marks it charged and
  says who pays (one person, or a split among that day's waiters, bar and cashier). Until the roster
  has staff, the names are typed.
- Payroll stays in the main supervisor's Excel. Later (A13) the app gives her a Sunday export: per
  person, the week's days on duty, rest, leave, sick, absent and covering, and the week's charges.
- Peso amounts of charges show once prices are in, behind see_costs (ADR-060).

## Why

Payroll carries government contributions, tax and pay rules where a bug shorts someone's wage; her
sheet already does that math. What costs her time is copying the inputs, which the app will hold.

## Consequences

side-waste and bar-shorts store the charge; A13 specs the export after the roster lands.

## Reopen only if

The main supervisor wants payroll itself in the app, or the export does not save her time.

## Sources

Architect chat 2026-11-15 (A8 part 2, round 2 question 1).
