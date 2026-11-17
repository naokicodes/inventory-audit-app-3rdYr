# ADR-104 A row nobody touched never saves

- Status: Accepted 2026-11-17
- Decided by: Naoki
- Supersedes: the 2026-09-15 line "Concurrency is optimistic ... NOT last-write-wins"
  (session-status, Things NOT to re-litigate; never an ADR)

## Context

Fable I-01, F2, U-01, I-02, U-03 and U-04: the count pages post every row on Save. A row that a
phone loaded earlier and nobody touched is written back over a newer count from another phone; on
the commissary page every later save also wipes the notes; and the landing stores prepped = 0 for
every dish. C-06: two contradictory rules about two devices sat on the do-not-reopen list.

## Decision

- Last save wins for what a person typed (ADR-015 stands).
- A row nobody touched never writes: not a count, a portion, prepped, nor a commissary count or note.
  A first count for an item with none may still come from a client that sends no touched flag;
  prepped is written only when touched.
- No version column and no "changed under you" warning.

## Why

One phone per sheet is the norm and the history keeps every save; the real harm was a correction
lost to a phone that never touched the item.

## Consequences

Step stale-saves. The 2026-09-15 line is marked superseded.

## Reopen only if

Two people typing the same item at the same time loses work often enough to matter.

## Sources

docs/reviews/fable-2026-11-17-2-integrity.md (I-01, I-02); -3-consistency.md (C-06);
-4-scale.md (F2); -5-pages-updates.md (U-01, U-03, U-04); architect chat 2026-11-17 (answer 4).
