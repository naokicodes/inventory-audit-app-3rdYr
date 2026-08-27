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
  computeYieldLogForDate
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
