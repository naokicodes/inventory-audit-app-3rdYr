# ADR-001 Record decisions as decision records

- Status: Accepted 2026-10-20 (rollout after Beta starts)
- Decided by: Naoki
- Supersedes: the practice of carrying decisions in dated handoffs

## Context

Decisions lived in three places that drift apart: `session-status.md` (2,214
lines at `213b9a1`), dated handoffs kept outside the repo (four in the Claude
project, each overriding the last), and `architect-notes-PRIVATE.md`. Older
handoffs keep the reasoning but carry decisions that were later reversed; newer
ones are correct but compressed, so the why is lost.

It already caused a miss: on 2026-10-20 an architect conversation that read the
handoffs but not session-status re-asked where management's money view lives,
which D3 and "Pesos are computed here" had settled on 2026-10-19. Same failure
class as #16.

## Decision

Split three jobs into three kinds of document:

1. **Decision records** (`docs/decisions/ADR-###-slug.md`): one decision per
   file with context, decision, why, consequences, reopen-only-if and sources.
   Rules in `docs/decisions/README.md`.
2. **Current state** (`session-status.md`): what is true now, plus an index of
   ADR ids. "Things NOT to re-litigate" becomes one line per ADR. Overwritten
   freely and kept short.
3. **Handoff**: one page, in-flight work and the next agenda only, pointing at
   1 and 2. Only the latest handoff sits in the Claude project files.

## Why

A record that is never rewritten keeps its reasoning, and supersede links keep
reversals visible. The decisions most likely to be reopened by accident are
reversals (intake weigh-in, yield `output_quantity`, the MySQL target). Living
under `docs/` means the autopilot's architect-docs pickup can apply new records
without a direct push.

## Consequences

- No big backfill. Harvest order: reversals first, then the "Things NOT to
  re-litigate" list, everything else when it is next touched.
- session-status slims over time into state plus index.
- Every architect session ends by writing records, not a long handoff.
- Where a decision can be a guard plus a test, add that too.

## Reopen only if

Records start drifting from session-status, or writing them stops paying for
itself.

## Sources

Architect conversation 2026-10-20 (Claude project "Auditing WebApp").
