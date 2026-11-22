# ADR-112 Kitchen Sales keeps what it fetched from Loyverse for a short time

- Status: Accepted 2026-11-22
- Decided by: Naoki
- Supersedes: -

## Context

Kitchen Sales asked Loyverse again, paging through every account's receipts, on every day or side
switch. That is slow, and several phones at 9 to 10 PM could run into Loyverse's request limits.

## Decision

- The server keeps each Kitchen Sales result in its memory, per side and business date: today's for
  2 minutes, the 7 days before (a POS that was offline uploads receipts late) for 30 minutes, older
  days until a restart.
- Sync with Loyverse always fetches fresh and replaces the kept result. A result with a failed
  account is never kept. The page shows when the numbers were fetched.
- Nothing is written to the database: the page stays a preview.

## Why

Switching should be instant, and a finished day does not change.

## Consequences

Step sales-cache (beta-3.1).

## Reopen only if

The stored Loyverse sync before Live replaces the preview, or staff see numbers that are too old.

## Sources

Architect chat 2026-11-22 (late: answer 5).
