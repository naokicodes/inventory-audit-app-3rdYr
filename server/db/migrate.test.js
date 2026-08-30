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
const { migrateCommissaryMultiTenant } = require('./migrate.js');

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
