---
description: Naoki's quick start — take ONE piece of queue work all the way to main (build or finish a PR, independent check, gates, merge, close). Run it again after /clear for the next one.
---

Take one piece of queue work from wherever it stands to merged on `main`, then
stop. One piece per run: the next run starts in a fresh conversation, because a
long conversation is how spec details get lost mid-build.

## 0. Fresh context

Apply `.claude/commands/start.md` section 0 exactly. If this conversation already
holds a previous step's work, stop and tell Naoki: "Run `/clear`, then
`/naoki-qs` again."

## 1. What Naoki authorized (2026-10-20)

For this command only, two rules are replaced by the gates in sections 5 to 7:
`docs/engineer-role.md`'s "never merge your own pull request" and
`/review`'s "wait for the architect's answer before merging". You may merge, but
only when every gate passes. Every other rule in `docs/rules-for-claude-code.md`,
`docs/engineer-role.md`, `/start` and `/continue` still applies in full,
including Class B stops, never `git add .`, never force-push, and never resolving
a conflict in `server/db/migrate.js` or `server/db/schema.sql` yourself.

## 2. Ground yourself

Follow `start.md` sections 1 and 2 (current `main`, baseline). If `npm run
verify` is not green on `main`, stop: nothing gets built on a broken `main`.

## 3. Pick the work, in this order

a. **An open PR for a queue step that is waiting for review** (not sent back).
   Oldest first. Skip building; go to section 5 with it.
b. **A sent-back PR** (`start.md` section 2b). Fix it the way `/continue`
   describes for a sent-back PR, then go to section 5.
c. **The next runnable step**, chosen exactly by `start.md` section 3. One
   addition: if `docs/dispatch-queue.md` has an "Order this week" note, take the
   runnable steps it names first, in its order.
d. **Nothing left.** Stop and report in plain words (section 8): what is still
   in the queue, and what each one is waiting for.

Announce what you picked in one line, then keep going without a checkpoint.

## 4. Build (for 3c only)

Follow `start.md` sections 4 and 5, then `/continue` (the `/step` procedure,
phases 4 to 7), without pausing for `/continue`. A Class B question at any point
ends the run: open the `needs-architect` issue as those commands say, do not
merge anything, and report (section 8).

## 5. Independent check (this replaces Naoki reading the code)

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

A green suite has let real screen bugs through before, so Naoki looks before
anything in `public/` merges.
1. On the PR's branch, reseed and start the server against the Beta database
   (`DB_PATH=server/db/beta.db`; `npm run reseed`, then `npm run dev` in the
   background).
2. Give Naoki the address: `http://localhost:3000` for the PC, and
   `http://<this PC's IPv4 from ipconfig>:3000` for a phone on the same Wi-Fi.
3. Turn the step spec's "Click-through" line into 3 to 6 short numbered things
   to try, in everyday words, plus "anything that looks broken or hard to read".
4. Ask him to reply **ok**, or to say what's wrong. Wait.
5. On **ok**: comment on the PR
   `Click-through: <short commit hash> — Naoki, <phone or PC> — "<his words>"`,
   then stop the server. On a problem: that is a fix round (section 5 limits
   apply). Fix, push, re-run section 5, then do this check again.

## 7. Merge and close

1. `gh pr review <n> --approve`. If GitHub refuses because you cannot approve
   your own PR, skip it.
2. `gh pr merge <n> --merge`. If the only thing blocking it is the required
   review, use `gh pr merge <n> --merge --admin`. If that is refused too, stop and
   tell Naoki the one click to make on GitHub.
3. Close the step exactly as `.claude/commands/review.md` section 6 does: the
   `**CLOSED ...**` line in `docs/dispatch-queue.md` and `docs/session-status.md`,
   commit those two paths only, push to `main`. Then `gh pr update-branch` for
   every other open PR that is `BEHIND`. Leave `DIRTY` ones alone.

## 8. Report to Naoki in plain words

At most six short lines, no jargon, no file names unless he needs to act on one:
- **Merged:** what this does, in words a restaurant person would understand
  (PR #n). Or **Stopped:** why, in one sentence.
- **See it:** where to look in the app, or "nothing to see, it works behind the
  scenes".
- **You need to:** the one thing he must do, if anything.
- **Next:** "`/clear`, then `/naoki-qs`."

Verify, don't assert: every gate above cites real command output, never a belief.
