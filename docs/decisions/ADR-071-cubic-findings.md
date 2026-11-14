# ADR-071 cubic's findings are sorted by the builder

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: -

## Context

cubic, the automatic GitHub reviewer, comments on every push. Nothing in `/naoki-qs` or
`pr-reviewer` read its findings; only `/naoki-qpr` listed them, so they piled up (7 open on #59, 6 on
#65), and one on #65 ("never remove memberships") was already reversed by ADR-047.

## Decision

- After CI is green, the `/naoki-qs` run reads cubic's open findings on the PR's current head and
  sorts each one:
  - **Fix:** a real bug inside the step's spec and Touches files, fixed without changing anything
    the spec describes. It is a normal fix round (the two-round limit counts it).
  - **Contradicts:** following it would break the spec, a decision block or an ADR. Never acted on.
  - **Not in this step:** everything else. Never acted on, and no issue is opened for it.
- The run comments `cubic on <hash>: ...` on the PR, so `/naoki-qpr` and a later merge see what
  was sorted. `/naoki-qpr` then lists only the Contradicts and Not-in-this-step clauses.
- cubic is never a gate: an unsorted or unfixed finding does not block a merge by itself.

## Why

The spec and the ADRs decide what a step builds; cubic does not know them. Its real bugs inside a
step are worth fixing, and its other ideas reach the architect through `/naoki-qpr`.

## Consequences

`.claude/commands/naoki-qs.md` section 5 and 8, `naoki-qpr.md` section 3. The pr-reviewer stays
cubic-blind (cold review).

## Reopen only if

cubic is removed from the repo, or its findings start blocking merges on GitHub.

## Sources

Architect chat 2026-11-14 (qpr report 18:04, "Recs").
