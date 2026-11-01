// Tests for the shared business date (Step business-day). Pure: injected
// instants, no clock. Plain assertions and the same "N passed, M failed"
// count line as the rest of the suite.

const assert = require('assert');
const { manilaDate, businessDate, mondayOf } = require('./businessDay.js');

let passed = 0, failed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

console.log('Business Day Tests (business-day)\n');

test('07:59:59 Manila belongs to the previous business day', () => {
  assert.strictEqual(businessDate('2026-11-02T07:59:59+08:00'), '2026-11-01');
});

test('08:00:00 Manila starts the new business day', () => {
  assert.strictEqual(businessDate('2026-11-02T08:00:00+08:00'), '2026-11-02');
});

test('a 1am count stays on the night before', () => {
  assert.strictEqual(businessDate(new Date('2026-11-03T01:00:00+08:00')), '2026-11-02');
});

test('year end: 2026-12-31 23:00 and 2027-01-01 07:59 Manila both give 2026-12-31', () => {
  assert.strictEqual(businessDate('2026-12-31T23:00:00+08:00'), '2026-12-31');
  assert.strictEqual(businessDate('2027-01-01T07:59:00+08:00'), '2026-12-31');
  assert.strictEqual(businessDate('2027-01-01T08:00:00+08:00'), '2027-01-01');
});

test('month end rolls: 2026-12-01 07:00 Manila gives 2026-11-30', () => {
  assert.strictEqual(businessDate('2026-12-01T07:00:00+08:00'), '2026-11-30');
});

test('manilaDate is the plain Manila calendar date (no 8am shift)', () => {
  assert.strictEqual(manilaDate('2026-11-02T07:59:59+08:00'), '2026-11-02');
  assert.strictEqual(manilaDate('2026-11-01T16:00:00Z'), '2026-11-02');
});

test('an invalid instant gives null', () => {
  assert.strictEqual(businessDate('not a date'), null);
  assert.strictEqual(manilaDate('not a date'), null);
});

test('mondayOf every weekday of the week of 2026-11-02 (a Monday)', () => {
  for (const d of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05',
    '2026-11-06', '2026-11-07', '2026-11-08']) {
    assert.strictEqual(mondayOf(d), '2026-11-02', d);
  }
  assert.strictEqual(mondayOf('2026-11-09'), '2026-11-09');
});

test('mondayOf crosses a year end: Sunday 2027-01-03 -> 2026-12-28', () => {
  assert.strictEqual(mondayOf('2027-01-03'), '2026-12-28');
});

test('mondayOf rejects a non-date', () => {
  assert.strictEqual(mondayOf('2026-02-30'), null);
  assert.strictEqual(mondayOf('2026-11-2'), null);
  assert.strictEqual(mondayOf(null), null);
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  PASS: ${name}`);
      passed++;
    } catch (err) {
      console.log(`  FAIL: ${name}`);
      console.log(`    ${err.message}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
