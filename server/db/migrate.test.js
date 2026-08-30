// Tests for the step 23a migration (multi-Commissary generalization,
// schema only - see docs/data-model.md section 10b and
// docs/session-status.md's "Item 3 design"). Focuses specifically on
// migrateCommissaryMultiTenant: does it produce a correct single-commissary
// state from a real pre-23a commissary_meats shape, not just "runs without
// erroring." Same plain-script, real node:sqlite, no-framework style as
// every other test file in this project.
//
// Run with: node server/db/migrate.test.js

const { DatabaseSync } = require('node:sqlite');
const assert = require('assert');
const { migrateCommissaryMultiTenant, migrateConversionStandardsMeatType } = require('./migrate.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

console.log('Migration Tests: migrateCommissaryMultiTenant (step 23a)\n');

// Builds a fresh in-memory DB with the OLD, pre-23a commissary_meats shape
// (no commissary_id/meat_type_id, UNIQUE(code) global) - mirrors what
// schema.sql actually created before this step, not a guess.
function makePreMigrationDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE commissary_meats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      unit TEXT NOT NULL CHECK (unit IN ('kg', 'unit')),
      allowed_leeway_pct REAL NOT NULL,
      cost_per_unit REAL,
      active INTEGER NOT NULL DEFAULT 1
    )
  `);
  return db;
}

// Real-shaped rows, straight from commissary-seed-data.json's actual
// values (M01/M03/M05 - a mix of unit/kg and different leeway_pct), not
// hand-invented placeholders.
function seedRealCommissaryMeats(db) {
  const insert = db.prepare(
    `INSERT INTO commissary_meats (code, name, unit, allowed_leeway_pct, cost_per_unit) VALUES (?, ?, ?, ?, ?)`
  );
  insert.run('M01', 'Whole Chicken', 'unit', 0.0, null);
  insert.run('M03', 'Belly Slab', 'kg', 0.25, null);
  insert.run('M05', 'JOWL', 'kg', 0.2, null);
}

test('fresh install (no commissary_meats table yet) is a no-op', () => {
  const db = new DatabaseSync(':memory:');
  const result = migrateCommissaryMultiTenant(db);
  assert.strictEqual(result.ran, false);
  assert.strictEqual(result.rowsMigrated, 0);
});

test('already-migrated shape (commissary_id already present) is a no-op', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE commissary_meats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commissary_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      allowed_leeway_pct REAL NOT NULL,
      cost_per_unit REAL,
      meat_type_id INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE (commissary_id, code)
    )
  `);
  const result = migrateCommissaryMultiTenant(db);
  assert.strictEqual(result.ran, false);
});

test('migration creates exactly one commissaries row', () => {
  const db = makePreMigrationDb();
  seedRealCommissaryMeats(db);
  migrateCommissaryMultiTenant(db);
  const count = db.prepare(`SELECT COUNT(*) AS n FROM commissaries`).get().n;
  assert.strictEqual(count, 1);
});

test('every existing commissary_meats row is preserved with correct data and backfilled commissary_id', () => {
  const db = makePreMigrationDb();
  seedRealCommissaryMeats(db);
  const result = migrateCommissaryMultiTenant(db);

  assert.strictEqual(result.ran, true);
  assert.strictEqual(result.rowsMigrated, 3);

  const commissaryId = db.prepare(`SELECT id FROM commissaries`).get().id;
  assert.strictEqual(result.commissaryId, commissaryId);

  const rows = db.prepare(`SELECT * FROM commissary_meats ORDER BY code`).all();
  assert.strictEqual(rows.length, 3);

  const jowl = rows.find(r => r.code === 'M05');
  assert.strictEqual(jowl.name, 'JOWL');
  assert.strictEqual(jowl.unit, 'kg');
  assert.strictEqual(jowl.allowed_leeway_pct, 0.2);
  assert.strictEqual(jowl.commissary_id, commissaryId);
  assert.strictEqual(jowl.meat_type_id, null);
  assert.strictEqual(jowl.active, 1);

  const chicken = rows.find(r => r.code === 'M01');
  assert.strictEqual(chicken.name, 'Whole Chicken');
  assert.strictEqual(chicken.unit, 'unit');
  assert.strictEqual(chicken.commissary_id, commissaryId);
});

test('row count is unchanged by the migration', () => {
  const db = makePreMigrationDb();
  seedRealCommissaryMeats(db);
  const before = db.prepare(`SELECT COUNT(*) AS n FROM commissary_meats`).get().n;
  migrateCommissaryMultiTenant(db);
  const after = db.prepare(`SELECT COUNT(*) AS n FROM commissary_meats`).get().n;
  assert.strictEqual(after, before);
});

