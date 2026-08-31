# Session Status — read this first after token reset

This file is **what to do next**. It is deliberately kept short: every
worker session reads it cold, so length here is a recurring cost paid on
every single dispatch (`rules-for-claude-code.md` rule 22).

Resolved history lives in `docs/session-history.md` — steps 1–22, the
steps 10–19 scope list, Round 2, item 3's design, and all of step 23.
Dated fix/decision detail lives in `docs/changelog.md`. Don't move
finished work back into this file; archive it.

`HANDOFF.md` was deleted (see `changelog.md`) — it had drifted stale and
was actively misleading. This file is the only "where we left off" doc.
If you are a fresh session with no memory of prior work, also read rules
18, 19 and 22 in `rules-for-claude-code.md` — they describe how work moves
between coder workers and the architect conversation, when to re-run the
suite, and how to keep context costs down.

## Current state — 2026-09-01

**Step 23 is fully closed.** All of 23a, 23b's six items, and 23c
(23c-i, 23c-i-b, 23c-ii-a through 23c-ii-d) are done and pushed. Full
suite: **15 files, 273/273 assertions, 0 failures**, verified
independently by the architect rather than taken from commit messages.

**No step is currently queued.** What comes next is the project owner's
call. The designed-but-unstarted work is step 24 (below); the cheap
contained fixes are in "Known open items."

The most recent landings, newest first — full detail for each is in
`changelog.md`:

| Step | What landed |
|---|---|
| — | Fixed 23c-ii-d follow-on: qualified-branch silent-first-match in `resolveCommissaryMeat` |
| 23c-ii-d | Terminal qualified-token grammar (`com-a/m05`); closed a silent-first-match bug |
| 23c-ii-c | Commissary identity on `GET /api/commissary/meats` (LEFT JOIN) + label fixes on two pages |
| 23c-ii-b | Commissary selector on `commissary-shipments.html` |
| 23c-ii-a | Commissary selector on `commissary.html` |
| 23b-vi-a/b | Grouped stock rollup + inline drill-down; closed a live double-count bug |
| — | Rules 21 (stop your server) and 22 (context economy) |

## Known open items (not the next step's problem, just not forgotten)

- **`dashboard.js`'s INNER JOIN to `commissaries` (found 2026-09-01,
  not yet fixed).** `/dashboard/stock-rollup` (~L103) does `JOIN
  commissaries c ON c.id = cm.commissary_id`. SQLite only enforces FKs
  under `PRAGMA foreign_keys = ON`, so a dangling `commissary_id` would
  make that meat **silently vanish** from the Dashboard — no error, no
  degraded row, just missing stock. Same hazard class as the
  `meat_type_id` null guard 23b-vi-b closed, but caught on the
  commissary side instead, and arguably worse since a missing row is
  harder to notice than a wrong label. 23c-ii-c specifies a LEFT JOIN for
  the route *it* touches; this one is a different route and was left
  alone deliberately rather than bundled, per rule 16. Small enough to
  ride along with the next Dashboard-touching step, or to dispatch on its
  own if none comes up soon.

- **A real click-through in an actual browser is still owed** for Stock
  Receipts' Unallocated/Assign flow specifically — the 2026-08-28 session
  had no browser available (no puppeteer/playwright, and the download
  host for one isn't in the sandbox's network allowlist), so it verified
  via live HTTP payload replay instead (see `changelog.md`). Strong
  verification, but not the same as clicking it. Commissary's own
  Edit/Delete UI flows are in the same boat — never fully click-tested.
- ~~**Live recalculation**~~ — done, step 13 above.
- ~~**Restaurant B/C still aren't seeded**~~ — Restaurant B (FC) done as
  of step 19, 2026-08-29. Restaurant C (Likod) is still unseeded — no
  workbook for it exists yet, unlike FC's real `FC_MasterAudit.xlsx`.
- ~~**`resolveCommissaryMeat`'s qualified branch takes the first of a
  multi-match**~~ — fixed 2026-09-01, see `changelog.md`.

