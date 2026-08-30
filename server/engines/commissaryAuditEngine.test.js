// Tests for the commissary audit engine (step 20b, session-status.md),
// using a real seeded scenario (commissary JOWL shipped to two
// restaurants) and hand-calculated expected values. Same approach as
// auditEngine.test.js - plain script, real node:sqlite DB, no framework.
//
// Run with: node server/engines/commissaryAuditEngine.test.js
// Exits with code 0 if all pass, 1 if anything fails.

const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const {
  getCommissaryStockIn,
  getCommissaryBackedUp,
  getCommissaryUsage,
  computeCommissaryMeatAudit,
  computeCommissaryDailyAudit
} = require('./commissaryAuditEngine.js');

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
const TEST_DB_PATH = path.join(__dirname, '..', 'db', 'test-commissary-audit.db');
for (const ext of ['', '-shm', '-wal']) {
  const p = TEST_DB_PATH + ext;
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const db = new DatabaseSync(TEST_DB_PATH);
db.exec('PRAGMA foreign_keys = ON');
db.exec(schema);

// --- Set up a real scenario: commissary JOWL (M05), shipped to two ---
// --- destination restaurants (RA, RB). ---
db.prepare('INSERT INTO restaurants (name, code) VALUES (?, ?)').run('Restaurant A', 'RA');
db.prepare('INSERT INTO restaurants (name, code) VALUES (?, ?)').run('Restaurant B', 'RB');
const restaurantA = db.prepare('SELECT id FROM restaurants WHERE code = ?').get('RA').id;
const restaurantB = db.prepare('SELECT id FROM restaurants WHERE code = ?').get('RB').id;

db.prepare(`INSERT INTO commissaries (code, name) VALUES ('COM-A', 'Commissary A')`).run();
const commissaryId = db.prepare(`SELECT id FROM commissaries WHERE code = 'COM-A'`).get().id;

db.prepare('INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?, ?)')
  .run(commissaryId, 'M05', 'JOWL', 'kg', 0.20);
const jowlId = db.prepare('SELECT id FROM commissary_meats WHERE code = ?').get('M05').id;

// A second commissary meat, used only for the daily-audit list/filter test
db.prepare('INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?, ?)')
  .run(commissaryId, 'M03', 'Belly Slab', 'kg', 0.25);
const bellyId = db.prepare('SELECT id FROM commissary_meats WHERE code = ?').get('M03').id;

console.log('Commissary Audit Engine Tests\n');

test('getCommissaryStockIn sums commissary_stock_receipts for the meat/date', () => {
  db.prepare('INSERT INTO commissary_stock_receipts (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(jowlId, '2026-08-01', 5.0);
  const stockIn = getCommissaryStockIn(db, jowlId, '2026-08-01');
  assert.strictEqual(stockIn, 5.0);
});

test('getCommissaryBackedUp sums commissary_yield_log.backed_weight_out, excludes soft-deleted rows', () => {
  db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out) VALUES (?, ?, ?, ?)')
    .run(jowlId, '2026-08-01', 4.0, 3.0);
  db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out, deleted_at) VALUES (?, ?, ?, ?, ?)')
    .run(jowlId, '2026-08-01', 100.0, 90.0, '2026-08-01T12:00:00Z');
  const backedUp = getCommissaryBackedUp(db, jowlId, '2026-08-01');
  assert.strictEqual(backedUp, 3.0);
});

test('getCommissaryUsage sums commissary_shipments.total_quantity across every destination restaurant', () => {
  db.prepare('INSERT INTO commissary_shipments (commissary_meat_id, restaurant_id, business_date, total_quantity) VALUES (?, ?, ?, ?)')
    .run(jowlId, restaurantA, '2026-08-01', 2.0);
  db.prepare('INSERT INTO commissary_shipments (commissary_meat_id, restaurant_id, business_date, total_quantity) VALUES (?, ?, ?, ?)')
    .run(jowlId, restaurantB, '2026-08-01', 1.5);
  const usage = getCommissaryUsage(db, jowlId, '2026-08-01');
  assert.ok(Math.abs(usage - 3.5) < 0.0001, `expected 2.0 + 1.5 = 3.5, got ${usage}`);
});

