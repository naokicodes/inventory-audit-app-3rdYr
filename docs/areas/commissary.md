# Commissary

Status: IRL Confirmed - FLOW None - APP Built (Likod destination missing)

## IRL - how it works today
Sheet "Commissary Inventory" (source: photos 2026-10-23 and 2026-10-24).
- Columns: PARTICULARS, BEGINNING, STOCK IN, BACKED UP, FC OUT, SILINGAN OUT,
  LIKOD OUT, ENDING, REMARKS (remarks often carry order quantities).
- About 18 meats, raw and processed pairs: whole chicken / raw, pata, belly
  slab / raw, jowl / raw, shortplate, pork steak, french cut, pompano, salmon
  belly, ground beef, tuna, pork chop, beef shank, ribs, fore quarter.
- One portion block per destination (FC, Likod, Silingan): these are the
  shipments. Each shipment is written twice, as kg and as portions; that is how
  they record it, and the app's commi flow already matches (handoff 41).
- The commi prepares the final products the kitchens and the grill use,
  including skewering and portioning (tuhog / portion).
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
- Decided 2026-10-28 (ADR-017): one commi, more people. All raw meat lands on
  commi stock first; whoever backs up meat asks for it, then records the yield
  and the shipment on the commissary page. Access: at Silingan, whoever is
  rostered on Commissary, plus a head-chef pick for the day (e.g. backing up
  shortplate into braised beef / nilaga); at Likod, all grillers. Commi counts
  are never blind.
- Decided 2026-10-28 (ADR-018): miscut becomes a counted kg item, carried over
  until announced as waste; portions and miscut share one cost per kg.

## Open questions
- None open.
