# Decision records

One file per decision. **The why lives here.** `docs/session-status.md` holds the
current state plus an index of these records; a handoff carries only what is in
flight. (ADR-001 explains the split.)

## Rules

1. **One decision per file**, named `ADR-###-short-slug.md`, numbered in the order
   it was recorded (not decided). The `ADR-` prefix avoids collisions with queue
   ids (`3u`) and the round-2 letters (`D3`, `D2-c`).
2. **Never rewrite an accepted record.** Only its Status and Superseded-by lines
   change. A reversal is a NEW record with `Supersedes: ADR-###`; the old one is
   marked `Superseded by ADR-###`. Wrong decisions keep their reasoning.
3. **Every record has "Reopen only if"**, so nobody reopens it by accident.
4. **Sources** point to where the full reasoning lives (session-status entry name
   and date, session-history, the chat date).
5. **If a record and session-status disagree, that is a bug.** Stop, ask Naoki,
   and fix both the same day.
6. **Public-safe.** The repo is public: no real prices, costs, budgets, credentials
   or staff details. Figures live in settings, off-repo.
7. **Prefer executable.** If a decision can also be a guard plus a test, add one
   and link it here. A test can't drift; a paragraph can.

## Template

```
# ADR-### Title

- Status: Proposed | Accepted YYYY-MM-DD | Superseded by ADR-###
- Decided by:
- Supersedes:

## Context
## Decision
## Why
## Consequences
## Reopen only if
## Sources
```

## Index

| ID | Title | Status |
|---|---|---|
| ADR-001 | Record decisions as decision records | Accepted 2026-10-20 |
| ADR-002 | Definition of done: Beta and Final | Accepted 2026-10-20 |
| ADR-003 | Staff meals recorded as quantities, not prices | Accepted 2026-10-20 |
| ADR-004 | SPOS ownership while Prince is busy | Accepted 2026-10-20 |
