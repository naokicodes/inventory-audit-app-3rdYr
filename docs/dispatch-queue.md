# Dispatch queue — what to work on next

The ordered list of what's next. This replaces the local-only handoff
file, which lived on one machine and could not travel to a collaborator's
clone.

**Only an architect adds to this queue.** If it is empty, stop and wait.
See `docs/engineer-role.md`.

`docs/session-status.md` remains the authoritative description of each
step. This file says *what order* and *which lane* — not what the work
is. Read the step's own section in `session-status.md` before starting.

---

## Queue

### 0. Step archive-pass — CLOSED 2026-09-03, PR #2.

### 1. Step 25d-ii — `prepped.created_by` is provenance, not identity
**Lane: DISPATCH only. Small, real code, tiny blast radius.**
**Re-dispatch. Attempt one was closed unmerged — read the whole spec.**

Makes `POST /api/daily-audit/portions` skip rows whose `portions_produced`
is unchanged; and on rows that did change, clears the
`SYSTEM:sync-batch-stock` stamp and logs the correction to `activity_log`.
No schema change, no `public/` change.

The change detection is not an optimisation and is not optional. The page
that calls this route posts every dish row on every save, so without it
the stamp-clearing lands on rows nobody edited. That is what attempt one
(`marble/25d-ii-prepped-provenance`, `c9f082a`) did — correctly
implementing a spec that was wrong. The spec is now fixed; the code was
never the problem.

Sequenced first deliberately: it is the smallest step that exercises the
full loop on real code — Class A decisions, tests, the write-path audit —
where a mistake costs a revert rather than a corrupted migration. The
first dispatch (archive-pass) was doc-only; this is the code equivalent.

Spec: `session-status.md`, section "25d-ii" — including the "Third half,
added 2026-09-04" subsection, which is the part attempt one predates.

### 2. Step 26a — beginning stock: date-scoped openings and an honest fallback
**Lane: DISPATCH only. Schema rebuild — the most invasive step in the queue.**

**Must not run concurrently with 25d-ii.** Both edit
`server/routes/dailyAudit.js`, and this one carries a migration; resolving a
migration inside a conflicted file is how an old constraint silently
survives. Merge 25d-ii, pull, then start this.

Do it before test data is entered — it is a table rebuild and the data is
disposable today.

Spec: `session-status.md`, section "Step 26a".

### 3. Step 25a — commissary stock receipts (supplier intake)
**Lane: DISPATCH only. Needs an architect-written prompt.**

Not startable on engineer initiative. It adds a weight column alongside
`quantity` via a schema migration, which is red by default. The design is
already settled in `session-status.md` — what's missing is the prompt,
not the decision.

Spec: `session-status.md`, section "Steps 25a / 25b — the commissary
ledger has no way in".

### 4. Step 24b-v — the effective yield output must be kg-tracked
**Lane: DISPATCH only. Needs an architect-written prompt.**

A live data-corruption guard. It changes what the code rejects, which is
red by default. Must land before soft-launch.

Spec: `session-status.md`, section "Step 24b-v".

### 5. Step 25d-i and 25d-iii — record who did the count
**Lane: DISPATCH only. Needs no schema change; the columns exist.**

Adds a per-sheet auditor name to both audit pages and writes it to
`ending_actual.created_by` and `portion_ending_actual.created_by`. It is
operator-visible and it makes a blank submission a 400, so it is not
engineer-lane.

Sequenced before soft-launch deliberately: attribution is the one deferred
item that cannot be backfilled later.

Spec: `session-status.md`, section "Step 25d".

### 6. Step 25e — restaurant-to-restaurant transfers must credit the receiver
**Lane: DISPATCH only. Queued AFTER soft launch, deliberately.**

A transfer writes one row today: it subtracts from the sender and credits the
receiver nothing. The fix writes a `stock_receipts` row at the destination,
which needs a third `source` value — and since SQLite cannot widen a CHECK
constraint, that means a full table rebuild in an idempotent migration.

Not before soft launch: `locations` is empty, so the transfer type cannot be
used and nothing wrong can be recorded today. Spending the project's most
invasive migration on a feature with no usage evidence is the wrong order.

One cheap guard IS needed before any site-level locations are created: reject a
transfer whose from- and to-location resolve to the same restaurant. Fold it
into whichever step next touches `allocations.js`.

Spec: `session-status.md`, section "Step 25e".

### 7. Nothing.
**This is deliberate. Do not invent a step 25.**

After 24b-v the plan is a soft launch against real output, so that actual
use decides what gets built next rather than guesswork. This is the same
reasoning that deferred the per-meat next-stage config. An idle assistant
costs far less than an invented step.

---

## Available engineer-lane work

These need no dispatched prompt and can be picked up on initiative. They
are genuinely useful and genuinely safe.

- **Browser click-through of Stock Receipts' Unallocated/Assign flow.**
  Owed and never done. Commissary's own Edit/Delete was click-tested
  during 24c-ii; this flow wasn't. No code change expected — open it,
  click through it, and report what you see. If you find a bug, open an
  issue rather than fixing it, since anything touching those filters is
  red.
- **Test coverage for behaviour that already exists and is correct.**
  Green by definition. Do not change the code to make a test pass — if
  the code seems wrong, that's an issue, not a fix.
- **Doc typos, dead links, stale file paths.** Green.

---

## Not in the queue, and not a task

- **The meat-type tagging pass on the LIVE database.** Live commissary
  meats have `meat_type_id` NULL, which is why every Allocate dropdown is
  empty. Step 25c fixes this for a freshly seeded DB, but it does not
  retro-tag existing rows and deliberately must not. Tagging an existing
  live DB is on-site data entry through the existing Settings UI, not a
  build task, and not a bug. Do not "fix" it in code.
- **Restaurant C (Likod) onboarding.** No workbook exists yet. Blocked on
  real-world data, not on code.
- **MySQL migration / POS integration.** Parked. Real work, not a config
  flip.