test('new UNIQUE(commissary_id, code) allows the same code under a second commissary', () => {
  const db = makePreMigrationDb();
  seedRealCommissaryMeats(db);
  migrateCommissaryMultiTenant(db);

  db.prepare(`INSERT INTO commissaries (code, name) VALUES ('COM-B', 'Commissary B')`).run();
  const secondCommissaryId = db.prepare(`SELECT id FROM commissaries WHERE code = 'COM-B'`).get().id;

  // Same code ("M01") as the migrated Commissary A row, but under a
  // different commissary - must be allowed now that codes are only
  // unique per-commissary, not global.
  assert.doesNotThrow(() => {
    db.prepare(
      `INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, 'M01', 'Whole Chicken (Commissary B)', 'unit', 0.0)`
    ).run(secondCommissaryId);
  });

  const count = db.prepare(`SELECT COUNT(*) AS n FROM commissary_meats WHERE code = 'M01'`).get().n;
  assert.strictEqual(count, 2);
});

test('duplicate code under the SAME commissary is still rejected', () => {
  const db = makePreMigrationDb();
  seedRealCommissaryMeats(db);
  const { commissaryId } = migrateCommissaryMultiTenant(db);

  assert.throws(() => {
    db.prepare(
      `INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, 'M01', 'Duplicate', 'unit', 0.0)`
    ).run(commissaryId);
  });
});

test('running the migration twice is idempotent - no duplicate commissaries row, no data loss', () => {
  const db = makePreMigrationDb();
  seedRealCommissaryMeats(db);
  migrateCommissaryMultiTenant(db);
  const secondResult = migrateCommissaryMultiTenant(db);

  assert.strictEqual(secondResult.ran, false);
  const commissaryCount = db.prepare(`SELECT COUNT(*) AS n FROM commissaries`).get().n;
  assert.strictEqual(commissaryCount, 1);
  const meatCount = db.prepare(`SELECT COUNT(*) AS n FROM commissary_meats`).get().n;
  assert.strictEqual(meatCount, 3);
});

console.log('\nMigration Tests: migrateConversionStandardsMeatType (step 23b)\n');

// Builds a fresh in-memory DB with the OLD, pre-23b commissary_conversion_standards
// shape (commissary_meat_id, not meat_type_id) on top of the NEW (post-23a)
// commissary_meats/meat_types/commissaries shape - mirrors the real sequencing
// in connection.js, where 23a's migration always runs first.
function makePreRekeyDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE commissaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )
  `);
  db.exec(`
    CREATE TABLE meat_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )
  `);
  db.exec(`
    CREATE TABLE commissary_meats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commissary_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      allowed_leeway_pct REAL NOT NULL,
      cost_per_unit REAL,
      meat_type_id INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (commissary_id) REFERENCES commissaries(id),
      FOREIGN KEY (meat_type_id) REFERENCES meat_types(id),
      UNIQUE (commissary_id, code)
    )
  `);
  db.exec(`
    CREATE TABLE restaurants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1
    )
  `);
  db.exec(`
    CREATE TABLE meats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL,
      meat_code TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
    )
  `);
  db.exec(`
    CREATE TABLE commissary_conversion_standards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commissary_meat_id INTEGER NOT NULL,
      restaurant_id INTEGER NOT NULL,
      meat_id INTEGER NOT NULL,
      ratio_per_unit REAL NOT NULL,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE (commissary_meat_id, restaurant_id, meat_id)
    )
  `);

  db.prepare(`INSERT INTO commissaries (code, name) VALUES ('COM-A', 'Commissary A')`).run();
  db.prepare(`INSERT INTO restaurants (name, code) VALUES ('FC', 'FC')`).run();
  db.prepare(`INSERT INTO meats (restaurant_id, meat_code, name, unit) VALUES (1, 'M01', 'Bagnet', 'unit')`).run();
  db.prepare(`INSERT INTO meats (restaurant_id, meat_code, name, unit) VALUES (1, 'M02', 'Sisig', 'unit')`).run();
  db.prepare(`INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (1, 'M05', 'JOWL', 'kg', 0.2)`).run();

  return db;
}

test('fresh install (no commissary_conversion_standards table yet) is a no-op', () => {
  const db = new DatabaseSync(':memory:');
  const result = migrateConversionStandardsMeatType(db);
  assert.strictEqual(result.ran, false);
  assert.strictEqual(result.rowsMigrated, 0);
});

test('already-migrated shape (meat_type_id already present) is a no-op', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE commissary_conversion_standards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meat_type_id INTEGER NOT NULL,
      restaurant_id INTEGER NOT NULL,
      meat_id INTEGER NOT NULL,
      ratio_per_unit REAL NOT NULL,
      UNIQUE (meat_type_id, restaurant_id, meat_id)
    )
  `);
  const result = migrateConversionStandardsMeatType(db);
  assert.strictEqual(result.ran, false);
});

