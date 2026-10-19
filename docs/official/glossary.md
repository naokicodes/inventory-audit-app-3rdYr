# Glossary

**For:** everyone. The kitchens' words first, then how the app uses them.

## Sheets and sites

- **Landing sheet** - a restaurant's daily meat sheet: the meat that landed in the kitchen and
  what happened to it. The app's daily audit is this sheet.
- **Commi / commissary** - the central kitchen that buys and processes raw meat for the
  restaurants.
- **Commi sheet** - the commissary's own daily meat audit.
- **Sides** - the non-meat sheets: Veggies, Pantry, Pizza, Bar, and Scullery (FC only). Simple
  counting, no recipes. *Planned.*
- **Site** - a restaurant or the commissary.
- **Business date** - the restaurant's working day. A sale after midnight belongs to the day
  before.

## Counting

- **Beginning** - what was on hand at the start of the day: yesterday's ending.
- **New stock / arrival** - what came in that day.
- **Allocation** - stock that left for a known reason: spoilage, staff meals, a transfer, and
  other kinds the admin sets up.
- **Usage** - what the day's sales and prepped dishes should have used, from their recipes.
- **Ending (calculated)** - what should be left: beginning + new stock - usage.
- **Ending (actual)** - what was physically counted.
- **Variance (over / short)** - the gap between what should be left and what was counted. Short
  means meat is missing; over means more on hand than expected. Allocations explain part of it;
  what remains is the unexplained over/short.
- **Carried** - when a day was missed, its beginning is carried from the last calculated ending;
  the number is tagged so everyone can see it was not counted.
- **Month opening** - at the start of each month, required meats are recounted and the rest are
  copied from last month's endings. The only place the app blocks you until it is done.
- **Recount difference** - the gap between a month-opening recount and what the chain expected;
  shown, tagged, on that day's over/short.

## The commissary

- **Yield** - processing raw meat into ready meat: raw kg in, backed-up kg out.
- **Backed-up meat** - the processed meat that comes out of a yield, ready to ship.
- **Shrinkage** - in these kitchens, the loss between raw and backed-up (the commi's yield loss).
  Not the same as variance.
- **Miscut** - trim cut off during processing that can still be used (staff meals, for example).
  Recorded separately; it never makes the loss figure look better.
- **True loss** - raw minus backed-up minus miscut: what was really lost.

## Buying and money

- **Par level** - the amount an item should not drop below. Under it, the item is **running
  low**. *Planned.*
- **Supplier order** - what the commi (meat) or the podium (sides) asks a supplier for; sent as a
  picture of the list. *Planned.*
- **Bill** - what was actually paid for an arrival, entered from the supplier's receipt. *Planned.*
- **Unit cost** - what one kg or one piece cost, from the last bill (or the settings cost until
  bills exist).
- **Stock value** - what the stock on hand is worth at unit cost; management's "stock as cash".
- **86** - POS slang for marking a dish unavailable because it ran out.

## People and roles

- **Checker** - enters counts, arrivals and allocations for their own sites.
- **Head chef** - closes the kitchen's sheets for the day. *Planned.*
- **Management** - reads the dashboards; changes nothing.
- **Admin** - sets up items, recipes, sites and roles.
- **Super-admin** - the one account that can never be locked out.

---
Last checked: 2026-10-19, against `main` `a6ec30d` plus the decisions recorded that day.
