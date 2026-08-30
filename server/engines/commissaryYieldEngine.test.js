// Tests for the commissary yield engine, using real rows pulled from
// Commi_Audit_Master.xlsx's Yield_Log sheet and its own Allowed Leeway %
// values (from the Meats sheet), hand-verified against that sheet's own
// Actual Loss %, Status, and Excess Loss columns.
//
// Same template as server/engines/auditEngine.test.js: a plain script,
// not node:test (node:test + node:sqlite don't play well together as of
// this writing).
//
// Run with: node server/engines/commissaryYieldEngine.test.js
// Exits with code 0 if all pass, 1 if anything fails.

const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const {
  computeActualLossPct,
  computeYieldStatus,
  computeExcessLoss,
  computeYieldMetrics,
  computeYieldRow,
  computeYieldLogForDate,
  getCommissaryBalance,
  listCommissaryBalances
} = require('./commissaryYieldEngine.js');

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

const EPS = 0.005; // sheet's own Excess Loss / Actual Loss % are rounded for display

console.log('Commissary Yield Engine Tests\n');

// --- Part 1: pure-function checks against real Yield_Log rows -------------
// (date, meat, raw_weight_in, backed_weight_out, allowed_leeway_pct,
//  expected_actual_loss_pct, expected_status, expected_excess_loss)
// All 7 Review rows in the real 46-row Yield_Log are included, plus a
// spread of Pass rows, the exact-boundary case, and the zero-weight edge
// case - not a cherry-picked happy path.
const realRows = [
  ['2026-07-01', 'Belly Slab',  23.5, 17.7, 0.25, 0.2468085106, 'Pass',   0],
  ['2026-07-02', 'JOWL',        20.5, 16.0, 0.20, 0.2195121951, 'Review', 0.4],
  ['2026-07-02', 'Shortplate',  14.0, 7.5,  0.20, 0.4642857143, 'Review', 3.7],
  ['2026-07-03', 'JOWL',        20.0, 16.0, 0.20, 0.2,          'Pass',   0],   // exact boundary: 20% loss == 20% leeway -> still Pass
  ['2026-07-04', 'Belly Slab',  15.0, 12.0, 0.25, 0.2,          'Pass',   0],
  ['2026-07-04', 'Shortplate',  12.5, 9.0,  0.20, 0.28,         'Review', 1.0],
  ['2026-07-05', 'Shortplate',  9.8,  7.2,  0.20, 0.2653061224, 'Review', 0.64],
  ['2026-07-06', 'JOWL',        20.5, 16.2, 0.20, 0.2097560976, 'Review', 0.2],
  ['2026-07-07', 'Shortplate',  14.0, 9.8,  0.20, 0.3,          'Review', 1.4],
  ['2026-07-09', 'JOWL',        20.0, 15.0, 0.20, 0.25,         'Review', 1.0],
];

for (const [date, meatName, rawIn, backedOut, leeway, expActualLoss, expStatus, expExcess] of realRows) {
  test(`${meatName} ${date}: raw ${rawIn} / backed ${backedOut} vs xlsx (${expStatus})`, () => {
    const { actualLossPct, status, excessLoss } = computeYieldMetrics(rawIn, backedOut, leeway);
    assert.ok(Math.abs(actualLossPct - expActualLoss) < 0.0001, `actualLossPct: expected ~${expActualLoss}, got ${actualLossPct}`);
    assert.strictEqual(status, expStatus, `status: expected ${expStatus}, got ${status}`);
    assert.ok(Math.abs(excessLoss - expExcess) < EPS, `excessLoss: expected ~${expExcess}, got ${excessLoss}`);
  });
}

test('zero-weight event (xlsx: "False Receival, No Receipt") - no loss %, no status, zero excess', () => {
  // Real row: Belly Slab, 2026-07-02, raw_weight_in=0, backed_weight_out=0,
  // allowed_leeway_pct=0.25. Sheet leaves Actual Loss % and Status blank.
  const { actualLossPct, status, excessLoss } = computeYieldMetrics(0, 0, 0.25);
  assert.strictEqual(actualLossPct, null);
  assert.strictEqual(status, null);
  assert.strictEqual(excessLoss, 0);
});

