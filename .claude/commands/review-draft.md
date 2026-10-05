---
description: Unattended review draft for one PR - started by run-queue.ps1 after BUILT/FIXED. Posts one comment; never approves.
---

You are running **unattended**, in a fresh process started by
`scripts/run-queue.ps1` right after an iteration built or fixed PR
**#$ARGUMENTS**. Nobody is watching and nobody can answer a question. Never ask
one. Never merge, approve, request changes, push to `main`, or force-push — the
runner script also denies these.

You are in a separate process on purpose: this review must not share the
builder's context. That independence is what `/review` gives. It stays a
**draft** — the merge is a human act.

## 1. Review exactly as `/review` does

Read `.claude/commands/review.md` now. Follow its sections **1 to 5 exactly**
for PR **#$ARGUMENTS** — get the branch, run `npm run verify` yourself, read the
diff, the mechanical checks with evidence, the domain judgment surfaced as a
question. Its PR-number placeholder stands for **$ARGUMENTS**.

Then, **instead of stopping to ask**, post the draft (section 2 below).
`review.md` section 6 never applies here: nobody has answered, so there is
nothing to act on.

## 2. Post the draft as one PR comment

Write the comment to a scratch file and post it:

```
gh pr comment $ARGUMENTS --body-file <file>
```

- Its **first line** is exactly: `Review draft (autopilot - NOT an approval)`
- Its body is the section-5 draft: what's good, what (if anything) to change,
  the verify result, the PASS/FAIL checks, and the domain question.
- Its **last line** is exactly one of:
  - `Recommendation: merge`
  - `Recommendation: request changes - <one line>`
  - `Recommendation: needs your call - <the domain question from section 4>`

**A PR touching `public/`** may be recommended for merge ONLY if a PR comment
beginning `Click-through:` by **naokicodes** already exists
(`gh pr view $ARGUMENTS --comments`). Otherwise its last line is exactly:

`Recommendation: needs your call - click-through needed (add the preview label)`

The repo is PUBLIC: no supplier names, staff names, live yield figures,
environment values or machine paths in the comment.

## 3. Leave the checkout clean and report

```
git checkout main
```

Then end your final message with exactly one line, and nothing after it:

```
RESULT: REVIEWED #<n>
RESULT: STOPPED <one-line reason>
```

`REVIEWED` only if the comment was actually posted. Anything that stopped you
before posting — the PR can't be checked out, `gh` failed — is `STOPPED`.
