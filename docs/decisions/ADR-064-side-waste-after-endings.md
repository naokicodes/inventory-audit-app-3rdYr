# ADR-064 Side waste: a prompt after endings

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: ADR-026 in part (side waste is entered at count time; the sheets' WASTE column stays
  computed)

## Context

Today cooks write waste on one sheet of paper that goes to the head chef. ADR-026 kept waste out of
count time and named "staff need to type waste at count time" as its reopen trigger.

## Decision

- After saving endings, the counter gets a "Waste today?" screen of its own, not table columns.
- It lists only items that could have been wasted: stock yesterday or something received today,
  perishables first.
- Tap an item, type an amount in any unit, pick a type (Wastage, Spoilage, Damaged). "No waste"
  closes it.
- The head chef sees the day's waste and can fix it: checked, never approved (ADR-013, as ADR-045).
- Side items only; meat waste stays as built.

## Why

On a phone a short list beats a table, and the counter already knows what spoiled.

## Consequences

Step side-waste (planned, after side-sheets).

## Reopen only if

Waste must be recorded as it happens during service.

## Sources

Architect chat 2026-11-14 (A8 Q6, R3).