test('computeActualLossPct and computeYieldStatus are independently correct building blocks', () => {
  // Shortplate 2026-07-02 from the real sheet, checked function-by-function
  // rather than only through the combined computeYieldMetrics.
  const actualLossPct = computeActualLossPct(14.0, 7.5);
  assert.ok(Math.abs(actualLossPct - 0.4642857143) < 0.0001);
  assert.strictEqual(computeYieldStatus(actualLossPct, 0.20), 'Review');
  assert.ok(Math.abs(computeExcessLoss(14.0, 7.5, 0.20) - 3.7) < EPS);
});

// --- Part 2: db-integration checks (real db rows, not just pure math) -----

const TEST_DB_PATH = path.join(__dirname, '..', 'db', 'test-commissary.db');
for (const ext of ['', '-shm', '-wal']) {
  const p = TEST_DB_PATH + ext;
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const db = new DatabaseSync(TEST_DB_PATH);
db.exec('PRAGMA foreign_keys = ON');
db.exec(schema);

// Seed real commissary meats (code/name/unit/leeway straight from the
// xlsx Meats sheet) and real Yield_Log rows for one real date, 2026-07-02,
// which has one Pass, one Review, and the zero-weight edge case together -
// the messiest real day in the sheet.
db.prepare('INSERT INTO commissary_meats (code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?)')
  .run('M05', 'JOWL', 'kg', 0.20);
const jowlId = db.prepare('SELECT id FROM commissary_meats WHERE code = ?').get('M05').id;

db.prepare('INSERT INTO commissary_meats (code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?)')
  .run('M08', 'Shortplate', 'kg', 0.20);
const shortplateId = db.prepare('SELECT id FROM commissary_meats WHERE code = ?').get('M08').id;

db.prepare('INSERT INTO commissary_meats (code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?)')
  .run('M03', 'Belly Slab', 'kg', 0.25);
const bellySlabId = db.prepare('SELECT id FROM commissary_meats WHERE code = ?').get('M03').id;

db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out, notes) VALUES (?, ?, ?, ?, ?)')
  .run(bellySlabId, '2026-07-02', 0.0, 0.0, 'False Receival, No Receipt');
db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out, notes) VALUES (?, ?, ?, ?, ?)')
  .run(jowlId, '2026-07-02', 20.5, 16.0, null);
db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out, notes) VALUES (?, ?, ?, ?, ?)')
  .run(shortplateId, '2026-07-02', 14.0, 7.5, '(17.9% to 46.4%)[4kg lost]');

test('computeYieldRow joins the meat\'s real allowed leeway and matches the sheet (JOWL 2026-07-02, Review)', () => {
  const jowlRowId = db.prepare('SELECT id FROM commissary_yield_log WHERE commissary_meat_id = ?').get(jowlId).id;
  const result = computeYieldRow(db, jowlRowId);
  assert.strictEqual(result.allowedLeewayPct, 0.20);
  assert.ok(Math.abs(result.actualLossPct - 0.2195121951) < 0.0001);
  assert.strictEqual(result.status, 'Review');
  assert.ok(Math.abs(result.excessLoss - 0.4) < EPS);
});

test('computeYieldLogForDate returns all 3 real rows for 2026-07-02, in the sheet\'s own mixed Pass/Review/edge-case state', () => {
  const results = computeYieldLogForDate(db, '2026-07-02');
  assert.strictEqual(results.length, 3);

  const belly = results.find(r => r.commissary_meat_id === bellySlabId);
  assert.strictEqual(belly.status, null); // zero-weight edge case

  const shortplate = results.find(r => r.commissary_meat_id === shortplateId);
  assert.strictEqual(shortplate.status, 'Review');
  assert.ok(Math.abs(shortplate.excessLoss - 3.7) < EPS);

  const jowl = results.find(r => r.commissary_meat_id === jowlId);
  assert.strictEqual(jowl.status, 'Review');
});

