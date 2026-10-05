// Tests for the Loyverse sales preview engine (Step loyverse-preview-i).
// No network: every test injects a stub fetch that serves canned receipt
// pages. Plain assertions, same "N passed, M failed" count line as the
// rest of the suite.

const assert = require('assert');
const {
  computePreview, loadNameMap, isValidDate, manilaDate, receiptWindow, normalize, buildResolver,
} = require('./loyversePreview.js');

let passed = 0, failed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

console.log('Loyverse Preview Engine Tests (loyverse-preview-i)\n');

const MAP = {
  accounts: [
    { label: 'Silingan', key: 'silingan', tokenEnv: 'TOK_S' },
    { label: 'Likod', key: 'likod', tokenEnv: 'TOK_L' },
  ],
  dishes: [
    { dish_code: 'D001', name: 'Meatball Pasta', silingan: 'Meatball Pasta', likod: 'Meatball  pasta', note: '' },
    { dish_code: 'D002', name: 'Pork Steak', silingan: 'Pan Fry Pork Steak*', likod: 'Pan Fry Pork Steak (*)', note: '' },
    { dish_code: 'D003', name: 'Pork Steak Special', silingan: 'Pan Fry Pork Steak Special', likod: '', note: '' },
    { dish_code: 'D004', name: 'Regex Dish', silingan: 'Kare+Kare [Big]?', likod: 'C.O.D. $5*', note: '' },
    { dish_code: 'D005', name: 'Never Sold', silingan: 'Never Sold', likod: 'Never Sold', note: '' },
  ],
};
const ENV = { TOK_S: 'secret-s', TOK_L: 'secret-l' };

function receipt(receipt_date, lines, extra = {}) {
  return {
    receipt_date,
    created_at: receipt_date,
    cancelled_at: null,
    receipt_type: 'SALE',
    line_items: lines.map(([item_name, quantity, item_id = 'i-' + item_name, variant_id = 'v1', variant_name]) => ({
      item_name, quantity, item_id, variant_id, variant_name,
      price: 999, total_money: 999, gross_total_money: 999, cost: 1, // must never leak
    })),
    total_money: 999,
    ...extra,
  };
}

// pages: { [token]: [page1Receipts, page2Receipts, ...] } or { [token]: {status} }
function stubFetch(pages, calls = []) {
  return async (url, opts) => {
    const token = opts.headers.Authorization.replace('Bearer ', '');
    const u = new URL(url);
    calls.push({ token, url: u });
    const spec = pages[token];
    if (spec && spec.status) {
      return { status: spec.status, text: async () => `bad token ${token}`, json: async () => ({}) };
    }
    const list = spec || [[]];
    const idx = u.searchParams.get('cursor') ? Number(u.searchParams.get('cursor').slice(1)) : 0;
    const cursor = idx + 1 < list.length ? `c${idx + 1}` : null;
    return { status: 200, text: async () => '', json: async () => ({ receipts: list[idx], cursor }) };
  };
}

function row(result, code) { return result.dishes.find(d => d.dish_code === code); }

// --- helpers ---

test('isValidDate accepts real dates and rejects malformed / impossible ones', () => {
  assert.strictEqual(isValidDate('2026-10-03'), true);
  for (const bad of ['2026-10-3', '20261003', '2026-02-30', 'abc', '', undefined]) {
    assert.strictEqual(isValidDate(bad), false, String(bad));
  }
});

test('window is <date>T00:00+08:00 through +7 days', () => {
  assert.deepStrictEqual(receiptWindow('2026-10-03'), {
    min: '2026-10-02T16:00:00.000Z',
    max: '2026-10-09T16:00:00.000Z',
  });
});

test('UTC -> Manila boundary: 2026-10-02T17:30:00Z is 2026-10-03', () => {
  assert.strictEqual(manilaDate('2026-10-02T17:30:00Z'), '2026-10-03');
  assert.strictEqual(manilaDate('2026-10-02T15:59:59Z'), '2026-10-02');
});

test('normalize trims, lowercases and collapses whitespace', () => {
  assert.strictEqual(normalize('  Meatball \t  PASTA '), 'meatball pasta');
});

// --- fetch / filtering ---

