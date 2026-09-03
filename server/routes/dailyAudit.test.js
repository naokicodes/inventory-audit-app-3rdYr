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
//
// Also covers, added 2026-08-29: POST /api/daily-audit/portions - the
// prepped/portion_ending_actual write path that's been missing since
// step 11 (BATCH_PREPPED dish rows were display-only until now).

const { DatabaseSync } = require('node:sqlite');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getBeginningStock } = require('../engines/auditEngine.js');
const { withTransaction, logActivity } = require('../db/activityLog.js');

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
db.prepare(`INSERT INTO dishes (id, restaurant_id, dish_code, name, prep_type) VALUES (1, 1, 'D01', 'Mozzarella Sticks', 'BATCH_PREPPED')`).run();
db.prepare(`INSERT INTO dishes (id, restaurant_id, dish_code, name, prep_type) VALUES (2, 1, 'D02', 'Chicken Skewers', 'BATCH_PREPPED')`).run();

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

// Mirrors POST /api/daily-audit/portions
const getPreppedRow = db.prepare(`
  SELECT * FROM prepped WHERE restaurant_id = ? AND dish_id = ? AND business_date = ?
`);
const upsertPrepped = db.prepare(`
  INSERT INTO prepped (restaurant_id, dish_id, business_date, portions_produced)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(restaurant_id, dish_id, business_date) DO UPDATE SET
    portions_produced = excluded.portions_produced,
    created_by = NULL
`);
const upsertPortionActual = db.prepare(`
  INSERT INTO portion_ending_actual (restaurant_id, dish_id, business_date, portions_counted)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(restaurant_id, dish_id, business_date) DO UPDATE SET portions_counted = excluded.portions_counted
`);
function savePortions(restaurantId, businessDate, rows) {
  let saved = 0;
  for (const row of rows) {
    if (row.prepped !== null && row.prepped !== undefined && row.prepped !== '') {
      withTransaction(db, () => {
        const before = getPreppedRow.get(restaurantId, row.dish_id, businessDate) || null;
        upsertPrepped.run(restaurantId, row.dish_id, businessDate, Number(row.prepped));
        const after = getPreppedRow.get(restaurantId, row.dish_id, businessDate);
        logActivity(db, {
          actor: null,
          entityType: 'prepped',
          entityId: after.id,
          action: before ? 'UPDATE' : 'CREATE',
          before,
          after,
          source: 'MANUAL'
        });
      });
    }
    if (row.portion_actual !== null && row.portion_actual !== undefined && row.portion_actual !== '') {
      upsertPortionActual.run(restaurantId, row.dish_id, businessDate, Number(row.portion_actual));
    }
    saved++;
  }
  return saved;
}

test('a fresh prepped write creates one row', () => {
  savePortions(1, '2026-08-29', [{ dish_id: 1, prepped: 20 }]);
  const row = db.prepare(`SELECT * FROM prepped WHERE restaurant_id = 1 AND dish_id = 1 AND business_date = '2026-08-29'`).get();
  assert.strictEqual(row.portions_produced, 20);
});

test('a second prepped write for the same dish/date REPLACES it (upsert, not a duplicate row) - this is the sync-batch-stock override case', () => {
  savePortions(1, '2026-08-29', [{ dish_id: 1, prepped: 18 }]);
  const rows = db.prepare(`SELECT * FROM prepped WHERE restaurant_id = 1 AND dish_id = 1 AND business_date = '2026-08-29'`).all();
  assert.strictEqual(rows.length, 1, 'must still be exactly one row, not two');
  assert.strictEqual(rows[0].portions_produced, 18, 'must be the new value, manual entry wins');
});

test('a fresh manual prepped write logs a CREATE with before=null', () => {
  savePortions(1, '2026-08-25', [{ dish_id: 1, prepped: 12 }]);
  const row = db.prepare(`SELECT * FROM prepped WHERE restaurant_id = 1 AND dish_id = 1 AND business_date = '2026-08-25'`).get();
  const logRow = db.prepare(`SELECT * FROM activity_log WHERE entity_type = 'prepped' AND entity_id = ?`).get(row.id);
  assert.ok(logRow, 'an activity_log row must exist for this create');
  assert.strictEqual(logRow.action, 'CREATE');
  assert.strictEqual(logRow.source, 'MANUAL');
  assert.strictEqual(JSON.parse(logRow.before === null ? 'null' : logRow.before), null);
});

