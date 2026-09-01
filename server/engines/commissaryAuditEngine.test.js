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

test('getCommissaryUsage sums commissary_shipments AND debits commissary_yield_log.raw_weight_in for this meat as input', () => {
  db.prepare('INSERT INTO commissary_shipments (commissary_meat_id, restaurant_id, business_date, total_quantity) VALUES (?, ?, ?, ?)')
    .run(jowlId, restaurantA, '2026-08-01', 2.0);
  db.prepare('INSERT INTO commissary_shipments (commissary_meat_id, restaurant_id, business_date, total_quantity) VALUES (?, ?, ?, ?)')
    .run(jowlId, restaurantB, '2026-08-01', 1.5);
  const usage = getCommissaryUsage(db, jowlId, '2026-08-01');
  // shipments 2.0 + 1.5 = 3.5, plus the getCommissaryBackedUp test above's
  // non-deleted yield row (raw_weight_in=4.0; the soft-deleted row's
  // raw_weight_in=100.0 is excluded) => 3.5 + 4.0 = 7.5
  assert.ok(Math.abs(usage - 7.5) < 0.0001, `expected 3.5 + 4.0 = 7.5, got ${usage}`);
});

test('day 1: beginning stock comes from commissary_opening_stock, not a prior commissary_ending_actual', () => {
  db.prepare('INSERT INTO commissary_opening_stock (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(jowlId, '2026-08-01', 10.0);
  db.prepare('INSERT INTO commissary_ending_actual (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(jowlId, '2026-08-01', 14.5);

  const result = computeCommissaryMeatAudit(db, jowlId, '2026-08-01');
  // Hand-calculated: beginning=10, stockIn=5, backedUp=3,
  // usage = shipments(3.5) + yield debit(4.0, the non-deleted yield row's
  // raw_weight_in from the getCommissaryBackedUp test above) = 7.5
  // -> endingCalculated = 10 + 5 + 3 - 7.5 = 10.5. actual=14.5 -> surplus
  // (calculated is now less than actual, per rule 12 that's negative
  // variance = surplus - this meat's real balance is 4.0 higher than the
  // old credit-only formula reported, because that formula never debited
  // the raw meat consumed by processing it).
  assert.strictEqual(result.beginning, 10.0);
  assert.strictEqual(result.stockIn, 5.0);
  assert.strictEqual(result.backedUp, 3.0);
  assert.ok(Math.abs(result.usage - 7.5) < 0.0001);
  assert.ok(Math.abs(result.endingCalculated - 10.5) < 0.0001, `expected ~10.5, got ${result.endingCalculated}`);
  assert.strictEqual(result.expectedEnding, result.endingCalculated); // no commissary adjustments layer yet
  assert.strictEqual(result.actual, 14.5);
  assert.ok(Math.abs(result.variance - (-4.0)) < 0.0001, `expected ~-4.0, got ${result.variance}`);
  assert.strictEqual(result.unexplainedVariance, result.variance);
  assert.strictEqual(result.status, 'SURPLUS');
});

test('day 2: beginning stock carries forward from day 1 actual ending automatically', () => {
  db.prepare('INSERT INTO commissary_stock_receipts (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(jowlId, '2026-08-02', 2.0);
  db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out) VALUES (?, ?, ?, ?)')
    .run(jowlId, '2026-08-02', 1.0, 0.8);
  db.prepare('INSERT INTO commissary_shipments (commissary_meat_id, restaurant_id, business_date, total_quantity) VALUES (?, ?, ?, ?)')
    .run(jowlId, restaurantA, '2026-08-02', 4.0);
  // beginning=14.5 (day1 actual), stockIn=2.0, backedUp=0.8,
  // usage = shipments(4.0) + yield debit(1.0, this day's raw_weight_in) = 5.0
  // -> endingCalculated = 14.5 + 2.0 + 0.8 - 5.0 = 12.3
  db.prepare('INSERT INTO commissary_ending_actual (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(jowlId, '2026-08-02', 13.0);

  const result = computeCommissaryMeatAudit(db, jowlId, '2026-08-02');
  assert.strictEqual(result.beginning, 14.5); // day 1's ACTUAL ending, not calculated
  assert.strictEqual(result.stockIn, 2.0);
  assert.ok(Math.abs(result.backedUp - 0.8) < 0.0001);
  assert.ok(Math.abs(result.usage - 5.0) < 0.0001, `expected 4.0 + 1.0 = 5.0, got ${result.usage}`);
  assert.ok(Math.abs(result.endingCalculated - 12.3) < 0.0001, `expected ~12.3, got ${result.endingCalculated}`);
  assert.strictEqual(result.actual, 13.0);
  assert.ok(Math.abs(result.variance - (-0.7)) < 0.0001, `expected ~-0.7, got ${result.variance}`);
  assert.strictEqual(result.status, 'SURPLUS'); // negative variance = surplus (rule 12)
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
  assert.strictEqual(jowlRow.status, 'SURPLUS'); // reuses day-1 scenario above (now debits yield raw input too)
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

// Step 23b-v: a second commissary, added here (after every test above that
// asserts an exact unfiltered row count) rather than up top with the rest
// of the fixtures, so it doesn't shift any already-asserted count.
db.prepare(`INSERT INTO commissaries (code, name) VALUES ('COM-B', 'Commissary B')`).run();
const commissaryBId = db.prepare(`SELECT id FROM commissaries WHERE code = 'COM-B'`).get().id;
db.prepare('INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?, ?)')
  .run(commissaryBId, 'M01', 'Beef Cut', 'kg', 0.20);
const beefCutId = db.prepare('SELECT id FROM commissary_meats WHERE commissary_id = ? AND code = ?').get(commissaryBId, 'M01').id;

test('computeCommissaryDailyAudit with no commissaryId still lists every active meat across every commissary, unchanged, now that a second commissary exists', () => {
  const rows = computeCommissaryDailyAudit(db, '2026-08-01');
  assert.strictEqual(rows.length, 3); // JOWL + Belly Slab (Commissary A) + Beef Cut (Commissary B)
});

test('computeCommissaryDailyAudit filters to only Commissary A\'s meats when given its commissaryId', () => {
  const rows = computeCommissaryDailyAudit(db, '2026-08-01', null, commissaryId);
  assert.strictEqual(rows.length, 2);
  assert.ok(rows.every(r => r.commissary_meat_id !== beefCutId), 'Commissary B\'s meat must not appear');
});

test('computeCommissaryDailyAudit filters to only Commissary B\'s meat when given its commissaryId', () => {
  const rows = computeCommissaryDailyAudit(db, '2026-08-01', null, commissaryBId);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].commissary_meat_id, beefCutId);
});

test('combining commissaryMeatId with a commissaryId it does not belong to returns nothing, not an error', () => {
  const rows = computeCommissaryDailyAudit(db, '2026-08-01', jowlId, commissaryBId);
  assert.strictEqual(rows.length, 0);
});

test('combining commissaryMeatId with the commissaryId it actually belongs to returns exactly that meat', () => {
  const rows = computeCommissaryDailyAudit(db, '2026-08-01', jowlId, commissaryId);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].commissary_meat_id, jowlId);
});

// Step 24a: output_commissary_meat_id debit/credit ledger cases. New
// commissary meats + an unused business_date range, so these don't shift
// any row-count/status assertion above.
db.prepare('INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?, ?)')
  .run(commissaryId, 'M10', 'Raw Test Input', 'unit', 0.20);
const rawInputId = db.prepare('SELECT id FROM commissary_meats WHERE commissary_id = ? AND code = ?').get(commissaryId, 'M10').id;
db.prepare('INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?, ?)')
  .run(commissaryId, 'M11', 'Processed Test Output', 'kg', 0.20);
const processedOutputId = db.prepare('SELECT id FROM commissary_meats WHERE commissary_id = ? AND code = ?').get(commissaryId, 'M11').id;

test('cross-row yield event debits the input meat and credits the output meat, not the same row', () => {
  db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, output_commissary_meat_id, business_date, raw_weight_in, backed_weight_out) VALUES (?, ?, ?, ?, ?)')
    .run(rawInputId, processedOutputId, '2026-08-10', 6.0, 4.5);

  const inputUsage = getCommissaryUsage(db, rawInputId, '2026-08-10');
  const inputBackedUp = getCommissaryBackedUp(db, rawInputId, '2026-08-10');
  const outputUsage = getCommissaryUsage(db, processedOutputId, '2026-08-10');
  const outputBackedUp = getCommissaryBackedUp(db, processedOutputId, '2026-08-10');

  assert.ok(Math.abs(inputUsage - 6.0) < 0.0001, `input debit expected 6.0, got ${inputUsage}`);
  assert.strictEqual(inputBackedUp, 0, 'input meat gets no credit - output_commissary_meat_id redirected it');
  assert.strictEqual(outputUsage, 0, 'output meat is not itself debited by this row');
  assert.ok(Math.abs(outputBackedUp - 4.5) < 0.0001, `output credit expected 4.5, got ${outputBackedUp}`);
});

