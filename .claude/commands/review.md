---
description: Review an open PR for the architect — verify, diff, scope-check, draft a comment; merges or requests changes only when the architect says so.
---

Review PR **$ARGUMENTS** and produce a summary and a draft review comment for the
architect. **Do NOT approve, merge, request changes, or post anything.** Approval
is a human act the architect performs after reading — this command only prepares
the review.

## 1. Get the PR branch and confirm it independently

```
git fetch origin
gh pr view $ARGUMENTS
gh pr checkout $ARGUMENTS
npm run verify
```

Run `verify` yourself — do NOT trust the verify output pasted in the PR body.
Paste the real result. If it is not `SUITE GREEN` and `AUDIT CLEAN`, that is the
headline finding; say so and stop the checks there.

## 2. Read the diff against main

```
git diff origin/main...HEAD
```

Summarize in plain terms: which files changed, and what the change actually does.

## 3. Mechanical checks — report each as PASS/FAIL with the evidence

- **Diff matches the stated purpose.** Does the code do what the PR title, commit
  message, and the step's `session-status.md` spec claim — no more, no less? A
  commit message is a claim; the diff is the evidence.
- **Scope.** Only the files the step should touch. Flag any out-of-scope file,
  especially `schema.sql`, migrations, `public/`, or a doc a worker shouldn't edit
  (`data-model.md`, `commissary-and-stock-receipts.md`, `scope.md`).
- **PR template filled honestly** — verify output present, the caller-check
  actually done (who calls the changed route, and was it exercised the way the
  real caller calls it, not a minimal payload), the settled-decision check. A
  blank template, or boxes ticked with no evidence, is a FAIL.
- **Tests.** Do the added tests exercise the behavior the step exists to fix — the
  real failure mode — not just a happy path?

## 4. Surface the domain judgment — do NOT resolve it

State, in one or two sentences, what this change means for how the restaurant
operation is modelled, and name explicitly any question that is a DOMAIN call
rather than a code call: does this number, rule, or behaviour match how the
restaurant actually works? That judgment is the architect's — it is the one thing
this command cannot make, because it needs restaurant context the repo does not
hold. Present it as a question, not an answer.

## 5. Draft a review comment, then STOP and ask

Write a short comment the architect can post as-is or edit: what's good, what (if
anything) to change, and the domain question from step 4.

If the PR touches `public/`, check for a human click-through note: a PR comment
beginning `Click-through:`, from the dispatcher (`gh pr view $ARGUMENTS --comments`).
Report whether it is there. A worker's own "verified live" in the PR body does not
count — that is the worker checking itself.

Then end with exactly:

> Draft review ready for PR #$ARGUMENTS. I have NOT approved, merged, or posted
> anything. Tell me: **merge**, **request changes** (in your own words), or
> **leave it**.

## 6. Act ONLY on the architect's explicit answer

Do nothing in this section until the architect answers in this conversation. A
green suite is never a reason to merge on your own; the architect's reading is
the approval, and this command only does the clicking.

**Merge.** Refuse, and say why, if `verify` was not green, or if the PR touches
`public/` and has no `Click-through:` comment. Otherwise:

```
gh pr review $ARGUMENTS --approve
gh pr merge $ARGUMENTS --merge
git checkout main
git pull
gh pr list --state open --json number,title,mergeStateStatus
```

Then mark the step closed, so nothing picks it up again. In
`docs/dispatch-queue.md`, and under the step's heading in
`docs/session-status.md`, add one line directly below that step's heading:
`**CLOSED <yyyy-mm-dd>, PR #$ARGUMENTS (`<merge commit short hash>`).**`
Change nothing else in either file. Then:

```
git add docs/dispatch-queue.md docs/session-status.md
git commit -m "docs: close <step-id> (PR #$ARGUMENTS)"
git push
```

This is the architect's own doc change, so it goes straight to `main`.

For every other open PR whose `mergeStateStatus` is `BEHIND`, run
`gh pr update-branch <n>` so CI re-runs against the new `main`. If a PR is
`DIRTY` (a real conflict), do not touch it — the next queue run resolves it.

**Request changes.** Post the architect's words, not yours:

```
gh pr review $ARGUMENTS --request-changes --body-file <file>
git checkout main
```

The next queue run picks this up and fixes it. Tell the architect: anything in
the request that is a design decision must be decided *in the comment* — a
change left open is parked in an issue, not guessed.

**Leave it.** `git checkout main`.

Verify, don't assert — every check above cites real output, never a belief.
