# ADR-020 Prices: the last billed unit price

- Status: Accepted 2026-10-22
- Decided by: Naoki
- Supersedes: the 10-19 "paid / received" (session-status, 2026-10-19)

## Context

Prices change, and the cashier confirms the real ones.

## Decision

- The default a cashier sees is the **last billed unit price**, falling back to the settings
  cost (seeded from the private workbook through import-settings, never the repo).
- The cashier approves or edits the unit price per line; line = unit price x quantity arrived.
- The receipt's grand total is typed once as a check: a mismatch warns, never blocks.
- Valuation uses the last billed cost, so the default and the valuation cost are the same
  number.
- Until about 75% of items have a billed price, prices are collected from receipts.

## Why

One number for billing and valuation, and nothing blocks the counter.

## Consequences

Staff meals and stock are valued with it (ADR-003, ADR-027).

## Reopen only if

The owners want contracted prices instead of billed ones.

## Sources

ARCHITECTURE-HANDOFF-2026-10-22 (archived) item 1; ARCHITECTURE-HANDOFF-2026-10-25 (archived) item 31.
