# ADR-008 How architect work runs: area docs, a queue, Edge states, ask first

- Status: Accepted 2026-10-24
- Decided by: Naoki
- Supersedes: none

## Context

Restaurant knowledge lived in chats. Specs missed edge states. Assumptions produced wrong
specs (yield, #16, twice; the kitchen dispatch mix-up on 10-28).

## Decision

- **`docs/areas/`**: a README map with IRL / FLOW / APP statuses per area, and one file per
  area (status line, IRL with sources, FLOW, APP with links, open questions). Naoki writes IRL
  and FLOW notes; the architect writes APP and keeps private details out. IRL comes before APP,
  and every architect conversation ends by updating the map.
- **Architect work runs as a queue** (A0, A1, ...): each conversation takes a batch, finishes
  it, and ends with a drop-in plus a handoff that marks items DONE.
- **Every step spec has an "Edge states:" line** (failure, partial, empty, stale, blocked,
  inactive, two devices).
- **The architect asks before assuming.** When new information contradicts an older decision or
  note, the architect names the contradiction and asks why, so Naoki can confirm and expand.

## Why

Knowledge in the repo survives chats; edge states and asked questions are cheaper than a
wrong build.

## Consequences

The dispatch-queue header carries the Edge states rule.

## Reopen only if

The area map stops being updated - then simplify it rather than keep a stale map.

## Sources

ARCHITECTURE-HANDOFF-2026-10-22 (archived) item 15; ARCHITECTURE-HANDOFF-2026-10-25 (archived) items 19, 20, 22; the 2026-10-28 architect conversation (handoff 2026-10-28 and its roster addendum) (roster round).
