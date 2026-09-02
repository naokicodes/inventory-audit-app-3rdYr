# Workflow guide — how this project is actually run

Written to be read cold, after weeks away, by someone who set all of this
up and has since forgotten the details. If something here disagrees with
what the repo does, the repo is right and this file is stale — fix it.

---

## The one-page version

Work is defined in `docs/session-status.md` and ordered in
`docs/dispatch-queue.md`. A worker runs `/step <name>`, builds it, and
opens a pull request. CI runs the suite and the write-path audit on that
PR. You merge. If the worker hits a decision it is not allowed to make,
it opens a `needs-architect` issue and stops.

**Your three jobs, and nothing else:**

1. Type `/step <name>` to start work.
2. Look at the PR and merge it.
3. Batch up open issues and bring them to an architect conversation.

Everything below is detail on those three.

---

## One-time setup

### On your machine

Already done if you can run `npm run dev`. What the automation adds:

```
gh auth login
```

That is the whole install. `gh` is what lets a Claude Code session open
pull requests and issues as you. Without it, `/step` will build and push
but stop short of opening the PR.

### On a collaborator's machine

Everything else arrives with `git pull` — the commands, the docs, the
scripts, the templates. Per-clone, once:

```
gh auth login
graphify hook install
```

`graphify hook install` is easy to skip and expensive to skip. The merge
driver for `graphify-out/graph.json` lives in local `.git/config` and does
not travel with a clone. Miss it and the first merge mangles the file.

A collaborator needs **Write** access on the repo — the minimum to push a
branch. Write also technically permits merging, which is why branch
protection on `main` is doing the real work rather than the permission
level.

---

## The loop

**Phase 0 — architect conversation (you, on the web).**
Design gets settled and written into `docs/`. Steps are defined in
`session-status.md` and ordered in `dispatch-queue.md`. This is the only
place design happens.

**Phase 1 — `/step 25a`.**
One command. The worker pulls, baselines with `npm run verify`, reads the
step, implements it, verifies again, branches, pushes, and opens a PR.
Class A decisions it makes alone and logs in the PR body.

**Phase 2 — CI, nobody present.**
The suite and the write-path audit run on the PR. Cubic reviews in
parallel. This is what replaced trusting a pasted test count.

**Phase 3 — you, about two minutes.**
Checks green, no open flags, `public/` untouched → merge. `public/`
touched → open the app and click it first, no exceptions.

**Phase 4 — next architect conversation.**
Open issues get resolved into `docs/`, the issues get closed with a
pointer to the section that resolved them, and the queue moves.

---

## Job 1 — dispatching

```
/step 25a
```

That is it. The command file at `.claude/commands/step.md` holds the whole
procedure, so you do not retype it and a worker cannot quietly skip a
phase.

```
/verify
```

Read-only. Pull, run the suite and audit, report state and any drift
between docs and code. Run it when you want to know where things stand
without starting anything.

Do not dispatch two steps that both touch `schema.sql` or `migrate.js` at
the same time. They will conflict, and no process fixes that.

---

## Job 2 — the merge gate

Merge when: CI green, no open `needs-architect` issue for that step, and
nothing outside scope changed.

**Do not merge a PR touching `public/` on a green suite alone.** Three of
the last four dispatches found a real UI bug while the suite was fully
green — a wrong row key on the balance cards, a dropdown with no active
filter, a bad edit rejection. The PR must describe what was actually
clicked. If it says "I didn't check this", that is honest and useful, and
it means you click it.

Read the Class A decision log for the record, not for approval. Class A is
reversible by definition — that is what makes it Class A. If one was
wrong, it is a later commit, not a blocked merge.

---

## Job 3 — architect sessions

This is the part that is hardest to pick back up cold, so here is the
recipe.

### Starting a fresh conversation

1. Paste your private architect notes.
2. **Say which mode you are in.** ARCHITECT or DISPATCHER. Do not start
   work until it is stated. The mode is about what is permitted, not who
   is typing — you use both yourself.
3. Tell Claude to clone the repo. It is public, and cloning is faster and
   cheaper than pasting files.
4. Have it run the suite and the audit before believing anything about
   state.

**Do not trust your own notes file.** On 2026-09-03 it listed a step as
"next" that had landed two commits earlier, and named three tables as
having no writer when one had gained a write path in that very step. The
repo docs were correct; the private notes were not. A fresh conversation
should always verify before planning.

