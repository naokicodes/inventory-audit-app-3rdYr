# ADR-087 How a bar is checked

- Status: Accepted 2026-11-15
- Decided by: Naoki
- Supersedes: none (it details ADR-025 and ADR-065)

## Context

ADR-025 gave bottles, cans and dessert slices an exact check against Loyverse sales, not blind, with
raws side-sheet style. The details came from Naoki on 2026-11-15.

## Decision

- **Sellable or raw, by section.** An item sold as it is (drinks, whole bottles of spirits, dessert
  slices) gets the exact check: expected = yesterday + received - sold - waste - deal drinks, and
  the difference shows. An item in the raw section (powders, syrups, spirits poured into cocktails)
  is ending and usage only. The same physical kind can be both, as two items.
- **Sales links.** Each sellable is linked to the Loyverse items that sell it, with how much one
  sale uses (a whole cake = 8 slices). Desserts are 8 slices per whole by default, changeable per
  dessert.
- **Deal drinks.** A deal that gives away sellables (FC's boodle: four sulit, or four panalo with the
  upgrade) is not itemized in Loyverse. At closing the bar person enters the deal drinks by item
  from the note staff keep; the app shows how many the deals sold imply, so a missing note stands
  out. Free drinks made from raws need no entry (their usage covers them).
- **Nothing sellable is free.** Staff coffee comes from raws (grinder spares).
- **Who checks.** A supervisor checks the bar's differences, not the head chef (the head chef keeps
  the kitchen and the POs, as the buyers' budget holder). A difference gets an explanation, or is
  charged (ADR-088).
- Sizes are sulit (small), panalo (medium) and litro (litre).

## Why

It mirrors how the bar is run and how shorts are settled today, and keeps deal drinks explainable.

## Consequences

Planned steps bar-links (the sales links and deals from the settings workbook), bar-check (the
expected column and deal drinks on the side sheet page) and bar-shorts (the supervisor's list),
specced once side-sheets lands.

## Reopen only if

Loyverse (or SPOS) starts recording the brand of deal drinks, or the bar counts blind.

## Sources

ADR-025, ADR-065; architect chat 2026-11-15 (A8 part 2, questions 1-5 and round 2 question 2).
