# ADR-075 cubic is optional; late findings are swept up after merge

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: ADR-071 in part (reading cubic's findings "on the current head", and the five-minute
  wait for them)

## Context

ADR-071 had `/naoki-qs` read cubic's findings on the PR's current head, waiting once if cubic had
not reviewed it yet. cubic does not review every push, and often reviews hours later: on PR #59 it
had not reviewed the last two commits when the PR merged.

## Decision

- cubic is optional. `/naoki-qs` never waits for it: once CI is green it sorts whatever cubic has
  posted on the PR so far (open findings, not outdated, any commit), as ADR-071 says, and writes
  "cubic: not reviewed yet" when there is nothing.
- `/naoki-qpr` also lists **late cubic findings**: on PRs merged in the last 7 days, cubic findings
  posted after the merge, or not covered by the PR's `cubic on <hash>` comment. One line each; the
  architect turns any that matter into a small fix step. Nothing acts on them automatically.

## Why

A gate that may arrive hours late cannot hold a merge, but its real bugs should still reach
someone.

## Consequences

`.claude/commands/naoki-qs.md` section 5; `naoki-qpr.md` sections 2, 3 and 5.

## Reopen only if

cubic starts reviewing every push within minutes, or is removed from the repo.

## Sources

Architect chat 2026-11-14 (after PR #59, "optional for yesterday's works").
