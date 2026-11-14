# ADR-068 Buyer runs: ticks and receipt photos

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: -

## Context

The buyer's list shows items and quantities (ADR-022). Buyers already photograph their receipts.
Where the money comes from (the COO's budget for the buyers, the change returned, the cashier's
till) stays outside this app (ADR-059).

## Decision

- During a run the buyer can tick each line bought or "not found"; "not found" lines roll onto
  tomorrow's list. Ticking is optional; the receiver still confirms what arrived.
- The buyer attaches each receipt photo to the run; the cashier enters the bill from it; the
  receiver confirms quantities only. For supplier deliveries the receiver photographs the receipt
  (ADR-059).
- Receipt photos are files next to the database on the restaurant PC, shrunk on the phone before
  upload, kept in the daily backup and kept for now.
- Later: an in-app alert for supervisors when a line is "not found". Phone notifications need
  HTTPS (ADR-070).

## Why

The landing sees by afternoon what is still missing, and the cashier gets every receipt.

## Consequences

Steps buyer-list, arrivals and bills (A9). Disk space on the restaurant PC is a standing check.

## Reopen only if

Buyers stop carrying phones on runs.

## Sources

Architect chat 2026-11-14 (A9 Q10, Q11, R6).
