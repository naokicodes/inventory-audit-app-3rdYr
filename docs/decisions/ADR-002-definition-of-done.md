# ADR-002 Definition of done: Beta and Final

- Status: Accepted 2026-10-20
- Decided by: Naoki (the Final goal comes from the CEO chef)
- Supersedes: the "directional through alpha, firmed at beta" part of
  session-status "Configure-from-the-ground-up posture" (2026-09-28, decision B)

## Context

The definition of done stayed directional through alpha, to be firmed at Beta.
Beta starts Monday 2026-10-26.

## Decision

**Beta: move the inventory from paper to phones.** It succeeds when staff spend
less time on inventory and go home earlier:

- Nobody rewrites yesterday's sheet; the app carries the ending forward.
- Counts show real shortages day by day, so staff see and explain them before
  the weekly physical audit, instead of balancing the sheet to zero and being
  caught at the audit.
- A report entered once on the phone is visible to the roles above it (for
  example the Landing people). Nobody rewrites someone else's report.

**Final: management sees where the money goes**, so problems that are hard to
find on paper can be found and fixed faster. Scope:

- Staff meals: budget (head count x a per-head daily allowance, from the
  roster) against actual use (ADR-003), with leftovers visible.
- Wastage and shrinkage in pesos.
- Supplier orders: what arrived and what was paid.
- Basic operating expenses: gas, electricity, water and similar.
- Staff roster: feeds the staff-meal budget. Design parked; it will expand.

After Final, Prince helps with the move to an app-based version, mostly
documentation work (ADR-004; the 2026-10-05 mobile-port note).

## Why

Beta is about staff time. Final is about the owners' problem: staff-meal spend
was found far above budget, with leftovers, and paper never showed it.

## Consequences

- **Already settled and inside the Final scope (2026-10-19):** pesos computed
  here, arrivals plus the Bills page, the management dashboard and 10pm sneak
  peek, separate apps (D3).
- **New for Final:** roster and head count; the staff-meal usage entry
  (ADR-003); an operating-expenses entry. Its placement is open: D3 puts money
  in on SPOS's back office and losses here, and operating expenses fit neither
  yet.
- The roster's head count includes people who never log in. The users table
  (3h, PR #24) holds app accounts, so decide between no-login rows in `users`
  and a separate staff table before the roster is built. Cheap before the Live
  wipe.
- Beta adoption is the foundation of Final: every dashboard number is only as
  good as the nightly counts.
- Figures (the allowance, the observed spend) stay out of this public repo.

## Reopen only if

The owners' priorities change, or Beta shows the time saving doesn't happen.

## Sources

Architect conversation 2026-10-20; session-status 2026-10-19 entries ("Supply,
cost and SPOS integration", "Separate apps", "Management dashboard + the 10pm
sneak peek", "Beta date + UI pass").