- **A preset-*authoring* admin UI is still deferred, not forgotten.**
  Shipment presets can be created and edited via
  `GET`/`POST`/`PUT /api/commissary/shipment-presets` today, but there is
  no browser form for authoring them — `commissary-shipments.html` only
  *consumes* presets via its "Load preset" control. Deferred out of step
  20c deliberately and re-confirmed as deferred several times since;
  lifted here on 2026-09-01 so it survives the archive split.

## Step 24 — multi-stage yield + Commissary-side allocation (designed, NOT started)


Raised by the project owner working through two real Commissary
scenarios that didn't fit the existing single-input/single-output yield
model. Settled through the same real back-and-forth as item 3's design
— every fork below was an actual question asked and answered:

- **A real, confirmed bug found and must be fixed as a prerequisite,
  not a nice-to-have**: `getCommissaryUsage`
  (`commissaryAuditEngine.js`) only ever sums `commissary_shipments` as
  usage for a commissary meat. It never counts
  `commissary_yield_log.raw_weight_in` as an outflow for whichever
  meat was the *input* to a yield event. Concretely: 20kg raw Jowl
  received, a yield event consumes 15kg of it — the raw item's
  calculated balance stays at 20kg forever, since nothing ever
  subtracts the 15kg that got processed. A real physical count would
  show a permanent, false SHORTAGE variance. This has been silently
  wrong since step 20b; harmless so far only because nothing yet
  depended on a raw/intermediate meat's balance being accurate (every
  existing commissary meat either doesn't get further processed, or
  ships out directly, so the bug never had a chance to matter until
  now). **Fix**: `getCommissaryUsage` also sums `raw_weight_in` for
  every yield event where the meat in question was the input side.
  Applies uniformly to a genuinely raw meat *and* to an intermediate
  stage (below) being consumed by a later stage — same mechanism, no
  special-casing needed.

- **Multi-stage yield chaining, configured per meat, not a new
  mechanism.** Most commissary meats have zero extra stages; some have
  one; a few (Shortplate: sear, then braise) have two. No new schema
  concept — each stage is a completely normal, existing single-input/
  single-output `commissary_yield_log` entry. The only difference:
  stage two's `commissary_meat_id` *input* is stage one's own output
  meat (e.g. "Seared Shortplate," a real catalog row with its own real
  balance — confirmed this needs to be real, not transient: it's
  common to sear a full day's new stock but not finish braising all of
  it the same day, so intermediate stock genuinely sits around and
  needs an accurate count). Depends entirely on the usage-formula fix
  above — without it, a chained intermediate stage's balance would be
  meaningless.