test('sends bearer token and the created_at window with limit=250', async () => {
  const calls = [];
  await computePreview({ date: '2026-10-03', nameMap: MAP, env: ENV, fetchImpl: stubFetch({}, calls) });
  assert.strictEqual(calls.length, 2);
  const u = calls[0].url;
  assert.strictEqual(u.origin + u.pathname, 'https://api.loyverse.com/v1.0/receipts');
  assert.strictEqual(u.searchParams.get('created_at_min'), '2026-10-02T16:00:00.000Z');
  assert.strictEqual(u.searchParams.get('created_at_max'), '2026-10-09T16:00:00.000Z');
  assert.strictEqual(u.searchParams.get('limit'), '250');
});

test('a late-synced receipt (created days later) is counted', async () => {
  const late = receipt('2026-10-03T05:00:00Z', [['Meatball Pasta', 2]], { created_at: '2026-10-06T01:00:00Z' });
  const r = await computePreview({ date: '2026-10-03', nameMap: MAP, env: ENV, fetchImpl: stubFetch({ 'secret-s': [[late]] }) });
  assert.strictEqual(row(r, 'D001').silingan, 2);
});

test('receipt at 2026-10-02T17:30:00Z counts for 10-03; one from another Manila day does not', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: ENV,
    fetchImpl: stubFetch({ 'secret-s': [[
      receipt('2026-10-02T17:30:00Z', [['Meatball Pasta', 1]]),
      receipt('2026-10-03T16:30:00Z', [['Meatball Pasta', 5]]), // 10-04 in Manila
    ]] }),
  });
  assert.strictEqual(row(r, 'D001').silingan, 1);
  assert.strictEqual(r.accounts[0].receiptsScanned, 2);
  assert.strictEqual(r.accounts[0].receiptsKept, 1);
});

test('cancelled receipts are skipped', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: ENV,
    fetchImpl: stubFetch({ 'secret-s': [[
      receipt('2026-10-03T04:00:00Z', [['Meatball Pasta', 3]], { cancelled_at: '2026-10-03T04:05:00Z' }),
      receipt('2026-10-03T04:00:00Z', [['Meatball Pasta', 1]]),
    ]] }),
  });
  assert.strictEqual(row(r, 'D001').silingan, 1);
  assert.strictEqual(r.accounts[0].receiptsKept, 1);
});

test('follows the cursor across two pages', async () => {
  const calls = [];
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: ENV,
    fetchImpl: stubFetch({ 'secret-s': [
      [receipt('2026-10-03T04:00:00Z', [['Meatball Pasta', 1]])],
      [receipt('2026-10-03T05:00:00Z', [['Meatball Pasta', 4]])],
    ] }, calls),
  });
  assert.strictEqual(row(r, 'D001').silingan, 5);
  const sCalls = calls.filter(c => c.token === 'secret-s');
  assert.strictEqual(sCalls.length, 2);
  assert.strictEqual(sCalls[1].url.searchParams.get('cursor'), 'c1');
});

// --- name resolution ---

test("wildcard 'Name*' and 'Name (*)' forms match", async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: ENV,
    fetchImpl: stubFetch({
      'secret-s': [[receipt('2026-10-03T04:00:00Z', [['Pan Fry Pork Steak - Large', 2], ['Pan Fry Pork Steak', 1]])]],
      'secret-l': [[receipt('2026-10-03T04:00:00Z', [['Pan Fry Pork Steak (Regular)', 3], ['Pan Fry Pork Steak Regular', 7]])]],
    }),
  });
  assert.strictEqual(row(r, 'D002').silingan, 3);
  assert.strictEqual(row(r, 'D002').likod, 3); // "(*)" requires the parentheses
  assert.deepStrictEqual(r.unmatched, [{ account: 'Likod', item_name: 'Pan Fry Pork Steak Regular', quantity: 7 }]);
});

test('regex metachars in map names are literal; only * is a wildcard', () => {
  const s = buildResolver(MAP.dishes, 'silingan');
  assert.strictEqual(s('Kare+Kare [Big]?').dish_code, 'D004');
  assert.strictEqual(s('KareeKare [Big]'), null);
  const l = buildResolver(MAP.dishes, 'likod');
  assert.strictEqual(l('C.O.D. $5 promo').dish_code, 'D004');
  assert.strictEqual(l('CXOXDX $5'), null);
});

