# ADR-101 Blind counting follows the paper: Beginning and New stock are shown

- Status: Accepted 2026-11-17
- Decided by: Naoki
- Supersedes: ADR-015 in part (counters "never see beginning, new stock"; the list of what is
  stripped)

## Context

The restaurant's updated landing sheet has Beg, End and PO columns: the night counter sees the
beginning on paper. Fable PERM-03, C-13 and U-10: a blind counter reads, on other pages, the numbers
the landing hides (adjustments, sales, the dashboard's expected stock, History); ADR-041 already
said History must not show them.

## Decision

- On the meat landing a blind counter sees each meat's Beginning and New stock beside their own
  count and remark. They never see sales, in-house, adjustments, expected or variance.
- The same holds on every page. For a site where the person is blind, Allocations, Sales and History
  show none of those numbers, and the dashboard's stock rollup leaves that site out. Stock Receipts
  stays readable (new stock is shown anyway).
- Month openings and count history stay refused to counters.
- Checking arrivals (the podium; a cook for veggies) is not blind counting (A9).

## Why

It follows the sheet the restaurant uses. What anchors a count is the expected figure, and that
stays hidden everywhere, not only on the landing.

## Consequences

Step blind-reads (it takes over the planned blind-history). The landing's blind answer keeps
beginning and new stock.

## Reopen only if

Counts drift toward the beginning (counters copying it): then hide it again.

## Sources

docs/reviews/fable-2026-11-17-1-permissions.md (PERM-03); -3-consistency.md (C-13);
-5-pages-updates.md (U-10); architect chat 2026-11-17 (answer 1 and "b").
