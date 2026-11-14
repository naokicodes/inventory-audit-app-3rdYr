# ADR-072 A PR is reviewed against main's spec, by the pr-reviewer agent

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: -

## Context

On 2026-11-14 `/naoki-qs 61` ran its review as a general-purpose subagent: it ran on the main
session's model and re-read the docs, the cost `pr-reviewer` (Sonnet, a short reading list) exists
to avoid. PR #61's branch is from 2026-11-02, before `.claude/agents/pr-reviewer.md` existed.
Worse, the builder and the reviewer read the step's spec from the checked-out branch. PRs #59 and
#65 were parked on issues whose answers (decision blocks) landed on main later, so a review on
their branches would read the old spec, pass, and #59 could merge without #60's changes.

## Decision

- The spec, the queue entry, the ADR index and the ADRs are always read from `origin/main`
  (`git show origin/main:<path>`), never from the PR's branch, by the builder and the reviewer.
- Before a review, `/naoki-qs` brings the PR up to date with main (`gh pr update-branch`, a merge;
  a conflict stops the run). If the spec has a decision block newer than the PR's last own commit,
  the run builds those changes first.
- The reviewer fails Purpose when the diff lacks a newer decision block's changes.
- The review runs as the `pr-reviewer` agent type, never another type. Fallback when it is not
  offered: general-purpose with model `sonnet`, told to follow main's `pr-reviewer.md`.

## Why

A decision block overrides the text above it only if the people building and reviewing see it.
The PR branch is the wrong place to read a spec that changes while the PR waits.

## Consequences

`.claude/commands/naoki-qs.md` sections 4 and 5, `naoki-qpr.md` section 3,
`.claude/agents/pr-reviewer.md` sections 1, 2 and 4.

## Reopen only if

Specs move out of the repo, or PRs stop waiting on decisions.

## Sources

Architect chat 2026-11-14 (the #61 run's screenshot, "general-purpose").