test('exact beats wildcard', () => {
  const s = buildResolver(MAP.dishes, 'silingan');
  const hit = s('pan fry pork steak special');
  assert.strictEqual(hit.dish_code, 'D003');
  assert.strictEqual(hit.matchedBy, 'exact');
  assert.strictEqual(s('Pan Fry Pork Steak Specialty').dish_code, 'D002');
});

test('case / whitespace normalization on both sides', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: ENV,
    fetchImpl: stubFetch({
      'secret-s': [[receipt('2026-10-03T04:00:00Z', [['  MEATBALL   pasta ', 2]])]],
      'secret-l': [[receipt('2026-10-03T04:00:00Z', [['meatball pasta', 1]])]],
    }),
  });
  assert.strictEqual(row(r, 'D001').silingan, 2);
  assert.strictEqual(row(r, 'D001').likod, 1);
});

test('unmatched names are summed per account, never dropped', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: ENV,
    fetchImpl: stubFetch({
      'secret-s': [[
        receipt('2026-10-03T04:00:00Z', [['Mystery Item', 2]]),
        receipt('2026-10-03T05:00:00Z', [['Mystery Item', 3]]),
      ]],
      'secret-l': [[receipt('2026-10-03T04:00:00Z', [['Mystery Item', 1]])]],
    }),
  });
  assert.deepStrictEqual(r.unmatched, [
    { account: 'Silingan', item_name: 'Mystery Item', quantity: 5 },
    { account: 'Likod', item_name: 'Mystery Item', quantity: 1 },
  ]);
});

test("an account that doesn't sell a dish ('') never matches it", () => {
  const l = buildResolver(MAP.dishes, 'likod');
  assert.strictEqual(l('Pan Fry Pork Steak Special'), null);
  assert.strictEqual(l(''), null);
});

// --- account failures ---

test('a missing token fails ONE account with a null column; the other computes', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: { TOK_S: 'secret-s' },
    fetchImpl: stubFetch({ 'secret-s': [[receipt('2026-10-03T04:00:00Z', [['Meatball Pasta', 2]])]] }),
  });
  assert.deepStrictEqual(r.accounts[1], { label: 'Likod', ok: false, receiptsScanned: 0, receiptsKept: 0, receiptTypes: {}, error: 'token not set' });
  assert.strictEqual(r.accounts[0].ok, true);
  assert.strictEqual(row(r, 'D001').silingan, 2);
  assert.strictEqual(row(r, 'D001').likod, null);
  assert.ok(r.dishes.every(d => d.likod === null));
});

test('a non-200 fails ONE account with a null column; error never carries the token', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: ENV,
    fetchImpl: stubFetch({
      'secret-s': { status: 401 },
      'secret-l': [[receipt('2026-10-03T04:00:00Z', [['Meatball Pasta', 1]])]],
    }),
  });
  assert.strictEqual(r.accounts[0].ok, false);
  assert.match(r.accounts[0].error, /401/);
  assert.ok(!JSON.stringify(r).includes('secret-s'), 'token leaked');
  assert.ok(r.dishes.every(d => d.silingan === null));
  assert.strictEqual(row(r, 'D001').likod, 1);
});

test('a network error fails ONE account', async () => {
  const fetchImpl = async (url, opts) => {
    if (opts.headers.Authorization.endsWith('secret-l')) throw new Error('getaddrinfo ENOTFOUND');
    return stubFetch({})(url, opts);
  };
  const r = await computePreview({ date: '2026-10-03', nameMap: MAP, env: ENV, fetchImpl });
  assert.strictEqual(r.accounts[0].ok, true);
  assert.deepStrictEqual([r.accounts[1].ok, r.accounts[1].error], [false, 'getaddrinfo ENOTFOUND']);
});

// --- diagnostics / id evidence ---

