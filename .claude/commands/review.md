---
description: Review an open PR for the architect — verify, diff, scope-check, draft a comment. Does NOT approve or merge.
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

## 5. Draft a review comment and STOP

Write a short comment the architect can post as-is or edit: what's good, what (if
anything) to change, and the domain question from step 4. Then end with exactly:

> Draft review ready for PR #$ARGUMENTS. I have NOT approved, merged, or posted
> anything. Your call: post or edit the comment, then — if satisfied —
> `gh pr review $ARGUMENTS --approve` and `gh pr merge $ARGUMENTS`. Or request
> changes. Return to main with `git checkout main` when done.

Verify, don't assert — every check above cites real output, never a belief.
