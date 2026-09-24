// Tests for step 26a-ii (session-status.md, "Step 26a-ii - the month-start
// recount"): server/engines/monthOpening.js - the must-count/copyable
// rules, Copy all, the block, and how the block interacts with 26a's
// beginning-stock walk and recount difference. Same plain-script, real
// node:sqlite, real schema.sql, no-framework style as every other test file.
//
// Run with: node server/engines/monthOpening.test.js

const { DatabaseSync } = require('node:sqlite');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  monthBounds, isBlocked, getMonthOpeningStatus, recordRecount, copyAll
} = require('./monthOpening.js');
const { computeMeatAudit } = require('./auditEngine.js');
const { computeCommissaryMeatAudit } = require('./commissaryAuditEngine.js');

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

const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(schema);

db.prepare(`INSERT INTO restaurants (id, name, code) VALUES (1, 'Restaurant A', 'A')`).run();
// M01: counted on Sept 30 -> copyable for October.
// M02: counted on Sept 30 but flagged Recount at month start -> must-count 'required'.
// M03: counted Sept 20, NOT on Sept 30 -> must-count 'last ending not counted'.
// M04: never counted, never opened -> must-count 'new'.
// M05: inactive -> not listed at all.
const insertMeat = db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit, recount_required, active) VALUES (?, 1, ?, ?, 'kg', ?, ?)`);
insertMeat.run(1, 'M01', 'Pork Belly', 0, 1);
insertMeat.run(2, 'M02', 'Beef Brisket', 1, 1);
insertMeat.run(3, 'M03', 'Chicken Thigh', 0, 1);
insertMeat.run(4, 'M04', 'Lamb Shank', 0, 1);
insertMeat.run(5, 'M05', 'Retired Meat', 0, 0);

const insertOpening = db.prepare(`INSERT INTO opening_stock (restaurant_id, meat_id, business_date, quantity, opening_source) VALUES (1, ?, ?, ?, ?)`);
const insertActual = db.prepare(`INSERT INTO ending_actual (restaurant_id, meat_id, business_date, quantity) VALUES (1, ?, ?, ?)`);
for (const meatId of [1, 2, 3]) insertOpening.run(meatId, '2026-09-01', 50, 'RECOUNT');
insertActual.run(1, '2026-09-30', 42);
insertActual.run(2, '2026-09-30', 30);
insertActual.run(3, '2026-09-20', 18);

console.log('Month opening (step 26a-ii): month bounds\n');

test('monthBounds handles month lengths and the year boundary', () => {
  assert.deepStrictEqual(monthBounds('2026-10-17'), { start: '2026-10-01', end: '2026-10-31', prevEnd: '2026-09-30' });
  assert.deepStrictEqual(monthBounds('2028-02-10'), { start: '2028-02-01', end: '2028-02-29', prevEnd: '2028-01-31' });
  assert.deepStrictEqual(monthBounds('2027-01-01'), { start: '2027-01-01', end: '2027-01-31', prevEnd: '2026-12-31' });
});

console.log('\nMonth opening: must-count vs copyable\n');

const byCode = (status, code) => status.rows.find(r => r.code === code);

test('panel data lists every ACTIVE meat once, none opened yet for October', () => {
  const status = getMonthOpeningStatus(db, 'restaurant', 1, '2026-10-05');
  assert.deepStrictEqual(status.rows.map(r => r.code), ['M01', 'M02', 'M03', 'M04']);
  assert.strictEqual(status.month_start, '2026-10-01');
  assert.strictEqual(status.complete, false);
  assert.ok(status.rows.every(r => r.opening === null));
});

test('a meat really counted on the last day of last month is copyable, with that count as the copy quantity', () => {
  const m01 = byCode(getMonthOpeningStatus(db, 'restaurant', 1, '2026-10-05'), 'M01');
  assert.strictEqual(m01.must_count, false);
  assert.deepStrictEqual(m01.reasons, []);
  assert.strictEqual(m01.copy_quantity, 42);
});

test('rule 1: Recount at month start makes it must-count ("required") even though it was counted', () => {
  const m02 = byCode(getMonthOpeningStatus(db, 'restaurant', 1, '2026-10-05'), 'M02');
  assert.strictEqual(m02.must_count, true);
  assert.deepStrictEqual(m02.reasons, ['required']);
  assert.strictEqual(m02.copy_quantity, null);
});

test('rule 2: no real count on the last day of last month -> must-count ("last ending not counted")', () => {
  const m03 = byCode(getMonthOpeningStatus(db, 'restaurant', 1, '2026-10-05'), 'M03');
  assert.strictEqual(m03.must_count, true);
  assert.deepStrictEqual(m03.reasons, ['last ending not counted']);
});

test('rule 3: no earlier opening and no earlier count at all -> must-count ("new"), in place of rule 2\'s tag', () => {
  const m04 = byCode(getMonthOpeningStatus(db, 'restaurant', 1, '2026-10-05'), 'M04');
  assert.strictEqual(m04.must_count, true);
  assert.deepStrictEqual(m04.reasons, ['new']);
});

test('in the first month every meat is must-count (onboarding needs no special mode)', () => {
  const status = getMonthOpeningStatus(db, 'restaurant', 1, '2026-08-15');
  assert.ok(status.rows.every(r => r.must_count), 'nothing exists before August for any meat');
});

console.log('\nMonth opening: the block\n');

test('with no opening dated in the month, every day of that month is blocked', () => {
  for (const d of ['2026-10-01', '2026-10-15', '2026-10-31']) {
    assert.strictEqual(isBlocked(db, 'restaurant', 1, 1, d), true, d);
  }
  const audit = computeMeatAudit(db, 1, 1, '2026-10-01');
  assert.strictEqual(audit.status, 'MISSING_PERIOD_OPENING');
  assert.strictEqual(audit.beginning, null);
  assert.strictEqual(audit.endingCalculated, null);
  assert.strictEqual(audit.unexplainedVariance, null);
});

test('September (which has openings) is not blocked', () => {
  assert.strictEqual(isBlocked(db, 'restaurant', 1, 1, '2026-09-30'), false);
  const sept30 = computeMeatAudit(db, 1, 1, '2026-09-30');
  assert.strictEqual(sept30.beginning, 50, 'carried from the Sept 1 opening');
  assert.strictEqual(sept30.status, 'SHORTAGE', '50 expected, 42 counted - an ordinary figure, not blocked');
});

console.log('\nMonth opening: Copy all\n');

test('Copy all copies ONLY copyable meats, dated the 1st, source COPY, quantity = last month\'s final count', () => {
  const copied = copyAll(db, 'restaurant', 1, '2026-10-05');
  assert.deepStrictEqual(copied, [1], 'must-count meats (M02 required, M03 not counted, M04 new) are never copied');
  const row = db.prepare(`SELECT business_date, quantity, opening_source FROM opening_stock WHERE meat_id = 1 AND business_date >= '2026-10-01'`).get();
  assert.deepStrictEqual({ ...row }, { business_date: '2026-10-01', quantity: 42, opening_source: 'COPY' });
});

test('a copied opening has recount difference 0 by construction, and unblocks the whole month', () => {
  const audit = computeMeatAudit(db, 1, 1, '2026-10-01');
  assert.strictEqual(audit.beginning, 42);
  assert.strictEqual(audit.recountDifference, 0);
  assert.strictEqual(audit.openingSource, 'COPY');
  assert.strictEqual(isBlocked(db, 'restaurant', 1, 1, '2026-10-31'), false);
});

test('Copy all is safe to repeat - an already-opened meat is skipped', () => {
  assert.deepStrictEqual(copyAll(db, 'restaurant', 1, '2026-10-20'), []);
  const count = db.prepare(`SELECT COUNT(*) AS n FROM opening_stock WHERE meat_id = 1 AND business_date >= '2026-10-01'`).get().n;
  assert.strictEqual(count, 1);
});

console.log('\nMonth opening: a recount dated after the 1st (spec example)\n');

test('recount on the morning of Oct 2: Oct 1 unblocks and chains from Sept 30; the recount difference lands on Oct 2', () => {
  // M02 counted 30 on Sept 30; recount on Oct 2 finds 27.
  assert.strictEqual(computeMeatAudit(db, 1, 2, '2026-10-01').status, 'MISSING_PERIOD_OPENING');
  assert.strictEqual(recordRecount(db, 'restaurant', 1, 2, '2026-10-02', 27).ok, true);

  const oct1 = computeMeatAudit(db, 1, 2, '2026-10-01');
  assert.strictEqual(oct1.status, 'MISSING_ACTUAL_COUNT', 'unblocked, ready to backfill from the paper sheet');
  assert.strictEqual(oct1.beginning, 30, 'chains from Sept 30\'s count (26a rules)');
  assert.strictEqual(oct1.recountDifference, null);

  const oct2 = computeMeatAudit(db, 1, 2, '2026-10-02');
  assert.strictEqual(oct2.beginning, 27);
  assert.strictEqual(oct2.recountDifference, 3, 'priorEnding (30, carried through Oct 1) - opening (27)');
  assert.strictEqual(oct2.openingSource, 'RECOUNT');
});

test('the panel reports each meat\'s opening once entered, and "complete" only when every active meat has one', () => {
  let status = getMonthOpeningStatus(db, 'restaurant', 1, '2026-10-02');
  assert.deepStrictEqual({ ...byCode(status, 'M02').opening }, { business_date: '2026-10-02', quantity: 27, opening_source: 'RECOUNT' });
  assert.strictEqual(status.complete, false);
  recordRecount(db, 'restaurant', 1, 3, '2026-10-02', 17);
  recordRecount(db, 'restaurant', 1, 4, '2026-10-02', 5);
  status = getMonthOpeningStatus(db, 'restaurant', 1, '2026-10-02');
  assert.strictEqual(status.complete, true);
});

test('clearing a meat\'s only opening in the month blocks it again', () => {
  db.prepare(`DELETE FROM opening_stock WHERE meat_id = 4 AND business_date = '2026-10-02'`).run();
  assert.strictEqual(isBlocked(db, 'restaurant', 1, 4, '2026-10-15'), true);
  assert.strictEqual(getMonthOpeningStatus(db, 'restaurant', 1, '2026-10-15').complete, false);
});

console.log('\nMonth opening: the commissary ledger uses the same rules\n');

db.prepare(`INSERT INTO commissaries (id, name, code) VALUES (1, 'Commissary A', 'CA')`).run();
db.prepare(`INSERT INTO commissaries (id, name, code) VALUES (2, 'Commissary B', 'CB')`).run();
const insertCm = db.prepare(`INSERT INTO commissary_meats (id, commissary_id, code, name, unit, allowed_leeway_pct, recount_required) VALUES (?, ?, ?, ?, 'kg', 0.1, ?)`);
insertCm.run(10, 1, 'C01', 'Whole Pig', 0);
insertCm.run(11, 1, 'C02', 'Pork Jowl', 1);
insertCm.run(12, 2, 'C01', 'Other Commissary Meat', 0);
db.prepare(`INSERT INTO commissary_opening_stock (commissary_meat_id, business_date, quantity, opening_source) VALUES (10, '2026-09-01', 100, 'RECOUNT'), (11, '2026-09-01', 20, 'RECOUNT'), (12, '2026-09-01', 5, 'RECOUNT')`).run();
db.prepare(`INSERT INTO commissary_ending_actual (commissary_meat_id, business_date, quantity) VALUES (10, '2026-09-30', 88), (11, '2026-09-30', 19), (12, '2026-09-30', 4)`).run();

test('commissary panel lists only that commissary\'s meats, with the same rules', () => {
  const status = getMonthOpeningStatus(db, 'commissary', 1, '2026-10-01');
  assert.deepStrictEqual(status.rows.map(r => r.meat_id), [10, 11]);
  assert.strictEqual(byCode(status, 'C01').copy_quantity, 88);
  assert.deepStrictEqual(byCode(status, 'C02').reasons, ['required']);
});

test('commissary Copy all copies only this commissary\'s copyable meats', () => {
  assert.strictEqual(computeCommissaryMeatAudit(db, 10, '2026-10-01').status, 'MISSING_PERIOD_OPENING');
  assert.deepStrictEqual(copyAll(db, 'commissary', 1, '2026-10-01'), [10]);
  assert.strictEqual(computeCommissaryMeatAudit(db, 10, '2026-10-01').beginning, 88);
  assert.strictEqual(computeCommissaryMeatAudit(db, 10, '2026-10-01').openingSource, 'COPY');
  assert.strictEqual(isBlocked(db, 'commissary', null, 12, '2026-10-01'), true, 'Commissary B untouched');
});

console.log('\nMonth opening: review fixes (PR #8)\n');

test('a negative recount is refused (400) and writes nothing - an opening count is never below zero', () => {
  const result = recordRecount(db, 'restaurant', 1, 4, '2026-10-03', -1);
  assert.strictEqual(result.status, 400);
  assert.strictEqual(isBlocked(db, 'restaurant', 1, 4, '2026-10-03'), true);
  assert.strictEqual(recordRecount(db, 'restaurant', 1, 4, '2026-11-02', 0).ok, true, 'zero is a real count, not refused');
});

test('Copy all is one transaction: a failure partway through leaves the month with no copies at all', () => {
  // M01 and M03 are both counted on Oct 31 -> both copyable for November.
  insertActual.run(1, '2026-10-31', 40);
  insertActual.run(3, '2026-10-31', 15);
  // A db whose SECOND opening insert throws, standing in for any mid-loop failure.
  let inserts = 0;
  const flakyDb = {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => {
      if (/INSERT INTO opening_stock/.test(sql) && ++inserts === 2) throw new Error('simulated mid-loop failure');
      return db.prepare(sql);
    }
  };
  assert.throws(() => copyAll(flakyDb, 'restaurant', 1, '2026-11-01'), /simulated mid-loop failure/);
  const n = db.prepare(`SELECT COUNT(*) AS n FROM opening_stock WHERE restaurant_id = 1 AND business_date = '2026-11-01'`).get().n;
  assert.strictEqual(n, 0, 'the first copy was rolled back, not left behind');
  assert.deepStrictEqual(copyAll(db, 'restaurant', 1, '2026-11-01'), [1, 3], 'a clean retry copies both');
});

test('a blocked meat with a stored ending reports actual null (no phantom balance), and the count reappears once the month is opened', () => {
  // M04's only October opening was cleared above -> October is blocked.
  insertActual.run(4, '2026-10-10', 6);
  const blocked = computeMeatAudit(db, 1, 4, '2026-10-10');
  assert.strictEqual(blocked.status, 'MISSING_PERIOD_OPENING');
  assert.strictEqual(blocked.actual, null);
  assert.strictEqual(recordRecount(db, 'restaurant', 1, 4, '2026-10-10', 6).ok, true);
  assert.strictEqual(computeMeatAudit(db, 1, 4, '2026-10-10').actual, 6, 'the stored count was never deleted');

  // Same on the commissary ledger: Commissary B's C01 has no October opening.
  db.prepare(`INSERT INTO commissary_ending_actual (commissary_meat_id, business_date, quantity) VALUES (12, '2026-10-05', 3)`).run();
  const cBlocked = computeCommissaryMeatAudit(db, 12, '2026-10-05');
  assert.strictEqual(cBlocked.status, 'MISSING_PERIOD_OPENING');
  assert.strictEqual(cBlocked.actual, null);
});

console.log('\nMonth opening: explicit recount overwrite (step 26a-iii)\n');

// November state from the tests above: M01 (40) and M03 (15) copied on
// Nov 1, M04 recounted 0 on Nov 2.
const novOpenings = (meatId) => db.prepare(
  `SELECT business_date, quantity, opening_source FROM opening_stock
   WHERE restaurant_id = 1 AND meat_id = ? AND business_date >= '2026-11-01' ORDER BY business_date`
).all(meatId).map(r => ({ ...r }));

test('a same-date recount flips COPY to RECOUNT - including the same number - with no second row', () => {
  assert.deepStrictEqual(novOpenings(1), [{ business_date: '2026-11-01', quantity: 40, opening_source: 'COPY' }]);
  assert.strictEqual(recordRecount(db, 'restaurant', 1, 1, '2026-11-01', 40).ok, true);
  assert.deepStrictEqual(novOpenings(1), [{ business_date: '2026-11-01', quantity: 40, opening_source: 'RECOUNT' }]);
  assert.strictEqual(computeMeatAudit(db, 1, 1, '2026-11-01').openingSource, 'RECOUNT');
});

test('a later-date recount keeps the earlier opening and lands the recount difference on the new date', () => {
  assert.strictEqual(recordRecount(db, 'restaurant', 1, 3, '2026-11-02', 12).ok, true);
  assert.deepStrictEqual(novOpenings(3), [
    { business_date: '2026-11-01', quantity: 15, opening_source: 'COPY' },
    { business_date: '2026-11-02', quantity: 12, opening_source: 'RECOUNT' }
  ]);
  const nov1 = computeMeatAudit(db, 1, 3, '2026-11-01');
  assert.strictEqual(nov1.beginning, 15);
  assert.strictEqual(nov1.recountDifference, 0);
  const nov2 = computeMeatAudit(db, 1, 3, '2026-11-02');
  assert.strictEqual(nov2.beginning, 12);
  assert.strictEqual(nov2.recountDifference, 3, 'priorEnding (15, carried through Nov 1) - opening (12)');
  assert.strictEqual(nov2.openingSource, 'RECOUNT');
});

test('a negative recount on an already-opened meat is still 400 and changes nothing', () => {
  assert.strictEqual(recordRecount(db, 'restaurant', 1, 3, '2026-11-02', -1).status, 400);
  assert.strictEqual(novOpenings(3)[1].quantity, 12);
});

test('the panel shows the latest opening on or before the page date; one dated only after it still shows (any opening unblocks)', () => {
  assert.deepStrictEqual({ ...byCode(getMonthOpeningStatus(db, 'restaurant', 1, '2026-11-01'), 'M03').opening },
    { business_date: '2026-11-01', quantity: 15, opening_source: 'COPY' });
  assert.deepStrictEqual({ ...byCode(getMonthOpeningStatus(db, 'restaurant', 1, '2026-11-20'), 'M03').opening },
    { business_date: '2026-11-02', quantity: 12, opening_source: 'RECOUNT' });
  // M04's only November opening is Nov 2: seen from Nov 1 it is still opened, never blank.
  assert.strictEqual(isBlocked(db, 'restaurant', 1, 4, '2026-11-01'), false);
  assert.strictEqual(byCode(getMonthOpeningStatus(db, 'restaurant', 1, '2026-11-01'), 'M04').opening.business_date, '2026-11-02');
});

test('the commissary ledger upserts the same way', () => {
  // C01 (meat 10) was copied on Oct 1.
  assert.strictEqual(recordRecount(db, 'commissary', 1, 10, '2026-10-01', 88).ok, true);
  const rows = db.prepare(`SELECT business_date, quantity, opening_source FROM commissary_opening_stock WHERE commissary_meat_id = 10 AND business_date >= '2026-10-01'`).all().map(r => ({ ...r }));
  assert.deepStrictEqual(rows, [{ business_date: '2026-10-01', quantity: 88, opening_source: 'RECOUNT' }]);
  assert.strictEqual(recordRecount(db, 'commissary', 1, 10, '2026-10-03', 80).ok, true);
  assert.strictEqual(computeCommissaryMeatAudit(db, 10, '2026-10-01').beginning, 88, 'earlier opening kept');
  assert.strictEqual(computeCommissaryMeatAudit(db, 10, '2026-10-03').beginning, 80);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
