# Staff meals and in-house

Status: IRL Confirmed - FLOW Drafted - APP Decided

## IRL - how it works today
- Meals per day differ by restaurant: Silingan 2 (afternoon and evening,
  because of the shifts), Likod 2, FC 3. Silingan sometimes cooks for Likod
  and notes it on the paper; normally Likod cooks its own on a portable stove
  in the space being readied for its kitchen.
- Each month the head chef picks four cooks; each plans one week of staff
  meals ahead (a dish per meal with an estimated cost). Events such as
  birthdays can replace the plan. The cook for each meal is still chosen on
  the day.
- OJT eat twice (breakfast at home); their food is cooked separately and paid
  from their own money.
- One cook per meal cooks and writes what was used, right after cooking: meat
  counted properly, sides and seasonings guessed.
- The paper log (source: photo) has three columns: lunch, OJT meal, dinner.
  Each meal lists ingredients with a peso amount each (seasonings in small
  amounts), cooking gas as a line, the head count, a total and the remaining
  budget. The OJT meal is simpler (a dish + grams of meat) and has its own
  head count.
- Only official staff count toward the meal budget; OJT meals are logged
  separately.
- In-house = staff meals + staff orders. Staff orders go through Loyverse;
  in-house and cash-advance slips are settled at the weekly payroll.
- Leftovers are not weighed and are out of scope.
- Sources: photo of the staff-meal log; chat 2026-10-22/24.

## FLOW - how they will use the app (drafted)
1. Right after cooking, the meal's cook opens Staff meals, picks the meal
   (afternoon / evening / OJT) and enters what was used: meat in grams, sides
   and seasonings as estimates.
2. The app prices each line from its last bill and shows used vs budget.
3. The landing shows tonight's in-house summary (staff meals + staff orders);
   management sees totals.

## APP
- Decided: ADR-003 (quantities, never prices; pesos computed); inhouse column
  on the side sheet unused (13); in-house summary (18); budget from official
  head count, OJT separate, meat in grams (32); budget figure kept as the
  maximum reference until the rule is confirmed (40); cooking gas stays out of
  staff-meal cost - it is an operating expense (52).
- Decided 2026-10-28: meal slots per restaurant are settings; each slot has a
  budget mode - a fixed amount, head count x a per-head rate, or no budget -
  with every value editable (values in the private notes). Budgets are per
  meal: the fixed amount is the budget, head count x rate the maximum. Head
  count: one field per meal, prefilled from the people on duty at that
  restaurant, editable by the cook (ADR-027). OJT
  uses "no budget": recorded and monitored, no limit; each slot can carry an
  optional OJT part with its own head count. Gas stays out (operating
  expenses). A logged meal stands alone (date, site, slot, cook, lines); the
  meal planner is a later, separate feature where a plan can be voided with a
  reason and stays in history.
- Not specced. Queue item A10.

## Open questions
- Does the meal budget also pay for rice (a pantry item)? Naoki asks the head
  chef. If yes, rice becomes the one pantry item logged in staff meals.
- Likod's non-meat ingredients: proposed as name + estimate lines until Likod's
  Veggies and Pantry sheets open (meat comes from the grill's raw stock).
- Which Loyverse field carries the staff member's name on a staff order
  (customer or note)? Staff orders are recognised by the staff name (53).
