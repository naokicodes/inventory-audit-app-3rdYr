# ADR-102 Which switch allows which write

- Status: Accepted 2026-11-17
- Decided by: Naoki
- Supersedes: ADR-084 in part (the read-only refusal lands with write-switches, before
  write-permission)

## Context

Fable PERM-05 and PERM-04: only recount orders and the Roles page ask a role switch. Every other
write needs only the site, so a blind counter can clear the month's opening (unlogged), a
supervisor can save counts (ADR-010: never counts) and management's read-only login can write.

## Decision

- Counts (landing endings, portions, prepped): enter_counts.
- Deliveries (stock receipts: add, edit, delete): a new switch, receive_stock ("Receives
  deliveries"), on by default for the head chef and the supervisor, and for the podium's role when
  it exists; off for the checker.
- Waste, transfers and conversions (allocations): a new switch, log_adjustments ("Logs waste and
  adjustments"), on by default for the head chef and the supervisor.
- A sales cell edit: finalize.
- Month opening, Copy all and opening edits: finalize, and never a person who is blind at the site.
  Every change is logged, a cleared opening included.
- A read-only login is refused every write from this step on (ADR-084).
- The commissary writes keep the site check (ADR-017) until write-permission. Logged out keeps
  passing until write-permission (ADR-040).

## Why

ADR-034: roles are switches, so each write names its switch. The defaults are data an admin can
change on the Roles page.

## Consequences

Step write-switches. The two new switches arrive through ensureRoleDefaults (beta.db is never
reseeded).

## Reopen only if

A write needs a person-level exception.

## Sources

docs/reviews/fable-2026-11-17-1-permissions.md (PERM-04, PERM-05); -5-pages-updates.md (U-14);
architect chat 2026-11-17 (answer 2).
