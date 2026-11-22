# Commissary

Status: IRL Confirmed - FLOW Drafted - APP Built in part (requests and staging decided, not built; Likod destination missing)

## IRL - how it works today
Sheet "Commissary Inventory" (source: photos 2026-10-23 and 2026-10-24).
- Columns: PARTICULARS, BEGINNING, STOCK IN, BACKED UP, FC OUT, SILINGAN OUT,
  LIKOD OUT, ENDING, REMARKS (remarks often carry order quantities).
- About 18 meats, raw and processed pairs: whole chicken / raw, pata, belly
  slab / raw, jowl / raw, shortplate, pork steak, french cut, pompano, salmon
  belly, ground beef, tuna, pork chop, beef shank, ribs, fore quarter.
- One portion block per destination (FC, Likod, Silingan): these are the
  shipments. Each shipment is written twice, as kg and as portions; that is how
  they record it, and the app's commi flow already matches (handoff 41).
- The commi prepares the final products the kitchens and the grill use,
  including skewering and portioning (tuhog / portion).
- A remarks box per destination at the bottom.
- Restaurants request meat on a "Meat Request Form": date, meat, raw or
  pre-cooked, quantity, unit, released by, receiver signature. In practice the
  release and signature columns stay empty.
- Sources: photos 2026-10-23/24 (sheet), 2026-10-21 (request form).
- 2026-11-15 (Naoki, asked on the floor): raw meat arrives in the morning, so the commi can back it
  up; FC collects its commi meat in the afternoon and weighs it at the commi with the commi's main
  person. Silingan and Likod take meat whenever they need it.
- One person works the commi, with 1-2 rest days a week; a kitchen person is sometimes lent there.
  When nobody else can back up as well, raw meat piles up. He writes the commi's own PO; the
  cold-station head chef, who consolidates the POs, rarely overrules it (meat comes first).
- Requests: at Silingan the kitchen meat sheet's QTY column is the request the commi reads; sudden
  requests in the day go by word. At FC the landing's meat lines. The paper form is skipped because
  everyone is busy.
- Shortages: when the commi person is away, people take meat with no note. On a short break they
  fix the paper after service.
- FC's sirloin (for beef tapa) is a direct delivery, portioned at FC (about 95%, no shrinkage worth
  tracking): FC enters it as portions. Silingan's sirloin comes through the commi.

## FLOW - drafted 2026-11-15 (the commi stays on paper during Beta)

1. A restaurant's request reaches the commi from its count sheet's PO lines for commi meats, or
   from "Request meat" in the day: meat and quantity.
2. The commi person fills it with a shipment (kg and portions, as built); if he was on a break when
   someone took the meat, he records it when he is back, the same day.
3. The receiver taps Received. On rest days the substitute placed on the Commissary station, or a
   head chef (standing access), fills requests.

## APP
- Built: yield (Path 1, kg), shipments to Silingan and FC, shipment presets.
- Decided, not built (until 2026-11-15 this line said built): commi staging (staged -> released),
  and the internal request (ADR-092; planned step meat-request).
- Missing: Likod as a third destination (8). Queue item A12.
- Missing: Stock In from suppliers (raw meat arriving at the commi). It was step 25a; it is now part
  of arrivals (A9). (Fable C-25.)
- The request's Received (planned) replaces the empty signature columns.
- Decided 2026-10-28 (ADR-017): one commi, more people. All raw meat lands on
  commi stock first; whoever backs up meat asks for it, then records the yield
  and the shipment on the commissary page. Access: at Silingan, whoever is
  rostered on Commissary, plus a head-chef pick for the day (e.g. backing up
  shortplate into braised beef / nilaga); at Likod, all grillers. Commi counts
  are never blind.
- Decided 2026-10-28 (ADR-018): miscut becomes a counted kg item, carried over
  until announced as waste; portions and miscut share one cost per kg.
- Specced 2026-11-01 (A6, ADR-037): commi write access = a placement on the
  Commissary station, the head chef's commi pick for the day, or standing access
  (Likod grillers); enforced by write-permission (3zr). Never blind.

## Open questions
- None open.