### Working through flags

```
gh issue list --label needs-architect
```

Resolve them in a batch — a fresh conversation has fixed startup cost, so
three flags in one sitting is far cheaper than three sittings. A flag does
not block the loop as long as the queue has other work in it.

Closing a flag properly is three things, not one:

1. Write the decision into `docs/session-status.md` as a step section or a
   settled-decision entry
2. Comment on the issue **pointing at that section**, not restating it
3. Close the issue

Write the resolution as a step section, never as an issue reply. A worker
prompt has to be self-contained; "see the discussion above" sends someone
into a thread to reconstruct a decision.

### The habit that matters most

Verify, don't assert. Pull the repo, read the real diff, run the real
suite. Never trust a commit message, a worker summary, or a notes file.

---

## Command reference

| Command | What it does |
|---|---|
| `npm run dev` | Start the app |
| `npm test` | All 16 suite files, one aggregate count |
| `npm run audit:write-paths` | Tables and columns read but never written |
| `npm run verify` | Both of the above — what CI runs |
| `/step <name>` | Run one queued step through to a PR |
| `/verify` | Read-only state and drift report |
| `gh issue list --label needs-architect` | Open flags waiting on you |

---

## The write-path audit, and how not to break it

It catches the bug class that has hit this project twice: schema that is
read but never written. Both times the code looked finished and the suite
was green.

Expected gaps live in `scripts/write-path-allowlist.json`, each with a
reason. **Delete an entry when its write path lands** — that deletion is
the whole point. An allowlist nobody prunes becomes a list everyone
scrolls past.

Adding an entry is an architect decision, never an engineer-lane fix. A
worker who silences the audit to make CI pass has removed the check that
was working.

Known gap: it is a grep, not a parser. It cannot see a write built from an
interpolated table name, and it does not know whether a write is
reachable. Clean means "a write path exists in the source", not "the
feature works".

---

## Deliberately not built yet

Each of these was designed and postponed on purpose. The trigger is what
makes it worth revisiting — until then, leaving it undone is the correct
state, not a backlog item.

| Postponed | Trigger to revisit |
|---|---|
| Issue-based queue with claiming and labels | Two workers actually running in parallel. With a short sequential queue it solves a collision that cannot happen. |
| Playwright / browser smoke tests | After soft launch, once screens stop moving. Would automate part of the `public/` click-through, which is currently manual and mandatory. |
| Seed fixture DB for realistic CI | If CI starts missing bugs that only appear with populated data. 25c covered part of this. |
| Full reconciliation of the authority docs | If `rules-for-claude-code.md`, `engineer-role.md`, and `decision-authority.md` ever actually contradict each other. Pointers were added instead of a restructure. |
| New Claude Code skills | When a body of knowledge grows past what fits comfortably in a worker's context. Commands cover procedures; skills are for knowledge. Currently only graphify qualifies. |
| Moving the collaborator handoff file into the repo | If it drifts. It is outside version control today, which is the same condition that let the architect notes go stale. |

**`docs/ui-conventions.md` is not on this list.** It is unwritten but not
postponed — it is the next architect session after the core queue clears.
`style.css` is 81 lines across twelve pages, so there are effectively no
conventions for a worker to follow, which means every UI step regenerates
the same questions and routes them all to an architect.
`decision-authority.md` already has the hook: anything that file settles
becomes Class A.

---

## When something goes wrong

**CI red on a PR you did not expect.** Run `/verify` locally first. If
local is green and CI is red, suspect the Node version or an uncommitted
file, not the test.

**The audit fails after a schema change.** Correct behaviour — you added a
column with no writer. Build the write path. Only allowlist it if the gap
is deliberate, and write the reason and the step that will close it.

**A worker reports green but the PR check is red.** The check is right.
This is exactly the case the automation exists to catch, and it has
happened here before with a real commit hash and a real test count
attached to work that never left a local checkout.

**Docs and code disagree.** Code wins, then fix the doc in the same
session. Do not carry it.

**The queue is empty.** Stop. That is deliberate, not an oversight. The
plan after the queue is a soft launch against real output, so that real
use decides what gets built rather than guesswork. An idle assistant costs
far less than an invented step.
