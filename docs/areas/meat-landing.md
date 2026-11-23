# Meat landing (Silingan, FC)

Status: IRL Confirmed - FLOW Drafted - APP Built (blind count + recount, PR #51); FC's lines Specced

## IRL - how it works today

**Silingan, two sheets** (source: photos 2026-10-24):

1. *Kitchen meat ending sheet ("Inventory Meats Ending - kitchen stock").*
   Counter's name and date; columns ITEMS, END, QTY, REMARKS.
   - RAW: pan fry, french cut, whole chicken, burger patty, meatballs, pompano,
     salmon, shrimp, golabki.
   - COOKED: sisig, jowl, pata, slab inihaw, braised beef, nilaga, pasta, whole
     chicken; croquettes and mozzarella added by hand.
   - 2026-11-23: the braised beef, the nilaga and the new Kare-Kare are all made from
     Forequarter, which replaced Shortplate (ADR-116).
   - The counter fills END; QTY is their first PO quantity for the item,
     which the head chef reviews. The counter never sees an expected
     number: blind counting already happens on paper.
   - 2026-11-15: QTY is also the meat request the commi reads (ADR-092).
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

**FC, 2026-11-15** (sources: the 11-14 sheet photo and FC's Loyverse item list, names only, sent
in the 2026-11-15 architect chat):
- The lines, in the sheet's order. Block 1: Pork Jowl, Paella, Baglaw Tuna, Tuna Tinola, Tuna
  Steak, Skewers, Pork Chops, Beef Tapa, Garlic Beef. Block 2: Bagnet, Laing, ASG, CPA, Sisig,
  Sinigang, Dinuguan, Salpicao, Tinola, Pancit, Daing, Arrabiatta, Burger Patty, Chicken Brgr,
  Burger Buns. Block 3: Whole Chicken, Half, Quarter.
- POS is in portions, worked out by hand from Loyverse: a platter is more portions of its solo dish
  (generally 2; the Pork Bagnet platter 3).
- Laing, CPA, Salpicao, Tinola, Pancit and Half keep no stock: their dishes take from other lines,
  and the paper notes it in the remarks (11-14: "3 portions to bagnet: 1 Baglaw, 2 Laing", next to
  Sinigang). Forgotten remarks are much of FC's shorts.
- Pork Jowl is raw jowl, kept just in case since the time the commissary did not work well; no dish
  sells it.
- 2026-11-22 (Naoki): Pork Jowl arrives from the commi like FC's other commi meat (New stock), and
  when it is used the landing writes an allocation for it rather than a dish taking it. So no
  Loyverse item counts it, on purpose.
- Arrabiatta arrives in kg (the shrimp) and is portioned; Tuna Tinola and Daing are counted in
  packs. Grams per dish and servings per pack are not known yet, and need not be strict: what matters
  is the usage rate and remembering allocations.
- The commissary ships FC only whole and quarter chicken; a half is a whole cut in two.
- The bottom PO: kitchen (with REM), pizza (FC sells pizza; on paper, ADR-065), bar, veg / dry.

**FC's map (ADR-094)** - the Loyverse items (exact names) each line counts, with portions per item
sold, then what other dishes take. Step landing-sales copies this into loyverse-name-map.json.

| Line | Counted from (portions per item) |
|---|---|
| PORK JOWL | (none) |
| PAELLA | `PAELLA NEGRA` 1 |
| BAGLAW TUNA | `BAGLAW` 1 |
| TUNA TINOLA | `TUNA TINOLA` 1 |
| TUNA STEAK | `PAN GRILLED TUNA STEAK` 1 |
| SKEWERS | `GARLIC PARMA CHICKEN SKEWERS` 1 |
| PORK CHOPS | `PAN SEARED HERBED PORK CHOP` 1 |
| BEEF TAPA | `BEEF TAPA` 1 |
| GARLIC BEEF | `GARLIC PEPPER BEEF` 1 |
| BAGNET | `PORK BAGNET - SOLO` 1, `BAGNET EXPRESS - SOLO` 1, `BAGNET BINAGOONGAN - SOLO` 1, `PLATTER - PORK BAGNET` 3, `PLATTER - BAGNET EXPRESS` 2, `PLATTER - BAGNET BINAGOONGAN` 2 |
| LAING | `LAING PORK - SOLO` 1, `PLATTER - LAING PORK` 2 |
| ASG | `ADOBO SA GINAMOS - SOLO` 1, `PLATTER - ADOBO SA GINAMOS` 2 |
| CPA | `CHICKEN PORK ADOBO - SOLO` 1, `PLATTER - CHICKEN PORK ADOBO` 2 |
| SISIG | `SISIG SOLO` 1, `SISIG PLATTER` 2 |
| SINIGANG | `BAGNET SINIGANG` 1 |
| DINUGUAN | `DINUGUAN - SOLO` 1, `PLATTER - DINUGUAN` 2 |
| SALPICAO | `CHICKEN SALPICAO` 1 |
| TINOLA | `TINOLA SA UPO` 1 |
| PANCIT | `CANTON GUISADO` 1, `PANCIT de ORO` 1 |
| DAING | `DAING NA SUNGAB` 1 |
| ARRABIATTA | `SHRIMP ARRABBIATA` 1 |
| BURGER PATTY | `HOMEMADE BURGER` 1 |
| CHICKEN BRGR | `CHICKEN BURGER` 1 |
| BURGER BUNS | `HOMEMADE BURGER` 1, `CHICKEN BURGER` 1 |
| WHOLE CHICKEN | `REGULAR - Whole Chicken` 1, `LARGE- Whole Chicken` 1, `EXTRA LARGE- Whole Chicken` 1, `JUMBO - Whole Chicken` 1, `REG BOODLE(4 SWAKTO)` 1, `LARGE-BOODLE ( 4 SWAKTO)` 1, `XL -BOODLE (4 SWAKTO)` 1, `JUMBO-BOODLE (4 SWAKTO)` 1, `FREE WHOLE CHICKEN` 1 |
| HALF | `HALF CHICKEN` 1 |
| QUARTER | `SOLO QUARTER` 1, `SOLO QUARTER UNLI` 1 |

Takes (shown as "also taken" on the line taken from):
- `LAING PORK - SOLO`: Bagnet 1/2. `PLATTER - LAING PORK`: Bagnet 1.
- `CHICKEN PORK ADOBO - SOLO`: Bagnet 1/2, Quarter 1. `PLATTER - CHICKEN PORK ADOBO`: Bagnet 1,
  Quarter 1 (a bigger quarter).
- `CHICKEN SALPICAO`, `TINOLA SA UPO`, `CANTON GUISADO`, `PANCIT de ORO`: Quarter 1.
- `PORK 150grms (Add ons)`: Bagnet 1 - the pork for a pork pancit, on no line of its own (Naoki,
  2026-11-17).
- `BAGLAW`: Bagnet 1.
- `HALF CHICKEN`: Whole Chicken 1/2.

Not on the landing: the boodle upgrades (the boodle already counts its chicken), trays and "Old
Price" items, pastas other than Arrabbiata, rice, sauces, drinks, boxes, the veggie dishes, Law-oy,
and pizza (its own table).

The map is final for beta-3 (2026-11-22): every name above is an item in FC's Loyverse export of
2026-11-17. Five older dishes still in that export (Double Roasted Pork Belly, Chicken Supreme
Stroganoff, Pot Roast Beef w/Mashed Potato, Squeaky Gud, Chicken de Oro Pasta) are no longer sold
and are ignored (Naoki, 2026-11-17).

## FLOW - how they will use the app (drafted)
1. Tonight's kitchen counter (the Kitchen Window dispatcher, picked by the head
   chef) opens the endings-only sheet and enters END for
   each item plus remarks. No expected, no variance. A later correction is an
   edit (kept in history), not a "+".
