# ADR-061 Queue steps are named, not numbered

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: -

## Context

The queue numbered steps 0 to 3zz; the 3z series ran out. `/start` and `/naoki-qs` already run the
queue in file order, and PR titles, issues and `/naoki-qs <id>` all use the step id.

## Decision

- A new step gets no number, only its id: `### Step side-items - ...`.
- Steps of one family sit under a family heading in the queue (`#### Sides (A8)`,
  `#### Supply (A9)`).
- Existing numbered steps keep their numbers.

## Why

The number was only a label. A "4a" series would clash with the old `### 4.` headings further down
the queue.

## Consequences

Order notes in the queue name steps by id.

## Reopen only if

A tool needs an order key the file order cannot give.

## Sources

Architect chat 2026-11-14 (A0 Q2, R1, "RECS").
