// Step sheets-tier1: sheet_definitions table + sheetDefinitions.js.
//
// Runs against an in-memory DB built from schema.sql - never the live
// inventory.db.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { createSheetDefinition, listSheetDefinitions, ensureDefaultSheets } = require('./sheetDefinitions.js');

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

console.log('Sheet Definitions Tests\n');

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));

db.prepare("INSERT INTO restaurants (name, code) VALUES ('Silang', 'SILT')").run();
db.prepare("INSERT INTO restaurants (name, code) VALUES ('Likod', 'LIK')").run();
db.prepare("INSERT INTO restaurants (name, code, active) VALUES ('Closed', 'OLD', 0)").run();
db.prepare("INSERT INTO commissaries (name, code) VALUES ('Commissary A', 'COM-A')").run();

const count = () => db.prepare('SELECT COUNT(*) AS n FROM sheet_definitions').get().n;

test('creates a MEAT and a SIDE definition', () => {
  const meat = createSheetDefinition(db, { siteCode: 'SILT', category: ' Landing ', engineType: 'MEAT' });
  assert.strictEqual(meat.category, 'Landing');
  assert.strictEqual(meat.engine_type, 'MEAT');
  assert.strictEqual(meat.active, 1);
  const side = createSheetDefinition(db, { siteCode: 'SILT', category: 'Veggies', engineType: 'SIDE' });
  assert.strictEqual(side.engine_type, 'SIDE');
});

test('rejects an unknown site, empty category and unknown engine type, writing nothing', () => {
  const before = count();
  assert.throws(() => createSheetDefinition(db, { siteCode: 'NOPE', category: 'X', engineType: 'MEAT' }), /unknown site code/);
  assert.throws(() => createSheetDefinition(db, { siteCode: 'SILT', category: '', engineType: 'MEAT' }), /category is required/);
  assert.throws(() => createSheetDefinition(db, { siteCode: 'SILT', category: '   ', engineType: 'MEAT' }), /category is required/);
  assert.throws(() => createSheetDefinition(db, { siteCode: 'SILT', category: 'Bar', engineType: 'DRINK' }), /engine type/);
  assert.strictEqual(count(), before);
});

test('rejects a case-insensitive duplicate on the same site', () => {
  const before = count();
  assert.throws(() => createSheetDefinition(db, { siteCode: 'SILT', category: 'landing', engineType: 'MEAT' }), /already has/);
  assert.strictEqual(count(), before);
});

test('allows the same category on two sites', () => {
  createSheetDefinition(db, { siteCode: 'COM-A', category: 'Veggies', engineType: 'SIDE' });
});

test('list filters by site and by activeOnly', () => {
  createSheetDefinition(db, { siteCode: 'SILT', category: 'Pantry', engineType: 'SIDE', active: 0 });
  assert.deepStrictEqual(listSheetDefinitions(db, { siteCode: 'SILT' }).map(r => r.category), ['Landing', 'Veggies']);
  assert.deepStrictEqual(listSheetDefinitions(db, { siteCode: 'SILT', activeOnly: false }).map(r => r.category), ['Landing', 'Pantry', 'Veggies']);
  assert.deepStrictEqual(listSheetDefinitions(db).map(r => `${r.site_code}:${r.category}`), ['COM-A:Veggies', 'SILT:Landing', 'SILT:Veggies']);
});

test('ensureDefaultSheets: one Landing per active restaurant, one Commi per active commissary, idempotent', () => {
  // SILT already has Landing, so only LIK and COM-A get a row; OLD is inactive.
  assert.deepStrictEqual(ensureDefaultSheets(db), { inserted: 2 });
  assert.strictEqual(listSheetDefinitions(db, { siteCode: 'LIK' })[0].category, 'Landing');
  assert.strictEqual(listSheetDefinitions(db, { siteCode: 'COM-A' }).find(r => r.category === 'Commi').engine_type, 'MEAT');
  assert.strictEqual(listSheetDefinitions(db, { siteCode: 'OLD', activeOnly: false }).length, 0);
  assert.deepStrictEqual(ensureDefaultSheets(db), { inserted: 0 });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
