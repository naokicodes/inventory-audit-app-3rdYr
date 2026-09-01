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

// ----------------------------------------------------------------------
// Step 23a (2026-08-31): multi-Commissary generalization, schema only.
// See docs/data-model.md section 10b and docs/session-status.md's "Item 3
// design" for the full reasoning - this migration covers only the piece
// resolved for 23a: commissary_meats gains commissary_id (NOT NULL) and
// meat_type_id (nullable), with UNIQUE(code) becoming
// UNIQUE(commissary_id, code). commissary_conversion_standards' own rekey
// (commissary_meat_id -> meat_type_id) is deliberately deferred to 23b,
// bundled with the route/engine changes that consume it - not touched
// here.
//
// Why a rebuild is needed (same reasoning as
// migrateStockReceiptsNullableDestination above): adding a NOT NULL
// column with no default, and changing a UNIQUE constraint, aren't things
// a plain ALTER TABLE ADD COLUMN can do - SQLite needs a full
// create-copy-drop-rename for both. Since commissaries/meat_types are
// themselves brand-new tables that a pre-23a database won't have yet,
// this migration creates them itself (matching schema.sql's own
// definitions exactly) before the commissary_meats rebuild - schema.sql's
// later CREATE TABLE IF NOT EXISTS for both is then a no-op.
//
// Must run BEFORE schema.sql - see connection.js.

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ ran: boolean, commissaryId?: number, rowsMigrated: number }}
 */
