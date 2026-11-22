# Areas - the map

One file per area of the business. Each file has four parts:
**IRL** (how it works today, with sources), **FLOW** (how each role will use the
app, step by step), **APP** (what the app does or will do, with links), and
**Open questions**. Read this map first; it shows where the project stands.

Public file: roles and sheet structure only. Prices, nicknames, photos and
money details live in the private notes (Claude project files), never here.

## Status words

- **IRL:** Unknown -> Told (said in a chat only) -> Written (in the IRL section)
  -> Confirmed (checked against the paper sheet or the people)
- **FLOW:** None -> Drafted -> Walked through with staff -> Matches the app
- **APP:** None -> Decided (ADR or decision list) -> Specced (step in
  session-status) -> Built (on main) -> Tested (phone / Beta) -> Live

## Habits

1. IRL before APP: no area gets a step spec until its IRL is at least Written.
2. Every architect chat ends by updating this map.
3. A paper-sheet photo is sent once; its structure is copied into the IRL
   section, which then stands in for the photo.

## Map (2026-11-22)

| # | Area | IRL | FLOW | APP |
|---|---|---|---|---|
| 1 | [Who does what tonight](who-does-what.md) | Confirmed | Drafted | Built: pick-your-name login, roles per site, the Roles page (PRs #33, #78, #83); Specced: picks, login list, write permission |
| 2 | [Meat landing (Silingan, FC)](meat-landing.md) | Confirmed | Drafted | Built: counts, blind count and recount (PR #51, by site role since #78); Built: FC's sales map and FC's 27 lines (PRs #90, #91), on the restaurant PC from beta-3 |
| 3 | [Kitchen veggies](veggies.md) | Confirmed (Silingan, FC) | Drafted | Built: side items (PR #74); side-sheets Specced (parked until roster-fill) |
| 4 | [Pantry](pantry.md) | Confirmed (Silingan, FC) | Drafted | Built: side items (PR #74); side-sheets Specced (parked until roster-fill) |
| 5 | [Bar](bar.md) | Confirmed (all three) | Drafted | Decided (ADR-087): sellables against Loyverse, raws side-style, deal drinks, supervisor checks; FC drinks only |
| 6 | [Roster](roster.md) | Confirmed (Silingan: the Nov 16-22 sheet, the 11-17 message); Written (Likod, FC) | Drafted (Fill) | Built: business day (PR #55); Specced: shift rows and Fill (ADR-096), any number of jobs a day (ADR-107); roster board Decided (ADR-090) |
| 7 | [Supplier orders and buying](supplier-orders.md) | Written | Drafted | Decided; supply-tags Specced |
| 8 | [Arrivals and bills](arrivals-and-bills.md) | Written | Drafted | Decided |
| 9 | [Staff meals and in-house](staff-meals.md) | Confirmed | Drafted | Built: meal settings (PR #82); log, check and view Specced (parked until roster-fill); side items on meals Decided (ADR-109) |
| 10 | [Prices](prices.md) | Written | None | Decided; costs behind see_costs Specced (cost-guard) |
| 11 | [Podium (receiving, misc)](podium.md) | Written | None | Decided |
| 12 | [Pizza stations](pizza.md) | Confirmed | None | Partly decided (dough in 12s) |
| 13 | [Likod grill landing](likod-grill.md) | Confirmed | None | Decided (counts blind; appointed head chef) |
| 14 | [FC scullery](fc-scullery.md) | Confirmed | None | Paper (ADR-065) |
| 15 | [Commissary](commissary.md) | Confirmed | Drafted | Built: yield, shipments; requests and staging Decided, not built (ADR-092); Stock In from suppliers missing (A9); Likod destination missing |
| 16 | [Sales (Loyverse)](sales.md) | Confirmed | None | Built (Kitchen Sales, FC switch; FC by landing line and the Pizza tables, PR #90, Kare-Kare included) |
| 17 | [Management view](management-view.md) | Written | Drafted | Built: a stock rollup in quantities (no pesos yet); views as cards (ADR-089) |
| 18 | [Money and operating expenses](money.md) | Written (payroll template, the purchaser's logbook, the cashier's tally) | None | Decided: charges recorded, payroll in Excel (ADR-088) |
| 19 | [Waste](waste.md) | Written | Drafted | Meat: Built (adjustment types); sides: Decided (any time + a catch-all after endings, ADR-086) |

Gaps to read off the map: IRL Confirmed + APP None is safe backlog (pizza,
Likod grill). APP ahead of IRL is a warning. IRL Told is knowledge that lives
only in a chat.

New area: copy [_template.md](_template.md).
