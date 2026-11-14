# ADR-044 Staff rice is an estimate line, never in the meal budget

- Status: Accepted 2026-11-11
- Decided by: Naoki, with the CEO
- Supersedes: none (answers ADR-027's open rice question)

## Context

ADR-027 left open whether the staff-meal budget also pays for rice. The kitchen's own template
had rice in it, but rice use per meal is hard to measure one to one.

## Decision

- The staff-meal budget **never includes rice**.
- Each site's day shows **"Staff rice (estimated)"**: cups = the sum, over the day's slot meals,
  of (staff head count + OJT head count) x cups per head; pesos = cups x grams per cup / 1000 x
  rice price per kg. All three are settings, dated so a change applies from that day on; the
  values live off-repo.
- An estimate only: never a stock deduction, and cooks type nothing about rice. OJT are counted
  in.
- A later report, with no new sheet: rice bought (bills, A9) - rice sold (Loyverse) - this
  estimate = waste or unexplained.

## Why

The CEO wants a constant daily approximation rather than a 1:1 count. Cups per head covers the
one-cup and three-cup eaters on average. Keeping rice outside the budget keeps the budget a
judgment of what was cooked.

## Consequences

staff-meal-settings holds the rates; staff-meal-view shows the line. ADR-027's "pantry stays out"
stands. Extra meals add no rice (they have no slot).

## Reopen only if

Management wants rice counted from stock, or inside the meal budget.

## Sources

Architect chat 2026-11-11 (items 10-15, Naoki's answers 11 and 14-15). Handoff 2026-11-11.