test('REFUND receipts are counted (GAS behaviour) and reported in receiptTypes', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: ENV,
    fetchImpl: stubFetch({ 'secret-s': [[
      receipt('2026-10-03T04:00:00Z', [['Meatball Pasta', 3]]),
      receipt('2026-10-03T05:00:00Z', [['Meatball Pasta', 1]], { receipt_type: 'REFUND' }),
      receipt('2026-10-03T06:00:00Z', [['Meatball Pasta', 1]], { receipt_type: undefined }),
    ]] }),
  });
  assert.strictEqual(row(r, 'D001').silingan, 5);
  assert.deepStrictEqual(r.accounts[0].receiptTypes, { SALE: 1, REFUND: 1 });
});

test('idCandidates aggregate per (dish, account, item_id, variant_id); wildcard hits carry matchedBy + pattern', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: ENV,
    fetchImpl: stubFetch({ 'secret-s': [[
      receipt('2026-10-03T04:00:00Z', [['Pan Fry Pork Steak Large', 2, 'item-ps', 'v-large', 'Large']]),
      receipt('2026-10-03T05:00:00Z', [['Pan Fry Pork Steak Large', 1, 'item-ps', 'v-large', 'Large']]),
      receipt('2026-10-03T06:00:00Z', [['Pan Fry Pork Steak Small', 4, 'item-ps', 'v-small', 'Small']]),
      receipt('2026-10-03T07:00:00Z', [['Meatball Pasta', 1, 'item-mp', 'v-mp']]),
    ]] }),
  });
  assert.deepStrictEqual(r.idCandidates, [
    { dish_code: 'D002', account: 'Silingan', item_id: 'item-ps', variant_id: 'v-large', item_name: 'Pan Fry Pork Steak Large', variant_name: 'Large', matchedBy: 'wildcard', pattern: 'Pan Fry Pork Steak*', quantity: 3 },
    { dish_code: 'D002', account: 'Silingan', item_id: 'item-ps', variant_id: 'v-small', item_name: 'Pan Fry Pork Steak Small', variant_name: 'Small', matchedBy: 'wildcard', pattern: 'Pan Fry Pork Steak*', quantity: 4 },
    { dish_code: 'D001', account: 'Silingan', item_id: 'item-mp', variant_id: 'v-mp', item_name: 'Meatball Pasta', variant_name: null, matchedBy: 'exact', pattern: 'Meatball Pasta', quantity: 1 },
  ]);
});

// --- output shape ---

test('every map row present in map order, zeros included; no price/total-money key anywhere', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: ENV,
    fetchImpl: stubFetch({ 'secret-s': [[receipt('2026-10-03T04:00:00Z', [['Meatball Pasta', 2]])]] }),
  });
  assert.deepStrictEqual(r.dishes.map(d => d.dish_code), ['D001', 'D002', 'D003', 'D004', 'D005']);
  assert.deepStrictEqual(row(r, 'D005'), { dish_code: 'D005', name: 'Never Sold', silingan: 0, likod: 0, total: 0 });
  assert.deepStrictEqual(row(r, 'D001'), { dish_code: 'D001', name: 'Meatball Pasta', silingan: 2, likod: 0, total: 2 });
  assert.deepStrictEqual(Object.keys(r), ['date', 'accounts', 'dishes', 'unmatched', 'idCandidates']);
  const keys = new Set();
  (function walk(v) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); }
  })(r);
  for (const k of keys) assert.ok(!/price|money|cost|discount|tax|tip/i.test(k), `money key in output: ${k}`);
  assert.ok(!JSON.stringify(r).includes('999'), 'a price value leaked');
});

test('the committed name map loads and every row has a code and both account columns', () => {
  const map = loadNameMap();
  assert.deepStrictEqual(map.accounts.map(a => a.tokenEnv), ['LOYVERSE_SILINGAN_TOKEN', 'LOYVERSE_LIKOD_TOKEN']);
  assert.ok(map.dishes.length > 0);
  for (const d of map.dishes) {
    assert.ok(d.dish_code && typeof d.silingan === 'string' && typeof d.likod === 'string', d.dish_code);
  }
  const l = buildResolver(map.dishes, 'likod');
  assert.strictEqual(l('Pompano (Large)').matchedBy, 'wildcard');
});

test('malformed date is rejected', async () => {
  await assert.rejects(() => computePreview({ date: '2026-13-01', nameMap: MAP, env: ENV, fetchImpl: stubFetch({}) }), /YYYY-MM-DD/);
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
