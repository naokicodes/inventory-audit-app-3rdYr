// Tests for the commissary audit engine (step 20b, session-status.md),
// using a real seeded scenario (commissary JOWL shipped to two
// restaurants) and hand-calculated expected values. Same approach as
// auditEngine.test.js - plain script, real node:sqlite DB, no framework.
//
// Step 24a-b (test isolation, 2026-09-02): every test below is
// self-contained - it creates its own dedicated commissary_meat (or, for
// the pure catalog/listing tests, reuses only the shared restaurants/
// commissaries/jowlId/bellyId fixtures that no test writes balance data
// onto by default) and uses business dates no other test touches.
// Deleting, reordering, or running any single test alone must not change
// another test's expected numbers. Restaurants/commissaries/commissary
// catalog rows are shared read-only reference data, not balance state, so
// reusing them across tests is fine - the isolation problem this fixes is
// specifically about shared *balance* rows (stock receipts, yield log,
// shipments, ending_actual/opening_stock).
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
  getCommissaryAdjustmentsTotal,
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

// --- Shared reference fixtures: restaurants, one commissary, and the two ---
// --- catalog meats used by the listing/filtering tests below. No test ---
// --- writes stock/yield/shipment/actual rows onto jowlId or bellyId ---
// --- except the one test that explicitly says so, self-contained. ---
db.prepare('INSERT INTO restaurants (name, code) VALUES (?, ?)').run('Restaurant A', 'RA');
db.prepare('INSERT INTO restaurants (name, code) VALUES (?, ?)').run('Restaurant B', 'RB');
const restaurantA = db.prepare('SELECT id FROM restaurants WHERE code = ?').get('RA').id;
const restaurantB = db.prepare('SELECT id FROM restaurants WHERE code = ?').get('RB').id;

db.prepare(`INSERT INTO commissaries (code, name) VALUES ('COM-A', 'Commissary A')`).run();
const commissaryId = db.prepare(`SELECT id FROM commissaries WHERE code = 'COM-A'`).get().id;

db.prepare('INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?, ?)')
  .run(commissaryId, 'M05', 'JOWL', 'kg', 0.20);
const jowlId = db.prepare('SELECT id FROM commissary_meats WHERE code = ?').get('M05').id;

// A second commissary meat, used only for the daily-audit list/filter tests
db.prepare('INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?, ?)')
  .run(commissaryId, 'M03', 'Belly Slab', 'kg', 0.25);
const bellyId = db.prepare('SELECT id FROM commissary_meats WHERE code = ?').get('M03').id;

console.log('Commissary Audit Engine Tests\n');

test('a meat with no opening_stock and no prior ending_actual -> MISSING_BEGINNING_STOCK', () => {
  const result = computeCommissaryMeatAudit(db, bellyId, '2026-08-01');
  assert.strictEqual(result.beginning, null);
  assert.strictEqual(result.status, 'MISSING_BEGINNING_STOCK');
  assert.strictEqual(result.endingCalculated, null);
});

