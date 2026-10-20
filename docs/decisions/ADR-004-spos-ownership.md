# ADR-004 SPOS ownership while Prince is busy

- Status: Accepted 2026-10-20 (one open question, below)
- Decided by: Naoki, with Prince
- Supersedes: none (amends who owns SPOS work, not the boundary)

## Context

2026-10-19 working assumption: SPOS is frozen at `5950238`. We write every
connector and change nothing in SPOS. If Prince keeps building, the bill screen
and the POS stock patch go back to him.

## Decision

Naoki has full control of SPOS while Prince is busy. After the Final goal
(ADR-002), Prince helps with the move to an app-based version, mostly
documentation work.

## Consequences

- The domain split is unchanged (D3: SPOS holds money in; this app holds stock
  and losses in pesos). Ownership changed, not the boundary.
- The Bills page stays in this app behind the bills-only role, since Prince is
  not continuing SPOS for now.
- **Open:** does this lift the frozen assumption? That is, may Naoki now patch
  SPOS (the D2-c POS stock check, or a bill screen in SPOS)? Until answered,
  the frozen assumption stands.

## Reopen only if

Prince resumes SPOS work.

## Sources

Architect conversation 2026-10-20; session-status 2026-10-19 "Supply, cost and
SPOS integration".
