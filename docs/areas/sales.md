# Sales (Loyverse)

Status: IRL Confirmed - FLOW None - APP Built (Kitchen Sales, the FC switch); landing-sales Specced (ADR-094)

## IRL - how it works today
- Three Loyverse accounts: Silingan, Likod and FC (FC's token not set yet, 2026-11-14).
  Likod's business day runs 7am-7am.
- Likod sales of Silingan-menu dishes count against Silingan's kitchen.
  Likod's own grill, pizza, coffee and cake items do not.
- The landing sheets copy the day's POS numbers by hand.
- FC's landing writes POS in portions per landing line, converting Loyverse items by hand (a
  platter is 2 portions, the Pork Bagnet platter 3; meat-landing.md).

## APP
- Built: read-only Loyverse preview engine and the Kitchen Sales page
  (PRs #28, #37), wildcard-match report (PR #39).
- Revenue stays in Loyverse / SPOS; this app never stores money in (D3).
- Built 2026-11-14 (loyverse-fc, PR #71): a Silingan + Likod | FC switch on Kitchen Sales; FC's
  side grouped by FC's Loyverse categories (ADR-066).
- Specced 2026-11-15 (ADR-094): landing-sales - FC's side becomes FC's landing lines in portions,
  each opening to its items and to what other dishes took; a Pizza table on both sides
  (temporary); the rest in "Not on the landing". Planned: fc-dish-map (the database half, for
  the landing's expected values).
