# Staff meals and in-house

Status: IRL Confirmed - FLOW Drafted - APP Decided

## IRL - how it works today
- Silingan eats twice a day (afternoon, evening) because of the shifts.
  Silingan sometimes cooks for Likod and notes it on the paper.
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
  maximum reference until the rule is confirmed (40).
- Not specced. Queue item A10.

## Open questions
- Budget rule: keep the paper's figure as the maximum reference for now (see
  private notes). It may be a whole-day budget; Naoki is asking.
- Is cooking gas part of the meal cost in the app?
- How a staff order is recognised in Loyverse.
