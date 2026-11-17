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
const { resolveDbPath } = require('./dbPath.js');
const { migrateStockReceiptsNullableDestination, migrateLocationsActiveColumn, migrateConversionColumns, migrateCommissaryMultiTenant, migrateConversionStandardsMeatType, migrateYieldLogOutputMeatColumn, migrateYieldLogInputQuantityColumn, migrateYieldLogMiscutWeightColumn, migrateCommissaryAdjustmentsTable, migrateOpeningStockDateScoped, migrateMonthStartRecountColumns, migrateCreatedByUserIdColumns } = require('./migrate.js');

// Step reseed-beta-db (2026-09-27): DB_PATH env var selects the database
// file, so Beta can run on a disposable beta.db. Unset = the live
// inventory.db, exactly as before. See server/db/dbPath.js.
const DB_PATH = resolveDbPath();
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Step db-start (B1 note 3): the schema version this code leaves a database
// at, kept in PRAGMA user_version. Raise it in a step that changes or drops
// something (not one that only adds), together with that step's migration.
// A database at a higher version was opened by newer code: an older app must
// not run on it.
const SCHEMA_VERSION = 1;

const db = new DatabaseSync(DB_PATH);

// Checked before anything below writes to the file.
const openedVersion = db.prepare('PRAGMA user_version').get().user_version;
if (openedVersion > SCHEMA_VERSION) {
  db.close();
  const err = new Error('This database was opened by a newer version of the app. Update the app (restaurant-pc.bat update) instead of going back.');
  err.code = 'DB_SCHEMA_TOO_NEW';
  throw err;
}

// A couple of pragmas for a shared, multi-user local SQLite file:
db.exec('PRAGMA journal_mode = WAL');   // better crash-safety, minimal downside here
db.exec('PRAGMA busy_timeout = 5000');  // Step busy-timeout: another process's lock waits up to 5s instead of failing at once
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

// Step 23a (2026-08-31): multi-Commissary generalization - adds
// commissary_id/meat_type_id to commissary_meats for anyone with a
// pre-existing local database from before this feature. See
// server/db/migrate.js.
migrateCommissaryMultiTenant(db);

// Step 23b (2026-08-31): commissary_conversion_standards' own rekey from
// commissary_meat_id to meat_type_id - must run after
// migrateCommissaryMultiTenant (needs commissary_meats.meat_type_id to
// already exist). See server/db/migrate.js.
migrateConversionStandardsMeatType(db);

// Step 24a (2026-09-02): commissary_yield_log.output_commissary_meat_id -
// adds the nullable output-meat column for anyone with a pre-existing
// local database from before this feature. See server/db/migrate.js.
migrateYieldLogOutputMeatColumn(db);

// Step 24b-i (2026-09-02): commissary_yield_log.input_quantity - adds
// the nullable input-quantity column for anyone with a pre-existing
// local database from before this feature. See server/db/migrate.js.
migrateYieldLogInputQuantityColumn(db);

// Step 24d-i (2026-09-28): commissary_yield_log.miscut_weight - adds the
// NOT NULL DEFAULT 0 miscut column for anyone with a pre-existing local
// database from before this feature. See server/db/migrate.js.
migrateYieldLogMiscutWeightColumn(db);

// Step 24b-ii (2026-09-02): commissary_adjustments - creates the table for
// anyone with a pre-existing local database from before this feature. See
// server/db/migrate.js.
migrateCommissaryAdjustmentsTable(db);

// Step 26a (2026-09-23): opening_stock/commissary_opening_stock's UNIQUE
// key gains business_date, for anyone with a pre-existing local database
// from before this feature. See server/db/migrate.js.
migrateOpeningStockDateScoped(db);

// Step 26a-ii (2026-09-23): recount_required on meats/commissary_meats and
// opening_source on both opening tables, for anyone with a pre-existing
// local database. Must run after migrateOpeningStockDateScoped, whose
// rebuild recreates the opening tables without opening_source. See
// server/db/migrate.js.
migrateMonthStartRecountColumns(db);

// Step user-id-authorship (2026-11-14): created_by_user_id on the ten
// created_by tables, for a pre-existing local database. Runs last, after
// every rebuild above. See server/db/migrate.js.
migrateCreatedByUserIdColumns(db);

// Run schema.sql on every startup. All statements use "CREATE TABLE IF
// NOT EXISTS" and "INSERT OR IGNORE", so this is safe to re-run every
// time the app starts - it only creates what's missing, never destroys
// or duplicates existing data.
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

// Step db-start: after the migrations and schema.sql, the file is at
// SCHEMA_VERSION. Written only when it differs (a database from before this
// step reads 0).
if (openedVersion !== SCHEMA_VERSION) {
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

module.exports = db;