test('computeCommissaryDailyAudit lists every active commissary meat for a date', () => {
  // Self-contained: gives jowlId its own opening_stock/ending_actual right
  // here rather than relying on any other test to have computed a status
  // for it. beginning=10 (opening), no other inflow/outflow, actual=10
  // -> endingCalculated=10, variance=0 -> OK.
  db.prepare('INSERT INTO commissary_opening_stock (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(jowlId, '2026-08-01', 10.0);
  db.prepare('INSERT INTO commissary_ending_actual (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(jowlId, '2026-08-01', 10.0);

  const rows = computeCommissaryDailyAudit(db, '2026-08-01');
  assert.strictEqual(rows.length, 2); // JOWL + Belly Slab
  const jowlRow = rows.find(r => r.code === 'M05');
  const bellyRow = rows.find(r => r.code === 'M03');
  assert.ok(jowlRow, 'expected a JOWL row');
  assert.ok(bellyRow, 'expected a Belly Slab row');
  assert.strictEqual(jowlRow.status, 'OK');
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

// --- Step 24a-b: standalone balance/getter tests below this point each ---
// --- get their own dedicated commissary_meat, positioned after every ---
// --- row-count assertion above (same placement reasoning as the M10/M11 ---
// --- block further down) so these new active commissary_meats rows can't ---
// --- shift an already-asserted catalog count. ---

db.prepare('INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?, ?)')
  .run(commissaryId, 'T01', 'Getter Test Meat', 'kg', 0.20);
const getterTestMeatId = db.prepare('SELECT id FROM commissary_meats WHERE commissary_id = ? AND code = ?').get(commissaryId, 'T01').id;

test('getCommissaryStockIn sums commissary_stock_receipts for the meat/date', () => {
  db.prepare('INSERT INTO commissary_stock_receipts (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(getterTestMeatId, '2026-09-01', 5.0);
  const stockIn = getCommissaryStockIn(db, getterTestMeatId, '2026-09-01');
  assert.strictEqual(stockIn, 5.0);
});

test('getCommissaryBackedUp sums commissary_yield_log.backed_weight_out, excludes soft-deleted rows', () => {
  db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out) VALUES (?, ?, ?, ?)')
    .run(getterTestMeatId, '2026-09-02', 4.0, 3.0);
  db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out, deleted_at) VALUES (?, ?, ?, ?, ?)')
    .run(getterTestMeatId, '2026-09-02', 100.0, 90.0, '2026-09-02T12:00:00Z');
  const backedUp = getCommissaryBackedUp(db, getterTestMeatId, '2026-09-02');
  assert.strictEqual(backedUp, 3.0);
});

test('getCommissaryUsage sums commissary_shipments AND debits commissary_yield_log.raw_weight_in for this meat as input', () => {
  db.prepare('INSERT INTO commissary_shipments (commissary_meat_id, restaurant_id, business_date, total_quantity) VALUES (?, ?, ?, ?)')
    .run(getterTestMeatId, restaurantA, '2026-09-03', 2.0);
  db.prepare('INSERT INTO commissary_shipments (commissary_meat_id, restaurant_id, business_date, total_quantity) VALUES (?, ?, ?, ?)')
    .run(getterTestMeatId, restaurantB, '2026-09-03', 1.5);
  db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out) VALUES (?, ?, ?, ?)')
    .run(getterTestMeatId, '2026-09-03', 4.0, 3.0);
  const usage = getCommissaryUsage(db, getterTestMeatId, '2026-09-03');
  // shipments 2.0 + 1.5 = 3.5, plus this test's own yield row's
  // raw_weight_in = 4.0 (its own insert, not borrowed from another test)
  // => 3.5 + 4.0 = 7.5
  assert.ok(Math.abs(usage - 7.5) < 0.0001, `expected 3.5 + 4.0 = 7.5, got ${usage}`);
});

db.prepare('INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?, ?)')
  .run(commissaryId, 'T02', 'Day 1 Test Meat', 'kg', 0.20);
const day1MeatId = db.prepare('SELECT id FROM commissary_meats WHERE commissary_id = ? AND code = ?').get(commissaryId, 'T02').id;

test('day 1: beginning stock comes from commissary_opening_stock, not a prior commissary_ending_actual', () => {
  db.prepare('INSERT INTO commissary_opening_stock (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(day1MeatId, '2026-09-10', 10.0);
  db.prepare('INSERT INTO commissary_stock_receipts (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(day1MeatId, '2026-09-10', 5.0);
  db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out) VALUES (?, ?, ?, ?)')
    .run(day1MeatId, '2026-09-10', 4.0, 3.0);
  db.prepare('INSERT INTO commissary_shipments (commissary_meat_id, restaurant_id, business_date, total_quantity) VALUES (?, ?, ?, ?)')
    .run(day1MeatId, restaurantA, '2026-09-10', 3.5);
  db.prepare('INSERT INTO commissary_ending_actual (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(day1MeatId, '2026-09-10', 14.5);

  const result = computeCommissaryMeatAudit(db, day1MeatId, '2026-09-10');
  // Hand-calculated: beginning=10 (opening stock, no prior actual exists
  // for this brand-new meat), stockIn=5, backedUp=3 (this test's own yield
  // row's backed_weight_out), usage = shipments(3.5) + yield debit(4.0,
  // the same row's raw_weight_in) = 7.5
  // -> endingCalculated = 10 + 5 + 3 - 7.5 = 10.5. actual=14.5 -> surplus
  // (calculated is 4.0 less than actual - negative variance, rule 12).
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

db.prepare('INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?, ?)')
  .run(commissaryId, 'T03', 'Day 2 Test Meat', 'kg', 0.20);
const day2MeatId = db.prepare('SELECT id FROM commissary_meats WHERE commissary_id = ? AND code = ?').get(commissaryId, 'T03').id;

test('day 2: beginning stock carries forward from a prior day\'s actual ending automatically', () => {
  // The "prior day" actual is inserted directly, right here - self
  // contained, not dependent on any other test having computed/written it.
  db.prepare('INSERT INTO commissary_ending_actual (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(day2MeatId, '2026-09-10', 14.5);

  db.prepare('INSERT INTO commissary_stock_receipts (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(day2MeatId, '2026-09-11', 2.0);
  db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out) VALUES (?, ?, ?, ?)')
    .run(day2MeatId, '2026-09-11', 1.0, 0.8);
  db.prepare('INSERT INTO commissary_shipments (commissary_meat_id, restaurant_id, business_date, total_quantity) VALUES (?, ?, ?, ?)')
    .run(day2MeatId, restaurantA, '2026-09-11', 4.0);
  db.prepare('INSERT INTO commissary_ending_actual (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(day2MeatId, '2026-09-11', 13.0);

  const result = computeCommissaryMeatAudit(db, day2MeatId, '2026-09-11');
  // beginning=14.5 (the prior day's actual inserted above), stockIn=2.0,
  // backedUp=0.8, usage = shipments(4.0) + yield debit(1.0) = 5.0
  // -> endingCalculated = 14.5 + 2.0 + 0.8 - 5.0 = 12.3
  assert.strictEqual(result.beginning, 14.5);
  assert.strictEqual(result.stockIn, 2.0);
  assert.ok(Math.abs(result.backedUp - 0.8) < 0.0001);
  assert.ok(Math.abs(result.usage - 5.0) < 0.0001, `expected 4.0 + 1.0 = 5.0, got ${result.usage}`);
  assert.ok(Math.abs(result.endingCalculated - 12.3) < 0.0001, `expected ~12.3, got ${result.endingCalculated}`);
  assert.strictEqual(result.actual, 13.0);
  assert.ok(Math.abs(result.variance - (-0.7)) < 0.0001, `expected ~-0.7, got ${result.variance}`);
  assert.strictEqual(result.status, 'SURPLUS'); // negative variance = surplus (rule 12)
});

db.prepare('INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?, ?)')
  .run(commissaryId, 'T04', 'Day 3 Test Meat', 'kg', 0.20);
const day3MeatId = db.prepare('SELECT id FROM commissary_meats WHERE commissary_id = ? AND code = ?').get(commissaryId, 'T04').id;

test('surplus case: actual higher than expected gives negative variance', () => {
  // Prior day's actual, inserted directly (self-contained).
  db.prepare('INSERT INTO commissary_ending_actual (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(day3MeatId, '2026-09-10', 13.0);
  // No inflows/usage today - beginning=13.0 carries as-is.
  db.prepare('INSERT INTO commissary_ending_actual (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(day3MeatId, '2026-09-11', 15.0);

  const result = computeCommissaryMeatAudit(db, day3MeatId, '2026-09-11');
  assert.strictEqual(result.beginning, 13.0);
  assert.strictEqual(result.stockIn, 0);
  assert.strictEqual(result.backedUp, 0);
  assert.strictEqual(result.usage, 0);
  assert.strictEqual(result.endingCalculated, 13.0);
  assert.ok(result.variance < 0, 'surplus should be negative');
  assert.strictEqual(result.status, 'SURPLUS');
});

db.prepare('INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?, ?)')
  .run(commissaryId, 'T05', 'Day 4 Test Meat', 'kg', 0.20);
const day4MeatId = db.prepare('SELECT id FROM commissary_meats WHERE commissary_id = ? AND code = ?').get(commissaryId, 'T05').id;

test('missing actual count is flagged, not silently treated as zero variance', () => {
  // Prior day's actual, inserted directly (self-contained).
  db.prepare('INSERT INTO commissary_ending_actual (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(day4MeatId, '2026-09-10', 15.0);
  db.prepare('INSERT INTO commissary_stock_receipts (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(day4MeatId, '2026-09-11', 3.0);

  const result = computeCommissaryMeatAudit(db, day4MeatId, '2026-09-11');
  assert.strictEqual(result.beginning, 15.0); // carried from the prior day's actual above
  assert.strictEqual(result.stockIn, 3.0);
  assert.strictEqual(result.actual, null);
  assert.strictEqual(result.status, 'MISSING_ACTUAL_COUNT');
  assert.strictEqual(result.variance, null);
});

// Step 24a: output_commissary_meat_id debit/credit ledger cases. New
// commissary meats + an unused business_date range, so these don't shift
// any row-count/status assertion above. Already self-contained per test
// (the pattern generalized to the rest of the file above, in 24a-b).
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

// Step 24b-i: input_quantity debit cases. New commissary meats + an unused
// business_date range, same self-contained pattern as 24a above.
db.prepare('INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?, ?)')
  .run(commissaryId, 'M12', 'Belly Test Input', 'kg', 0.20);
const bellyInputId = db.prepare('SELECT id FROM commissary_meats WHERE commissary_id = ? AND code = ?').get(commissaryId, 'M12').id;
db.prepare('INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?, ?)')
  .run(commissaryId, 'M13', 'Chicken Test Input', 'unit', 0.20);
const chickenInputId = db.prepare('SELECT id FROM commissary_meats WHERE commissary_id = ? AND code = ?').get(commissaryId, 'M13').id;

test('NULL input_quantity debits raw_weight_in exactly as before (back-compat)', () => {
  db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out) VALUES (?, ?, ?, ?)')
    .run(bellyInputId, '2026-08-13', 32.5, 30.0);

  const usage = getCommissaryUsage(db, bellyInputId, '2026-08-13');
  assert.ok(Math.abs(usage - 32.5) < 0.0001, `expected raw_weight_in=32.5 fallback, got ${usage}`);
});

test('a set input_quantity debits that instead of raw_weight_in', () => {
  db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, business_date, input_quantity, raw_weight_in, backed_weight_out) VALUES (?, ?, ?, ?, ?)')
    .run(chickenInputId, '2026-08-14', 40, 32.5, 30.0);

  const usage = getCommissaryUsage(db, chickenInputId, '2026-08-14');
  assert.ok(Math.abs(usage - 40) < 0.0001, `expected input_quantity=40, got ${usage}`);
});

test('unit-in/kg-out row debits the count from the input while crediting the weighed output to the output meat', () => {
  db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, output_commissary_meat_id, business_date, input_quantity, raw_weight_in, backed_weight_out) VALUES (?, ?, ?, ?, ?, ?)')
    .run(chickenInputId, bellyInputId, '2026-08-15', 40, 32.5, 30.0);

  const inputUsage = getCommissaryUsage(db, chickenInputId, '2026-08-15');
  const outputBackedUp = getCommissaryBackedUp(db, bellyInputId, '2026-08-15');

  assert.ok(Math.abs(inputUsage - 40) < 0.0001, `expected input count=40 debited, got ${inputUsage}`);
  assert.ok(Math.abs(outputBackedUp - 30.0) < 0.0001, `expected weighed output=30.0 credited, got ${outputBackedUp}`);
});

// Step 24b-ii: commissary_adjustments (LOSS/ALLOCATION). New commissary
// meats + an unused business_date range, same self-contained pattern as
// 24a/24b-i above.
db.prepare('INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?, ?)')
  .run(commissaryId, 'M20', 'Allocation Source', 'kg', 0.20);
const allocSourceId = db.prepare('SELECT id FROM commissary_meats WHERE commissary_id = ? AND code = ?').get(commissaryId, 'M20').id;
db.prepare('INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?, ?)')
  .run(commissaryId, 'M21', 'Allocation Destination', 'kg', 0.20);
const allocDestId = db.prepare('SELECT id FROM commissary_meats WHERE commissary_id = ? AND code = ?').get(commissaryId, 'M21').id;

test('an ALLOCATION debits the source and credits the destination - both balances reflect it', () => {
  db.prepare(`INSERT INTO commissary_adjustments (commissary_meat_id, business_date, kind, quantity, destination_commissary_meat_id) VALUES (?, ?, 'ALLOCATION', ?, ?)`)
    .run(allocSourceId, '2026-08-20', 5.0, allocDestId);

  const sourceUsage = getCommissaryUsage(db, allocSourceId, '2026-08-20');
  const destBackedUp = getCommissaryBackedUp(db, allocDestId, '2026-08-20');
  assert.ok(Math.abs(sourceUsage - 5.0) < 0.0001, `source debit expected 5.0, got ${sourceUsage}`);
  assert.ok(Math.abs(destBackedUp - 5.0) < 0.0001, `destination credit expected 5.0, got ${destBackedUp}`);

  db.prepare('INSERT INTO commissary_opening_stock (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(allocSourceId, '2026-08-20', 20.0);
  db.prepare('INSERT INTO commissary_ending_actual (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(allocSourceId, '2026-08-20', 15.0);
  const sourceAudit = computeCommissaryMeatAudit(db, allocSourceId, '2026-08-20');
  // beginning=20, usage=5 (the allocation debit) -> endingCalculated=15, matches actual=15
  assert.ok(Math.abs(sourceAudit.endingCalculated - 15.0) < 0.0001, `expected 15.0, got ${sourceAudit.endingCalculated}`);
  assert.strictEqual(sourceAudit.status, 'OK');

  db.prepare('INSERT INTO commissary_opening_stock (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(allocDestId, '2026-08-20', 0.0);
  db.prepare('INSERT INTO commissary_ending_actual (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(allocDestId, '2026-08-20', 5.0);
  const destAudit = computeCommissaryMeatAudit(db, allocDestId, '2026-08-20');
  // beginning=0, backedUp=5 (the allocation credit) -> endingCalculated=5, matches actual=5
  assert.ok(Math.abs(destAudit.endingCalculated - 5.0) < 0.0001, `expected 5.0, got ${destAudit.endingCalculated}`);
  assert.strictEqual(destAudit.status, 'OK');
});

test('a soft-deleted ALLOCATION affects neither the source debit nor the destination credit', () => {
  db.prepare(`INSERT INTO commissary_adjustments (commissary_meat_id, business_date, kind, quantity, destination_commissary_meat_id, deleted_at) VALUES (?, ?, 'ALLOCATION', ?, ?, ?)`)
    .run(allocSourceId, '2026-08-21', 100.0, allocDestId, '2026-08-21T09:00:00Z');

  const sourceUsage = getCommissaryUsage(db, allocSourceId, '2026-08-21');
  const destBackedUp = getCommissaryBackedUp(db, allocDestId, '2026-08-21');
  assert.strictEqual(sourceUsage, 0, 'soft-deleted allocation must not debit the source');
  assert.strictEqual(destBackedUp, 0, 'soft-deleted allocation must not credit the destination');
});

db.prepare('INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?, ?)')
  .run(commissaryId, 'M22', 'Loss Test Meat', 'kg', 0.20);
const lossMeatId = db.prepare('SELECT id FROM commissary_meats WHERE commissary_id = ? AND code = ?').get(commissaryId, 'M22').id;

test('a LOSS leaves variance unchanged but drives unexplainedVariance to zero', () => {
  db.prepare('INSERT INTO commissary_opening_stock (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(lossMeatId, '2026-08-22', 10.0);
  db.prepare(`INSERT INTO commissary_adjustments (commissary_meat_id, business_date, kind, quantity) VALUES (?, ?, 'LOSS', ?)`)
    .run(lossMeatId, '2026-08-22', 3.0);
  db.prepare('INSERT INTO commissary_ending_actual (commissary_meat_id, business_date, quantity) VALUES (?, ?, ?)')
    .run(lossMeatId, '2026-08-22', 7.0);

  const result = computeCommissaryMeatAudit(db, lossMeatId, '2026-08-22');
  // beginning=10, no other movement -> endingCalculated=10. actual=7.
  // variance = 10 - 7 = 3 (unaffected by the declared loss - stays visible).
  // expectedEnding = 10 - 3 (adjustments) = 7 -> unexplainedVariance = 0.
  assert.strictEqual(result.endingCalculated, 10.0);
  assert.strictEqual(result.adjustments, 3.0);
  assert.ok(Math.abs(result.variance - 3.0) < 0.0001, `variance expected 3.0 (unchanged), got ${result.variance}`);
  assert.ok(Math.abs(result.expectedEnding - 7.0) < 0.0001, `expectedEnding expected 7.0, got ${result.expectedEnding}`);
  assert.ok(Math.abs(result.unexplainedVariance) < 0.0001, `unexplainedVariance expected 0, got ${result.unexplainedVariance}`);
  assert.strictEqual(result.status, 'OK');
});

test('a soft-deleted LOSS does not reduce expectedEnding', () => {
  db.prepare(`INSERT INTO commissary_adjustments (commissary_meat_id, business_date, kind, quantity, deleted_at) VALUES (?, ?, 'LOSS', ?, ?)`)
    .run(lossMeatId, '2026-08-23', 50.0, '2026-08-23T09:00:00Z');

  const adjustments = getCommissaryAdjustmentsTotal(db, lossMeatId, '2026-08-23');
  assert.strictEqual(adjustments, 0, 'soft-deleted loss must not count toward adjustments');
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
