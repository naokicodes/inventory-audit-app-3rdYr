# Dispatch queue — what to work on next

The ordered list of what's next. This replaces the local-only handoff
file, which lived on one machine and could not travel to a collaborator's
clone.

**Only an architect adds to this queue.** If it is empty, stop and wait.
See `docs/engineer-role.md`.

**`Touches:` lines.** A runnable step lists the files it will change, so
`/start` and the queue runner can skip it while an open PR touches the same
files. The architect adds the line when a step becomes runnable.

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

### 2. Step 26a — CLOSED 2026-09-23, PR #7 (`c8fb7e0`).

### 2b. Step 26a-ii — CLOSED 2026-09-24, PR #8 (`769a110`).

### 2c. Step 26a-iii — CLOSED 2026-09-25, PR #9 (`de82714`).

### 2d. Step ui-viewport — CLOSED 2026-09-25, PR #10 (`4d92634`).

### 3a. Step daily-audit-mobile — CLOSED 2026-09-28, PR #14 (`c3c9575`).

### 3b. Step reseed-beta-db — CLOSED 2026-09-28, PR #15 (`9786dad`).

### 3c. Step 24d-i — CLOSED 2026-09-28, PR #20 (`17cad2c`).

### 3d. Step nav-mobile — CLOSED 2026-09-28, PR #17 (`39dfcc6`).

### 3e. Step 24d-ii — CLOSED 2026-09-28, PR #21 (`546386d`).

### 3f. Step 24d-iii - richer yield: miscut on the commissary UI (Path 1)  [runnable]
Touches: public/commissary.html, public/style.css
Adds a miscut_weight field to the yield form + a miscut column in the log table (Path 1: no
output-count). Wide table scrolls below 768px. Depends on 24d-ii. PUBLIC -> click-through before
merge. Full spec: session-status.md -> "Step 24d-iii".

### 3g. Step archive-pass-2 — CLOSED 2026-09-28, PR #18 (`971bf9c`).

### 3h. Step users-roles - identity foundation: users + roles tables + role seed  [runnable]
**#19 resolved (2026-09-28):** seed one super-admin USER in seed.js so the users table has a write path (spec updated).
Touches: server/db/schema.sql, server/db/seed.js
First multi-user slice: the two tables + the 5-role seed with capability flags (decision C).
No membership/login/authorship yet. Server-only, no click-through, no migration. Overlaps
24d-i on schema.sql -> not both in flight; sequence them. Full spec: session-status.md ->
"Step users-roles".

### 3i. Step user-sites - membership table + site resolver  [blocked: users-roles]
Touches: server/db/schema.sql, server/db/siteAccess.js
Membership model B (site_code text) + a resolver (getUserSiteCodes / userHasSite /
resolveSiteCode). Data layer only, NO enforcement yet. Depends on users-roles (users table);
overlaps schema.sql with 24d-i + users-roles -> sequence. Server-only, no click-through. Full
spec: session-status.md -> "Step user-sites".

### 3j. Step import-identity - import-settings.js identity slice (Roles/Users/memberships)  [blocked: user-sites]
Touches: scripts/import-settings.js, package.json
Standalone importer (decision A), identity tabs only, UPSERT/idempotent, uses siteAccess.js to
validate memberships. Depends on users-roles + user-sites. DECIDED 2026-09-28: reader = B (CSV, zero-dep) behind a loadTab() adapter; PLUS an export mode (dump the DB to the template shape) so it round-trips export->edit->import. Server/scripts only, no
click-through. Full spec: session-status.md -> "Step import-identity".

### 3k. Step stub-login - pick-your-name login + currentUser middleware  [blocked: users-roles]
Touches: public/login.html, server/routes/auth.js, server/index.js
Phase-1 identity, no passwords: pick-your-name -> cookie -> req.user with capability flags. No
enforcement yet. LEAN: plain cookie, no new dep (flag). Needs users present (import-identity or a
dev seed). PUBLIC -> click-through. Full spec: session-status.md -> "Step stub-login".

### 3l. Step user-id-authorship - new writes carry user_id  [blocked: stub-login]
Touches: server/db/schema.sql, server/db/migrate.js, server/db/connection.js, write routes
Add created_by_user_id (FK users) to the ~10 created_by tables; stamp it from req.user on new
writes; legacy created_by retired at wipe, no backfill. Invasive (many routes), one pass. Big
migration -> sequences with other schema/migration steps. Full spec: session-status.md ->
"Step user-id-authorship".

### 3m. Step site-filter - query-layer site scoping enforcement  [blocked: stub-login, user-sites]
Touches: server/middleware/requireSiteAccess.js, site-scoped routes, server/index.js
requireSiteAccess middleware: checker scoped to memberships (siteAccess.js), management/admin/
super-admin bypass; one middleware, never a per-query WHERE. Enumerate scoped routes; park
ambiguous ones. Full spec: session-status.md -> "Step site-filter".

### 3n. Step autopilot-runner - runner lock, run log, pause switch, review drafts  [runnable]
Touches: scripts/run-queue.ps1, .claude/commands/review-draft.md (new)
First of the AUTOPILOT family (settled 2026-10-04; inert until the server install in
docs/autopilot-guide.md - the interactive /start flow is unchanged). Makes the unattended
runner safe to schedule. Scripts + a command file only, no app code, no click-through.
Full spec: session-status.md -> "Step autopilot-runner".

### 3o. Step architect-docs-pickup - apply architect doc edits filed as an issue  [runnable]
Touches: .claude/commands/run-step.md
The runner's first job each run: an open `architect-docs` issue by naokicodes becomes a docs
PR, applied verbatim, all-or-nothing, docs/ only. Independent of 3n (no shared file). Full
spec: session-status.md -> "Step architect-docs-pickup".

