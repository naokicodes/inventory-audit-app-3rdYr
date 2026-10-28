# ADR-014 Kitchen dispatch and tonight's kitchen counter

- Status: Accepted 2026-10-28
- Decided by: Naoki, from the head chef
- Supersedes: none (corrects the 10-28 item 76 "each cook's PO")

## Context

Older notes spoke of several kitchen "counters" and of "the landing person" counting. The head
chef described the real flow on 2026-10-28.

## Decision

- **Kitchen flow**: cooks -> **Kitchen Window dispatch** (plating) -> **FOH Counter dispatch**
  (the head chef, helped by the cold station) -> the open counter (Expo, no person) -> servers.
- **The Kitchen Window dispatcher**, a cook, does all three kitchen inventories (meat, veggies,
  pantry) and their first PO lines while the others clean.
- **The FOH counter** does the landing, PO checks, shortages and allocation asks. The landing
  person does not count. The landing can be assigned to anyone, a supervisor as fallback.
- **The dispatcher is a daily pick** by the head chef or a supervisor, any time before closing
  (preferably in the morning). One pick covers the three kitchen sheets. No automatic default.
- If the counter leaves or is absent, another is picked: access for that night only; saves
  already made keep their author.

## Why

It matches how the kitchen works, and one counter per night makes blind counting meaningful.

## Consequences

Veggies and Pantry stay separately assignable (ADR-024); POs per ADR-021.

## Reopen only if

The kitchen splits its inventories among several cooks again.

## Sources

ARCHITECTURE-HANDOFF-2026-10-25 (archived) items 24, 25, 54; the 2026-10-28 architect conversation (handoff 2026-10-28 and its roster addendum), items 84-85.
