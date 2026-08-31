# Rules for Claude Code

Read this at the start of any session touching this project. These are
standing constraints, not suggestions — they exist to keep a solo,
2-hours-a-day project from drifting into something unmaintainable.

## Before writing code
1. **Read the relevant docs first** (`data-model.md`, `scope.md`,
   `daily-workflow.md`, `tech-stack.md`, `loyverse-sync.md` if touching
   sync, and `commissary-and-stock-receipts.md` if touching stock receipts,
   commissary yield, or the activity log). Don't guess at schema, formulas,
   or scope — they're already defined.
2. **State the plan briefly before implementing** — what files will
   change, what won't. Small, reviewable steps over large ones.
3. **If a task isn't covered by these docs, or seems to require expanding
   scope, stop and ask** rather than making an assumption and building on
   top of it.

## While writing code
4. **Calculated values are never hardcoded or stored redundantly.**
   Beginning stock, new stock, usage, expected ending, variance, commissary
   yield loss % and status — always computed from the underlying input
   tables per the formulas in `data-model.md`, not written as static
   numbers or cached without a clear invalidation plan.
5. **Match the tech stack in `tech-stack.md` exactly.** Don't introduce
   Postgres, Docker, React, a heavy ORM, or cloud dependencies without
   an explicit conversation first.
6. **Write tests for the audit engine specifically** (and the commissary
   yield engine, once built), using real numbers from the original
   spreadsheets as the expected answers. This is the part that must never
   be silently wrong.
7. **Don't modify these docs directly.** If something here turns out to
   be wrong or incomplete once implementation reveals a gap, flag it and
   the doc gets updated deliberately (outside of a pure coding session),
   not edited inline as a side effect of writing code.
8. **Small, focused commits — but committing is a separate, later step**
   from testing. Don't feel pressure to commit something broken as if it
   were finished; freely iterate first. That's different from a
   deliberate, honestly-labeled WIP commit when a step runs out of
   session time — see rule 17, which is the one case where landing
   unfinished work is the right call, not the wrong one.
9. **Every write to `stock_receipts` or `commissary_yield_log` logs to
   `activity_log`** with a before/after snapshot, in the same transaction
   as the write it's logging. Deletes on those two tables are soft
   (`deleted_at`), never a physical `DELETE`. See
   `commissary-and-stock-receipts.md` Part 3. This pattern is scoped to
   just these two tables for now — don't silently extend it to
   `ending_actual`/`adjustments`/`prepped`/`portion_ending_actual`; that's
   deliberate future work, tracked in `scope.md`.

