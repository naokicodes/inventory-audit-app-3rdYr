# ADR-019 Allocation requests

- Status: Accepted 2026-10-28
- Decided by: Naoki
- Supersedes: none

## Context

Counters tell the head chef about allocations by word of mouth; about half are forgotten, and
the head chef only needs to confirm the value.

## Decision

- Counters propose an allocation (type, amount, note) from the count page.
- The head chef (or an admin) accepts it - which creates the entry through the existing path -
  edits it, or rejects it. Nothing changes stock until it is accepted. History is kept.
- Staff meals are not a request type (their own page).

## Why

It turns a forgotten remark into a one-tap confirmation.

## Consequences

Step `allocation-requests` (queue 3zc).

## Reopen only if

Requests pile up unanswered night after night.

## Sources

the 2026-10-28 architect conversation (handoff 2026-10-28 and its roster addendum), item 74.
