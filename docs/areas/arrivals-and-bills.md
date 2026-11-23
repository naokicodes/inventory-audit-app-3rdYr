# Arrivals and bills

Status: IRL Written - FLOW Written (the receive screen) - APP Specced (receive)

## IRL - how it works today
- Receiving: veggies go to the kitchen (they confirm the items are there; the
  buyer weighed them), meat to the commi, everything else to the podium.
  Receivers are assigned (usually one kitchen cook and the podium person); the
  roster covers their days off.
- Receipts go to each restaurant's own cashier: Silingan and FC on arrival,
  Likod at shift end (around count time).
- A receipt shows unit price, quantity x unit price, and a grand total.
- Silingan and Likod share a location, so a delivery sometimes lands at the
  wrong restaurant.
- Sources: chat 2026-10-22/24.
- 2026-11-16 (Naoki): receipts reach the main supervisor in the evening for the change check, then
  their restaurant; the podium rechecks a receipt's quantities against what arrived, in pesos
  (supplier-orders.md). This differs from the note above (receipts to each cashier on arrival):
  asked.
- 2026-11-17 (Naoki), the answer: by kind of supplier. A supplier a purchaser goes to or receives
  from is on the purchasers' budget with the COO, and its receipts go through the main supervisor.
  A delivery that needs no purchaser (ice, for example: ordered and delivered) goes straight to the
  cashier, not through her (money.md: the cashier's tally lists those as cashier expenses).

## FLOW - how they will use the app (drafted)
1. The receiver checks the arrival against the PO: quantities only, receipt
   photo, extra items tagged, missing lines marked short or cancelled.
2. The cashier opens the bill: unit price pre-filled, approve or edit each
   line; line = unit price x quantity arrived; type the receipt grand total once
   as a check (mismatch warns, never blocks).
3. A line that belongs to the other restaurant is moved there (logged) the same
   day.

**2026-11-23, Naoki (A9 round 1; flow notes for the spec, not decided yet):**
- On a phone or tablet, no per-line dropdown. Every PO line shows by itself, grouped; the groups are
  big buttons like Kitchen Sales' site switch. The receiver checks and types how many arrived.
- Unticking is faster than ticking: the kitchen unticks the veggies that did not come. It checks by
  eye and hand, no weighing; up to 0.5 kg off is accepted.
- The podium counts what arrives: mostly pieces (cans and such), not kg.
- A whole group is approved at once.
- A line that did not come (no tomatoes at the public market) leaves its group and waits ungrouped,
  until it arrives from another supplier and joins that group.
- Extras: anything that arrives with no PO line (a catch-up or a random buy) is added by hand.
- The purchaser types each receipt's grand total, before service (ADR-117). The podium's count and
  the purchaser's receipt meet on the receipt.

**2026-11-23 evening, decided (ADR-121):** the group's button is **"All here"** (the receiver confirms;
the app never approves, ADR-045). The kitchen sees the veggie groups, the podium the rest (one
Settings choice). Weights are ticked to start, with a 0.5 kg leeway in Settings; pieces are filled in
with - / +. A line that did not come waits, joins the group it came with, or is on the next day's list
at 8 AM. Each group shows that store's receipt from the purchaser's run (its total only with
see_costs).

## APP
- Decided: prices and bill rule (1); moving a line between Silingan and Likod
  (9); unplanned buys (28); receivers assigned via roster (29).
- A9: receive specced 2026-11-23 (below).

- Decided (handoff 57): one bill per receipt; a buyer's receipts for the day
  are grouped under that day's run.
- Decided 2026-11-14 (ADR-068): the buyer photographs buyer-run receipts, the receiver supplier
  receipts; photos are files next to the database on the restaurant PC. FC's direct meats arrive
  on FC's landing (ADR-067). The podium logs name and quantity (podium.md). Planned (A9).
- Specced 2026-11-23: receive (ADR-121), after po-lines; the run's receipts come from purchaser-run
  (ADR-122). Moving a line to the other restaurant, FC's direct meats and the bills stay later
  (arrivals, bills).

## Open questions
- (A9) Which receipts go through the main supervisor: answered 2026-11-17 (by kind of supplier,
  above).
- (A9) The arrival check compares against the receipt, not the PO (rec: yes; the PO stays the
  order list)?
  Answered 2026-11-23 (Naoki): against the PO's lines, every one shown; the receipt is the
  purchaser's (ADR-117).
- (A9) Help the evening change check: the purchaser types each receipt's total and the app shows
  cash given minus receipts = change (rec: yes, inside the buyer run; not now)? Answered 2026-11-23: yes
  (ADR-117), the grand total per receipt, typed before service.
