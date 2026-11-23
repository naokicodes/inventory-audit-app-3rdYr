# Podium (receiving, misc)

Status: IRL Written - FLOW Written (the podium test) - APP Specced (receive)

## IRL - how it works today
- The podium receives everything that is not veggies or meat.
- It keeps a logbook of items and quantities for pantry and miscellaneous
  things that are on no inventory sheet.
- The logbook holds the product name and the quantity, nothing else (Naoki, 2026-11-14).
- The podium staff count deliveries on arrival and borrow the receipts from the cashier to check
  them against their count (Naoki, 2026-11-17).
- Sources: chat 2026-10-24.
- The podium counts what arrives: mostly pieces (cans and such), not kg (Naoki, 2026-11-23).
- First test (Naoki, 2026-11-23): the podium person does not use the app yet; Naoki runs it
  beside her logbook, with a PO list made from photos, to show how much faster it is (ADR-114).

## FLOW - how they will use the app (written 2026-11-23, ADR-121)
1. The first test: Naoki types the day's PO from the paper PO's photos (ADR-120) and runs the receive
   screen beside the podium's logbook (ADR-114); she keeps her logbook.
2. Receive -> Podium: a big button per supplier. Her piece lines are already filled in with what was
   ordered; - and + only for a difference; "All here" for the group.
3. Something that did not come goes to Waiting; something with no PO line goes in with + Extra.
4. Each group shows that store's receipt photo from the purchaser's run: she checks quantities
   against it, as she borrows the receipts today.

## APP
- Decided: a "Misc" area for anything received that nobody is sure about;
  inventory holders later move it onto the right item (26).
- Specced 2026-11-23: receive (ADR-121): the Podium place, pieces filled in, All here, + Extra.

## Open questions
- Specced 2026-11-23 evening: receive (ADR-121), with purchaser-run (ADR-122). Was: the podium's check of a delivery against the PO is specced together
  with the purchaser's receipt totals (A9), after the roster build; both become staff tests
  (ADR-114).
- None open (the logbook layout was answered 2026-11-14).
