# ADR-094 FC's sales follow its landing sheet

- Status: Accepted 2026-11-15
- Decided by: Naoki
- Supersedes: ADR-066 in part (FC's side "grouped by FC's own Loyverse categories")

## Context

FC's landing sheet has a POS column for each landing line, in portions, worked out by hand from
Loyverse. A platter is more portions of its solo dish. Six lines (Laing, CPA, Salpicao, Tinola,
Pancit, Half) have no stock of their own: their dishes take from other lines, and the paper notes
that in the remarks ("3 portions to bagnet: 1 Baglaw, 2 Laing"). Remarks that get forgotten are much
of FC's shorts. Kitchen Sales' FC side (ADR-066) lists items by Loyverse category, so FC's landing
still converts by hand. The app's FC dish list (from the old FC workbook) predates FC's current menu.

## Decision

- Kitchen Sales' FC side is one table of FC's landing lines, in the sheet's order and names, each
  with the portions sold that business date. Platters count more portions: generally 2; the Pork
  Bagnet platter 3.
- A line opens (a dropdown) to the items counted on it, so the landing sees how many of each dish
  to cook (the bagnet dishes, for example), and to what other dishes took from it ("also taken").
  The row shows the taken amount beside its number.
- What other dishes take: Laing ½ Bagnet per solo, 1 per platter; CPA solo ½ Bagnet and 1 Quarter,
  CPA platter 1 Bagnet and 1 (bigger) Quarter; Salpicao, Tinola sa Upo and both pancits 1 Quarter;
  Baglaw 1 Bagnet (and 1 Baglaw Tuna portion, its own line); a Half ½ Whole Chicken. A boodle is 1
  whole chicken of the size picked; its upgrades take nothing more. A pork pancit takes 1 Bagnet: a
  remark until its Loyverse item is known.
- Lines counted in kg or packs (Arrabiatta, Tuna Tinola, Daing) show dishes sold. Grams and servings
  per pack stay loose until someone measures: the aim is the usage rate and remembered allocations,
  not strict yields.
- Pork Jowl is raw jowl kept just in case (from when the commissary was unreliable); no dish sells
  it. It stays on the table with 0, as on the sheet.
- Temporarily, both sides get a Pizza table listing every pizza, sold or not (unsold greyed):
  Silingan, Likod and Total on the left; FC's count on the right. Naoki picks the pizzas in effect
  later.
- Everything else FC sold goes into a closed "Not on the landing" list. FC's category cards go.
- The map is item names only (loyverse-name-map.json; the full list is in meat-landing.md). The
  landing's expected values use the same takes later (fc-dish-map: FC's dishes and recipes in the
  database).

## Why

FC's landing copies the numbers instead of converting them, and the allocations that remarks forget
become numbers on screen.

## Consequences

Step landing-sales (in beta-3). fc-dish-map stays planned. Kitchen Sales stays open (ADR-041): sales
in portions are not stock, and the paper shows POS to the same people.

## Reopen only if

FC's landing sheet changes its lines, or FC's sales move to SPOS.

## Sources

Architect chat 2026-11-15 (FC's Loyverse item list, the 11-14 FC landing sheet, answers 4-8 and
"recs").