test('soft-deleted yield log rows are excluded from computeYieldLogForDate', () => {
  db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out, deleted_at) VALUES (?, ?, ?, ?, ?)')
    .run(jowlId, '2026-07-10', 999, 1, '2026-07-10T12:00:00Z');
  const results = computeYieldLogForDate(db, '2026-07-10');
  assert.strictEqual(results.length, 0);
});

// --- Part 3: commissary balance (backed-in minus shipped-out) -------------
// Commi_Audit_Master.xlsx was available this session - these fixtures are
// the REAL M03 Belly Slab rows from Yield_Log and Outbound_Log, and the
// balance is cross-checked against Commissary_Stock's own cached numbers
// (D3=29.7 backed in, E3=14.9 shipped out, F3=14.8 balance), the same way
// excess_loss was verified in step 3.
//
// Outbound_Log also has a 5.0kg "Unallocated" row for M03 on 2026-07-02
// (shipped but not yet assigned to a restaurant). Before step 9,
// stock_receipts.restaurant_id was NOT NULL, so this row was
// unrepresentable and the balance below came out to 19.8 instead of the
// sheet's real 14.8 - a documented, known gap (see
// docs/commissary-and-stock-receipts.md Part 2). As of step 9,
// restaurant_id/meat_id are nullable and getCommissaryBalance is already
// destination-agnostic (it only filters on commissary_meat_id/source,
// never restaurant_id - see commissaryYieldEngine.js), so simply adding
// the real Unallocated row below makes the balance match the sheet
// exactly, with no engine code changes needed.

// Complete the real Yield_Log dataset for Belly Slab (bellySlabId already
// has the 2026-07-02 0.0/0.0 row from Part 2 above) - adding the other 2
// real rows so the backed-in total matches the sheet's D3=29.7 exactly.
db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out, notes) VALUES (?, ?, ?, ?, ?)')
  .run(bellySlabId, '2026-07-01', 23.5, 17.7, null);
db.prepare('INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out, notes) VALUES (?, ?, ?, ?, ?)')
  .run(bellySlabId, '2026-07-04', 15.0, 12.0, null);

test('getCommissaryBalance: Belly Slab backed-in total matches Commissary_Stock D3 (29.7) exactly', () => {
  const backedIn = db.prepare(
    `SELECT COALESCE(SUM(backed_weight_out), 0) AS total FROM commissary_yield_log WHERE commissary_meat_id = ? AND deleted_at IS NULL`
  ).get(bellySlabId).total;
  assert.ok(Math.abs(backedIn - 29.7) < EPS, `expected 29.7, got ${backedIn}`);
});

db.prepare('INSERT INTO restaurants (name, code) VALUES (?, ?)').run('Test Restaurant', 'TR1');
const restaurantId = db.prepare('SELECT id FROM restaurants WHERE code = ?').get('TR1').id;
db.prepare('INSERT INTO meats (restaurant_id, meat_code, name, unit) VALUES (?, ?, ?, ?)')
  .run(restaurantId, 'RM03', 'Restaurant-side Belly Slab', 'kg');
const restaurantMeatId = db.prepare('SELECT id FROM meats WHERE restaurant_id = ? AND meat_code = ?')
  .get(restaurantId, 'RM03').id;