- **The Chicken → Yaki-portions + Miscuts case turned out not to need
  a new "multi-output yield" concept at all** — it decomposes into two
  *already-designed* patterns:
  1. A normal single-stage yield: Raw Chicken → "Processed Chicken,"
     one output, real trackable inventory, same as any other yield
     event (cutting/portioning can legitimately be lossless — 0%
     `allowed_leeway_pct` for these events, no schema change needed;
     confirmed searing/braising *do* have real loss, cutting doesn't
     necessarily).
  2. A **new Commissary-side allocation mechanism** — a parallel table
     to the existing restaurant-scoped `adjustments`, not a shared or
     merged one (keeps Commissary and restaurants structurally
     separate, consistent with item 3's own "option B" decision, not a
     new precedent). Two distinct kinds of entry, confirmed as
     genuinely different, not two names for the same thing: **loss**
     (no trackable destination — pure shrinkage, conceptually the same
     as a yield event's own leeway loss) and **allocation** (a
     trackable destination elsewhere, e.g. redirecting part of
     Processed Chicken's balance to Miscuts-Chicken).
  Shipping stays completely untouched either way — once "Processed
  Chicken" exists as inventory, it ships via the exact same
  Shipments + Conversion Standards mechanism every other commissary
  meat already uses, regardless of which stage or allocation path
  produced it.

- **Miscuts are separate catalog rows per meat** (Miscuts-Chicken,
  Miscuts-Jowl, Miscuts-Belly, etc. — matches the real xlsx's
  intent, which the app had been treating as one shared `M14` row
  without actually tagging them; confirmed this needs fixing, not
  preserving). Tagged via the same meat-type reference table item 3
  already designed, not a new tagging mechanism — lets reporting roll
  up "total Miscuts across everything" while keeping each one tracked
  separately for real operational use (e.g. staff-meal planning per
  meat).

**RESOLVED 2026-08-31 — the remaining open questions above, settled in
the same architecture session as item 3's rekey:**

- **A real, previously-unflagged gap found while checking this against
  actual code**: `commissary-seed-data.json` already has three raw/
  backed pairs seeded as *separate catalog rows* — `M01 Whole
  Chicken`/`M02 Whole Chicken Raw`, `M03 Belly Slab`/`M04 Belly Slab
  Raw`, `M05 JOWL`/`M06 JOWL Raw` — but `commissary_yield_log` has only
  one `commissary_meat_id` column, and no route or engine function ever
  references the "Raw" rows. They're vestigial — seeded for a
  raw-vs-backed split that was never wired up. **Confirmed by the
  project owner (2026-08-31): this was intentional, not accidental —
  "not every meat could be backed up" is a real case, these rows were
  meant to be tracked, the app just never got that far.** This isn't
  scoped to Shortplate/Chicken alone — it's the same fix, retroactively
  covering three existing meats.
- **`commissary_yield_log` gets one new column**: `output_commissary_meat_id`,
  nullable FK → `commissary_meats`, **defaulting to "same as input"
  when NULL** — this is what keeps every existing single-row event
  (e.g. Belly Slab in, Belly Slab out, just lighter from trim loss)
  working completely unchanged. Only an event that genuinely produces a
  *different* catalog row (Raw Shortplate → Seared Shortplate, Raw
  Chicken → Processed Chicken, and now `M02→M01`/`M04→M03`/`M06→M05`)
  sets it explicitly. No separate "is this chained" marker needed — the
  column's presence/absence on a given row already tells you which
  case it is.
- **The existing `commissary_meat_id` column stays as-is and means
  "input"** — no rename. `getCommissaryBackedUp`'s credit target
  changes from always crediting `commissary_meat_id` to crediting
  `output_commissary_meat_id` when set, `commissary_meat_id` otherwise.
- **No stage-count cap in the schema.** Chain length is emergent from
  however many yield-log rows point at each other, not a declared
  number — a real 2-stage case (Shortplate) doesn't need the schema to
  know it's 2 stages, and nothing breaks if a future case needs more.
- **`commissary_adjustments` — new table, parallel to the existing
  restaurant-scoped `adjustments`, not shared/merged** (matches item
  3's "option B" precedent of keeping Commissary structurally
  separate):
  ```
  commissary_adjustments
    id
    commissary_meat_id               -- source being drawn down
    business_date
    kind                              -- 'LOSS' | 'ALLOCATION' — this
                                       -- column's value IS the
                                       -- classifier, no separate flag
    quantity
    destination_commissary_meat_id    -- NULL for LOSS, required for
                                       -- ALLOCATION (e.g. Miscuts-Chicken)
    notes
    created_by / created_at
    deleted_at                        -- soft delete, same pattern as
                                       -- commissary_yield_log
  ```
  `destination_commissary_meat_id` self-references `commissary_meats`
  (both sides are commissary items, never a restaurant's `meats` row).
- **Miscuts stay separate catalog rows** (Miscuts-Chicken,
  Miscuts-Jowl, Miscuts-Belly, ...) **tagged via `meat_types`** — same
  table item 3's schema (23a) introduces, not a new tagging mechanism.
  An allocation's destination dropdown should be restricted to
  `meat_type`-compatible siblings of the source (so Processed Chicken
  can't accidentally allocate into a Jowl-tagged bucket) — a UI/route
  concern for 24c, not a schema constraint.
- **Depends on 23a** (needs `meat_types` to exist for Miscuts tagging) —
  sequenced after it, not before.

**Sub-step plan, confirmed:**
- **24a (usage-formula fix + schema)**: `getCommissaryUsage` also sums
  `raw_weight_in` for every yield event where the meat in question is
  the input side (`commissary_meat_id`) — this part has no schema
  dependency and fixes the standalone bug on its own. Bundled into the
  same step: `output_commissary_meat_id` added to
  `commissary_yield_log`, `commissary_adjustments` created, migration
  wires `M02→M01`/`M04→M03`/`M06→M05` as legitimate explicit-output
  pairs going forward (no historical data to backfill — these rows
  have never been referenced by any real event).
- **24b (engine/routes)**: crediting logic updated to target
  `output_commissary_meat_id`, per-meat "next stage" config so the
  yield form can default the output dropdown, `commissary_adjustments`
  CRUD + balance effects, Miscuts destination filtering via
  `meat_type_id`.
- **24c (UI)**: output-item field on the yield-entry form (defaults to
  same meat when no next-stage is configured), an Allocate/Write-off
  action on the commissary balance view.

**Next up, after 23a/23b/23c: 24a.** None of the three sub-steps are
started.

## Things NOT to re-litigate (already decided, stable)

- Tech stack: Node.js + Express + `node:sqlite` (not better-sqlite3, not
  Postgres) — see `changelog.md` for why.
- Single local machine, one SQLite file, no hosting/multi-user — see
  `scope.md`.
- Docs-first workflow: update the relevant `docs/*.md` file whenever a
  real decision changes, before or alongside the code. Architecture
  decisions are made between sessions, in the docs — not decided
  unilaterally mid-session. If a session hits a genuine ambiguity the
  docs don't resolve, it should flag it and stop, per rule 3.
- Testing approach: build and test in the sandbox environment first (real
  code paths, real database, hand-verified numbers) before handing files
  over. As of the step-9 session, this sandbox has had working npm
  registry access, so "build and test" can mean a real `npm install` +
  live Express server + live HTTP requests, not just hand-mirrored SQL —
  worth doing whenever the sandbox allows it, not just schema-level
  tests.
- Stock receipts are unified across restaurants (one log, restaurant
  column) rather than per-restaurant New Stock screens; `restaurant_id`
  is nullable as of step 9, per `data-model.md` section 5.
- Activity logging via before/after snapshots + soft deletes, not hard
  locks. Scoped to `stock_receipts` and `commissary_yield_log` only —
  `commissary_meat_map` is deliberately excluded, being config data
  rather than a daily transactional log.
- "Landing" mixes meats + prepared dishes as rows; Prep is not a separate
  tab (confirmed via the real paper workflow, "Silingan Landing
  Inventory").
- The repo is public (no secrets committed — `.env`, `*.db`, and
  `/uploads/` are gitignored and always have been). This was a deliberate
  choice to simplify tooling access; it doesn't change any of the above.

## End-of-session checklist (every session, no exceptions)

Since each session starts with zero memory of prior conversations and
relies entirely on `docs/` for continuity, every session — whether or not
the step it was working on is fully finished — should, before ending:

1. Update `docs/changelog.md` with a dated entry (what shipped, what's
   deliberately not built yet, how it was verified).
2. Update **this file** — change the step's status tag and, if it's not
   **Done**, replace the step's one-line description with a precise
   done/not done/untested breakdown. Something like:

   > 12. **[WIP] Opening-stock fix.** Done: the `opening_stock` write
   > path and its test. Not done: the Beginning cell isn't wired to be
   > conditionally editable in `daily-audit.html` yet — still always
   > editable. Untested: haven't confirmed the write path against a
   > real multi-day sequence, only a single day in isolation.

   This is the difference between step 9's total loss and a WIP hand-off
   actually being useful — vague ("still in progress") forces the next
   session to re-derive what happened by reading the diff; precise lets
   it just continue.
3. If the step isn't fully done, commit it anyway per rule 17 (`wip:`
   prefix, nothing previously-working left broken, full test suite still
   green) rather than leaving it uncommitted. Per rule 16, still prefer
   not needing this at all — a step running long is a signal to stop at
   the nearest clean boundary, not to power through the original scope.
4. There is no `HANDOFF.md` — it was deleted 2026-08-28. Don't create a
   new parallel "handoff" doc; extend this file instead, so there's never
   again a second doc that can silently drift out of sync with the real
   one.