test('two standards for the SAME commissary meat resolve to the SAME meat_type_id', () => {
  const db = makePreRekeyDb();
  const jowlId = db.prepare(`SELECT id FROM commissary_meats WHERE code = 'M05'`).get().id;
  db.prepare(`INSERT INTO commissary_conversion_standards (commissary_meat_id, restaurant_id, meat_id, ratio_per_unit) VALUES (?, 1, 1, 0.3)`).run(jowlId);
  db.prepare(`INSERT INTO commissary_conversion_standards (commissary_meat_id, restaurant_id, meat_id, ratio_per_unit) VALUES (?, 1, 2, 0.25)`).run(jowlId);

  const result = migrateConversionStandardsMeatType(db);
  assert.strictEqual(result.ran, true);
  assert.strictEqual(result.rowsMigrated, 2);

  const meatTypeCount = db.prepare(`SELECT COUNT(*) AS n FROM meat_types`).get().n;
  assert.strictEqual(meatTypeCount, 1, 'both standards for Jowl should share one meat_types row, not create two');

  const rows = db.prepare(`SELECT * FROM commissary_conversion_standards ORDER BY meat_id`).all();
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].meat_type_id, rows[1].meat_type_id);
  assert.strictEqual(rows[0].ratio_per_unit, 0.3);
  assert.strictEqual(rows[1].ratio_per_unit, 0.25);
});

test('the commissary_meats row referenced by the standard gets tagged with the new meat_type_id', () => {
  const db = makePreRekeyDb();
  const jowlId = db.prepare(`SELECT id FROM commissary_meats WHERE code = 'M05'`).get().id;
  db.prepare(`INSERT INTO commissary_conversion_standards (commissary_meat_id, restaurant_id, meat_id, ratio_per_unit) VALUES (?, 1, 1, 0.3)`).run(jowlId);

  migrateConversionStandardsMeatType(db);

  const jowl = db.prepare(`SELECT meat_type_id FROM commissary_meats WHERE id = ?`).get(jowlId);
  assert.notStrictEqual(jowl.meat_type_id, null);

  const meatType = db.prepare(`SELECT name FROM meat_types WHERE id = ?`).get(jowl.meat_type_id);
  assert.strictEqual(meatType.name, 'JOWL');
});

test('new UNIQUE(meat_type_id, restaurant_id, meat_id) still rejects a true duplicate pairing', () => {
  const db = makePreRekeyDb();
  const jowlId = db.prepare(`SELECT id FROM commissary_meats WHERE code = 'M05'`).get().id;
  db.prepare(`INSERT INTO commissary_conversion_standards (commissary_meat_id, restaurant_id, meat_id, ratio_per_unit) VALUES (?, 1, 1, 0.3)`).run(jowlId);
  migrateConversionStandardsMeatType(db);

  const meatTypeId = db.prepare(`SELECT meat_type_id FROM commissary_meats WHERE id = ?`).get(jowlId).meat_type_id;
  assert.throws(() => {
    db.prepare(`INSERT INTO commissary_conversion_standards (meat_type_id, restaurant_id, meat_id, ratio_per_unit) VALUES (?, 1, 1, 0.5)`).run(meatTypeId);
  });
});

test('row count is unchanged by the migration', () => {
  const db = makePreRekeyDb();
  const jowlId = db.prepare(`SELECT id FROM commissary_meats WHERE code = 'M05'`).get().id;
  db.prepare(`INSERT INTO commissary_conversion_standards (commissary_meat_id, restaurant_id, meat_id, ratio_per_unit) VALUES (?, 1, 1, 0.3)`).run(jowlId);
  db.prepare(`INSERT INTO commissary_conversion_standards (commissary_meat_id, restaurant_id, meat_id, ratio_per_unit) VALUES (?, 1, 2, 0.25)`).run(jowlId);

  const before = db.prepare(`SELECT COUNT(*) AS n FROM commissary_conversion_standards`).get().n;
  migrateConversionStandardsMeatType(db);
  const after = db.prepare(`SELECT COUNT(*) AS n FROM commissary_conversion_standards`).get().n;
  assert.strictEqual(after, before);
});

test('running the migration twice is idempotent - no duplicate meat_types row, no data loss', () => {
  const db = makePreRekeyDb();
  const jowlId = db.prepare(`SELECT id FROM commissary_meats WHERE code = 'M05'`).get().id;
  db.prepare(`INSERT INTO commissary_conversion_standards (commissary_meat_id, restaurant_id, meat_id, ratio_per_unit) VALUES (?, 1, 1, 0.3)`).run(jowlId);

  migrateConversionStandardsMeatType(db);
  const secondResult = migrateConversionStandardsMeatType(db);

  assert.strictEqual(secondResult.ran, false);
  const meatTypeCount = db.prepare(`SELECT COUNT(*) AS n FROM meat_types`).get().n;
  assert.strictEqual(meatTypeCount, 1);
  const standardCount = db.prepare(`SELECT COUNT(*) AS n FROM commissary_conversion_standards`).get().n;
  assert.strictEqual(standardCount, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
