# Engineer role — what a collaborator may change without an architect

Read this before touching anything. It defines the boundary between work
you may do on your own judgement and work that has to wait.

This document **supersedes rule 23's 2026-09-02 amendment for
collaborators.** That amendment lets a coder worker push straight to
`main`. It was written for a solo repo where the same person was the
worker and the reviewer. A collaborator does not push to `main` — branch
and pull request, always. Everything else in
`docs/rules-for-claude-code.md` still applies to you in full.

**This file says which *work* you may start. `docs/decision-authority.md`
says which *decisions* you may make once you have started.** Read both.
The second one exists so that small, reversible choices inside an
already-approved task stop coming back to an architect.

## The two lanes

Work reaches you in one of two ways, and they have different rules. Know
which lane you are in before you start.

**DISPATCH lane — you are running a prompt an architect already wrote.**
The design decisions are already made and already written into `docs/`.
Do exactly what the prompt says. The work may be large, may add columns,
may change validation — that is fine, because the thinking already
happened. If the prompt turns out to be ambiguous or contradicts the
docs, stop and park it; do not resolve the ambiguity yourself.

**ENGINEER lane — you spotted something and want to fix it.** This is
your own initiative, and it is deliberately narrow. See green and red
below.

The distinction is not about difficulty. `25a` is a substantial step
with a schema migration and it is perfectly fine as a dispatched prompt,
because the design is settled in `session-status.md`. The same change on
your own initiative would be red. **What makes work safe is that the
decision was already made, not that the code is easy.**

## Green — fix it, no permission needed

- A failing test, or a test that is wrong about what the code does
- A crash or error with a reproducible trigger
- Typos, dead links, broken formatting, stale file paths in docs
- Adding test coverage for behaviour that already exists and is correct
- Anything the docs explicitly say to do and nothing has done yet

The pattern: **green work changes no behaviour that anyone decided on.**
If your fix makes the app do something different from what it was
designed to do, it is not green, however obviously broken it looks.

## Red — stop, park it, do not fix

- Any change to a filter, constraint, validation rule, or what the code
  rejects
- Anything that makes a balance, variance, or yield number come out
  differently
- New columns, new tables, migrations, schema changes
- Anything listed in `session-status.md`'s **"Things NOT to
  re-litigate"** section
- Deleting anything that looks unused
- Anything where you find yourself writing "this is obviously a bug" —
  see below

## The check that matters most

**Before any fix, search `session-status.md`'s "Things NOT to
re-litigate" section for what you are about to touch.** It is long, and
it is long on purpose. If what you are fixing appears there, it is a
settled decision that looks like a bug — park it and stop.

This project is unusually dense with these. Three real examples, all
currently in the code, all of which read as obvious defects:

- Allocation destinations are deliberately **not** filtered by
  `commissary_id`. Yield output **is** restricted to its own commissary.
  Opposite rules, both correct, both intentional. Reading one and
  "fixing" the other to match is the single most likely mistake here.
- Rows created before 24b-iv on unit-tracked meats reject **every**
  edit, including notes-only edits. Deliberately kept — those rows are
  actively corrupting a balance and should not be quietly editable.
- Every Allocate dropdown is currently empty. This is not a filter bug.
  Live meats are untagged in the database; the fix is data entry
  on-site, not code.

None of these need restaurant knowledge to *notice*. They all need it to
know not to touch. That asymmetry is the whole reason this boundary
exists.

## When you hit the line — how to park something

Open a **GitHub issue** with the label `needs-architect`. Not a doc
change, not a note in a file, not a message that scrolls away.

An issue is the right container because it needs no branch and no merge
to exist. The case that matters most — blocked *before* you started, so
there is no branch yet — is exactly the case a file in the repo cannot
handle.

Use `.github/ISSUE_TEMPLATE/needs-architect.md`. It asks for:

- what you were doing
- what you hit
- which doc section is silent or contradictory, **by name**
- what you did *not* change

Then **stop that piece of work.** If you were mid-branch and have
partial work, push it as a **draft** PR referencing the issue so nothing
is lost, and say plainly in the description that it is incomplete and
why.

**An issue is an inbox, never a record.** It is closed only when the
decision has been written into `session-status.md`. The docs stay the
single source of truth; issues are just how a question reaches a sleeping
architect. Never let a decision live only in an issue thread.

This repo is public. Issues describe the *code* question and cite doc
sections by name. No real supplier names, staff names, live yield
figures, or photos.

## After you park something

You may take the next item in `docs/dispatch-queue.md`, but only if it
is untouched by the question you just parked.

You may **not** invent a new task. **If the queue is empty, stop and
wait.** That is a deliberate decision, not an oversight — the plan after
the queue is a soft-launch against real output, so that real use decides
what gets built rather than guesswork. An idle assistant costs far less
than an invented step.

## Git rules

- Branch from up-to-date `main`, named `marble/<short-description>`
- One branch per task. Never reuse a branch after it has been merged
- **Never** push to `main`. **Never** `git push --force`, on any branch.
  **Never** merge your own pull request
- `git pull` before you start, every session, no exceptions
- Run `graphify hook install` once per clone — see README step 4. Skip it
  and `graphify-out/graph.json` will conflict or mangle on your first
  merge
- Do not commit `*.db`, `/uploads/`, or `.env`

## Before opening a pull request

- `npm run verify` green — the full suite plus the write-path audit. It must
  print `SUITE GREEN` and `AUDIT CLEAN`. CI runs the same command on your PR,
  so paste the real output; a mismatch between your paste and the check is
  itself a finding
- If the audit flags something you introduced, build the write path. **Do not
  add an entry to `scripts/write-path-allowlist.json` to make it pass** — that
  is an architect decision, and silencing the audit removes the check that was
  working
- **If you touched `public/`, a green suite is not enough.** Several real
  bugs have shipped past a fully green suite: a wrong row key on the
  balance cards, a dropdown with no active filter, a bad edit rejection.
  Open the app, click the thing, and describe what you saw in the PR
- Nothing outside your task's scope changed. If something did, say so in
  the PR rather than quietly including it
- Fill in `.github/pull_request_template.md` honestly. "I didn't check
  this" is a useful and welcome answer; a guess presented as a check is
  not

Then stop and wait for review. Do not merge.

## The one habit worth more than the rest

**Verify, don't assert.** Never report something as done, passing, or
pushed because you believe it is. Run it and paste the real output. A
worker on this project once reported a step as pushed, with a real
commit hash and a real test count, when the work had never left their
local checkout. An independent pull caught it.

The same applies to you reading the docs: check what the code actually
does before trusting a doc's description of it. On 2026-09-02 an
architect pass found two columns that had been in the schema and fully
*read* by the engine for two sub-steps, but written by no route at all —
while the step list read as though the write path existed.
