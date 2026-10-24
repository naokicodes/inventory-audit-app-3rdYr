# Meat landing (Silingan, FC)

Status: IRL Confirmed - FLOW Drafted - APP Built (endings-only + blind count Decided)

## IRL - how it works today

**Silingan, two sheets** (source: photos 2026-10-24):

1. *Kitchen meat ending sheet ("Inventory Meats Ending - kitchen stock").*
   Counter's name and date; columns ITEMS, END, QTY, REMARKS.
   - RAW: pan fry, french cut, whole chicken, burger patty, meatballs, pompano,
     salmon, shrimp, golabki.
   - COOKED: sisig, jowl, pata, slab inihaw, braised beef, nilaga, pasta, whole
     chicken; croquettes and mozzarella added by hand.
   - Only END is filled. The counter never sees an expected number: blind
     counting already happens on paper.
   - Endings like "12+6" are later additions: paper cannot be erased, so staff
     add with "+". In the app this is simply an edit.
   - Remarks carry the OJT meals (dish and grams of jowl).
2. *Landing sheet ("Silingan Landing Inventory").* Date, name; columns ITEMS,
   BEG, NEW STOCK, POS, INHOUSE, OVER/SHORT, REMARKS, END.
   - About 38 dish / portion rows (mozzarella, sisig, golabki, salads, pastas,
     croquettes, pan fry, french chop, braised beef, bagnet, chopsuey,
     pinakbet, dereta, whole chicken, pata, pompano, noodles, burgers, salmon
     tinola, nilaga, inihaw, miscut jowl, shrimp peeled / raw).
   - POS = that day's Loyverse sales. INHOUSE holds staff and OJT meal
     quantities. OVER/SHORT is meant to be worked out (by the app, later).
   - The bottom is the consolidated PO (see supplier-orders.md).

**FC, one sheet** ("Landing Inventory", source: photo 2026-10-24). Columns
ITEM NAME, BEG, NEW S., POS, INHOUSE, OVR/SHRT, END, RAW, REMARKS.
- Block 1: pork jowl, paella, tuna dishes, skewers, pork chops, beef tapa,
  garlic beef. Block 2: bagnet, laing, ASG, CPA, sisig, sinigang, dinuguan,
  salpicao, tinola, pancit, daing, arrabiata, burger patty, chicken burger,
  buns. Block 3: whole / half / quarter chicken.
- Mixed counts like "21 + 5 packs". Remarks such as "2 portions on order".
- The bottom is FC's consolidated PO: kitchen (with REM), pizza, bar,
  veg / dry, and scullery items.

## FLOW - how they will use the app (drafted)
1. The assigned meat counter opens the endings-only sheet and enters END for
   each item plus remarks. No expected, no variance. A later correction is an
   edit (kept in history), not a "+".
2. The landing person sees expected vs counted and the variance; if something
   looks wrong, they quietly order a recount by someone else. The first count
   stays in history; the recount becomes the count.
3. The landing person / head chef enters allocations. Staff meals come from the
   staff-meal page; waste from waste entries.

## APP
- Built: daily audit (meat + portion counts, allocations, month opening and
  recount, dashboard), count drafts kept on the phone (PR #31).
- Decided, not specced: blind count + quiet recount (handoff 2), counters enter
  endings + remarks only (3). Queue item A7.

## Open questions
- Counting one meat by pieces AND weight: allowed? (handoff open question 4)
