# ADR-118 The click-through runs in its own subagent; builders read the rules digest

- Status: Accepted 2026-11-23
- Decided by: Naoki
- Supersedes: ADR-072 in part (`/naoki-qs` ran one subagent; now two: pr-reviewer and click-checker)

## Context

A17 (docs/reviews/token-use-2026-11-22.md): a build with a click-through sends 11 to 21 million tokens
against about 2 million for a small step, because every screenshot and page read stays in the session
for every later call. `/usage` (2026-11-23, Naoki's laptop, last 24 hours): `/naoki-qs` 86% of usage,
claude-in-chrome 13%; it suggests cheaper models for `/naoki-qs` and for subagents, and turning
claude-in-chrome off. `docs/rules-for-claude-code.md` (about 8k tokens) was read whole by builds.

## Decision

- The "Claude checks" half of a click-through (docs/click-through.md) runs in a **click-checker**
  subagent on Sonnet. It gets the PR number, the server's address and the step's "Claude checks" list
  with its edge states, walks them in Claude in Chrome, and replies with one PASS or FAIL line per
  check and nothing else: no screenshots, page text or HTML.
- The build session acts on that list: a FAIL is a fix round, as today. The "You check" half (the
  person's phone check, `/naoki-qs` section 6) is unchanged.
- Builds and `/naoki-qs` stay on Opus (Naoki, 2026-11-14: Sonnet missed issues). `/usage`'s one-key
  fix is not used; its changes are made in the repo, where they are reviewed.
- Builders read the Digest at the top of `docs/rules-for-claude-code.md` and grep a rule's own section
  only when the step touches it. The rules themselves are unchanged.

## Why

The click-through's output is the biggest thing a build carries; a separate session keeps it out of
every later call. Walking a written checklist suits a cheaper model; judging code does not.

## Consequences

Step token-diet (.claude/ files only). docs/click-through.md names who runs each half. After two
builds with the click-checker, their logs are compared with docs/reviews/token-use-2026-11-22.md.

## Reopen only if

The click-checker misses a logic bug its list covered, or a build with it costs no less.

## Sources

Architect chat 2026-11-23 (A17: "token diet, recs").
