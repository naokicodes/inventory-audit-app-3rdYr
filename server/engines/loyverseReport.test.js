// Tests for the wildcard-match report formatter (Step loyverse-preview-iii).
// Pure: a canned computePreview() result, no network.

const assert = require('assert');
const { formatReport } = require('./loyverseReport.js');

let passed = 0, failed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

console.log('Loyverse Report Tests (loyverse-preview-iii)\n');

function cand(account, dish_code, pattern, matchedBy, item_name, quantity, variant_name = null) {
  return { dish_code, account, item_id: 'i-' + item_name, variant_id: 'v-' + variant_name, item_name, variant_name, matchedBy, pattern, quantity };
}

function preview(overrides = {}) {
  return {
    date: '2026-10-20',
    accounts: [
      { label: 'Silingan', ok: true, receiptsScanned: 9, receiptsKept: 7, receiptTypes: { SALE: 6, REFUND: 1 } },
      { label: 'Likod', ok: true, receiptsScanned: 3, receiptsKept: 3, receiptTypes: { SALE: 3 } },
    ],
    dishes: [
      { dish_code: 'D001', name: 'Meatball Pasta' },
      { dish_code: 'D002', name: 'Pork Steak' },
      { dish_code: 'D003', name: 'Braised Beef' },
    ],
    unmatched: [],
    idCandidates: [
      cand('Silingan', 'D002', 'Pan Fry Pork Steak*', 'wildcard', 'Pan Fry Pork Steak', 3, 'Large'),
      cand('Silingan', 'D001', 'Meatball Pasta', 'exact', 'Meatball Pasta', 4),
      cand('Silingan', 'D002', 'Pan Fry Pork Steak*', 'wildcard', 'Pan Fry Pork Steak Rice', 2),
      cand('Silingan', 'D003', 'Braised Beef*', 'wildcard', 'Braised Beef Tapa', 1),
      cand('Likod', 'D002', 'Pan Fry Pork Steak (*)', 'wildcard', 'Pan Fry Pork Steak (Big)', 5),
    ],
    ...overrides,
  };
}

// Lines between a section title and the next blank line.
function section(text, title) {
  const lines = text.split('\n');
  const start = lines.indexOf(title);
  assert.ok(start >= 0, `section "${title}" missing`);
  const end = lines.indexOf('', start);
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

test('wildcard matches are grouped by account, then pattern', () => {
  assert.deepStrictEqual(section(formatReport(preview()), 'Wildcard matches'), [
    '  Silingan',
    '    Pan Fry Pork Steak* -> D002 Pork Steak: 5',
    '      Pan Fry Pork Steak [Large]: 3',
    '      Pan Fry Pork Steak Rice: 2',
    '    Braised Beef* -> D003 Braised Beef: 1',
    '      Braised Beef Tapa: 1',
    '  Likod',
    '    Pan Fry Pork Steak (*) -> D002 Pork Steak: 5',
    '      Pan Fry Pork Steak (Big): 5',
  ]);
});

test('each subtotal equals the sum of its lines', () => {
  const lines = section(formatReport(preview()), 'Wildcard matches');
  let subtotal = null, sum = 0;
  const check = () => { if (subtotal !== null) assert.strictEqual(sum, subtotal); };
  for (const l of lines) {
    if (/^ {4}\S/.test(l)) { check(); subtotal = Number(l.split(': ').pop()); sum = 0; }
    else if (/^ {6}\S/.test(l)) sum += Number(l.split(': ').pop());
    else { check(); subtotal = null; }
  }
  check();
});

test('variant names are shown', () => {
  assert.match(formatReport(preview()), /Pan Fry Pork Steak \[Large\]: 3/);
});

test('exact matches are left out by default', () => {
  const text = formatReport(preview());
  assert.ok(!text.includes('Exact matches'));
  assert.ok(!text.includes('Meatball Pasta'));
});

test('all adds the exact matches', () => {
  assert.deepStrictEqual(section(formatReport(preview(), { all: true }), 'Exact matches'), [
    '  Silingan',
    '    Meatball Pasta -> D001 Meatball Pasta: 4',
    '      Meatball Pasta: 4',
    '  Likod',
    '    (none)',
  ]);
});

test('unmatched section appears only when non-empty', () => {
  assert.ok(!formatReport(preview()).includes('Unmatched'));
  const text = formatReport(preview({ unmatched: [{ account: 'Likod', item_name: 'Mystery Item', quantity: 2 }] }));
  assert.deepStrictEqual(section(text, 'Unmatched'), ['  Likod: Mystery Item: 2']);
});

test('one status line per account, with receipts kept and refunds', () => {
  const lines = formatReport(preview()).trimEnd().split('\n');
  assert.deepStrictEqual(lines.slice(lines.indexOf('Accounts') + 1), [
    '  Silingan: 7 receipts kept, 1 refund receipts',
    '  Likod: 3 receipts kept, 0 refund receipts',
  ]);
});

test('a failed account prints its error line', () => {
  const p = preview({
    accounts: [
      { label: 'Silingan', ok: true, receiptsScanned: 9, receiptsKept: 7, receiptTypes: { SALE: 7 } },
      { label: 'Likod', ok: false, receiptsScanned: 0, receiptsKept: 0, receiptTypes: {}, error: 'Loyverse API returned 401' },
    ],
    idCandidates: preview().idCandidates.filter(c => c.account === 'Silingan'),
  });
  const text = formatReport(p);
  assert.match(text, /^ {2}Likod: FAILED - Loyverse API returned 401$/m);
  assert.match(text, /^ {2}Likod\n {4}\(account failed - see status below\)$/m);
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
