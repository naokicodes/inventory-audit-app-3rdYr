# ADR-106 An audit fix may move a patch version inside package.json's range

- Status: Accepted 2026-11-22
- Decided by: Naoki
- Supersedes: none (narrows step npm-audit's "Not in scope: upgrading express itself")

## Context

Fable N-1 listed three advisories under express. Step npm-audit said: run `npm audit fix` once,
lockfile only, never upgrade express itself, and stop and ask if an advisory remains. The overnight
runner's pass (draft PR #85, 2026-11-18) cleared proxy-addr and body-parser. The qs advisory stayed:
express 4.22.2 accepts only qs 6.15.x, and every fixed qs is 6.16.1 or later. A second pass moves
express to 4.22.3. The runner stopped and asked (issue #86).

## Decision

- An audit fix may move a dependency, express included, to a newer patch version that
  package.json's range already allows. package.json does not change.
- Never `--force`, never a minor or major version, never a package.json change. If only that would
  clear an advisory, stop and ask.
- For npm-audit now: a second `npm audit fix` on PR #85 (express 4.22.2 -> 4.22.3, qs 6.16.2);
  `npm audit` then reports 0.

## Why

Checked 2026-11-22: express 4.22.3's only code change is one line in `req.fresh` (the QUERY
method, which this app never uses), plus its qs and path-to-regexp ranges. With it the suite is
green and no advisory remains. The restaurant PC installs fresh at beta-3, so the change costs
nothing there.

## Consequences

npm-audit gains a 2026-11-22 block; PR #85 gets the second pass and is then ready; issue #86
closes.

## Reopen only if

A patch release breaks something the suite does not cover.

## Sources

Issue #86; PR #85; the overnight run's log (2026-11-18 02:47); architect chat 2026-11-22
(answer 1).
