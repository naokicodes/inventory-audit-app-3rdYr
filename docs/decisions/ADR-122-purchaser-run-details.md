# ADR-122 The purchaser's run: fares and tips as lines, the short, optional photos, no extra work

- Status: Accepted 2026-11-23; "the short is shown only" superseded in part by ADR-125 (a payroll
  charge when the run is checked); cash-out lines and shared receipts added by ADR-126
- Decided by: Naoki
- Supersedes: ADR-117 and ADR-068 in part (a receipt's photo is optional; photos are mirrored once
  by the backup)

## Context

ADR-117 put the purchaser's run in the app and left fares, tips and the short to A9's spec. The
logbook page (money.md) lists per restaurant each store's receipt total, extra lines, tips and the
fare for each leg, then cash on hand, total purchased, cash left, cash counted and the short. Likod is
not a site in the app yet (ADR-030; A12 parked). Run 4 of the Fable review (D6) asked for four answers
before the first photo upload. Naoki: the purchasers are already buried with early-morning work.

## Decision

- **No more work for the purchasers.** The run replaces the logbook page; it is never filled as well
  as the logbook. On a test day Naoki types the run beside the logbook (an admin may type a run for a
  person); a purchaser uses the app himself only once his logbook page stops. The purchaser never
  sorts and never types lines or unit prices; the app does the arithmetic.
- The run, one per purchaser and business day: the cash given; one line per receipt (the store, which
  restaurant, the grand total, a photo); fares, tips and other small buys as lines (amount, which
  restaurant, an optional note, no photo); the cash counted at the end.
- The app shows the spent (receipts, fares, tips, other), the cash left (given minus spent) and the
  short (cash left minus cash counted: "Short", "Over" or "Even"), with a subtotal per restaurant, as
  the logbook does. The short is only shown; turning it into a charge waits for A13 (who covers a
  short is still open).
- Which restaurant: the run's own list - Silingan, Likod, FC - until Likod is a site; then Likod's
  lines move to it.
- Once the main supervisor marks a run checked, its purchaser cannot change it; she can uncheck it.
- Who sees a run's money: its purchaser, whoever checks runs, admins and read-only roles. The receive
  screen shows a receipt's total only with see_costs (ADR-060).
- Photos (D6): optional on every receipt (the supervisor sees "no photo"); shrunk on the phone and
  sent as a file, not inside JSON; kept as `photos/YYYY/MM/...jpg` beside the database, the record
  holding the relative path; never deleted for now (ADR-068); the backup mirrors each photo once into
  the backups folder and the copy folder, never into each dated backup.

## Why

A tool that adds a step to the hardest morning is not used. A photo forced on every receipt would
block a save when a camera fails; the supervisor still sees which are missing. Mirroring once keeps a
year of photos from filling an old PC's disk.

## Consequences

Step purchaser-run (switches purchase and check_runs, ADR-123); it extends the backup (backup-restore
left photos to the step that builds them). money.md. Still for A13: who covers a short, the logbook's
"cash out" lines, one receipt for two restaurants.

## Reopen only if

A purchaser asks to type his run himself before the logbook stops, or photos must be kept for a set
time.

## Sources

Architect chat 2026-11-23 (A9 round 2, questions 10, 11 and 13: "recs"; "never give the purchasers
any more work"); docs/reviews/fable-2026-11-17-4-scale.md (D6).
