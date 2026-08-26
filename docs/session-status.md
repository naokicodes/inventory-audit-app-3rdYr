# Session Status — read this first after token reset

Last updated: 2026-08-25. This is the authoritative "where we left off" doc.
Read this before re-deriving anything from chat history.

## What's DONE, tested, and pushed to GitHub
- All rules docs (`data-model.md`, `scope.md`, `daily-workflow.md`,
  `loyverse-sync.md`, `tech-stack.md`, `rules-for-claude-code.md`,
  `changelog.md`)
- App skeleton — Express + Node's built-in `node:sqlite`
- Full database schema (15 tables), auto-creates on startup
- Real seed data from the xlsx: 11 meats, 39 dishes, 23 recipe rows
- **Audit engine** (`server/engines/auditEngine.js`) — beginning stock,
  usage, expected ending, variance, known-loss vs unexplained variance.
  7/7 tests passing against hand-calculated real numbers.
- A working "Daily Audit" grid (meat-only version) — **this is about to be
  superseded, see below, don't build further on top of it as-is**

## CORRECTED UNDERSTANDING — read carefully, this changes the UI plan
The person corrected a misunderstanding from earlier in the session:

**"Landing" is not meats-only, and Prep is not a separate tab.** The real
workflow (confirmed via a photo of the actual paper/sheet system, "Silingan
Landing Inventory") is: **one unified grid, mixing BOTH raw meats AND
prepared dishes as rows**, using the same audit cycle for both:

```
NAME/ITEMS | BEG | NEW | POS | INHOUSE | OVER/SHORT | REMARKS | END STOCK
```

Real example rows from the photo: raw meats (MISCUT, WHOLE CHICKEN, PATA)
sit in the SAME table as prepared dishes (SISIG, BURATTA, MEATBALL PASTA,
PORK BAGNET) — because both get physically counted and audited the same
way. This matches what was already correct in `data-model.md`'s portion-
tracking formulas (structurally identical to the meat formulas) — the
mistake was planning to split them into separate UI tabs. **They are one
page, mixed rows.**

Vocabulary correction: **"Over/Short" is the real term for what
docs call "variance"** — use this label in the UI, keep "variance" as the
internal/technical term in code and docs.

## Recipe usage rule — confirmed important, already partly built
The `Recipe_BOM` distinguishes DIRECT usage (meat consumed per sale) vs
BATCH_PREPPED usage (meat consumed per prep batch, not per sale) — this
already exists in the schema (`dishes.prep_type`) and the audit engine
already uses it correctly (see `getUsage()` in `auditEngine.js`).

**Validation rule to add (not yet implemented anywhere)**: for
BATCH_PREPPED dishes, **sold quantity (POS) should never exceed available
prepped portions** (beginning portions + portions prepped that day) — you
can't sell more Sisig than you cooked. This is a real data-integrity rule.
Should be surfaced as a WARNING (likely via the command panel, see below)
rather than a hard block — the auditor is often entering this after the
fact and needs to be able to flag/explain the discrepancy, not be
prevented from recording it.

## Finalized architecture — 2 tabs + 1 cross-cutting feature

**1. Landing tab** (renamed from "Daily Audit", needs rebuilding to mix
meats + prepared dishes as rows, not meats-only):
- Columns: BEG, NEW, POS, IN-HOUSE, OVER/SHORT, REMARKS, END STOCK
- One day at a time (matches physical counting workflow)
- Meats pull from `new_stock`/`ending_actual`
- Prepared dishes pull from `prepped`/`portion_ending_actual`
- Both computed through the SAME audit engine pattern (already built for
  meats in `auditEngine.js` — needs a parallel/shared version for portions,
  likely most of the logic can be shared/generalized rather than duplicated)

**2. Sales tab** (not yet built) — monthly grid like the xlsx: rows =
dishes, columns = Day 1 through last day of month. Editable, with a
confirmation prompt on manual override (Loyverse sometimes misses receipts
when the cashier app closes suddenly — this is the real-world reason
manual override needs to exist). Should enforce/warn on the BATCH_PREPPED
over-sold validation rule above.

**3. Command panel** (not yet built, cross-cutting, build FIRST since
everything else logs to it) — one new table, `activity_log`: timestamp,
who, what it's about (meat/dish/day/general), message, and whether it's
system-generated or auditor-typed. Reusable panel component appears on any
tab, shows relevant entries for current context, plus a free-text box so
the auditor can leave notes anytime, not just during corrections. This
becomes the audit trail for the WHOLE app, and is also where the
BATCH_PREPPED over-sold warning above would surface.

## Also still queued (diagnosed, not yet fixed)
- **Opening stock bug**: confirmed root cause via real reproduction — when
  a meat/dish has never been tracked before, `beginning` is null forever
  (no prior day, no opening_stock row), which cascades to
  ending_calculated/variance staying null no matter how much you
  save/reload. Fix: make the Beginning cell editable ONLY on a row's
  first-ever appearance; on save, write it once to `opening_stock` (or the
  portion equivalent).
- **Live recalculation**: currently Ending(calc)/Over-Short only update
  after a full save+reload round trip. Should recalculate live in the
  browser as the auditor types, matching spreadsheet-like expectations.

## Confirmed tab layout (final, for now)
**Home, Landing, Sales** — three tabs total. No separate Direct/Batch tabs
(Landing already mixes both as rows, per the correction above).

## Command panel — confirmed dual purpose (log/notes AND quick actions)
The command panel isn't just an audit trail feed — it's also where **typed
bulk actions/shortcuts** live, rather than scattering buttons across the
UI. First concrete command to build:

**"Sync batch stock" (exact command text/phrasing still TBD)** — addresses
a real gap between ideal workflow and actual kitchen practice: batch-prepped
dishes are SUPPOSED to be prepped ahead in tracked batches, but right now
the kitchen mostly cooks to order, so Prepped effectively equals Sold most
days. Rather than making the auditor retype the same number twice, this
command:
1. Finds every BATCH_PREPPED dish for the restaurant/date in view
2. For each: if a `prepped` entry ALREADY exists for that day, skip it
   (never overwrite a manually-entered value)
3. If no `prepped` entry exists yet, copy that dish's `sales` quantity into
   `prepped` for that day automatically
4. Logs the action to `activity_log` (system-generated entry) so it's
   visible in the audit trail that this happened automatically, not
   manually entered

This should run as an explicit, deliberate action (typed command or a
clearly-labeled button), never automatically/silently — the auditor
should always know when data was auto-filled vs. manually entered.

## Order for next session
1. `activity_log` table + reusable command panel component, including the
   "sync batch stock" command described above
2. Generalize the audit engine (or add a parallel version) to handle
   portion-tracking the same way it handles meats, since Landing needs both
3. Rebuild Landing tab as ONE mixed grid (meats + prepared dishes), with
   the opening-stock fix and live recalc built in from the start (not
   patched on after)
4. Sales tab (monthly grid), including the BATCH_PREPPED over-sold
   validation warning

## Things NOT to re-litigate (already decided, stable)
- Tech stack: Node.js + Express + `node:sqlite` (not better-sqlite3, not
  Postgres) — see `changelog.md` for why
- Single local machine, one SQLite file, no hosting/multi-user — see
  `scope.md`
- Docs-first workflow: update the relevant `docs/*.md` file whenever a
  real decision changes, before or alongside the code
- Testing approach: build and test in the sandbox environment first (real
  API calls, real database, hand-verified numbers) before handing files
  over, since that catches bugs without costing the person conversation
  turns
