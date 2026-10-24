---
description: Quick PR report — read every open PR at once and write one plain report Naoki can paste into a fresh architect chat. Read-only.
---

Read every open pull request, sort each one by what it needs, and write one
report. Best run in a fresh conversation (`/clear` first).

**Read-only.** Never merge, approve, request changes, comment, label, close,
push, or edit a file in the repo. The only file you write is the report, and it
goes outside the repo so it can never be committed.

## 1. Ground

`git fetch origin`, then note `main`'s short hash and run `npm run verify` on a
clean `main`. Record one line: green, or what failed.

## 2. Gather

```
gh pr list --state open --json number,title,headRefName,headRefOid,isDraft,author,createdAt,mergeStateStatus,labels
```
For each PR: `gh pr view <n> --comments`, `gh pr checks <n>`,
`gh pr diff <n> --name-only`. Find its step id (the `(<step-id>)` in its title)
and that step's spec in `docs/session-status.md`.

## 3. Use existing evidence before doing new work

A PR's comments may already hold its gates: a review draft from
`/review-draft` or `/review`, a `Ready to merge: all gates passed on <hash>`
line, a `Click-through: <hash> ...` line. Evidence counts only if it names the
PR's **current** head commit; older evidence is listed as "out of date".

Only for a non-draft PR with no current review evidence: run
`.claude/commands/review.md` sections 1 to 4 in a **subagent with a fresh
context**, one per PR. At most 5 new reviews per run, oldest PR first; list the
rest as "not reviewed yet, run again". Draft PRs are claims by a running
`/naoki-qs`: never review them.

## 4. Sort each PR into exactly one group

- **Needs a decision**: the review's domain-judgment list has an item the spec
  does not answer word for word, or an open `needs-architect` issue names the
  step.
- **Needs a fix**: CI red, `verify` red, or a review check FAIL. Say what, in
  one line.
- **Needs a phone check**: touches `public/`, gates pass, no `Click-through:` for
  the current head.
- **Blocked**: `DIRTY` (conflict), or it shares files with an older open PR. Name
  the conflict or the PR.
- **Ready to merge**: current evidence for every gate, nothing above applies.
- **In progress**: drafts. One line each: step, who, since when.

## 5. Write the report

Save to `~/Downloads/naoki-qpr-<yyyy-mm-dd-hhmm>.md`. In the terminal print only
the file path and the count per group.

```
# PR report - <date time>, main at <short hash> (verify: <green | red: what>)
Paste into a fresh architect chat in the Auditing WebApp project.
Branches and head hashes are included so the architect can fetch and check them.

Needs a decision: n · Needs a fix: n · Needs a phone check: n · Blocked: n · Ready to merge: n · In progress: n

## Needs a decision
### PR #<n> (<step-id>) - <what it does, in plain words>
- Branch `<headRefName>` @ `<short head hash>`; files: <list>
- The question: <one sentence>
- Reading A: <...>  Reading B: <...>  (evenly, no recommendation)
- Silent or conflicting doc section: <file + heading>
- Waiting behind it: <steps that depend on this one, from dispatch-queue.md>

## Needs a fix
### PR #<n> (<step-id>) - <plain words>
- Branch @ hash; what fails, with the real output line

## Needs a phone check / Blocked / Ready to merge
- PR #<n> (<step-id>) - <plain words> - branch @ hash - <the one thing it needs>

## In progress
- <step-id> - <who> - since <date>
```

Rules for the report: plain words, decisions first. Copy questions and readings
from the review or issue, never invent one, and never add a recommendation. No
prices, costs, supplier or staff names, even if a comment contains them. Under
200 lines; if longer, shorten the "Ready to merge" entries first. Anything not
checked is written "not checked".

Verify, don't assert: every line comes from real command output.
