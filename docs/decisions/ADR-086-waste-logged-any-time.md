# ADR-086 Side waste is logged any time; the sheet's checker ticks it

- Status: Accepted 2026-11-15
- Decided by: Naoki
- Supersedes: ADR-064 in part ("after endings" as the only way in; "the head chef" as the only
  checker)

## Context

ADR-064 gave side waste a "Waste today?" screen after endings, checked by the head chef. In real
life cooks write waste during the day on one paper that goes to the head chef, and the bar is
checked by a supervisor, not the head chef.

## Decision

- Anyone who counts at a site can log side waste at any time from a "Log waste" button on the side
  sheet and bar pages: item, amount in any unit, type (Wastage, Spoilage, Damaged).
- The "Waste today?" screen after endings stays as the catch-all; it shows what is already logged
  today, so nothing is entered twice.
- Each line is ticked by the checker of its sheet: the head chef for kitchen sheets, a supervisor
  for bar sheets (two new switches, check_kitchen and check_bar). Checked, never approved (ADR-045).
  The checker can fix a line, and can mark it charged (ADR-088).
- A broken full bottle is Damaged waste and is normally charged. An empty bottle thrown out is not
  waste and is not entered.
- New lines show on the checker's list the next time they open it; a phone pop-up waits for the
  PC's HTTPS name (ADR-070).
- Meat waste stays as built and with allocation-requests (3zc).

## Why

It follows the paper the cooks already use and gets waste to the checker the same day.

## Consequences

Step side-waste (after side-sheets) builds it; two switches join role-assignments' list (seeded on
head-chef and supervisor for check_kitchen, supervisor for check_bar).

## Reopen only if

Waste needs approval, or meat and side waste should share one screen.

## Sources

ADR-064; architect chat 2026-11-15 (A8 part 2, questions 6, 7 and round 2 question 3).
