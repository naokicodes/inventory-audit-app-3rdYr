# Sales (Loyverse)

Status: IRL Confirmed - FLOW None - APP Built (Kitchen Sales preview); FC switch Specced

## IRL - how it works today
- Three Loyverse accounts: Silingan, Likod and FC (FC's token not set yet, 2026-11-14).
  Likod's business day runs 7am-7am.
- Likod sales of Silingan-menu dishes count against Silingan's kitchen.
  Likod's own grill, pizza, coffee and cake items do not.
- The landing sheets copy the day's POS numbers by hand.

## APP
- Built: read-only Loyverse preview engine and the Kitchen Sales page
  (PRs #28, #37), wildcard-match report (PR #39).
- Revenue stays in Loyverse / SPOS; this app never stores money in (D3).
- Specced 2026-11-14: loyverse-fc, a Silingan + Likod | FC switch on Kitchen Sales; FC's side
  is grouped by FC's Loyverse categories (ADR-066). Planned: fc-dish-map.
