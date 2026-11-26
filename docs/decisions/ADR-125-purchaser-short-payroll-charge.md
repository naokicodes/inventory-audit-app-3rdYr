# ADR-125 A purchaser's short is a payroll deduction, charged when the run is checked

- Status: Accepted 2026-11-26
- Decided by: Naoki
- Supersedes: ADR-122 in part (the short was shown only; who covers it was left to A13)

## Context

ADR-122 shows a run's short (cash left minus cash counted) and left its charge to A13. The main
supervisor checks the purchaser's logbook every day and signs it.

## Decision

- The purchaser covers a short through payroll: a deduction, one of ADR-088's charges.
- When the main supervisor (check_runs) marks a run checked and it shows a short, the short becomes a
  charge on that purchaser for the week's payroll export. She may lower or clear it with a reason (the
  missing cash turned up, a counting slip). An over is shown only, never charged.
- Money is checked every day near the end of service, when everyone is present and the day's other
  work is done (Naoki, 2026-11-26).
- Built with the charges list (bar-shorts, ADR-088), not in purchaser-run: purchaser-run's "Checked"
  stays as specced, and the step that first records charges adds the run's charge.

## Why

It is how a short is settled today. Charging at the check, by the person who checks, keeps one
decision in one place and leaves the purchasers no new work (ADR-122).

## Consequences

purchaser-run unchanged on this point; bar-shorts (or the first charges step) gains the run's charge
and its reason.

## Reopen only if

Small shorts are to be absorbed by the restaurant (a threshold).

## Sources

Architect chat 2026-11-26 (questions 9 and 9a; Naoki: "Payroll deduction"; "Yeah" - the main
supervisor checks the logbook every day).
