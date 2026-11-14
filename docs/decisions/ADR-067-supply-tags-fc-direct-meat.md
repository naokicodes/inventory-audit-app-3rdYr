# ADR-067 How it's bought: from the commi; FC's direct meats

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: ADR-017 in part (FC's direct meats do not land on the commi first)

## Context

ADR-022 tags items by how they are bought (supplier delivery, buyer run). The landing PO's MEATS
block goes to the commi. FC buys some meats outside the commi.

## Decision

- How it's bought has three values: supplier delivery, buyer run, from the commi.
- The landing's meat lines are tagged from the commi and become the internal meat request already
  built (requested, fulfilled, acknowledged), never a supplier order.
- FC buys sirloin, pork chops, tuna cubes and tuna steaks straight from a supplier: tagged
  supplier delivery on FC's orders, they arrive on FC's landing as stock receipts and never pass
  through the commi. FC only.

## Why

It matches the paper and how FC buys today.

## Consequences

Supply family (A9): supply-tags, arrivals, commi-meat-lines.

## Reopen only if

Another site buys meat direct.

## Sources

Architect chat 2026-11-14 (A9 Q9, R5).