test('step 25d-ii: correcting a SYSTEM-stamped prepped row clears created_by rather than overwriting it, and logs an UPDATE', () => {
  db.prepare(`
    INSERT INTO prepped (restaurant_id, dish_id, business_date, portions_produced, created_by)
    VALUES (1, 1, '2026-08-26', 40, 'SYSTEM:sync-batch-stock')
  `).run();

  savePortions(1, '2026-08-26', [{ dish_id: 1, prepped: 42 }]);

  const row = db.prepare(`SELECT * FROM prepped WHERE restaurant_id = 1 AND dish_id = 1 AND business_date = '2026-08-26'`).get();
  assert.strictEqual(row.portions_produced, 42, 'the corrected number wins');
  assert.strictEqual(row.created_by, null, 'the SYSTEM stamp must be cleared, not replaced with a name');

  const logRows = db.prepare(`SELECT * FROM activity_log WHERE entity_type = 'prepped' AND entity_id = ? ORDER BY id`).all(row.id);
  const correction = logRows[logRows.length - 1];
  assert.strictEqual(correction.action, 'UPDATE', 'a row already existed, so this is a correction, not a create');
  const before = JSON.parse(correction.before);
  const after = JSON.parse(correction.after);
  assert.strictEqual(before.created_by, 'SYSTEM:sync-batch-stock', 'before snapshot preserves what the SYSTEM stamp was');
  assert.strictEqual(after.created_by, null);
  assert.strictEqual(after.portions_produced, 42);
});

test('a fresh portion_actual write creates one row', () => {
  savePortions(1, '2026-08-29', [{ dish_id: 1, portion_actual: 15 }]);
  const row = db.prepare(`SELECT * FROM portion_ending_actual WHERE restaurant_id = 1 AND dish_id = 1 AND business_date = '2026-08-29'`).get();
  assert.strictEqual(row.portions_counted, 15);
});

test('a second portion_actual write for the same dish/date replaces it, same upsert behavior as prepped', () => {
  savePortions(1, '2026-08-29', [{ dish_id: 1, portion_actual: 13 }]);
  const rows = db.prepare(`SELECT * FROM portion_ending_actual WHERE restaurant_id = 1 AND dish_id = 1 AND business_date = '2026-08-29'`).all();
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].portions_counted, 13);
});

test('rows with no prepped/portion_actual fields write nothing for those fields', () => {
  savePortions(1, '2026-08-29', [{ dish_id: 2 }, { dish_id: 2, prepped: null }, { dish_id: 2, portion_actual: '' }]);
  const prepped = db.prepare(`SELECT * FROM prepped WHERE dish_id = 2`).get();
  const actual = db.prepare(`SELECT * FROM portion_ending_actual WHERE dish_id = 2`).get();
  assert.strictEqual(prepped, undefined);
  assert.strictEqual(actual, undefined);
});

test('prepped/portion_actual are per (restaurant, dish, date) - writing dish 2 does not touch dish 1', () => {
  savePortions(1, '2026-08-29', [{ dish_id: 2, prepped: 5, portion_actual: 4 }]);
  const dish1 = db.prepare(`SELECT portions_produced FROM prepped WHERE dish_id = 1 AND business_date = '2026-08-29'`).get();
  const dish2 = db.prepare(`SELECT portions_produced FROM prepped WHERE dish_id = 2 AND business_date = '2026-08-29'`).get();
  assert.strictEqual(dish1.portions_produced, 18, 'dish 1 unaffected');
  assert.strictEqual(dish2.portions_produced, 5);
});

test('this write path feeds computeDishAudit correctly end to end - the read side already existed, this confirms the write side actually connects to it', () => {
  const { computeDishAudit } = require('../engines/auditEngine.js');
  // Fresh dish/date so there's no "yesterday" portion_ending_actual -
  // portionBeginning is null on day one, same documented shape as
  // getPortionBeginning's own comment describes, not a bug.
  savePortions(1, '2026-09-01', [{ dish_id: 1, prepped: 30, portion_actual: 28 }]);
  const result = computeDishAudit(db, 1, 1, '2026-09-01');
  assert.strictEqual(result.prepped, 30);
  assert.strictEqual(result.portionActual, 28);
  assert.strictEqual(result.status, 'MISSING_BEGINNING_STOCK', 'no prior day actual exists yet for this dish');

  // Day two: portionBeginning should now resolve from day one's actual (28).
  savePortions(1, '2026-09-02', [{ dish_id: 1, prepped: 10, portion_actual: 25 }]);
  const day2 = computeDishAudit(db, 1, 1, '2026-09-02');
  assert.strictEqual(day2.portionBeginning, 28, "day two's beginning must be day one's actual count");
  assert.strictEqual(day2.portionEndingCalculated, 28 + 10 - 0, 'sold is 0, no sales rows seeded for this dish/date');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
