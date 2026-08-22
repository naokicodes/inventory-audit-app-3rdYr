# Loyverse Sync — porting notes

The sales-sync logic already exists and works in production, as Google Apps
Script (`loyverse_sync_production.gs` and `loyverse_sync_test.gs`, already
reviewed). This doc captures the architecture and business rules to preserve
when porting to Node.js — it is NOT a replacement for reading those actual
files. When implementation time comes, **read the real .gs files directly**
for exact logic (receipt fields used, exact wildcard matching rules, etc.) —
this doc is the map, not the territory.

## Core principle
Don't reinvent this. The business rules below were arrived at through real
production debugging (see the dry-run/debug functions in the test file) —
port them faithfully, then verify against real dates using the same kind of
dry-run approach before trusting it.

## Architecture to preserve

### Per-restaurant/account config
Each Loyverse account (restaurant) has its own:
- API token
- A **business-day start hour** — not all restaurants necessarily close out
  at midnight; a sale after midnight but before the restaurant's actual
  "end of day" might belong to the prior business date.
- This maps to a `day_start_hour` column on the `restaurants` table
  (see data-model.md) — config per restaurant, not hardcoded per account.

### Business-date resolution
A receipt's `receipt_date` gets converted to a **local business date**,
accounting for the restaurant's day-start-hour and timezone — this is NOT
the same as just taking the calendar date of the timestamp. Get this exactly
right; it's the single most bug-prone part of the whole sync (per the
original script's dedicated debugging tools).

### Late-sync lookback window
Receipts can arrive in Loyverse's system some time after the actual sale
(network delays, offline mode syncing later, etc.). The sync window looks
back further than just "today" to catch late-arriving receipts for a given
business date — a receipt whose `created_at` is later than its `receipt_date`
is a legitimate late-sync case, not a bug, and needs to still be counted
correctly. Preserve this lookback logic exactly.

### Cancelled receipts
Any receipt with a `cancelled_at` timestamp is excluded entirely from sales
totals — check this before counting the receipt at all.

### Pagination
Loyverse's API paginates receipts via a cursor. The sync must page through
all results for the window, not just the first page — preserve the
do/while-cursor pattern from the original.

### Item name → DishID resolution
Loyverse item names don't necessarily match `dishes.name` exactly. The
original script uses a **Name_Map** lookup (with wildcard support) to
resolve a raw Loyverse item name to a `DishID`. Port this as:
- An admin-managed mapping table (`loyverse_name_map` or similar): raw item
  name/pattern → dish_id, scoped per restaurant/account (since two
  restaurants might use the same item name for different dishes, or need
  different wildcard rules).
- Unmatched item names should be logged/flagged, not silently dropped —
  the original script's `unmatched` tracking is a debugging necessity, not
  optional polish.

### Deduplication
Receipts already synced shouldn't be double-counted on a re-run. Port this
as an upsert (insert-or-update) keyed on the receipt's unique identifier,
not a blind insert.

## Debug/verification tooling — keep the equivalent
The original test file's dry-run functions were genuinely useful for
catching real discrepancies and should have Node.js equivalents, even if
just as internal scripts/CLI commands (not exposed in the daily-use UI —
see scope.md, this is an admin/you-only tool):
- **Dry-run sync for a date**: run the full fetch+filter+resolve logic,
  log results, write nothing to the database. Used to sanity-check before
  trusting a real sync.
- **Dump all receipts for a date**: full, unaggregated detail per receipt,
  for manually eyeballing a day when a discrepancy shows up.
- **Search items across a date**: substring search across raw item names
  for a date, showing raw total vs. currently-mapped total side by side —
  surfaces naming/mapping gaps directly instead of them vanishing into
  "unmatched."

## What changes vs. the original
- Apps Script's `UrlFetchApp` → Node's built-in `fetch()`.
- `PropertiesService` (token storage) → `.env` file, never committed
  (see the GitHub setup guide's `.gitignore`).
- Google Sheet tabs (`Sales`, `Sales_Log`, `Name_Map`) → SQLite tables per
  data-model.md, plus a `loyverse_name_map` table for the name resolution.
- Menu-triggered manual sync / time-driven trigger → a "Sync Sales" button
  in the app, plus optionally `node-cron` for an automatic nightly run once
  the manual version is trusted.

## Scope note
This is explicitly a **later phase** (see scope.md) — build and prove the
core audit engine with manual/test sales data first, then port this once
the foundation is solid. Don't let sync complexity block the MVP.
