# Prices

Status: IRL Written - FLOW None - APP Decided

## IRL - how it works today
- Receipts show unit prices. Prices change (veggies swing a lot).
- A private workbook of default prices per item, one tab per station, is being
  filled from receipts in a dedicated chat until about 75% of items are priced.
- Sources: chat 2026-10-21/22/24.

## APP
- Decided: default = last billed unit price, falling back to the settings cost
  seeded from the private workbook through import-settings (1); valuation uses
  the same number; prices never in the repo (31).
- Not specced (import-settings price slice). Queue item A9.
- Counted-meat costing (valuation): batch cost = input quantity x unit cost;
  shrinkage pesos = batch x (raw - backed) / raw; portions and miscut share one
  cost per kg = batch / (backed kg + miscut kg), which is batch / backed kg when
  there is no miscut (ADR-018). No schema change.