test('day 1: beginning stock comes from commissary_opening_stock, not a prior commissary_ending_actual', () => {
  db.prepare('INSERT INTO commissary_opening_stock (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(jowlId, '2026-08-01', 10.0);
  db.prepare('INSERT INTO commissary_ending_actual (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(jowlId, '2026-08-01', 14.5);

  const result = computeCommissaryMeatAudit(db, jowlId, '2026-08-01');
  // Hand-calculated: beginning=10, stockIn=5, backedUp=3, usage=3.5
  // -> endingCalculated = 10 + 5 + 3 - 3.5 = 14.5. actual=14.5 -> OK.
  assert.strictEqual(result.beginning, 10.0);
  assert.strictEqual(result.stockIn, 5.0);
  assert.strictEqual(result.backedUp, 3.0);
  assert.ok(Math.abs(result.usage - 3.5) < 0.0001);
  assert.ok(Math.abs(result.endingCalculated - 14.5) < 0.0001, `expected ~14.5, got ${result.endingCalculated}`);
  assert.strictEqual(result.expectedEnding, result.endingCalculated); // no commissary adjustments layer yet
  assert.strictEqual(result.actual, 14.5);
  assert.ok(Math.abs(result.variance) < 0.0001);
  assert.strictEqual(result.unexplainedVariance, result.variance);
  assert.strictEqual(result.status, 'OK');
});

test('day 2: beginning stock carries forward from day 1 actual ending automatically', () => {
  db.prepare('INSERT INTO commissary_stock_receipts (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(jowlId, '2026-08-02', 2.0);
  db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out) VALUES (?, ?, ?, ?)')
    .run(jowlId, '2026-08-02', 1.0, 0.8);
  db.prepare('INSERT INTO commissary_shipments (commissary_meat_id, restaurant_id, business_date, total_quantity) VALUES (?, ?, ?, ?)')
    .run(jowlId, restaurantA, '2026-08-02', 4.0);
  // beginning=14.5 (day1 actual), stockIn=2.0, backedUp=0.8, usage=4.0
  // -> endingCalculated = 14.5 + 2.0 + 0.8 - 4.0 = 13.3
  db.prepare('INSERT INTO commissary_ending_actual (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(jowlId, '2026-08-02', 13.0); // actual slightly under -> shortage

  const result = computeCommissaryMeatAudit(db, jowlId, '2026-08-02');
  assert.strictEqual(result.beginning, 14.5); // day 1's ACTUAL ending, not calculated
  assert.strictEqual(result.stockIn, 2.0);
  assert.ok(Math.abs(result.backedUp - 0.8) < 0.0001);
  assert.strictEqual(result.usage, 4.0);
  assert.ok(Math.abs(result.endingCalculated - 13.3) < 0.0001, `expected ~13.3, got ${result.endingCalculated}`);
  assert.strictEqual(result.actual, 13.0);
  assert.ok(Math.abs(result.variance - 0.3) < 0.0001, `expected ~0.3, got ${result.variance}`);
  assert.strictEqual(result.status, 'SHORTAGE'); // positive variance = shortage (rule 12)
});

test('surplus case: actual higher than expected gives negative variance', () => {
  // No inflows/usage today - beginning=13.0 (day 2 actual) carries as-is.
  db.prepare('INSERT INTO commissary_ending_actual (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(jowlId, '2026-08-03', 15.0);

  const result = computeCommissaryMeatAudit(db, jowlId, '2026-08-03');
  assert.strictEqual(result.beginning, 13.0);
  assert.strictEqual(result.stockIn, 0);
  assert.strictEqual(result.backedUp, 0);
  assert.strictEqual(result.usage, 0);
  assert.strictEqual(result.endingCalculated, 13.0);
  assert.ok(result.variance < 0, 'surplus should be negative');
  assert.strictEqual(result.status, 'SURPLUS');
});

test('missing actual count is flagged, not silently treated as zero variance', () => {
  db.prepare('INSERT INTO commissary_stock_receipts (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(jowlId, '2026-08-04', 3.0);
  const result = computeCommissaryMeatAudit(db, jowlId, '2026-08-04');
  assert.strictEqual(result.beginning, 15.0); // carried from 08-03 actual
  assert.strictEqual(result.stockIn, 3.0);
  assert.strictEqual(result.actual, null);
  assert.strictEqual(result.status, 'MISSING_ACTUAL_COUNT');
  assert.strictEqual(result.variance, null);
});

test('a meat with no opening_stock and no prior ending_actual -> MISSING_BEGINNING_STOCK', () => {
  const result = computeCommissaryMeatAudit(db, bellyId, '2026-08-01');
  assert.strictEqual(result.beginning, null);
  assert.strictEqual(result.status, 'MISSING_BEGINNING_STOCK');
  assert.strictEqual(result.endingCalculated, null);
});

test('computeCommissaryDailyAudit lists every active commissary meat for a date', () => {
  const rows = computeCommissaryDailyAudit(db, '2026-08-01');
  assert.strictEqual(rows.length, 2); // JOWL + Belly Slab
  const jowlRow = rows.find(r => r.code === 'M05');
  const bellyRow = rows.find(r => r.code === 'M03');
  assert.ok(jowlRow, 'expected a JOWL row');
  assert.ok(bellyRow, 'expected a Belly Slab row');
  assert.strictEqual(jowlRow.status, 'OK'); // reuses day-1 scenario above
  assert.strictEqual(bellyRow.status, 'MISSING_BEGINNING_STOCK');
});

test('computeCommissaryDailyAudit filters to a single commissary meat when an id is given', () => {
  const rows = computeCommissaryDailyAudit(db, '2026-08-01', jowlId);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].commissary_meat_id, jowlId);
  assert.strictEqual(rows[0].code, 'M05');
});

test('inactive commissary meats are excluded from the unfiltered list', () => {
  db.prepare('UPDATE commissary_meats SET active = 0 WHERE id = ?').run(bellyId);
  const rows = computeCommissaryDailyAudit(db, '2026-08-01');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].code, 'M05');
  db.prepare('UPDATE commissary_meats SET active = 1 WHERE id = ?').run(bellyId); // restore
});

console.log(`\n${passed} passed, ${failed} failed`);

db.close();
for (const ext of ['', '-shm', '-wal']) {
  const p = TEST_DB_PATH + ext;
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (err) {
    console.log(`  (note: couldn't clean up ${p} - ${err.code}. Harmless, delete manually if it bothers you.)`);
  }
}

process.exit(failed > 0 ? 1 : 0);
