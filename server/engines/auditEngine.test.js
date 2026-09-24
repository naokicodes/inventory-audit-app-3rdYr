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
  getNewStock,
  addDays,
  computeDishAudit,
  computeMixedDailyAudit,
  getBeginningStock
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
  db.prepare('INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source) VALUES (?, ?, ?, ?, ?)')
    .run(restaurantId, meatId, '2026-08-01', 5.0, 'DIRECT');
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
  db.prepare('INSERT INTO ending_actual (restaurant_id, meat_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, meatId, '2026-08-02', 13.46);

  const result = computeMeatAudit(db, restaurantId, meatId, '2026-08-02');
  assert.strictEqual(result.beginning, 14.0); // day 1's ACTUAL ending, not calculated
  assert.strictEqual(result.usage, 0.54);
  assert.ok(Math.abs(result.endingCalculated - 13.46) < 0.0001);
  assert.strictEqual(result.status, 'OK');
});

test('surplus case: actual higher than expected gives negative variance', () => {
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
  db.prepare('INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source) VALUES (?, ?, ?, ?, ?)')
    .run(restaurantId, meatId, '2026-08-05', 2.0, 'DIRECT');
  const result = computeMeatAudit(db, restaurantId, meatId, '2026-08-05');
  assert.strictEqual(result.actual, null);
  assert.strictEqual(result.status, 'MISSING_ACTUAL_COUNT');
  assert.strictEqual(result.variance, null);
});

test('getNewStock sums two receipts on the same meat/day (DIRECT + COMMISSARY)', () => {
  db.prepare('INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source) VALUES (?, ?, ?, ?, ?)')
    .run(restaurantId, meatId, '2026-08-06', 4.0, 'DIRECT');
  db.prepare('INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source) VALUES (?, ?, ?, ?, ?)')
    .run(restaurantId, meatId, '2026-08-06', 2.5, 'COMMISSARY');

  const newStock = getNewStock(db, restaurantId, meatId, '2026-08-06');
  assert.ok(Math.abs(newStock - 6.5) < 0.0001, `expected 4.0 + 2.5 = 6.5, got ${newStock}`);
});

