---
description: Quick merge — merge the PRs Naoki names (e.g. /naoki-qm 39 40) that are already Ready, one at a time with verify after each, then close all their steps in one docs commit. Naoki only.
---

Merge the pull requests named in `$ARGUMENTS`, in the order given, then close
their steps in one batch. This command merges work that has ALREADY passed its
gates. It never builds, fixes, reviews or phone-checks anything. A PR that is not
ready is skipped and named in the report, never repaired here.

## 0. Who and what

1. Fresh context: apply `.claude/commands/start.md` section 0 exactly.
2. `gh api user --jq .login` must print `naokicodes`. Otherwise stop and say:
   "Only Naoki's account runs /naoki-qm."
3. `$ARGUMENTS` must be one or more PR numbers. If it is empty, list the open
   PRs that look ready (non-draft, with a `Ready to merge: all gates passed on
   <hash>` comment naming their current head) as one line each, say
   "Run `/naoki-qm <numbers>` to merge them", and stop. Merge nothing.

This command is covered by the `/naoki-qs` merge policy (2026-10-21): the gates
replace human code review and only Naoki merges. Every other rule in
`docs/rules-for-claude-code.md` still applies: never `git add .`, never
force-push, never push code to `main` (only the docs commit in section 4).

## 1. Ground

`git checkout main`, `git pull`, `npm run verify`. If `main` is not green, stop:
nothing merges onto a broken `main`.

## 2. Check every named PR before merging any

For each PR, gather `gh pr view <n> --json number,title,isDraft,headRefOid,mergeStateStatus,files,comments,reviews`
and `gh pr checks <n>`. A PR is **ready** only if ALL hold:

- not a draft;
- its title carries a step id `(<step-id>)` that has a spec in `docs/session-status.md`;
- CI is green on its current head;
- a `Ready to merge: all gates passed on <hash>` comment, or a review with every
  mechanical check PASS, names its **current** head commit;
- if it touches `public/`: a `Click-through: <hash> ...` comment names its
  current head commit;
- no open `needs-architect` issue names its step
  (`gh issue list --state open --label needs-architect --json number,title`);
- `mergeStateStatus` is not `DIRTY`;
- it shares no file with another PR in this batch (compare `files`). If two do,
  keep the lower-numbered one and skip the other.

Print one line per PR: ready, or skipped with the one reason. If none is
ready, stop.

## 3. Merge the ready ones, one at a time

For each ready PR, in the order given:

1. If it is `BEHIND` and GitHub refuses the merge because of that, run
   `gh pr update-branch <n>`, then `gh pr checks <n> --watch`. Continue only if
   CI is green. The only new commit is the merge of `main` that GitHub made, so
   the PR's earlier evidence still stands; any other new commit means skip it.
2. `gh pr review <n> --approve` (skip if GitHub refuses because it is your own).
3. `gh pr merge <n> --merge`. If only the required review blocks it, use
   `gh pr merge <n> --merge --admin`. If that is refused too, stop and say the
   one click to make on GitHub.
4. `git checkout main`, `git pull`, `npm run verify`. **If it is red, stop
   here.** Merge nothing more, write no docs, and report which merge turned it
   red and the failing line. Do not revert on your own: a revert is Naoki's
   call, through a PR.
5. Note the merge commit's short hash.

## 4. Close the steps in one docs commit

After the last merge, for each merged PR add one line directly below its step's
heading in BOTH `docs/dispatch-queue.md` and `docs/session-status.md`:
`**CLOSED <yyyy-mm-dd>, PR #<n> (`<merge commit short hash>`).**`
Change nothing else in either file. If a step already has a CLOSED line, leave
it alone. Then:

```
git add docs/dispatch-queue.md docs/session-status.md
git commit -m "docs: close <step-ids> (PRs #<a>, #<b>)"
git push
```

Then `gh pr list --state open --json number,mergeStateStatus` and run
`gh pr update-branch <n>` for every open PR that is `BEHIND`. Leave `DIRTY` ones
alone.

## 5. Report in plain words

At most six short lines:
- **Merged:** what each one does, in everyday words (PR #n).
- **Skipped:** PR #n and the one reason, if any.
- **Stopped:** only if verify went red, with the merge that did it.
- **Next:** "`/clear`, then `/naoki-qpr` for a fresh report."

Verify, don't assert: every line cites real command output, never a belief.
