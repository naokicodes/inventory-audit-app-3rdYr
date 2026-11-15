# Waste

Status: IRL Written - FLOW Drafted - APP Decided (sides: logged any time, a catch-all after endings, ADR-086)

## IRL - how it works today
- Waste is not written on the count sheets. Like staff meals, it is written on
  a separate paper. The WASTE columns on the sheets stay empty for that reason.
- Sources: chat 2026-10-25. The waste paper has not been seen yet.
- Cooks write waste on one sheet of paper that goes to the head chef (Naoki, 2026-11-14).
- Bar (2026-11-15): a broken full bottle is waste, charged to whoever broke it; empty bottles are
  trash, not waste. The bar is checked by a supervisor.

## FLOW - drafted 2026-11-15

1. Someone wastes something: they tap "Log waste" on their sheet page, pick the item, type the
   amount in any unit and pick the type.
2. The checker sees it the next time they open their list: the head chef for kitchen sheets, a
   supervisor for the bar. They tick it, fix it, or mark it charged.
3. At closing, after endings, "Waste today?" shows today's lines and the items that could still
   have been wasted; "No waste" closes it.

## APP
- Meat: Built. Waste is already an adjustment in the daily audit, with the
  seeded types Wastage, Spoilage and Damaged (admin can add more).
- Side items: Decided (handoff 38) - the same adjustment idea extended to side
  items; the sheets show WASTE (and COOKED / INHOUSE) from those entries.
  Not specced.
- Decided 2026-11-14 (ADR-064): side waste is a "Waste today?" screen after endings, listing
  items that had stock or arrivals; the head chef checks it. Planned: side-waste.
- During testing Naoki enters most waste himself.
- 2026-11-15 (ADR-086, ADR-088): logged any time by anyone who counts at the site; the night screen
  is the catch-all; checkers tick (check_kitchen, check_bar) and may mark a charge. Planned:
  side-waste.

## Open questions
- None open (answered 2026-11-14).
