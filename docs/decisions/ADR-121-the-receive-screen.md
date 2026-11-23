# ADR-121 The receive screen: groups by supplier, ticks for weights, counts for pieces, "All here"

- Status: Accepted 2026-11-23
- Decided by: Naoki
- Supersedes: none (details ADR-023 and ADR-068 for the receiver)

## Context

A9 round 1 (Naoki, 2026-11-23): on a phone, no per-line dropdowns; every PO line shows by itself,
grouped; the kitchen unticks the veggies that did not come (by eye and hand, up to 0.5 kg off
accepted); the podium counts pieces; a whole group is done at once; a line that did not come waits
until it arrives from another supplier; extras are added by hand. The sketch called the group's
button "Approve", but the app checks and never approves (ADR-045).

## Decision

- Today's PO lines for a restaurant, as big group buttons by supplier (with how many lines are left),
  plus "Any shop", "Waiting" and "+ Extra". The kitchen sees the categories it receives (veggies to
  start, one Settings choice), the podium the rest (ADR-023).
- Weight lines (kg, g) are ticked by default: untick what did not come; tap the number only if it is
  clearly off. Within the leeway of the amount ordered (one Settings number, 0.5 kg to start; per item
  later) the line counts as in full; beyond it, it shows short or over.
- Piece lines are filled in with the amount ordered; - and + change it.
- One "All here" button per group saves every line in it. The word is the receiver's: it is not an
  approval (ADR-045).
- An unticked line, or a piece line at 0, waits in Waiting. Tapping it there, then the supplier it came
  with, moves it into that group. Still waiting at 8 AM, it is on the next day's list in its group.
- + Extra: anything with no PO line, picked or typed, with its amount and the group it came with.
- A group shows that supplier's receipt from a purchaser's run that day (ADR-122): its photo, and its
  total only for someone who may see costs (ADR-060). A delivery with no run receipt can get the
  receiver's photo (ADR-068), with no total.

## Why

Unticking is faster than ticking, and pre-filled counts mean typing only the differences. The
receiver confirms her own work; nothing waits on anyone.

## Consequences

Step receive (switch receive, ADR-123). arrivals-and-bills.md, podium.md, veggies.md. Moving a line to
the other restaurant, FC's direct meats and the side sheets' Received stay with step arrivals.

## Reopen only if

The kitchen starts weighing arrivals, or a supervisor must sign off a delivery before it counts.

## Sources

Architect chat 2026-11-23 (A9 round 1 and its brainstorm, answers 1 to 3; round 2, question 9:
"recs").