## Specific to this project
10. **The worker-facing (auditor's daily) screens must stay minimal** —
    see `daily-workflow.md`. No math visible, no recipe/admin concepts
    leaking into the daily entry forms.
11. **Recipe/BOM data is intentionally incomplete right now.** Don't try
    to "fill in" missing recipe quantities from assumptions.
12. **Positive variance = shortage, negative = surplus.** This sign
    convention is fixed — don't flip it without updating every doc and
    screen consistently.
13. **Photo attachments are references only** — never build automatic
    reading/OCR of the photos.
14. **The Loyverse sync is a later phase** — don't let it block or
    complicate the core audit engine.
15. **Never infer `commissary_meat_map` rows from matching meat codes.**
    Commissary and restaurant meat numbering are confirmed NOT aligned
    (see `data-model.md` section 10) — mapping is explicit, admin-set data
    only.
16. **Size each numbered step to fit one focused session, with margin —
    not "as much as fits before usage runs out."** This rule exists
    because of a real incident: step 9 (Unallocated receipts) was sized
    as "schema + migration + all three routes + tests + the UI," a
    session did the first four parts correctly, then lost all of it by
    hitting its usage limit before committing (see `changelog.md`,
    2026-08-28 entries). A step sized so a full session comfortably
    covers implementation, tests, docs, AND a commit — with room to
    spare — turns a usage cutoff into "next session picks up the next
    small step" instead of "the last hour of work vanished." Concretely:
    - A backend change and its matching frontend change are two steps,
      not one, unless both are genuinely trivial.
    - A step description that reads as "X, Y, and Z" (three-plus
      distinct deliverables) should usually be three steps.
    - **A step's own text in `session-status.md` should be the whole
      task, not a pointer to go implement a spec section yourself.**
      Even when a full design doc already exists (step 9's did — two
      docs fully specified the schema, the validation rules, and the
      workflow — and it still took a session to a total loss before it
      landed), don't hand a future session "go build Unallocated
      receipts per data-model.md section 5." Hand it the narrow slice —
      "add the nullable columns and the migration, nothing else" — with
      the spec cited for *background*, not as the task itself. A session
      shouldn't have to read and internalize a multi-part design before
      it can start; that reading is real cost too, and it's cost every
      single session pays again if the step stays large.
    - **Commit as soon as a step's own tests pass** — don't bundle
      "finish the step" and "commit it" as separate later actions within
      the same session if the step is already done; per rule 8, testing
      and committing are separate steps, but on a *usage-limited* session
      the gap between them should be minutes, not "whenever I get
      around to it."
    - If a step turns out bigger than expected once inside it, stop at
      the next clean boundary and hand off via `session-status.md` — see
      rule 17 for what to do if that boundary isn't a fully working,
      tested state.
    - See `session-status.md`'s roadmap for what this looks like applied
      to the actual remaining work (steps 10 onward were re-split for
      exactly this reason on 2026-08-28).
17. **WIP hand-offs are allowed — provisionally, treat this as
    experimental and revisit if it causes problems.** Until 2026-08-28
    the rule was implicitly "land a whole tested step or land nothing,"
    which is exactly what turned step 9's usage cutoff into a total
    loss instead of partial progress. The policy now is the opposite
    default: **partial, honestly-labeled progress is better than no
    commit at all**, even if what's committed doesn't fully work yet.
    That only holds if the hand-off is done properly:
    - Prefix the commit message `wip:` (e.g. `wip(step10): landing
      mixed-grid query - meats rows done, dish rows not started`) so
      it's unmistakable from the git log alone, without needing to open
      `session-status.md`, that this isn't a finished step.
    - **Never leave previously-working behavior broken.** New,
      incomplete work must be isolated — a new file, an unwired route,
      a code path nothing else calls yet — rather than landed
      half-finished on top of something that currently works. If
      finishing the step requires editing an existing working file in a
      way that would leave it broken partway through, that's a sign the
      step should be re-split (rule 16), not a reason to skip
      committing.
    - Run the full existing test suite before committing WIP, same as
      any other commit — "incomplete" describes the new work's scope,
      not permission to regress what's already tested and passing.
    - Update `session-status.md`'s entry for that step with a precise
      **done / not done / untested** breakdown — not "step 10 is in
      progress," but specifically what exists, what's missing, and what
      hasn't been run. The next session's job is to read that and
      continue from exactly where this one stopped, not to re-plan the
      step or re-derive what's already decided.
    - This is a fallback for when a step genuinely runs long, not a
      substitute for rule 16 — the goal is still to size steps so this
      rule rarely gets used.

18. **Distribution flow between the architect conversation and coder
    workers: worker → architect → worker, one hop at a time — never a
    batch of pre-written future prompts.** Adopted 2026-08-29, because
    the architect conversation resets between token budgets and won't
    remember any of this — these rules are what carries it forward, not
    the chat history. If you're picking this up fresh with no memory of
    a prior conversation, this is how the project actually runs:

    **2026-08-31 addendum**: every "coder worker" session referenced below,
    for every step done so far (1–22, all of Round 2, item 3's design), has
    been **free-tier Claude.ai web chat**, not literal Claude Code — confirmed
    by the project owner directly. Claude Code (the CLI/app, running on the
    project owner's own local checkout) starts being used at step 23a. See
    `docs/web-vs-claude-code.md`'s "Push access" section — whether Claude
    Code sessions can push directly (collapsing most of the file-handoff
    branch below) is **not yet confirmed**. Until it is, a Claude Code
    session should attempt `git push` and fall back to the standard
    file-handoff format on failure, same as any other worker; don't assume
    push will work just because it's a local checkout.
    - A coder worker finishes a step, commits, and **pushes to `main`
      on GitHub** (`https://github.com/naokicodes/inventory-audit-app-3rdYr`)
      — not a zip handed back, not a WIP left un-pushed, unless rule 17
      applies and it's honestly labeled `wip:`.
    - The architect conversation **pulls directly** (`git fetch`/`git
      pull` — GitHub is reachable from the sandbox) rather than asking
      the project owner to upload files. Uploading is the fallback only
      if network access is ever actually broken, not the default.
    - The architect reviews what landed: checks any decisions the
      worker flagged rather than deciding alone (this is the payoff of
      rule 3 and rule 7 — a worker that stops and flags instead of
      guessing is doing exactly what's asked, and the architect's job
      is to actually resolve those flags, not just acknowledge them),
      confirms tests/verification actually happened rather than taking
      a commit message's word for it, and writes any new decisions into
      the docs directly (same standing practice as everywhere else in
      this file).
    - The architect then packages a **fresh, ready-to-unzip repo**
      (`node_modules`/`.db` files stripped, matching `.gitignore`) for
      the *next* worker — not a batch of prompts for steps N, N+1, N+2
      written in advance. Only the immediately-next step's prompt gets
      written, after the pull and review above, using the template
      shape already established in this project's chat history (read
      `docs/rules-for-claude-code.md`, then `session-status.md`; state
      plan before coding; verify live, not just mirrored-logic; update
      `changelog.md` + `session-status.md`; flag rather than assume).
      Pre-generating several steps' worth of prompts risks a later one
      being built on a wrong assumption about what an earlier one
      actually produced — one hop at a time avoids that entirely.
    - **Worker network/git access is currently uneven, not a fixed
      given — and "has network" doesn't always mean "can push."** As of
      2026-08-29: some coder workers have live network + `git` clone
      access but no push credentials configured (read-only — `git
      clone`/`git fetch` work, `git push` fails with a credential
      error); others have no network at all; it's expected to even out
      incrementally as more tasks complete, roughly around the 10-task
      mark per worker, not all at once. Until a given worker can
      actually push, expect and accept the pattern already established:
      mirrored-logic tests (same style as
      `commands.test.js`/`stockReceipts.test.js`) plus, when a live
      server is possible, real HTTP verification against it — honestly
      labeled either way, never a claim that verification happened when
      it didn't.
    - **When push isn't possible for any reason, the deliverable is
      always the same standard handoff — individual changed/new files,
      a list of their repo-relative locations, and the exact `git add`
      / `git commit` commands (with real commit messages already
      written) for the project owner to run themselves.** Not a git
      bundle, not a patch file, not any other git mechanism, even
      though those are technically valid — consistency in what the
      project owner has to actually do with the output matters more
      than technical elegance, and this is the format every architect
      hand-off in this project has used. A worker that discovers push
      won't work should stop trying alternate git tooling and produce
      this instead — that applies whether the worker has read-only
      network access or none at all. Don't build a zip-packaging system
      or any other alternative unless the project owner explicitly asks
      for it in that session; just hand back whatever files exist in
      the standard format and flag the gap plainly.
    - **Never paste `git` commands (or any shell commands) into the
      content of a file being handed off — always run them in a
      terminal, separately from the file's own text.** This actually
      happened once (2026-08-29): a copy-pasteable command block meant
      to be run in a terminal got pasted into `session-status.md`'s own
      content instead, then committed as part of the doc, corrupting
      its first several lines until a later worker caught it. When
      applying a file+commands hand-off, the file content and the
      commands are two separate things — never combine them.
    - When a worker *does* have both network and push access,
      it should push directly and skip all of the above, per the rest
      of this rule.
    - This flow is itself provisional, same spirit as rule 17 — revisit
      if it causes friction, but it's the default until it does.

19. **Re-run the full test suite after code changes, not after
    doc-only edits.** Added 2026-08-29, after a session burned a full
    11-file suite run purely because `changelog.md`/`session-status.md`
    changed — markdown can't break a JS test, so that run had zero
    chance of catching anything. This isn't permission to skip
    verification — the baseline-before-starting run and the
    after-code-change run have both caught real problems in this
    project (the step-15/16 cross-test interaction bug was found
    exactly this way) and stay mandatory. The cut is narrower than it
    sounds: if the only thing that changed since the last full-suite
    run is `.md` files, don't re-run it again just for that.

20. **Commit messages: short subject line + 2-4 tight paragraphs,
    max. Never a changelog copy-paste.** Added 2026-08-29 after a
    session wrote 37-61 line commit messages that fully duplicated
    verification detail already going into `changelog.md`, then burned
    several more turns rewriting them once the mismatch with this
    repo's own actual convention got flagged (check `git log` yourself
    — real commits here are short and skimmable). The rule going
    forward: one line summarizing what changed, then a few short
    paragraphs on *why* if it's not obvious — never a bullet-by-bullet
    restatement of every test that passed or every file that changed.
    That detail belongs in `changelog.md`, once, not duplicated into
    git history too. This applies to the architect conversation's own
    commits as much as any coder worker's — if you're an architect
    session reading this, your own commit messages so far in this
    project's history have NOT consistently followed this rule; that's
    the bad precedent this entry exists to correct, not just a coder
    instruction.
    - **When handing the project owner copy-pasteable terminal
      commands with multiple `-m` flags, put them all on one line,
      each `-m "..."` repeated directly — never a backslash
    - **Never chain terminal commands with `&&` — hand them over as
      separate lines, one command per line.** Confirmed 2026-09-01 in the
      project owner's actual terminal: `&&` is not a valid statement
      separator in Windows PowerShell 5.1, so a chained `git add ... &&
      git commit ... && git push` fails outright. Same lesson as the
      backslash bullet above, and the same fix: hand over exactly what
      can be pasted and run as-is, rather than the shell syntax that
      happens to be idiomatic elsewhere.

## Rule 21 — Stop any server you start

Several rules above ask for live verification against a real booted
server, and that has caught real bugs repeatedly — keep doing it. But
**stop the process before you finish your session.** A left-running
server holds port 3000, so the project owner's next `npm run dev` fails
with `EADDRINUSE: address already in use :::3000` — which looks like an
app bug and isn't one.

This is not hypothetical: it happened on 2026-08-31, after six sessions
in a row each booted a server for its live check. Every one correctly
cleaned up its test *rows*; none stopped its *process*. The stale server
kept serving `localhost:3000` from whatever commit was checked out when
it started, several commits behind by then — so it looked like the app
was working while actually serving old code.

Concretely, before ending a session:
- Kill any server you started (`Ctrl-C`, or kill the background PID).
- Clean up test rows and any throwaway `.db` file you created, as
  before — this rule is in addition to that, not a replacement.

If the project owner reports `EADDRINUSE`, the fix is theirs to run, not
a code change:
`Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object OwningProcess`
then `Stop-Process -Id <pid> -Force` (PowerShell), or
`netstat -ano | findstr :3000` then `taskkill /PID <pid> /F`.

## Rule 22 — Context economy: clear at STEP boundaries, cite sections, query the graph

Added 2026-09-01, from a measured regression: worker sessions that had
been costing 10k–25k tokens jumped to ~80k. Nothing about the work got
harder — the dispatch practice changed. Two compounding causes, both
fixable, and both were the architect conversation's doing rather than any
worker's.

**Cause 1: `/clear` between sub-steps of the same step.** Clearing before
23c-ii-a was correct and had specific reasons: that session's context was
unrelated Dashboard work, and rule 21 had landed *after* it started, so it
had never read the current rules file. Those reasons were then not
re-checked, and the instruction was repeated mechanically for 23c-ii-b and
23c-ii-c — where it was wrong. 23c-ii-b is the direct sibling of 23c-ii-a:
same pattern, same page family, and its own prompt told it to go read
23c-ii-a's diff — i.e. to re-acquire, cold and linearly, exactly the
context that had just been discarded.

**The policy: `/clear` at step boundaries, not sub-step boundaries.**
Clear when moving to a genuinely different step (23 → 24), when the next
piece touches unrelated files, or when a rule changed under the running
session. Not by default, and never just because a piece finished.

The counter-argument is real and worth stating: a carried context makes a
mid-step usage cutoff likelier, which is what rules 16 and 17 exist for. At
a 3–5x cost difference that trade is still clearly worth taking — but it
makes "commit incrementally as pieces land" load-bearing rather than
advisory. Keep that line in every prompt.

**Cause 2: prompts that instruct a linear read of the biggest files.**
Every worker prompt opened with "read `docs/rules-for-claude-code.md`, then
`docs/session-status.md`" — a cold linear read of a ~2,600-line file plus
this one, on every dispatch. That instruction is more specific and more
imperative than `CLAUDE.md`'s standing graphify guidance, so it wins, and
graphify goes unused. **Cite the section, not the file**: "read the
'23c-ii split into four sub-steps' section," "note rules 16, 21, 22." A
step's spec still gets read in full — rule 16 requires the step text BE the
task — but that is one section, not the whole document.

**Structural fix, done 2026-09-01: `session-status.md` was split.** It is
now ~320 lines (current state, known open items, the next step's design,
stable decisions, the checklist); the resolved tail moved to
`docs/session-history.md`. **Finished work gets archived, never moved
back** — if `session-status.md` creeps past a few hundred lines again, that
is the signal to archive, not to keep appending. When archiving, lift any
still-pending item out of the sections being moved *first*; two were nearly
buried in this split and had to be rescued deliberately.

**Also tell workers to use graphify for the code half.** It has been
installed and committed since 2026-08-31 and no worker prompt has ever
mentioned it. Codebase navigation questions — who consumes this route,
where is this defined, what breaks if this changes — should go through
`graphify query "..."` / `graphify path` / `graphify explain` rather than
grep or whole-file reads. `graphify update .` after changing code.

**Do NOT switch graphify to `--strict`.** It blocks a raw file read and
redirects to a graph query. The graph indexes code structure; this
project's source of truth for *what to build* is prose spec in
`session-status.md`. Strict mode would block the one read a worker must do
linearly and push it toward a subgraph that cannot represent "the architect
chose a LEFT JOIN, here is why." That is not a saving, it is a worker
building from a partial spec. Soft-nudge stays until the graph is proven
reliable for this repo, per `web-vs-claude-code.md`'s original note.

**Not on the list of things to trim**: the full-suite runs and the live
server check. Those are what catch real problems, repeatedly, and they are
not where the tokens go.

## Red flags — stop and ask if you notice yourself about to do these
- Adding authentication/user roles beyond a single local user.
- Suggesting a hosted database or cloud deployment.
- Building features not listed in `scope.md`.
- Writing a calculation as a hardcoded number "for now."
- Silently changing the sign convention, units, or table names from
  `data-model.md`.
- Expanding the daily entry screens with anything beyond what
  `daily-workflow.md` describes.
- Matching a commissary meat to a restaurant meat by code string instead
  of via `commissary_meat_map`.
- A hard `DELETE` on `stock_receipts` or `commissary_yield_log` instead of
  a soft delete + activity log entry.
