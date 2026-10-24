# Commissary

Status: IRL Confirmed - FLOW None - APP Built (Likod destination missing)

## IRL - how it works today
Sheet "Commissary Inventory" (source: photos 2026-10-23 and 2026-10-24).
- Columns: PARTICULARS, BEGINNING, STOCK IN, BACKED UP, FC OUT, SILINGAN OUT,
  LIKOD OUT, ENDING, REMARKS (remarks often carry order quantities).
- About 18 meats, raw and processed pairs: whole chicken / raw, pata, belly
  slab / raw, jowl / raw, shortplate, pork steak, french cut, pompano, salmon
  belly, ground beef, tuna, pork chop, beef shank, ribs, fore quarter.
- One portion block per destination (FC, Likod, Silingan) with what was sent.
  Some lines carry a count and a weight together (10-24, FC block: "28 pcs,
  3.3 kg").
- A remarks box per destination at the bottom.
- Restaurants request meat on a "Meat Request Form": date, meat, raw or
  pre-cooked, quantity, unit, released by, receiver signature. In practice the
  release and signature columns stay empty.
- Sources: photos 2026-10-23/24 (sheet), 2026-10-21 (request form).

## APP
- Built: yield (Path 1, kg), staging, shipments to Silingan and FC, internal
  requests (requested -> fulfilled -> acknowledged).
- Missing: Likod as a third destination (8). Queue item A12.
- The app's acknowledge step replaces the empty signature columns.

## Open questions
- Pieces AND weight for portions (handoff open question 4).