### 3p. Step autopilot-doorbell - start a run from the phone  [blocked: autopilot-runner]
Touches: scripts/doorbell.ps1 (new)
A 15-minute poll: a `run-now` label or a new `architect-docs` issue (naokicodes only) starts a
1-step run. Calls no Claude itself. Needs 3n's lock, -Trigger and pause switch. Full spec:
session-status.md -> "Step autopilot-doorbell".

### 3q. Step autopilot-preview - serve a PR on port 3100 for phone click-throughs  [blocked: autopilot-doorbell]
Touches: scripts/preview.ps1 (new), scripts/doorbell.ps1
A `preview` label on a PR serves that PR's code from a separate worktree on port 3100 with a
reseeded throwaway DB, reachable over Tailscale. Never port 3000, never the live DB. Full
spec: session-status.md -> "Step autopilot-preview".

### 3r. Step loyverse-preview-i - Loyverse sales preview: engine + route, writes nothing  [runnable]
Touches: server/engines/loyversePreview.js, server/engines/loyversePreview.test.js, server/routes/loyverse.js, server/routes/loyverse.test.js, server/index.js, .env.example
Read-only dry run of the Loyverse port (decided 2026-10-03, 1b + 2a): both accounts, one business
date, per-dish Silingan / Likod / total + unmatched. Writes nothing, no migration. Tokens via .env
(gitignored, loaded by server/index.js). Server-only, no click-through. Parallel-safe with
users-roles, 24d-iii and autopilot 3n-3q. Full spec: session-status.md -> "Step loyverse-preview-i".

### 3s. Step loyverse-preview-ii - Kitchen Sales page (temporary)  [blocked: loyverse-preview-i]
Touches: public/kitchen-sales.html, public/index.html, public/style.css
Dish | Likod | Silingan | Total, an unmatched list, Copy as text with a LAN-safe fallback; a
failed account shows "-", never 0. Linked from Home only. Overlaps 24d-iii on style.css ->
sequence. PUBLIC -> click-through before merge. Full spec: session-status.md -> "Step
loyverse-preview-ii".

### 3t. Step loyverse-preview-iii - wildcard-match report (terminal, you-only)  [blocked: loyverse-preview-i]
Touches: server/engines/loyverseReport.js, server/engines/loyverseReport.test.js, scripts/loyverse-matches.js, package.json
`npm run loyverse:matches -- --date YYYY-MM-DD`: lists every wildcard pattern's catches (raw
Loyverse names + quantities), unmatched items and account status, by calling the SAME engine as
the route. Writes nothing. Not in the UI. Parallel-safe with loyverse-preview-ii. Full spec:
session-status.md -> "Step loyverse-preview-iii".

### 3. Step 25a — commissary stock receipts (supplier intake)
**REVISED — quantity-only; the intake weigh-in is CANCELLED. Needs the rewritten quantity-only prompt before dispatch.**

**Note 2026-09-24:** the architecture draft cancels the intake weigh-in
(`weight_kg`) — 25a shrinks to quantity-only receipts. Do not build from the
spec below until it is rewritten.

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
**RESOLVED 2026-09-28 (#16 -> Path 1): STANDS and is BUILT by Step 24d-i** (24d-i codes the kg-output guard this step specified). Not superseded - kept and enforced. Close when 24d-i lands.

**Lane: DISPATCH only. Needs an architect-written prompt.**

A live data-corruption guard. It changes what the code rejects, which is
red by default. Must land before soft-launch.

Spec: `session-status.md`, section "Step 24b-v".

### 5. Step 25d-i and 25d-iii — record who did the count
**RETIRED 2026-09-28 — do not dispatch; superseded by the forward-clean users table.**
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
**Lane: DISPATCH only. Queued AFTER soft launch, deliberately. Not startable before then.**

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

### 7. No invented steps.
**Updated 2026-10-03.** The "nothing after 24b-v" stop is retired: 24b-v landed (built by
24d-i), and the architect now slices the designed families (identity chain, Loyverse preview and
port, sheets, sides, PO, staging) into this queue. The rule underneath stands: only an architect
adds a step, and an idle assistant costs far less than an invented one.

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

## Planned — commissary staging + restaurant conversion (architect-defined 2026-09-28, corrected, NOT yet sliced)

Three stages (the kg<->units RATIO conversion is the RESTAURANT's, not the commi's - #16-class
correction). See session-status "Things NOT to re-litigate -> Commissary staging + restaurant
conversion model". Family:
- **Commi staging/packing** (Stage 2): commi meat -> ready-to-ship restaurant meat via
  commissary_meat_map (a MAP, no ratio); staged at the commi; released by a shipment (staged ->
  released). Restaurant-meat balance spans commi-staged vs on-hand. Delivered in kg or a reported
  piece count. No transit shrinkage; transit loss = allocation.
- **Restaurant conversion** (Stage 3, OPTIONAL): received meat -> portions/quarters/skewers/sahog
  vs a ratio standard; variance -> shrinkage. Extends existing allocations/conversion +
  commissary_conversion_standards (multiple standards per conversion + costing-default + per-log
  override). Optional - most goods received proper; conversion is the on-the-spot exception.
Commi yield (Stage 1) is built (24d-i). Leans on commissary_meat_map + allocation machinery already in schema.

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
- **MySQL migration.** Not planned: hybrid A (2026-10-03) keeps inventory on
  SQLite and SPOS on MySQL, connected by API. **SPOS integration** comes after
  the Loyverse + inventory web app is finished.
