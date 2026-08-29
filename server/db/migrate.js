// One-time, idempotent migration helper for step 9 (Unallocated-destination
// support). See docs/data-model.md section 5 and docs/session-status.md.
//
// Why this exists: schema.sql uses "CREATE TABLE IF NOT EXISTS" everywhere,
// which is safe for adding brand-new tables but CANNOT loosen a NOT NULL
// constraint on a table that already exists in someone's local
// inventory.db. Anyone who ran this app before step 9 has a stock_receipts
// table with restaurant_id/meat_id declared NOT NULL - schema.sql alone
// would silently leave that constraint in place forever.
//
// This module detects that old constraint via PRAGMA table_info and, only
// if found, rebuilds the table (new column definitions, same data)
// preserving every existing row untouched. If the table doesn't exist yet
// (fresh install) or already has the new nullable definition (already
// migrated, or created fresh by schema.sql), this is a complete no-op.
//
// Must run BEFORE schema.sql is executed - see connection.js.

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ ran: boolean, rowsPreserved: number }} what happened, mostly
 *   for logging/tests - callers don't need to branch on this.
 */
function migrateStockReceiptsNullableDestination(db) {
  const tableExists = db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'stock_receipts'`
  ).get();

  if (!tableExists) {
    // Fresh install - schema.sql will create the table with the correct
    // (nullable) definition. Nothing to migrate.
    return { ran: false, rowsPreserved: 0 };
  }

  const columns = db.prepare(`PRAGMA table_info(stock_receipts)`).all();
  const restaurantCol = columns.find(c => c.name === 'restaurant_id');
  const meatCol = columns.find(c => c.name === 'meat_id');

  if (!restaurantCol || !meatCol) {
    // Unexpected shape - don't guess, leave it alone. schema.sql's
    // CREATE TABLE IF NOT EXISTS will also leave it alone; a human needs
    // to look at this database.
    return { ran: false, rowsPreserved: 0 };
  }

  const needsMigration = restaurantCol.notnull === 1 || meatCol.notnull === 1;
  if (!needsMigration) {
    // Already has the nullable definition - either migrated previously,
    // or a fresh database schema.sql already created correctly.
    return { ran: false, rowsPreserved: 0 };
  }

  const rowCountBefore = db.prepare(`SELECT COUNT(*) AS n FROM stock_receipts`).get().n;

  // Foreign keys must be off for a rebuild-and-rename (SQLite recommends
  // this for any schema change that isn't a simple ALTER TABLE ADD
  // COLUMN); restored to ON afterward, matching connection.js's default.
  const fkWasOn = db.prepare(`PRAGMA foreign_keys`).get().foreign_keys === 1;
  db.exec('PRAGMA foreign_keys = OFF');

  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE stock_receipts__migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurant_id INTEGER,
        meat_id INTEGER,
        business_date TEXT NOT NULL,
        quantity REAL NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('DIRECT', 'COMMISSARY')),
        commissary_meat_id INTEGER,
        notes TEXT,
        photo_path TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
        FOREIGN KEY (meat_id) REFERENCES meats(id),
        FOREIGN KEY (commissary_meat_id) REFERENCES commissary_meats(id),
        CHECK (
          (restaurant_id IS NOT NULL AND meat_id IS NOT NULL)
          OR (restaurant_id IS NULL AND meat_id IS NULL AND source = 'COMMISSARY')
        )
      )
    `);

    db.exec(`
      INSERT INTO stock_receipts__migrated
        (id, restaurant_id, meat_id, business_date, quantity, source,
         commissary_meat_id, notes, photo_path, created_by, created_at, deleted_at)
      SELECT
        id, restaurant_id, meat_id, business_date, quantity, source,
        commissary_meat_id, notes, photo_path, created_by, created_at, deleted_at
      FROM stock_receipts
    `);

    const rowCountAfter = db.prepare(`SELECT COUNT(*) AS n FROM stock_receipts__migrated`).get().n;
    if (rowCountAfter !== rowCountBefore) {
      throw new Error(
        `Migration row count mismatch: ${rowCountBefore} before, ${rowCountAfter} after - aborting rather than risk data loss.`
      );
    }

    db.exec('DROP TABLE stock_receipts');
    db.exec('ALTER TABLE stock_receipts__migrated RENAME TO stock_receipts');

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    if (fkWasOn) db.exec('PRAGMA foreign_keys = ON');
  }

  return { ran: true, rowsPreserved: rowCountBefore };
}

module.exports = { migrateStockReceiptsNullableDestination };

// ----------------------------------------------------------------------
// Step 22 (session-status.md): locations.active
//
// Why this exists: locations was added back in step 9's era of
// data-model.md but has stayed unused (zero rows, no admin UI) until
// step 22 gives it one. schema.sql's "CREATE TABLE IF NOT EXISTS" can
// add brand-new tables safely but can't add a column to a table that
// already exists locally without it. Unlike the stock_receipts
// migration above (which had to loosen a NOT NULL constraint via a
// full rebuild-and-rename), adding a plain nullable-with-default column
// is a simple ALTER TABLE ADD COLUMN - no rebuild needed.
//
// Must run BEFORE schema.sql - see connection.js.

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ ran: boolean }}
 */
function migrateLocationsActiveColumn(db) {
  const tableExists = db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'locations'`
  ).get();
  if (!tableExists) {
    // Fresh install - schema.sql creates it with the active column
    // already present. Nothing to migrate.
    return { ran: false };
  }

  const columns = db.prepare(`PRAGMA table_info(locations)`).all();
  const hasActive = columns.some(c => c.name === 'active');
  if (hasActive) {
    return { ran: false };
  }

  db.exec(`ALTER TABLE locations ADD COLUMN active INTEGER NOT NULL DEFAULT 1`);
  return { ran: true };
}

module.exports.migrateLocationsActiveColumn = migrateLocationsActiveColumn;

// Adds requires_conversion_target (adjustment_types) and
// linked_adjustment_id (adjustments) - new columns for the Portion
// Conversion allocation type, item 1 of the 2026-08-29 "Future
// considerations" list. Same ALTER TABLE ADD COLUMN pattern as
// migrateLocationsActiveColumn above - both are new nullable/defaulted
// columns, not a constraint change, so no table rebuild is needed.
function migrateConversionColumns(db) {
  const results = { ran: false };

  const atExists = db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'adjustment_types'`
  ).get();
  if (atExists) {
    const atColumns = db.prepare(`PRAGMA table_info(adjustment_types)`).all();
    if (!atColumns.some(c => c.name === 'requires_conversion_target')) {
      db.exec(`ALTER TABLE adjustment_types ADD COLUMN requires_conversion_target INTEGER NOT NULL DEFAULT 0`);
      results.ran = true;
    }
  }

  const aExists = db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'adjustments'`
  ).get();
  if (aExists) {
    const aColumns = db.prepare(`PRAGMA table_info(adjustments)`).all();
    if (!aColumns.some(c => c.name === 'linked_adjustment_id')) {
      db.exec(`ALTER TABLE adjustments ADD COLUMN linked_adjustment_id INTEGER REFERENCES adjustments(id)`);
      results.ran = true;
    }
  }

  return results;
}

module.exports.migrateConversionColumns = migrateConversionColumns;
