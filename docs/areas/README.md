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

## Map (2026-10-25, round 2)

| # | Area | IRL | FLOW | APP |
|---|---|---|---|---|
| 1 | [Who does what tonight](who-does-what.md) | Written | Drafted | Decided; pick-your-name login Built |
| 2 | [Meat landing (Silingan, FC)](meat-landing.md) | Confirmed | Drafted | Built; endings-only + blind count Decided |
| 3 | [Kitchen veggies](veggies.md) | Confirmed (Silingan, FC) | Drafted | Decided |
| 4 | [Pantry](pantry.md) | Confirmed (Silingan, FC) | Drafted | Decided |
| 5 | [Bar](bar.md) | Confirmed (all three) | None | Decided; exact sales check for bottles, cans, desserts |
| 6 | [Roster](roster.md) | Written | Drafted | Decided |
| 7 | [Supplier orders and buying](supplier-orders.md) | Written | Drafted | Decided |
| 8 | [Arrivals and bills](arrivals-and-bills.md) | Written | Drafted | Decided |
| 9 | [Staff meals and in-house](staff-meals.md) | Confirmed | Drafted | Decided |
| 10 | [Prices](prices.md) | Written | None | Decided |
| 11 | [Podium (receiving, misc)](podium.md) | Told | None | Decided |
| 12 | [Pizza stations](pizza.md) | Confirmed | None | Partly decided (dough in 12s) |
| 13 | [Likod grill landing](likod-grill.md) | Confirmed | None | None |
| 14 | [FC scullery](fc-scullery.md) | Confirmed | None | Decided |
| 15 | [Commissary](commissary.md) | Confirmed | None | Built (Likod destination missing) |
| 16 | [Sales (Loyverse)](sales.md) | Confirmed | None | Built (Kitchen Sales preview) |
| 17 | [Management view](management-view.md) | Written | Drafted | Partly built |
| 18 | [Money and operating expenses](money.md) | Unknown | None | None |
| 19 | [Waste](waste.md) | Told | None | Meat: Built (adjustment types); sides: Decided |

Gaps to read off the map: IRL Confirmed + APP None is safe backlog (pizza,
Likod grill). APP ahead of IRL is a warning. IRL Told is knowledge that lives
only in a chat.

New area: copy [_template.md](_template.md).
