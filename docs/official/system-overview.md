# System overview

**For:** everyone - owners, management, Prince, staff trainers, future maintainers.

## What the app is for

The Inventory Audit App replaces the paper audit sheets with phones. It follows the way the
kitchens already work - it helps people record and read the numbers, it does not add process -
and it gives management a clear view of wastage, shrinkage and cost.

## The sites

- **Commissary (the commi)** receives raw meat from suppliers, processes it (raw in, backed-up
  meat out, weighed in kg) and ships it to the restaurants. It is the source of truth for meat.
- **Silingan** is a restaurant.
- **Likod** is Silingan's backyard restaurant. Likod customers can order from the Silingan menu;
  those dishes are cooked in Silingan's kitchen, so they count toward Silingan's kitchen usage.
  Likod's own menu is being finalized.
- **FC** is a restaurant that stays on the Excel process for now.

## Who uses what

| People | App | For |
|---|---|---|
| Staff (checkers, head chef) | this app, on phones and PCs | counts, arrivals, yields, allocations |
| Cashiers | the SPOS POS | selling |
| Management | SPOS's back office, and this app's dashboard (read-only) | money in; stock and losses |
| Admins | this app's settings | items, recipes, sites, roles |

The roles in this app are super-admin, admin, management (read-only), head chef, and checker.
A checker sees only the sites they belong to.

## What it does today - Built

- **Landing sheet** - each restaurant's daily meat audit: beginning stock, new stock,
  allocations, the calculated ending, the actual count and the variance. A missed day carries
  forward and is tagged. At the start of each month the required meats are recounted and the rest
  are copied. On a phone the sheet has two views: Review and Enter.
- **Commissary** - the yield log (raw in, backed-up out, miscut, true loss), the commi's own audit,
  and shipments to the restaurants.
- **Stock receipts, allocations, sales, dashboard, settings and history.** Dish quantities sold
  are entered by hand for now. Every change to receipts and yields is logged.
- **Roles** are set up; login comes next.

## Coming next - Planned (decided, not built yet)

- Login: pick your name for Beta; real passwords before Live.
- Sales arriving automatically from Loyverse, starting with a read-only preview.
- Sides sheets (Veggies, Pantry, Pizza, Bar, and Scullery at FC), and sheet owners with Done and
  Closed.
- Supplier orders sent as a picture, arrivals checked against them, and bills that bring in what
  was paid.
- Peso values for stock, wastage, shrinkage and variance, and a management dashboard with a
  sneak peek of the day around 10pm.
- Sales from SPOS, once SPOS replaces Loyverse.

## Money: what enters this app and what doesn't

- **Sales revenue, margin and profit never enter this app.** They stay in the POS (Loyverse
  today, SPOS later).
- **Quantities sold do enter,** because they tell us how much meat should have been used.
- **What was paid for stock does enter,** from the supplier's bill, per arrival - valuing stock
  and losses is inventory's job. Until bills exist, a cost set in settings is used.

## How it fits with SPOS

Two separate apps with separate databases:

- From the POS to this app: dish quantities sold - never prices or totals.
- Supplier orders, arrivals and stock live here. The POS's own inventory screens are not used at
  these sites.
- The POS decides whether a dish can be sold; it does not need a stock number from this app. When
  something runs out, staff mark it unavailable in the POS. A "running low" hint from this app
  may come later.
- Management sees money in SPOS's back office and stock and losses here, with a link between them.

## Where it runs

Beta, from Monday 2026-10-26, runs on a local server at the restaurant, used over the
restaurant's Wi-Fi with sample data. Hosting comes later. Real staff and real data wait for Live
testing.

---
Last checked: 2026-10-19, against `main` `a6ec30d` plus the decisions recorded that day.