test('getNewStock excludes soft-deleted receipts from the SUM', () => {
  db.prepare('INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source, deleted_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(restaurantId, meatId, '2026-08-06', 100.0, 'DIRECT', '2026-08-06T12:00:00Z');

  const newStock = getNewStock(db, restaurantId, meatId, '2026-08-06');
  assert.ok(Math.abs(newStock - 6.5) < 0.0001, `deleted receipt should not count, expected still 6.5, got ${newStock}`);
});

// --- Step 10: computeDishAudit / computeMixedDailyAudit ---
// Reuses dishId (D003, Bagnet Sisig, BATCH_PREPPED) but its own dates
// (2026-08-09 onward) so these don't collide with the meat-side prepped
// rows already inserted above for 2026-08-01/02.

test('dish audit: no prior portion_ending_actual -> MISSING_BEGINNING_STOCK', () => {
  const result = computeDishAudit(db, restaurantId, dishId, '2026-08-10');
  assert.strictEqual(result.portionBeginning, null);
  assert.strictEqual(result.status, 'MISSING_BEGINNING_STOCK');
});

test('dish audit: portion_beginning carries from prior day portion_ending_actual', () => {
  db.prepare('INSERT INTO portion_ending_actual (restaurant_id, dish_id, business_date, portions_counted) VALUES (?, ?, ?, ?)')
    .run(restaurantId, dishId, '2026-08-09', 20);
  db.prepare('INSERT INTO prepped (restaurant_id, dish_id, business_date, portions_produced) VALUES (?, ?, ?, ?)')
    .run(restaurantId, dishId, '2026-08-10', 10);
  db.prepare('INSERT INTO sales (restaurant_id, dish_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, dishId, '2026-08-10', 12);
  db.prepare('INSERT INTO portion_ending_actual (restaurant_id, dish_id, business_date, portions_counted) VALUES (?, ?, ?, ?)')
    .run(restaurantId, dishId, '2026-08-10', 18);

  const result = computeDishAudit(db, restaurantId, dishId, '2026-08-10');
  // Hand-calculated: beginning=20, prepped=10, sold=12 -> ending calc = 18
  assert.strictEqual(result.portionBeginning, 20);
  assert.strictEqual(result.prepped, 10);
  assert.strictEqual(result.sold, 12);
  assert.strictEqual(result.portionEndingCalculated, 18);
  assert.strictEqual(result.portionActual, 18);
  assert.ok(Math.abs(result.portionVariance) < 0.0001);
  assert.strictEqual(result.status, 'OK');
});

test('dish audit: shortage case (positive variance) on a second consecutive day', () => {
  db.prepare('INSERT INTO prepped (restaurant_id, dish_id, business_date, portions_produced) VALUES (?, ?, ?, ?)')
    .run(restaurantId, dishId, '2026-08-11', 5);
  db.prepare('INSERT INTO sales (restaurant_id, dish_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, dishId, '2026-08-11', 3);
  db.prepare('INSERT INTO portion_ending_actual (restaurant_id, dish_id, business_date, portions_counted) VALUES (?, ?, ?, ?)')
    .run(restaurantId, dishId, '2026-08-11', 19);

  const result = computeDishAudit(db, restaurantId, dishId, '2026-08-11');
  // beginning=18 (from 08-10 actual), prepped=5, sold=3 -> calc=20, actual=19 -> variance=1
  assert.strictEqual(result.portionBeginning, 18);
  assert.strictEqual(result.portionEndingCalculated, 20);
  assert.ok(Math.abs(result.portionVariance - 1) < 0.0001);
  assert.strictEqual(result.status, 'SHORTAGE');
});

test('dish audit: missing actual count is flagged, not treated as zero variance', () => {
  const result = computeDishAudit(db, restaurantId, dishId, '2026-08-12');
  assert.strictEqual(result.portionBeginning, 19); // carried from 08-11 actual
  assert.strictEqual(result.portionActual, null);
  assert.strictEqual(result.portionVariance, null);
  assert.strictEqual(result.status, 'MISSING_ACTUAL_COUNT');
});

test('dish audit: a gap day with no actual breaks the beginning-stock chain for the next day', () => {
  // 2026-08-12 above had no portion_ending_actual entered, so 08-13's
  // lookup at 08-12 finds nothing - same missing-chain behavior as the
  // meat side's opening-stock gap (session-status.md step 12).
  const result = computeDishAudit(db, restaurantId, dishId, '2026-08-13');
  assert.strictEqual(result.portionBeginning, null);
  assert.strictEqual(result.status, 'MISSING_BEGINNING_STOCK');
});

test('mixed daily audit: tags meats and BATCH_PREPPED dishes, excludes DIRECT dishes', () => {
  db.prepare('INSERT INTO dishes (restaurant_id, dish_code, name, prep_type) VALUES (?, ?, ?, ?)')
    .run(restaurantId, 'D010', 'A La Carte Item', 'DIRECT');

  const rows = computeMixedDailyAudit(db, restaurantId, '2026-08-10');
  const meatRows = rows.filter(r => r.type === 'MEAT');
  const dishRows = rows.filter(r => r.type === 'DISH');

  assert.strictEqual(meatRows.length, 1);
  assert.strictEqual(meatRows[0].code, 'M03');
  assert.strictEqual(meatRows[0].item_id, meatId);

  assert.strictEqual(dishRows.length, 1); // D003 only - D010 is DIRECT, excluded
  assert.strictEqual(dishRows[0].code, 'D003');
  assert.strictEqual(dishRows[0].item_id, dishId);
  assert.strictEqual(dishRows[0].portionEndingCalculated, 18); // reuses 08-10 scenario above
});

// --- Step 26a: date-scoped opening_stock, carry-forward, recount difference ---
// A dedicated meat (M04) so this chain is fully isolated from the
// scenarios above - carry-forward depends on the meat's entire history,
// not just one date.
db.prepare('INSERT INTO meats (restaurant_id, meat_code, name, unit) VALUES (?, ?, ?, ?)')
  .run(restaurantId, 'M04', 'Pork Belly', 'kg');
const carryMeatId = db.prepare('SELECT id FROM meats WHERE meat_code = ?').get('M04').id;

console.log('\nStep 26a: date-scoped opening stock, carry-forward, recount difference\n');

test('a normal day (declared opening for THIS date, no prior chain): daysCovered=1, not carried, no recount difference', () => {
  db.prepare('INSERT INTO opening_stock (restaurant_id, meat_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, carryMeatId, '2026-09-28', 100);

  const result = computeMeatAudit(db, restaurantId, carryMeatId, '2026-09-28');
  assert.strictEqual(result.beginning, 100);
  assert.strictEqual(result.daysCovered, 1);
  assert.strictEqual(result.beginningCarried, false);
  assert.strictEqual(result.recountDifference, null);
});

test('a normal day (yesterday has an actual): daysCovered=1, not carried', () => {
  db.prepare('INSERT INTO ending_actual (restaurant_id, meat_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, carryMeatId, '2026-09-28', 90); // counted at 90, chain resets here

  const result = computeMeatAudit(db, restaurantId, carryMeatId, '2026-09-29');
  assert.strictEqual(result.beginning, 90);
  assert.strictEqual(result.daysCovered, 1);
  assert.strictEqual(result.beginningCarried, false);
});

test('spec example: counted Sept 28 (90), uncounted 29-Oct 2, counted Oct 3 -> daysCovered=5, beginningCarried=true, Over/Short covers all 5 days', () => {
  // Sept 29 - Oct 2: no activity at all (no receipts/usage), no actual entered.
  const uncountedDay = computeMeatAudit(db, restaurantId, carryMeatId, '2026-09-30');
  assert.strictEqual(uncountedDay.beginning, 90, 'no flows on any uncounted day so far, beginning stays 90');
  assert.strictEqual(uncountedDay.beginningCarried, true);
  assert.strictEqual(uncountedDay.daysCovered, 2, 'Sept 29 (1) + Sept 30 (2) - reported even though Sept 30 itself has no actual yet');
  assert.strictEqual(uncountedDay.status, 'MISSING_ACTUAL_COUNT');

  // Step 26a-ii: October has no opening yet, so every October day is
  // blocked. The October recount happens on Oct 10 (declared 80); any
  // opening dated in October unblocks all of October, and the days before
  // it still chain from September. The recount-difference test below
  // reads that same Oct 10 opening.
  assert.strictEqual(computeMeatAudit(db, restaurantId, carryMeatId, '2026-10-03').status, 'MISSING_PERIOD_OPENING');
  db.prepare('INSERT INTO opening_stock (restaurant_id, meat_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, carryMeatId, '2026-10-10', 80);

  db.prepare('INSERT INTO ending_actual (restaurant_id, meat_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, carryMeatId, '2026-10-03', 90); // exact match, no further variance

  const result = computeMeatAudit(db, restaurantId, carryMeatId, '2026-10-03');
  assert.strictEqual(result.beginning, 90, 'no new_stock/usage anywhere in the carried window');
  assert.strictEqual(result.beginningCarried, true);
  assert.strictEqual(result.daysCovered, 5, 'Sept 29, 30, Oct 1, 2 (carried) + Oct 3 (today)');
  assert.strictEqual(result.status, 'OK');
});

test('an adjustment dated on a carried (uncounted) day is still picked up by the count day\'s window sum', () => {
  const typeId = db.prepare('SELECT id FROM adjustment_types WHERE name = ?').get('Wastage').id;
  // Same chain as above, next segment: Oct 4-6 uncounted, an adjustment
  // logged for Oct 5 (a day with no variance of its own), counted Oct 7.
  db.prepare('INSERT INTO adjustments (restaurant_id, meat_id, business_date, quantity, adjustment_type_id) VALUES (?, ?, ?, ?, ?)')
    .run(restaurantId, carryMeatId, '2026-10-05', 3.0, typeId);
  db.prepare('INSERT INTO ending_actual (restaurant_id, meat_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, carryMeatId, '2026-10-07', 87); // 90 - 3 (unlogged shrinkage) = 87

  const result = computeMeatAudit(db, restaurantId, carryMeatId, '2026-10-07');
  assert.strictEqual(result.daysCovered, 4, 'Oct 4, 5, 6 (carried) + Oct 7 (today)');
  assert.strictEqual(result.endingCalculated, 90, 'no new_stock/usage - only the LOSS adjustment explains the gap');
  assert.strictEqual(result.variance, 3, 'raw variance unaffected by the window - endingCalculated(90) - actual(87)');
  assert.ok(Math.abs(result.unexplainedVariance) < 0.0001, 'the Oct 5 adjustment, picked up via the window sum, fully explains it');
  assert.strictEqual(result.status, 'OK', 'fully explained by the known adjustment, same as any other day');
});

test('recount difference (option A): a declared opening on a date with a prior chain adds the difference into that day\'s Over/Short, not earlier days', () => {
  // Chain continues from Oct 7's actual (87). Oct 8-9 uncounted, then the
  // recount on Oct 10 (declared in the spec-example test above) is 80 - 7
  // less than the chain expected.
  const result = computeMeatAudit(db, restaurantId, carryMeatId, '2026-10-10');
  assert.strictEqual(result.beginning, 80, 'the declared opening always wins for its own date');
  assert.strictEqual(result.recountDifference, 7, 'priorEnding (87, no flows since) - opening (80) = 7, a shortage found at the recount');
  assert.strictEqual(result.daysCovered, 3, 'Oct 8, 9 (carried) + Oct 10 (today) - the days the recount difference covers');

  db.prepare('INSERT INTO ending_actual (restaurant_id, meat_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, carryMeatId, '2026-10-10', 80); // no further variance beyond the recount itself

  const afterCount = computeMeatAudit(db, restaurantId, carryMeatId, '2026-10-10');
  assert.strictEqual(afterCount.endingCalculated, 80, 'today\'s own calc uses the declared 80 as beginning, no other flows');
  assert.strictEqual(afterCount.variance, 0, 'raw variance: endingCalculated(80) - actual(80)');
  assert.strictEqual(afterCount.unexplainedVariance, 7, 'the recount difference alone - "as if the recount never happened"');
  assert.strictEqual(afterCount.status, 'SHORTAGE');

  // Earlier days are untouched by this - Oct 7 still reads exactly as it did.
  const earlierDay = computeMeatAudit(db, restaurantId, carryMeatId, '2026-10-07');
  assert.ok(Math.abs(earlierDay.unexplainedVariance) < 0.0001, 'Oct 7 is unaffected by a recount three days later');
});

test('a declared opening with NO prior chain (onboarding, brand-new meat): recountDifference is null, daysCovered is 1', () => {
  db.prepare('INSERT INTO meats (restaurant_id, meat_code, name, unit) VALUES (?, ?, ?, ?)')
    .run(restaurantId, 'M05', 'Beef Tapa', 'kg');
  const freshMeatId = db.prepare('SELECT id FROM meats WHERE meat_code = ?').get('M05').id;

  db.prepare('INSERT INTO opening_stock (restaurant_id, meat_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, freshMeatId, '2026-09-15', 25);

  const result = computeMeatAudit(db, restaurantId, freshMeatId, '2026-09-15');
  assert.strictEqual(result.beginning, 25);
  assert.strictEqual(result.recountDifference, null, 'nothing to compare against - the opening simply starts the chain');
  assert.strictEqual(result.daysCovered, 1);
  assert.strictEqual(result.beginningCarried, false);
});

test('MISSING_BEGINNING_STOCK (no prior count, opening later in the month): daysCovered/beginningCarried/recountDifference report as null/false/null, not garbage', () => {
  db.prepare('INSERT INTO meats (restaurant_id, meat_code, name, unit) VALUES (?, ?, ?, ?)')
    .run(restaurantId, 'M06', 'Chicken Skin', 'kg');
  const neverSeededId = db.prepare('SELECT id FROM meats WHERE meat_code = ?').get('M06').id;

  // Step 26a-ii: with no opening at all the month is blocked, which is
  // checked first - MISSING_BEGINNING_STOCK is only reachable once the
  // month has an opening dated after this day.
  const blocked = computeMeatAudit(db, restaurantId, neverSeededId, '2026-09-20');
  assert.strictEqual(blocked.status, 'MISSING_PERIOD_OPENING');
  assert.strictEqual(blocked.daysCovered, null);
  assert.strictEqual(blocked.beginningCarried, false);
  assert.strictEqual(blocked.recountDifference, null);

  db.prepare('INSERT INTO opening_stock (restaurant_id, meat_id, business_date, quantity) VALUES (?, ?, ?, ?)')
    .run(restaurantId, neverSeededId, '2026-09-25', 10);
  const result = computeMeatAudit(db, restaurantId, neverSeededId, '2026-09-20');
  assert.strictEqual(result.status, 'MISSING_BEGINNING_STOCK');
  assert.strictEqual(result.daysCovered, null);
  assert.strictEqual(result.beginningCarried, false);
  assert.strictEqual(result.recountDifference, null);
});

test('getBeginningStock returns the full { value, carried, daysCovered, recountDifference } shape directly', () => {
  const info = getBeginningStock(db, restaurantId, carryMeatId, '2026-09-28');
  assert.strictEqual(info.value, 100);
  assert.strictEqual(info.carried, false);
  assert.strictEqual(info.daysCovered, 1);
  assert.strictEqual(info.recountDifference, null);
});

console.log(`\n${passed} passed, ${failed} failed`);

// Close the connection BEFORE deleting the file - Windows keeps a lock on
// the db file until the handle is explicitly closed (Linux releases it
// automatically at process exit, which is why this didn't show up during
// initial testing). Wrapped in try/catch as an extra safety net in case
// antivirus/indexing briefly holds the file on some machines.
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