function migrateCommissaryMultiTenant(db) {
  const tableExists = db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'commissary_meats'`
  ).get();

  if (!tableExists) {
    // Fresh install - schema.sql will create commissary_meats with
    // commissary_id/meat_type_id already present. Nothing to migrate.
    return { ran: false, rowsMigrated: 0 };
  }

  const columns = db.prepare(`PRAGMA table_info(commissary_meats)`).all();
  const alreadyMigrated = columns.some(c => c.name === 'commissary_id');
  if (alreadyMigrated) {
    // Already has the new shape - either migrated previously, or created
    // fresh by schema.sql on a database that never had the old shape.
    return { ran: false, rowsMigrated: 0 };
  }

  const rowCountBefore = db.prepare(`SELECT COUNT(*) AS n FROM commissary_meats`).get().n;

  const fkWasOn = db.prepare(`PRAGMA foreign_keys`).get().foreign_keys === 1;
  db.exec('PRAGMA foreign_keys = OFF');

  let commissaryId;
  db.exec('BEGIN');
  try {
    // commissaries/meat_types are brand-new tables - a pre-23a database
    // won't have them yet. Definitions match schema.sql exactly.
    db.exec(`
      CREATE TABLE IF NOT EXISTS commissaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS meat_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1
      )
    `);

    // One real commissary row representing today's single implicit
    // commissary. INSERT OR IGNORE + SELECT so a re-run (shouldn't happen,
    // guarded by the alreadyMigrated check above, but matches this file's
    // existing defensive style) doesn't create a second row.
    db.prepare(
      `INSERT OR IGNORE INTO commissaries (code, name) VALUES ('COM-A', 'Commissary A')`
    ).run();
    commissaryId = db.prepare(
      `SELECT id FROM commissaries WHERE code = 'COM-A'`
    ).get().id;

    db.exec(`
      CREATE TABLE commissary_meats__migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        commissary_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        unit TEXT NOT NULL CHECK (unit IN ('kg', 'unit')),
        allowed_leeway_pct REAL NOT NULL,
        cost_per_unit REAL,
        meat_type_id INTEGER,
        active INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (commissary_id) REFERENCES commissaries(id),
        FOREIGN KEY (meat_type_id) REFERENCES meat_types(id),
        UNIQUE (commissary_id, code)
      )
    `);

    db.prepare(`
      INSERT INTO commissary_meats__migrated
        (id, commissary_id, code, name, unit, allowed_leeway_pct, cost_per_unit, meat_type_id, active)
      SELECT
        id, ?, code, name, unit, allowed_leeway_pct, cost_per_unit, NULL, active
      FROM commissary_meats
    `).run(commissaryId);

    const rowCountAfter = db.prepare(`SELECT COUNT(*) AS n FROM commissary_meats__migrated`).get().n;
    if (rowCountAfter !== rowCountBefore) {
      throw new Error(
        `Migration row count mismatch: ${rowCountBefore} before, ${rowCountAfter} after - aborting rather than risk data loss.`
      );
    }

    db.exec('DROP TABLE commissary_meats');
    db.exec('ALTER TABLE commissary_meats__migrated RENAME TO commissary_meats');

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    if (fkWasOn) db.exec('PRAGMA foreign_keys = ON');
  }

  return { ran: true, commissaryId, rowsMigrated: rowCountBefore };
}

module.exports.migrateCommissaryMultiTenant = migrateCommissaryMultiTenant;

// ----------------------------------------------------------------------
// Step 23b (2026-08-31): commissary_conversion_standards' own rekey from
// commissary_meat_id to meat_type_id. See docs/data-model.md section 10b
// and docs/session-status.md's "Item 3 design" - deliberately deferred out
// of 23a's migration (migrateCommissaryMultiTenant above) since it needed
// the route/engine changes that actually consume meat_type_id landing at
// the same time, not schema alone.
//
// Must run AFTER migrateCommissaryMultiTenant (needs commissary_meats to
// already have a meat_type_id column to tag) and BEFORE schema.sql - see
// connection.js.

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ ran: boolean, rowsMigrated: number }}
 */
function migrateConversionStandardsMeatType(db) {
  const tableExists = db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'commissary_conversion_standards'`
  ).get();

  if (!tableExists) {
    // Fresh install - schema.sql will create it with meat_type_id already
    // present. Nothing to migrate.
    return { ran: false, rowsMigrated: 0 };
  }

  const columns = db.prepare(`PRAGMA table_info(commissary_conversion_standards)`).all();
  const alreadyMigrated = columns.some(c => c.name === 'meat_type_id');
  if (alreadyMigrated) {
    return { ran: false, rowsMigrated: 0 };
  }

  const rowCountBefore = db.prepare(`SELECT COUNT(*) AS n FROM commissary_conversion_standards`).get().n;

  const fkWasOn = db.prepare(`PRAGMA foreign_keys`).get().foreign_keys === 1;
  db.exec('PRAGMA foreign_keys = OFF');

  db.exec('BEGIN');
  try {
    // meat_types may not exist yet on a database that never ran 23a's
    // migration in the same startup (shouldn't happen given the call order
    // in connection.js, but matches this file's existing defensive style).
    db.exec(`
      CREATE TABLE IF NOT EXISTS meat_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1
      )
    `);

    const oldRows = db.prepare(`SELECT * FROM commissary_conversion_standards`).all();

    const findMeatTypeByName = db.prepare(`SELECT id FROM meat_types WHERE name = ?`);
    const insertMeatType = db.prepare(`INSERT INTO meat_types (name) VALUES (?)`);
    const getCommissaryMeat = db.prepare(`SELECT id, name FROM commissary_meats WHERE id = ?`);
    const tagCommissaryMeat = db.prepare(`UPDATE commissary_meats SET meat_type_id = ? WHERE id = ? AND meat_type_id IS NULL`);

    // create/reuse one meat_types row per DISTINCT commissary meat referenced
    // (not per standard row) - two standards for the same commissary meat
    // (e.g. Jowl -> Bagnet and Jowl -> Sisig) must resolve to the same type.
    const meatTypeIdByCommissaryMeatId = new Map();
    const meatTypeIdForStandard = new Map();

    for (const row of oldRows) {
      if (!meatTypeIdByCommissaryMeatId.has(row.commissary_meat_id)) {
        const cm = getCommissaryMeat.get(row.commissary_meat_id);
        if (!cm) {
          throw new Error(
            `commissary_conversion_standards row ${row.id} references missing commissary_meat_id ${row.commissary_meat_id} - aborting rather than guess.`
          );
        }
        const existingType = findMeatTypeByName.get(cm.name);
        const meatTypeId = existingType
          ? existingType.id
          : Number(insertMeatType.run(cm.name).lastInsertRowid);
        tagCommissaryMeat.run(meatTypeId, cm.id);
        meatTypeIdByCommissaryMeatId.set(row.commissary_meat_id, meatTypeId);
      }
      meatTypeIdForStandard.set(row.id, meatTypeIdByCommissaryMeatId.get(row.commissary_meat_id));
    }

    db.exec(`
      CREATE TABLE commissary_conversion_standards__migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meat_type_id INTEGER NOT NULL,
        restaurant_id INTEGER NOT NULL,
        meat_id INTEGER NOT NULL,
        ratio_per_unit REAL NOT NULL,
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (meat_type_id) REFERENCES meat_types(id),
        FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
        FOREIGN KEY (meat_id) REFERENCES meats(id),
        UNIQUE (meat_type_id, restaurant_id, meat_id)
      )
    `);

    const insertMigrated = db.prepare(`
      INSERT INTO commissary_conversion_standards__migrated
        (id, meat_type_id, restaurant_id, meat_id, ratio_per_unit, notes, active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of oldRows) {
      insertMigrated.run(
        row.id, meatTypeIdForStandard.get(row.id), row.restaurant_id, row.meat_id,
        row.ratio_per_unit, row.notes, row.active
      );
    }

    const rowCountAfter = db.prepare(`SELECT COUNT(*) AS n FROM commissary_conversion_standards__migrated`).get().n;
    if (rowCountAfter !== rowCountBefore) {
      throw new Error(
        `Migration row count mismatch: ${rowCountBefore} before, ${rowCountAfter} after - aborting rather than risk data loss.`
      );
    }

    db.exec('DROP TABLE commissary_conversion_standards');
    db.exec('ALTER TABLE commissary_conversion_standards__migrated RENAME TO commissary_conversion_standards');

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    if (fkWasOn) db.exec('PRAGMA foreign_keys = ON');
  }

  return { ran: true, rowsMigrated: rowCountBefore };
}

module.exports.migrateConversionStandardsMeatType = migrateConversionStandardsMeatType;

// ----------------------------------------------------------------------
// Step 24a (2026-09-02): commissary_yield_log.output_commissary_meat_id -
// see docs/data-model.md section 10b and docs/session-status.md's 24a
// bullet. NULL means the output is the same meat as the input (back-compat
// default). Adding a plain nullable column is a simple ALTER TABLE ADD
// COLUMN, same as migrateLocationsActiveColumn above - no rebuild needed.
//
// Must run BEFORE schema.sql - see connection.js.

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ ran: boolean }}
 */
function migrateYieldLogOutputMeatColumn(db) {
  const tableExists = db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'commissary_yield_log'`
  ).get();
  if (!tableExists) {
    // Fresh install - schema.sql creates it with the column already
    // present. Nothing to migrate.
    return { ran: false };
  }

  const columns = db.prepare(`PRAGMA table_info(commissary_yield_log)`).all();
  const hasColumn = columns.some(c => c.name === 'output_commissary_meat_id');
  if (hasColumn) {
    return { ran: false };
  }

  db.exec(`ALTER TABLE commissary_yield_log ADD COLUMN output_commissary_meat_id INTEGER REFERENCES commissary_meats(id)`);
  return { ran: true };
}

