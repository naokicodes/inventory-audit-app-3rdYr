---
description: Team quick start — take ONE piece of queue work as far as the runner may (build or finish a PR, independent check, gates; Naoki's runs also merge and close). Optional target - /naoki-qs 35 (a PR or issue number) or /naoki-qs warn-ink (a step id). Run it again after /clear for the next one.
---

Take one piece of queue work as far as you are allowed, then stop. One piece per
run: the next run starts in a fresh conversation, because a long conversation is
how spec details get lost mid-build. Naoki and Marble may both run this, even at
the same time; the claim in section 3 keeps them off the same step.

## 0. Fresh context

Apply `.claude/commands/start.md` section 0 exactly. If this conversation already
holds a previous step's work, stop and say: "Run `/clear`, then `/naoki-qs`
again."

## 1. What Naoki authorized (2026-10-21)

For this command only, two rules are replaced by the gates in sections 5 to 7:
`docs/engineer-role.md`'s "never merge your own pull request" and `/review`'s
"wait for the architect's answer before merging". **Only Naoki's runs merge**:
check `gh api user --jq .login`. If it is not `naokicodes`, you are a builder
run: you go up to "ready to merge" and stop (section 7). Every other rule in
`docs/rules-for-claude-code.md`, `docs/engineer-role.md`, `/start` and
`/continue` still applies in full, including Class B stops, never `git add .`,
never force-push, and never resolving a conflict in `server/db/migrate.js` or
`server/db/schema.sql` yourself.

## 2. Ground yourself

Follow `start.md` sections 1 and 2 (current `main`, baseline). If `npm run
verify` is not green on `main`, stop: nothing gets built on a broken `main`.

## 3. Pick the work

Draft PRs are claims. Never pick up, review or merge someone else's draft
(the one exception is a takeover Naoki asks for, in 3T).

### 3T. A target the person named (`$ARGUMENTS` is not empty)

The person chose the work, so skip the automatic order below (and any "Order
this week" note). Read the first word of `$ARGUMENTS`:

- **A number:** try `gh pr view <n>`; if there is no such PR, try
  `gh issue view <n>`.
  - **A PR.** Merged or closed: stop and say so. Its step has an open
    `needs-architect` issue: stop and name the issue ("waiting on a decision").
    Someone else's **draft**: stop and say whose claim it is, unless the second
    word is `takeover` (below). Otherwise treat it exactly as the automatic
    order would: your own draft -> 3.0; sent back -> 3b; waiting or "Ready to
    merge" -> 3a.
  - **An issue.** An open `needs-architect` issue: stop ("this is a decision for
    an architect chat"). A closed `needs-architect` issue: work on the PR it
    links, as above. An issue naming a step ("Step <id>"): treat it as that step
    id. Anything else: stop ("not queue work").
- **A step id** (`warn-ink`, or its queue number like `3z`): if an open PR's
  title has `(<step-id>)`, work on that PR as above. Otherwise check it with
  `start.md` section 3: runnable -> claim and build it as in 3c; blocked or not
  specced -> stop and say what it waits for. Never build a step that is not
  runnable just because it was named.

**Takeover** (`/naoki-qs <PR> takeover`, Naoki's runs only): for a teammate's
draft or parked PR when they are away. Stop instead if the login is not
`naokicodes`, or if the branch's newest commit is less than 2 hours old (they
may still be working). Otherwise comment on the PR
`Taken over by naokicodes on <yyyy-mm-dd> (owner away).`, check out its branch,
and continue from section 4 or 5 on that same branch. Never force-push; if a
push is rejected, someone else pushed: stop.

### The automatic order (no target)

Before choosing, list every candidate you looked at with a one-line reason for
skipping it ("#35 - someone else's draft", "#43 - waiting on issue #44"). The
report repeats this list, so a skipped claim is always visible.

0. **Your own unfinished claim**: `gh pr list --author @me --draft`. A run of
   yours stopped part-way. Resume it on its branch from section 4 (or section 5
   if the build is complete).
a. **An open, non-draft PR for a queue step that is waiting** (for review, or
   marked "Ready to merge" by a builder run). Oldest first. Go to section 5.
b. **A sent-back PR** (`start.md` section 2b). Fix it the way `/continue`
   describes for a sent-back PR, then go to section 5.
c. **The next runnable step**, chosen exactly by `start.md` section 3. One
   addition: if `docs/dispatch-queue.md` has an "Order this week" note, take the
   runnable steps it names first, in its order. Then **claim it before building**:
   ```
   git checkout -b marble/<short-description> origin/main
   git commit --allow-empty -m "chore(<step-id>): claim - building now"
   git push -u origin marble/<short-description>
   gh pr create --draft --title "<type>(<step-id>): <short summary>" --body "Claimed, building now. Not ready for review."
   ```
   The title must contain `(<step-id>)` exactly, so `/start` and other runs see
   the step as in flight.
d. **Nothing left.** Stop and report in plain words (section 8): what is still
   in the queue, and what each one is waiting for.

Announce what you picked in one line (and, for the automatic order, the
skipped list), then keep going without a checkpoint.

## 4. Build (for 3c, or a resumed 3.0)

On the claimed branch, follow `start.md` sections 4 and 5, then `/continue` (the
`/step` procedure, phases 4 to 7), without pausing for `/continue`. At phase 7 do
not open a new PR: write the filled `.github/pull_request_template.md` to a file,
then `gh pr edit <n> --body-file <file>` and `gh pr ready <n>`. A Class B
question at any point ends the run: open the `needs-architect` issue as those
commands say, comment on the draft that it is parked, merge nothing, and report.

## 5. Independent check (this replaces a person reading the code)

Run a review in a **subagent with a fresh context**, giving it only the PR number
and `.claude/commands/review.md` sections 1 to 4 to follow. It must not see your
build reasoning. If no subagent tool is available, do it yourself from
`gh pr diff <n>` read cold, as if someone else wrote it.

All of these must hold:
- every mechanical check in the review is PASS;
- CI is green: `gh pr checks <n> --watch`;
- the review's domain-judgment list (its section 4) is empty, or every item on it
  is answered word for word by the step's spec. Anything that needs a human
  decision means **do not merge**: open a `needs-architect` issue and stop.

If a check fails, fix it on the same branch, push, and check again. At most two
fix rounds. Still failing after two: leave the PR open, comment what is wrong in
plain words, and stop.

## 6. Phone check (only if the PR touches `public/`)

A green suite has let real screen bugs through before, so a person looks before
anything in `public/` merges. **Skip this section** if the PR already has a
`Click-through:` comment naming its current head commit (`gh pr view <n>
--comments`); that check still counts.
1. On the PR's branch, reseed and start the server against the Beta database
   (`DB_PATH=server/db/beta.db`; `npm run reseed`, then `npm run dev` in the
   background).
2. Give the person running this the address: `http://localhost:3000` for the PC,
   and `http://<this PC's IPv4 from ipconfig>:3000` for a phone on the same Wi-Fi.
3. Turn the step spec's "Click-through" line into 3 to 6 short numbered things
   to try, in everyday words, plus "anything that looks broken or hard to read".
4. Ask them to reply **ok**, or to say what's wrong. Wait.
5. On **ok**: comment on the PR
   `Click-through: <short head commit hash> — <their name>, <phone or PC> — "<their words>"`,
   then stop the server. On a problem: that is a fix round (section 5 limits
   apply). Fix, push, re-run section 5, then do this check again.

## 7. Merge and close

**Builder run** (login is not `naokicodes`): comment on the PR
`Ready to merge: all gates passed on <short head commit hash>.` and stop. Do not
approve, merge or push to `main`. Report that Naoki's next `/naoki-qs` merges it
first.

**Naoki's run:**
1. `gh pr review <n> --approve`. If GitHub refuses because you cannot approve
   your own PR, skip it.
2. `gh pr merge <n> --merge`. If the only thing blocking it is the required
   review, use `gh pr merge <n> --merge --admin`. If that is refused too, stop and
   say the one click to make on GitHub.
3. Close the step exactly as `.claude/commands/review.md` section 6 does: the
   `**CLOSED ...**` line in `docs/dispatch-queue.md` and `docs/session-status.md`,
   commit those two paths only, push to `main`. Then `gh pr update-branch` for
   every other open PR that is `BEHIND`. Leave `DIRTY` ones alone.

## 8. Report in plain words

At most eight short lines, no jargon, no file names unless someone must act on one:
- **Merged** / **Ready for Naoki** / **Stopped:** what this does, in words a
  restaurant person would understand (PR #n), or why it stopped, in one sentence.
- **See it:** where to look in the app, or "nothing to see, it works behind the
  scenes".
- **You need to:** the one thing a person must do, if anything.
- **Skipped:** for the automatic order, each candidate passed over and why
  (one line each, at most three; "and N more" after that).
- **Next:** "`/clear`, then `/naoki-qs`" (or `/naoki-qs <n>` for a specific PR).

Verify, don't assert: every gate above cites real command output, never a belief.
