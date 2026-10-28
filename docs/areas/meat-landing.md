# Meat landing (Silingan, FC)

Status: IRL Confirmed - FLOW Drafted - APP Built (blind count + recount Specced)

## IRL - how it works today

**Silingan, two sheets** (source: photos 2026-10-24):

1. *Kitchen meat ending sheet ("Inventory Meats Ending - kitchen stock").*
   Counter's name and date; columns ITEMS, END, QTY, REMARKS.
   - RAW: pan fry, french cut, whole chicken, burger patty, meatballs, pompano,
     salmon, shrimp, golabki.
   - COOKED: sisig, jowl, pata, slab inihaw, braised beef, nilaga, pasta, whole
     chicken; croquettes and mozzarella added by hand.
   - The counter fills END; QTY is their first PO quantity for the item,
     which the head chef reviews. The counter never sees an expected
     number: blind counting already happens on paper.
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
- Specced 2026-10-28: step blind-count (queue 3za). Blind = the checker role
  (derived from role flags until the supervisor role adds a flag); the server
  never sends beginning, new stock, sales, in-house, expected or variance to a
  counter. Recounts are picked by the landing person / head chef, told in
  person, recount only the ticked items, and become the count; the first count
  stays in history. The first counter may be picked, with a warning.
- Specced 2026-10-28: step allocation-requests (3zc). Counters propose an
  allocation (type, amount, note); the head chef accepts, edits or rejects.
- One unit per meat on the landing. A kg figure at a landing is commi work,
  done on the commissary page (see commissary.md).
- Not blind: the commissary (never) and the Likod grill landing (until it has
  a head).
- QTY (the counter's PO line) belongs to the supply family (A9).

## Open questions
- None open. (Pieces AND weight: closed 2026-10-28 - one unit per meat.)
