# Dispatch queue — what to work on next

The ordered list of what's next. This replaces the local-only handoff
file, which lived on one machine and could not travel to a collaborator's
clone.

**Only an architect adds to this queue.** If it is empty, stop and wait.
See `docs/engineer-role.md`.

`docs/session-status.md` remains the authoritative description of each
step. This file says *what order* and *which lane* — not what the work
is. Read the step's own section in `session-status.md` before starting.

> **2026-09-15 — read alongside the pivot.** The app is moving to multi-user
> with roles. The decisions are recorded in `session-status.md` -> "Things NOT
> to re-litigate" (2026-09-15 block); fuller reasoning is in the architect-held
> `ARCHITECTURE-HANDOFF-2026-09-15.md` (local / gitignored — ask the architect).
> The steps below are the still-valid CORRECTNESS backbone and mostly stand, but
> **two now carry a reconciliation flag** (25a and 25d-i/iii), and the new
> multi-user surface is listed under "Planned" at the bottom as **NOT yet
> specified.** The launch model is now a phased beta (P0 open -> P1
> identity+roles -> P2 passwords) and the definition-of-done is still owed, so
> the "before soft-launch" tags below are under revision.

---

## Queue

### 0. Step archive-pass — CLOSED 2026-09-03, PR #2.

### 1. Step 25d-ii — CLOSED 2026-09-22, PR #5 (`6c21238`).

### 2. Step 26a — beginning stock: date-scoped openings and an honest fallback
**Lane: DISPATCH only. Schema rebuild — the most invasive step in the queue.**

**Spec revised 2026-09-23, answering issue #6.** Both gaps are closed. Re-read
the whole section; it changed shape (no new status string, a covered-window rule
for adjustments, the recount difference). The month-start recount workflow is
split out to 26a-ii and is **not** part of this step.

25d-ii is merged (`6c21238`), so the concurrency constraint is satisfied.

Do it before test data is entered — it is a table rebuild and the data is
disposable today.

Spec: `session-status.md`, section "Step 26a".

### 2b. Step 26a-ii — the month-start recount
**Lane: DISPATCH only. Schema addition + `public/` change.**

**Starts only after 26a is merged.** It builds on 26a's date-keyed opening
tables, beginning-stock walk and PATCH routes, and both touch
`server/routes/dailyAudit.js` and `server/routes/commissary.js`. Merge 26a, pull,
then start this.

Must land before real entry starts — it is what bounds 26a's carry chain.

Spec: `session-status.md`, section "Step 26a-ii".

### 3. Step 25a — commissary stock receipts (supplier intake)
**Lane: DISPATCH only. Needs an architect-written prompt.**

Not startable on engineer initiative. It adds a weight column alongside
`quantity` via a schema migration, which is red by default. The design is
already settled in `session-status.md` — what's missing is the prompt,
not the decision.

Spec: `session-status.md`, section "Steps 25a / 25b — the commissary
ledger has no way in".

**RECONCILE before the prompt is written (2026-09-15).** Endorsement-as-receipt
makes "confirm an arrival = write a receipt." Before 25a's prompt is authored,
the architect must settle whether commissary supplier-intake and the
endorsement / PO-arrival receipt share ONE receipt shape or stay distinct. This
is a domain reconciliation, still open — not the engineer's call.

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

**HOLD / RECONCILE (2026-09-15).** This stamps a free-text human name with
`Unknown` as the convention. That free-text identity is SUPERSEDED by the thin
`users` table (identity-now-passwords-later). Do NOT dispatch it as free-text;
it waits for, or folds into, the users-table step, which is not yet written.
(25d-ii — provenance, SYSTEM/NULL — is unaffected and proceeds.)

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

## Planned — multi-user surface (architect-defined, NOT yet specified)

Decided in scoping (2026-09-15), listed so they are visible — but **none is
dispatchable yet.** Each is gated on still-open items (the recycled auth repo,
the custom POS repo, the written definition-of-done) and must be written into
`session-status.md` one at a time before dispatch. Do NOT start any on engineer
initiative — that is still "inventing a step."

- Thin `users` table + configurable roles/permissions (anchors identity,
  logging, station scoping; supersedes 25d-i/iii free-text identity)
- Endorsement-as-receipt (reconcile with 25a first)
- Side inventory (simple counting, separate from the meat engine)
- Sahog / no-standard-consumption residual (day-close valuation)
- Running-low par-level config
- Finalization flag (mark-and-warn, per site/date sheet)
- Optimistic-concurrency column + `busy_timeout` + hot-query indexes
- Snapshot-then-sync backups
- Source-agnostic sales ingestion (Loyverse-first) + CSV export

Decisions: `session-status.md` -> "Things NOT to re-litigate" (2026-09-15).

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