module.exports.migrateYieldLogOutputMeatColumn = migrateYieldLogOutputMeatColumn;

// ----------------------------------------------------------------------
// Step 24b-i (2026-09-02): commissary_yield_log.input_quantity - see
// docs/data-model.md section 10b and docs/session-status.md's 24b-i
// bullet. NULL means the input quantity is the same as raw_weight_in
// (back-compat default). Same plain ALTER TABLE ADD COLUMN shape as
// migrateYieldLogOutputMeatColumn above - no rebuild needed.
//
// Must run BEFORE schema.sql - see connection.js.

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ ran: boolean }}
 */
function migrateYieldLogInputQuantityColumn(db) {
  const tableExists = db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'commissary_yield_log'`
  ).get();
  if (!tableExists) {
    // Fresh install - schema.sql creates it with the column already
    // present. Nothing to migrate.
    return { ran: false };
  }

  const columns = db.prepare(`PRAGMA table_info(commissary_yield_log)`).all();
  const hasColumn = columns.some(c => c.name === 'input_quantity');
  if (hasColumn) {
    return { ran: false };
  }

  db.exec(`ALTER TABLE commissary_yield_log ADD COLUMN input_quantity REAL`);
  return { ran: true };
}

module.exports.migrateYieldLogInputQuantityColumn = migrateYieldLogInputQuantityColumn;

// ----------------------------------------------------------------------
// Step 24b-ii (2026-09-02): commissary_adjustments - see
// docs/data-model.md section 10b and docs/session-status.md's 24b-ii
// bullet. Brand-new table, so CREATE TABLE IF NOT EXISTS covers a fresh
// install on its own via schema.sql; this migration only needs to handle
// a pre-existing database that predates the table, matching it exactly.
//
// Must run BEFORE schema.sql - see connection.js.

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ ran: boolean }}
 */
function migrateCommissaryAdjustmentsTable(db) {
  const tableExists = db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'commissary_adjustments'`
  ).get();
  if (tableExists) {
    return { ran: false };
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS commissary_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commissary_meat_id INTEGER NOT NULL,
      business_date TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('LOSS', 'ALLOCATION')),
      quantity REAL NOT NULL,
      destination_commissary_meat_id INTEGER,
      notes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (commissary_meat_id) REFERENCES commissary_meats(id),
      FOREIGN KEY (destination_commissary_meat_id) REFERENCES commissary_meats(id)
    )
  `);
  return { ran: true };
}

module.exports.migrateCommissaryAdjustmentsTable = migrateCommissaryAdjustmentsTable;
