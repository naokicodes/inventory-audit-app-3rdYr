# ADR-055 Hybrid A: two apps, two databases; this web app is the core

- Status: Accepted 2026-10-03 (core-app line 2026-10-05)
- Decided by: Naoki (the core-app line with Prince's agreement)
- Supersedes: ADR-054

## Context

The domain split (2026-10-03): SPOS owns finance and service (orders, payments, shifts and cash,
prices, discounts); this app owns inventory, and its logic is the inventory core.

## Decision

- Inventory stays on SQLite and SPOS on MySQL; they connect by API. No MySQL port of this app is
  planned.
- Only quantities cross into the inventory database: no price, total or payment.
- This web app is the core app (2026-10-05): SPOS is integrated onto it gradually, through the
  usual architect -> slice -> build -> review flow, as a selective two-way contract.
- Portability where it is free stays a habit, not a migration plan; an existing in-file convention
  wins over it (2026-10-13).

## Why

After the domain split the apps share only sales quantities and what SPOS asks of us, which an
API carries; neither needs the other's database.

## Consequences

SPOS is a second sales source through the same intake as Loyverse; logic stays on the server;
business rules go in engine modules. ADR-005 later puts SPOS's code in `spos/` in this repo, still
two apps.

## Reopen only if

The apps must share data an API cannot carry, or a hosting choice forces one database.

## Sources

session-status "SPOS integration - settled 2026-10-03", "Core app + integration shape - settled
2026-10-05" and "Portability vs convention" (2026-10-13); `ARCHITECTURE-HANDOFF-2026-10-05`
(archived). Recorded 2026-11-12 (A14a).
