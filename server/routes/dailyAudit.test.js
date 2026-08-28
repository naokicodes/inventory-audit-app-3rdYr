// Tests for step 12 (session-status.md): the opening_stock write path
// added to POST /api/daily-audit. Same approach as stockReceipts.test.js/
// settings.test.js - a real in-memory node:sqlite DB, real schema, plain
// assertions, no framework - a small helper mirrors the exact new bit of
// route logic (not the whole POST handler, which is already exercised
// implicitly by the app; this file is scoped to what step 12 added).
//
// Only the write side is covered here. getBeginningStock (the read side
// that decides whether a row's Beginning is null and therefore editable)
// already existed before this step and is covered by
// auditEngine.test.js - not duplicated here.

const { DatabaseSync } = require('node:sqlite');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getBeginningStock } = require('../engines/auditEngine.js');

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

console.log('Daily Audit Route Tests (step 12: opening-stock fix)\n');

const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(schema);

// ---- seed fixtures ----
db.prepare(`INSERT INTO restaurants (id, name, code) VALUES (1, 'Restaurant A', 'A')`).run();
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit) VALUES (1, 1, 'M01', 'Whole Chicken', 'kg')`).run();
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit) VALUES (2, 1, 'M02', 'Pork Belly', 'kg')`).run();

const insertOpeningStock = db.prepare(`
  INSERT OR IGNORE INTO opening_stock (restaurant_id, meat_id, business_date, quantity)
  VALUES (?, ?, ?, ?)
`);

// Mirrors the opening_stock branch of POST /api/daily-audit's row loop.
function saveOpeningStock(restaurantId, businessDate, rows) {
  for (const row of rows) {
    if (row.opening_stock !== null && row.opening_stock !== undefined && row.opening_stock !== '') {
      insertOpeningStock.run(restaurantId, row.meat_id, businessDate, Number(row.opening_stock));
    }
  }
}

test('Before any write, beginning stock is null (nothing to carry forward, no opening count yet)', () => {
  assert.strictEqual(getBeginningStock(db, 1, 1, '2026-08-29'), null);
});

test('A provided opening_stock value is written and becomes the beginning stock', () => {
  saveOpeningStock(1, '2026-08-29', [{ meat_id: 1, opening_stock: '12.5' }]);
  assert.strictEqual(getBeginningStock(db, 1, 1, '2026-08-29'), 12.5);
});

test('A second write attempt for the same meat is silently ignored (write-once)', () => {
  saveOpeningStock(1, '2026-08-30', [{ meat_id: 1, opening_stock: '999' }]);
  assert.strictEqual(getBeginningStock(db, 1, 1, '2026-08-30'), 12.5, 'must still be the original value, not overwritten');
  const rows = db.prepare(`SELECT COUNT(*) as c FROM opening_stock WHERE restaurant_id = 1 AND meat_id = 1`).get();
  assert.strictEqual(rows.c, 1, 'must still be exactly one row');
});

test('Rows with no opening_stock field (undefined/null/empty) write nothing', () => {
  saveOpeningStock(1, '2026-08-29', [
    { meat_id: 2 },
    { meat_id: 2, opening_stock: null },
    { meat_id: 2, opening_stock: '' }
  ]);
  const row = db.prepare(`SELECT * FROM opening_stock WHERE restaurant_id = 1 AND meat_id = 2`).get();
  assert.strictEqual(row, undefined);
  assert.strictEqual(getBeginningStock(db, 1, 2, '2026-08-29'), null);
});

test('opening_stock is per (restaurant, meat) - writing meat 2 does not touch meat 1', () => {
  saveOpeningStock(1, '2026-08-29', [{ meat_id: 2, opening_stock: '3' }]);
  assert.strictEqual(getBeginningStock(db, 1, 2, '2026-08-29'), 3);
  assert.strictEqual(getBeginningStock(db, 1, 1, '2026-08-29'), 12.5, 'meat 1 unaffected');
});

test('Once ending_actual exists for a day, beginning for the next day comes from THAT, not opening_stock (opening_stock is only the fallback)', () => {
  db.prepare(`INSERT INTO ending_actual (restaurant_id, meat_id, business_date, quantity) VALUES (1, 2, '2026-08-29', 7)`).run();
  assert.strictEqual(getBeginningStock(db, 1, 2, '2026-08-30'), 7);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
