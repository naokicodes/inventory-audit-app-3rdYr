// Tests for the audit engine, using real seeded data (Bagnet Sisig / JOWL)
// and hand-calculated expected values.
//
// This is a plain script, not using Node's built-in test runner - node:test
// and node:sqlite (both still experimental) don't play well together as of
// this writing (writes fail with "readonly database" partway through a
// test-runner session, even though the exact same code works fine as a
// normal script). Simpler to just run assertions directly.
//
// Run with: node server/engines/auditEngine.test.js
// Exits with code 0 if all pass, 1 if anything fails.

const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const {
  computeMeatAudit,
  getUsage,
  addDays
} = require('./auditEngine.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

// Fresh, isolated test database - never touches the real inventory.db
const TEST_DB_PATH = path.join(__dirname, '..', 'db', 'test.db');
for (const ext of ['', '-shm', '-wal']) {
  const p = TEST_DB_PATH + ext;
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const db = new DatabaseSync(TEST_DB_PATH);
db.exec('PRAGMA foreign_keys = ON');
db.exec(schema);

// --- Set up a real scenario: Restaurant A, JOWL, Bagnet Sisig (0.18kg/portion) ---
db.prepare('INSERT INTO restaurants (name, code) VALUES (?, ?)').run('Restaurant A', 'RA');
const restaurantId = db.prepare('SELECT id FROM restaurants WHERE code = ?').get('RA').id;

db.prepare('INSERT INTO meats (restaurant_id, meat_code, name, unit) VALUES (?, ?, ?, ?)')
  .run(restaurantId, 'M03', 'JOWL', 'kg');
const meatId = db.prepare('SELECT id FROM meats WHERE meat_code = ?').get('M03').id;

db.prepare('INSERT INTO dishes (restaurant_id, dish_code, name, prep_type) VALUES (?, ?, ?, ?)')
  .run(restaurantId, 'D003', 'Bagnet Sisig', 'BATCH_PREPPED');
const dishId = db.prepare('SELECT id FROM dishes WHERE dish_code = ?').get('D003').id;

db.prepare('INSERT INTO recipe_bom (dish_id, meat_id, quantity, effective_from) VALUES (?, ?, ?, ?)')
  .run(dishId, meatId, 0.18, '2026-01-01');

console.log('Audit Engine Tests\n');

test('addDays handles month/year rollover correctly', () => {
  assert.strictEqual(addDays('2026-08-25', -1), '2026-08-24');
  assert.strictEqual(addDays('2026-03-01', -1), '2026-02-28');
  assert.strictEqual(addDays('2026-01-01', -1), '2025-12-31');
});

test('usage calculation: 5 portions prepped x 0.18kg = 0.9kg exactly', () => {
  db.prepare('INSERT INTO prepped (restaurant_id, dish_id, business_date, portions_produced) VALUES (?, ?, ?, ?)')
    .run(restaurantId, dishId, '2026-08-01', 5);
  const usage = getUsage(db, restaurantId, meatId, '2026-08-01');
  assert.ok(Math.abs(usage - 0.9) < 0.0001, `expected ~0.9, got ${usage}`);
});

test('day 1: beginning stock comes from opening_stock, not a prior ending_actual', () => {
  db.prepare('INSERT INTO opening_stock (restaurant_id, meat_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, meatId, '2026-08-01', 10.0);
  db.prepare('INSERT INTO new_stock (restaurant_id, meat_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, meatId, '2026-08-01', 5.0);
  db.prepare('INSERT INTO ending_actual (restaurant_id, meat_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, meatId, '2026-08-01', 14.0);

  const result = computeMeatAudit(db, restaurantId, meatId, '2026-08-01');
  // Hand-calculated: beginning=10, new=5, usage=0.9 -> expected ending = 14.1
  // actual = 14.0 -> variance = 14.1 - 14.0 = 0.1 (shortage, positive)
  assert.strictEqual(result.beginning, 10.0);
  assert.strictEqual(result.newStock, 5.0);
  assert.ok(Math.abs(result.usage - 0.9) < 0.0001, `expected usage ~0.9, got ${result.usage}`);
  assert.ok(Math.abs(result.endingCalculated - 14.1) < 0.0001, `expected ending ~14.1, got ${result.endingCalculated}`);
  assert.strictEqual(result.actual, 14.0);
  assert.ok(Math.abs(result.variance - 0.1) < 0.0001, `expected ~0.1, got ${result.variance}`);
  assert.strictEqual(result.status, 'SHORTAGE');
});

test('day 2: beginning stock carries forward from day 1 actual ending automatically', () => {
  db.prepare('INSERT INTO prepped (restaurant_id, dish_id, business_date, portions_produced) VALUES (?, ?, ?, ?)')
    .run(restaurantId, dishId, '2026-08-02', 3); // 3 x 0.18 = 0.54kg usage
  db.prepare('INSERT INTO new_stock (restaurant_id, meat_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, meatId, '2026-08-02', 0);
  db.prepare('INSERT INTO ending_actual (restaurant_id, meat_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, meatId, '2026-08-02', 13.46);

  const result = computeMeatAudit(db, restaurantId, meatId, '2026-08-02');
  assert.strictEqual(result.beginning, 14.0); // day 1's ACTUAL ending, not calculated
  assert.strictEqual(result.usage, 0.54);
  assert.ok(Math.abs(result.endingCalculated - 13.46) < 0.0001);
  assert.strictEqual(result.status, 'OK');
});

test('surplus case: actual higher than expected gives negative variance', () => {
  db.prepare('INSERT INTO new_stock (restaurant_id, meat_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, meatId, '2026-08-03', 0);
  db.prepare('INSERT INTO ending_actual (restaurant_id, meat_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, meatId, '2026-08-03', 20.0);

  const result = computeMeatAudit(db, restaurantId, meatId, '2026-08-03');
  assert.strictEqual(result.beginning, 13.46);
  assert.strictEqual(result.usage, 0);
  assert.ok(result.variance < 0, 'surplus should be negative');
  assert.strictEqual(result.status, 'SURPLUS');
});

test('known adjustment (waste) reduces unexplained variance without changing raw variance', () => {
  const typeId = db.prepare('SELECT id FROM adjustment_types WHERE name = ?').get('Wastage').id;
  db.prepare('INSERT INTO new_stock (restaurant_id, meat_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, meatId, '2026-08-04', 0);
  db.prepare('INSERT INTO adjustments (restaurant_id, meat_id, business_date, quantity, adjustment_type_id) VALUES (?, ?, ?, ?, ?)')
    .run(restaurantId, meatId, '2026-08-04', 1.0, typeId);
  db.prepare('INSERT INTO ending_actual (restaurant_id, meat_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, meatId, '2026-08-04', 19.0);

  const result = computeMeatAudit(db, restaurantId, meatId, '2026-08-04');
  assert.strictEqual(result.beginning, 20.0);
  assert.strictEqual(result.endingCalculated, 20.0);
  assert.strictEqual(result.variance, 1.0); // raw variance still shows the 1kg gap
  assert.ok(Math.abs(result.unexplainedVariance) < 0.0001); // fully explained by the waste log
  assert.strictEqual(result.status, 'OK'); // status is based on UNEXPLAINED variance
});

test('missing actual count is flagged, not silently treated as zero variance', () => {
  db.prepare('INSERT INTO new_stock (restaurant_id, meat_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, meatId, '2026-08-05', 2.0);
  const result = computeMeatAudit(db, restaurantId, meatId, '2026-08-05');
  assert.strictEqual(result.actual, null);
  assert.strictEqual(result.status, 'MISSING_ACTUAL_COUNT');
  assert.strictEqual(result.variance, null);
});

console.log(`\n${passed} passed, ${failed} failed`);

for (const ext of ['', '-shm', '-wal']) {
  const p = TEST_DB_PATH + ext;
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

process.exit(failed > 0 ? 1 : 0);