test('getCommissaryBalance: all 4 real Belly Slab shipments (2.2 + 5.7 + 2.0 + 5.0 Unallocated = 14.9) now match Outbound_Log exactly', () => {
  // Real Outbound_Log rows for M03, all 4 of them:
  // 07-01 Restaurant B 2.2, 07-02 Restaurant A 5.7, 07-05 Restaurant A 2.0,
  // and 07-02 destination "Unallocated" 5.0 - representable as of step 9
  // via restaurant_id = NULL, meat_id = NULL.
  db.prepare(`INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source, commissary_meat_id)
              VALUES (?, ?, ?, ?, 'COMMISSARY', ?)`)
    .run(restaurantId, restaurantMeatId, '2026-07-01', 2.2, bellySlabId);
  db.prepare(`INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source, commissary_meat_id)
              VALUES (?, ?, ?, ?, 'COMMISSARY', ?)`)
    .run(restaurantId, restaurantMeatId, '2026-07-02', 5.7, bellySlabId);
  db.prepare(`INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source, commissary_meat_id)
              VALUES (?, ?, ?, ?, 'COMMISSARY', ?)`)
    .run(restaurantId, restaurantMeatId, '2026-07-05', 2.0, bellySlabId);
  db.prepare(`INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source, commissary_meat_id)
              VALUES (NULL, NULL, ?, ?, 'COMMISSARY', ?)`)
    .run('2026-07-02', 5.0, bellySlabId);

  const balance = getCommissaryBalance(db, bellySlabId);
  // 29.7 - 14.9 = 14.8, matching Commissary_Stock's own cached F3 exactly -
  // the previously-flagged 19.8-vs-14.8 gap is now closed.
  assert.ok(Math.abs(balance - 14.8) < EPS, `expected 14.8 (29.7 - 14.9, all 4 Outbound_Log rows now representable), got ${balance}`);
});

test('getCommissaryBalance: a DIRECT-source receipt on the same meat is not subtracted', () => {
  const before = getCommissaryBalance(db, bellySlabId);
  db.prepare(`INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source)
              VALUES (?, ?, ?, ?, 'DIRECT')`)
    .run(restaurantId, restaurantMeatId, '2026-07-08', 999);
  const after = getCommissaryBalance(db, bellySlabId);
  assert.strictEqual(after, before, 'a DIRECT receipt must not affect the commissary balance');
});

test('getCommissaryBalance: a soft-deleted stock_receipts row is not subtracted', () => {
  const before = getCommissaryBalance(db, bellySlabId);
  db.prepare(`INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source, commissary_meat_id, deleted_at)
              VALUES (?, ?, ?, ?, 'COMMISSARY', ?, ?)`)
    .run(restaurantId, restaurantMeatId, '2026-07-09', 999, bellySlabId, '2026-07-09T00:00:00Z');
  const after = getCommissaryBalance(db, bellySlabId);
  assert.strictEqual(after, before, 'a soft-deleted receipt must not affect the commissary balance');
});

test('getCommissaryBalance: a meat with backed-in but no shipments yet returns the full backed-in total', () => {
  // JOWL has one db-backed yield_log row (2026-07-02, 16.0) and no
  // shipments recorded in this test db - balance should be 16.0.
  const balance = getCommissaryBalance(db, jowlId);
  assert.ok(Math.abs(balance - 16.0) < EPS);
});

test('getCommissaryBalance: a meat with zero activity at all returns 0, not null', () => {
  db.prepare('INSERT INTO commissary_meats (code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?)')
    .run('M99', 'Untouched Meat', 'kg', 0.15);
  const untouchedId = db.prepare('SELECT id FROM commissary_meats WHERE code = ?').get('M99').id;
  assert.strictEqual(getCommissaryBalance(db, untouchedId), 0);
});

test('listCommissaryBalances: returns one row per active commissary meat, matching individual lookups', () => {
  const list = listCommissaryBalances(db);
  const bellyEntry = list.find(r => r.commissary_meat_id === bellySlabId);
  assert.ok(bellyEntry, 'Belly Slab should appear in the balance list');
  assert.ok(Math.abs(bellyEntry.balance - getCommissaryBalance(db, bellySlabId)) < EPS);
  assert.strictEqual(list.length, new Set(list.map(r => r.commissary_meat_id)).size, 'no duplicate meats in the list');
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
