# Bar

Status: IRL Confirmed (all three restaurants) - FLOW Drafted - APP Decided (ADR-087; steps planned)

## IRL - how it works today
Source: photos 2026-10-24.

**Silingan "Inventory Bar".** Three blocks with BEG, N.S., END:
- Drinks sold as-is (beers, cans, bottled water), with an ITEMS SOLD column.
- Raw (about 30: powders, syrups, sugar, pearls, milk, fruit, straws,
  take-out supplies, coffee sticks, biscuits), with ITEMS SOLD for made drinks.
- Desserts (about 15), counted as wholes plus slices ("1 whole, 4 slices").
- A PO block; lines are crossed out once handled.

**Likod, two sheets** (kept by the barista / cashier):
- *"Inventory Bar":* columns ITEMS, BEG, NEW STOCKS, END, POS, P.O, QUANTITY.
  Pastries and cakes (macaroons, brigadeiro, bars, cups, cheesecakes, cinnamon
  rolls); raw (coffee beans, oat milk, condensed milk, syrups, juices, spirits
  used for cocktails); others (local beers, added by hand).
- *"Inventory Likod - Bottles & Cans":* columns ITEMS, BEG, NEW STOCKS, OUT,
  POS, END, P.O. Beers and ready-to-drink, non-alcoholic, liqueurs, gin,
  vodka, rum, whisky, tequila, brandy, wines - counted in bottles or cans.
  In places the handwritten END values sit one row off from their item.

**FC "Inventory Form Kitchen - BAR/DINING":** columns ITEM NAME, BEG, NS, END,
SOLD, OVR/SHRT, PO, QTY, NOTE. Soft drinks by size, water, fruit, syrups,
sugar, cups, straws, and dining supplies (condiments, toothpicks, tissues,
pest spray, alcohol, rags, cellophane, foil, cling wrap). Units: pcs, case,
pack, kilo, "half", roll, "1 and a half". SOLD and OVR/SHRT exist but are
empty.
- FC (2026-11-14): the boodle deal includes four free small soft drinks; when those run out,
  customers may upgrade all four to panalo. 7UP is gone (counted as Mountain Dew).

- The roster's bar person counts; with two, either one.
- 2026-11-15 (Naoki): every bar has items sold as they are (whole bottles of spirits too) and raws
  (spirits poured into cocktails are raws). Sizes: sulit (small), panalo (medium), litro (litre).
- The boodle's free drinks: the brand is not in Loyverse, so staff note it by hand (everyone keeps
  such notes on their own inventories). Silingan's and Likod's deals give free drinks made from
  raws, never items sold as they are.
- Desserts are sold per slice; cakes are 8 slices; a whole sold in Loyverse counts as 8 slices.
- Staff drinks: only raws (coffee from the grinder's spares when it is cleaned). Nothing sold as it
  is goes free; staff buy their drinks outside.
- A supervisor checks the bar's shorts and asks why. With no proper explanation the short is
  charged, split among the waiters, bar and cashier (the people tied to the drinks). A broken full
  bottle is charged to whoever broke it; empty bottles are trash.

## FLOW - how the bar person will use the app (drafted 2026-11-15)

1. At closing the bar person opens the bar sheet.
2. Items sold as they are: each shows yesterday, received, sold (Loyverse) and expected; they type
   the count and the difference shows (the bar is not blind).
3. Raws: the ending, with usage, like the kitchen's side sheets.
4. Deal drinks: from the staff's note, how many of each drink went out free; the app shows how many
   the deals sold imply.
5. Waste: logged any time with "Log waste" (a broken bottle is Damaged), and "Waste today?" after
   the count.
6. PO quantities; the head chef consolidates the POs (supplier-orders).
7. A supervisor sees the differences and writes the explanation or marks a charge.

## APP
- Decided (handoff 36, 42): bottles, cans and desserts get an exact sales check
  (expected from Loyverse sales vs counted). Bar is NOT blind: the bar counter
  sees expected and variance. Raw bar items stay side-sheet style for now.
- Desserts need a conversion (slices per whole).
- 2026-11-14: each bar is checked against its own restaurant's Loyverse account; FC's bar in
  the app is drinks only, the list in ADR-065 (ADR-065, ADR-066). Planned: bar-check (A8).
- 2026-11-15 (ADR-085, ADR-087, ADR-088): designed for Silingan's full bar; sellable or raw by
  section; sales links per Loyverse item; deal drinks; a supervisor checks; charges recorded.
  Planned: bar-links, bar-check, bar-shorts.

## Open questions
- What Likod's OUT column records (unclear even to Naoki; maybe a transfer or an allocation;
  skipped for now, 2026-11-15).
