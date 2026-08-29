# Scope — what this app IS and IS NOT

Read this before implementing anything. If a feature isn't listed under
"In scope," don't build it without checking first — even if it seems like
an obvious/helpful addition. Small scale, deliberately.

## What this app IS
- A **meat-cost audit tool** for one person (the "auditor") to use, on one
  computer, covering 3 restaurants.
- Tracks, per restaurant per day: stock received (from a unified log — see
  below), actual physical ending count, sales (auto-synced), prep
  quantities (for batch-cooked dishes), and optional adjustments (waste,
  transfers, staff meals, etc.).
- **Tracks a single commissary's meat-processing yield** (raw weight in vs.
  backed/processed weight out, checked against an allowed loss % per meat)
  and feeds shipments from the commissary into the same unified stock
  receipts log restaurants use for direct deliveries — added 2026-08-27,
  see `data-model.md` section 10 and `commissary-and-stock-receipts.md`.
- Calculates automatically: beginning stock (carried from yesterday),
  theoretical usage (from sales/prep × recipe), expected ending, and
  variance (shortage/surplus) vs. the physical count.
- **Logs every change to stock receipts and commissary yield entries**
  (create/edit/soft-delete, with before/after values) to a single
  admin-visible activity log — added 2026-08-27, see
  `commissary-and-stock-receipts.md`.
- Runs **locally**, on the auditor's machine, backed by a single SQLite file.
- Code lives in a private GitHub repo. Business data (counts, photos) never
  leaves the local machine unless deliberately exported.

## What this app is NOT
- **Not a full restaurant inventory system.** It does not track produce, dry
  goods, beverages, or anything besides meat. The existing station-by-station
  daily inventory process for everything else continues unchanged, outside
  this app.
- **Not multi-user / not networked.** One auditor, one computer, one
  database file. No login system beyond maybe a simple local password if
  ever needed — no roles, no permissions matrix, no concurrent access. The
  activity log's "actor" field is plain text the person types, not an
  authenticated identity.
- **Not cloud-hosted (for now).** No server to maintain, no monthly hosting
  bill, no uptime to worry about.
- **Not a POS.** Sales numbers come FROM the existing Loyverse setup via the
  already-built sync logic — this app never records a sale directly.
- **Not doing recipe costing, food-cost percentage, menu engineering,** or
  any other restaurant-management features beyond meat variance auditing.
- **Not a general audit/compliance system.** The activity log covers stock
  receipts and commissary yield entries only for now — extending it to
  every other input table is real, valid future work, not built yet (see
  `commissary-and-stock-receipts.md`, Part 3, scope boundary note).

## The worker-facing surface should stay small
The auditor's actual daily task is transcribing numbers from staff photos
into a small number of short forms — no dropdowns into recipes, no
restaurant configuration, no math visible anywhere. Recipe/dish/meat
management and the commissary yield log are separate admin/occasional-use
areas, not part of the daily entry screens.

## Explicitly deferred (valid future ideas, not now)
- Portion-level (finished dish) physical counts — confirmed IN scope now,
  see `data-model.md`, but keep the UI for it minimal.
- Multi-computer / multi-location networked access.
- AI-generated daily/weekly summary reports (planned, but after the core
  audit engine is solid and tested with real data).
- Receipt/photo OCR (auto-reading numbers off the photo instead of manual
  typing) — interesting later, not now.
- Any inventory category beyond meat.
- Extending soft-delete + activity logging to `ending_actual`,
  `adjustments`, `sales`, `prepped`, and `portion_ending_actual` — deliberately
  scoped out of the 2026-08-27 change to keep it reviewable; a real next
  step, not forgotten. `sales` added to this list 2026-08-29 when step
  16 introduced its first real manual-edit path (`PATCH /api/sales`) —
  same open question as the others, worth revisiting once there's a
  second editable table with this need, not decided under step 16's own
  time budget. **Narrow exception added 2026-08-29 for step 15**:
  the "Sync batch stock" command's own writes to `prepped` (and only
  those — it's the sole write path into that table right now, there's no
  manual edit UI for it yet) log a `CREATE`/`SYSTEM` row to
  `activity_log`, since a system-inferred number is exactly the case
  that most needs a trail of where it came from. This does not reopen
  soft-delete or general audit logging for `prepped` — that's still
  deferred until a real edit UI exists for it.
- A second/third commissary, or commissary-to-commissary transfers — the
  current design assumes one commissary serving all restaurants.

## When in doubt
If a Claude Code suggestion or an implementation detail would expand scope
beyond this document, stop and ask before building it. Small, working, and
boring beats large and half-finished.
