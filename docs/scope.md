# Scope — what this app IS and IS NOT

Read this before implementing anything. If a feature isn't listed under
"In scope," don't build it without checking first — even if it seems like
an obvious/helpful addition. Small scale, deliberately.

## What this app IS
- A **meat-cost audit tool** for one person (the "auditor") to use, on one
  computer, covering 3 restaurants.
- Tracks, per restaurant per day: new stock in, actual physical ending count,
  sales (auto-synced), prep quantities (for batch-cooked dishes), and
  optional adjustments (waste, transfers, staff meals, etc.).
- Calculates automatically: beginning stock (carried from yesterday),
  theoretical usage (from sales/prep × recipe), expected ending, and
  variance (shortage/surplus) vs. the physical count.
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
  ever needed — no roles, no permissions matrix, no concurrent access.
- **Not cloud-hosted (for now).** No server to maintain, no monthly hosting
  bill, no uptime to worry about. If this ever needs to become multi-location
  (each restaurant entering its own data on-site), that's a deliberate future
  decision, not a default to build toward.
- **Not a POS.** Sales numbers come FROM the existing Loyverse setup via the
  already-built sync logic — this app never records a sale directly.
- **Not doing recipe costing, food-cost percentage, menu engineering,** or
  any other restaurant-management features beyond meat variance auditing.
  Those are legitimate features *someday*, but not now.

## The worker-facing surface should stay small
The auditor's actual daily task is transcribing numbers from staff photos
into two or three short forms per restaurant (new stock, ending counts,
prep counts) — no dropdowns into recipes, no restaurant configuration, no
math visible anywhere. Recipe/dish/meat management is a separate admin
area, used occasionally, not daily.

## Explicitly deferred (valid future ideas, not now)
- Portion-level (finished dish) physical counts — confirmed IN scope now,
  see data-model.md, but keep the UI for it minimal.
- Multi-computer / multi-location networked access.
- AI-generated daily/weekly summary reports (planned, but after the core
  audit engine is solid and tested with real data).
- Receipt/photo OCR (auto-reading numbers off the photo instead of manual
  typing) — interesting later, not now.
- Any inventory category beyond meat.

## When in doubt
If a Claude Code suggestion or an implementation detail would expand scope
beyond this document, stop and ask before building it. Small, working, and
boring beats large and half-finished.
