// Database connection helper.
// Opens (or creates, if missing) the local SQLite file.
// No tables are defined here yet - that's the next step, once
// docs/data-model.md is turned into an actual schema.
//
// Uses Node's BUILT-IN SQLite support (node:sqlite) instead of the
// better-sqlite3 package. As of Node 22.13+ this ships with the runtime
// itself - no native compilation, no Visual Studio Build Tools needed on
// Windows. Requires Node 22.13.0 or newer.

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { migrateStockReceiptsNullableDestination, migrateLocationsActiveColumn, migrateConversionColumns } = require('./migrate.js');

const DB_PATH = path.join(__dirname, 'inventory.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new DatabaseSync(DB_PATH);

// A couple of sane defaults for a single-user local SQLite file:
db.exec('PRAGMA journal_mode = WAL');   // better crash-safety, minimal downside here
db.exec('PRAGMA foreign_keys = ON');    // enforce FK constraints once tables exist

// Step 9 (2026-08-28): one-time, idempotent migration for anyone with a
// pre-existing local inventory.db whose stock_receipts table still has
// the old NOT NULL restaurant_id/meat_id constraints. Must run BEFORE
// schema.sql - schema.sql's "CREATE TABLE IF NOT EXISTS" cannot loosen a
// constraint on a table that's already there. No-ops for a fresh install
// or an already-migrated database. See server/db/migrate.js.
migrateStockReceiptsNullableDestination(db);

// Step 22 (2026-08-29): same reasoning, smaller migration - adds
// locations.active for anyone with a pre-existing local locations table
// from before step 22 gave it an admin UI. See server/db/migrate.js.
migrateLocationsActiveColumn(db);

// Item 1 of the 2026-08-29 "Future considerations" list (Portion
// Conversion allocations) - adds requires_conversion_target and
// linked_adjustment_id for anyone with a pre-existing local database
// from before this feature. See server/db/migrate.js.
migrateConversionColumns(db);

// Run schema.sql on every startup. All statements use "CREATE TABLE IF
// NOT EXISTS" and "INSERT OR IGNORE", so this is safe to re-run every
// time the app starts - it only creates what's missing, never destroys
// or duplicates existing data.
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

module.exports = db;