2. The head chef (the landing) sees expected vs counted and the variance; if something
   looks wrong, they quietly order a recount by someone else. The first count
   stays in history; the recount becomes the count.
3. The landing person / head chef enters allocations. Staff meals come from the
   staff-meal page; waste from waste entries.
4. FC (2026-11-23, ADR-114; replaces the 11-22 plan): FC's head chef counts on paper and reads
   FC's side of Kitchen Sales on his own phone through the Tailscale share (ADR-110) to fill the
   POS column. Counting in the app waits for a staff test with Naoki there.
5. Every landing (2026-11-23, ADR-114): until the staff test, the head chef fills the paper
   landing's POS column from Kitchen Sales. The counters never see sales (ADR-101).

## APP
- Built: daily audit (meat + portion counts, allocations, month opening and
  recount, dashboard), count drafts kept on the phone (PR #31).
- Built 2026-11-01 (blind-count, PR #51); blind by the site's roles since role-assignments (PR #78,
  ADR-038). The 10-28 lines below are the spec's history.
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
- Not blind: the commissary (never). The Likod grill landing counts blind
  (ADR-038).
- Decided 2026-11-01: the counter is tonight's kitchen pick (the Kitchen Window
  dispatcher, ADR-014), and only they save the counts (write-permission, 3zr).
  The landing is the head-chef role at the site, appointed people included
  (ADR-035). Blind follows the site's roles (ADR-038; role-assignments, 3zj).
- QTY (the counter's PO line) belongs to the supply family (A9).
- Decided 2026-11-15 (ADR-094): Kitchen Sales' FC side follows FC's landing (step landing-sales,
  the map above); the landing's expected values use the same takes later (fc-dish-map).
- Decided 2026-11-22 (Naoki): FC's count sheet in the app is the paper's 27 lines in the paper's
  order, the six that keep no stock included (counted as 0: the landing person copies the paper one
  to one); Pork Jowl in kg, every other line in pieces; FC's old dishes leave the starting data
  until fc-dish-map (step fc-landing-lines, before beta-3).
- Built 2026-11-22: Kitchen Sales' FC side by landing line (landing-sales, PR #90) and FC's 27
  lines with two meal slots (fc-landing-lines, PR #91). On the restaurant PC from beta-3.

## Open questions
- None open. (Pieces AND weight: closed 2026-10-28 - one unit per meat.)