test('cross-unit yield event: unit in, kg out - each side reads its own row unit and never reconciles', () => {
  db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, output_commissary_meat_id, business_date, raw_weight_in, backed_weight_out) VALUES (?, ?, ?, ?, ?)')
    .run(rawInputId, processedOutputId, '2026-08-11', 10.0, 7.2);

  const inputUsage = getCommissaryUsage(db, rawInputId, '2026-08-11');       // read as "unit"
  const outputBackedUp = getCommissaryBackedUp(db, processedOutputId, '2026-08-11'); // read as "kg"

  assert.ok(Math.abs(inputUsage - 10.0) < 0.0001, `expected raw_weight_in=10.0 read as-is, got ${inputUsage}`);
  assert.ok(Math.abs(outputBackedUp - 7.2) < 0.0001, `expected backed_weight_out=7.2 read as-is, got ${outputBackedUp}`);
  // No conversion between the two units happens anywhere in the engine -
  // each side is just its own row's column, summed in its own row's unit.
});

test('a soft-deleted yield row is excluded from both the input debit and the output credit', () => {
  db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, output_commissary_meat_id, business_date, raw_weight_in, backed_weight_out, deleted_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(rawInputId, processedOutputId, '2026-08-12', 50.0, 40.0, '2026-08-12T09:00:00Z');

  const inputUsage = getCommissaryUsage(db, rawInputId, '2026-08-12');
  const outputBackedUp = getCommissaryBackedUp(db, processedOutputId, '2026-08-12');

  assert.strictEqual(inputUsage, 0, 'soft-deleted row must not debit the input meat');
  assert.strictEqual(outputBackedUp, 0, 'soft-deleted row must not credit the output meat');
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
