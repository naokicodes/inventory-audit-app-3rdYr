# ADR-108 Sheet finalization is not planned

- Status: Accepted 2026-11-17 (recorded 2026-11-22)
- Decided by: Naoki
- Supersedes: the 2026-09-26 decision in session-status (a dated sheet row with an owner and a
  Done / Closed finalization status, tier 2 of the sheets), never built

## Context

On 2026-09-26 a Done / Closed step per sheet was decided, with a dated sheet row holding its owner.
It was never built, and later text treats it as built or coming (Fable C-07): write-permission
lists "finalize" as a review-page action and says "isBlocked and finalization refuse first, as
today"; ADR-084 says finalize checks nothing today. Since then the roster's picks (ADR-014,
tonight-picks) have replaced the sheet owner.

## Decision

- No Done / Closed step per sheet and no dated sheet rows with an owner.
- The head chef's check is the recount (ADR-015).
- The finalize switch keeps its meaning: ordering recounts today, and from write-switches the sales
  cell edit and the month opening (ADR-102).
- Closing a sheet for maintenance is a different thing and stays (sheet-close, active = 0).

## Why

The picks already say who counts tonight, and the recount is how the landing checks a count. A
day lock would only stop the next-morning corrections the paper allows.

## Consequences

write-permission's spec drops "finalize" from its review-page actions and "and finalization" from
its Blocked line (its 2026-11-17 block); the 09-26 lines are marked.

## Reopen only if

The owners want a day locked once it has been checked.

## Sources

docs/reviews/fable-2026-11-17-3-consistency.md (C-07); architect chat 2026-11-17 (second round,
answer 5).
