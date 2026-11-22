// Tests for the Loyverse sales preview engine (Step loyverse-preview-i).
// No network: every test injects a stub fetch that serves canned receipt
// pages. Plain assertions, same "N passed, M failed" count line as the
// rest of the suite.

const assert = require('assert');
const {
  computePreview, computeFcLanding, loadNameMap, isValidDate, manilaDate, businessDate, receiptWindow, normalize, buildResolver,
} = require('./loyversePreview.js');

let passed = 0, failed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

console.log('Loyverse Preview Engine Tests (loyverse-preview-i)\n');

const MAP = {
  accounts: [
    { label: 'Silingan', key: 'silingan', tokenEnv: 'TOK_S', group: 'silingan-likod' },
    { label: 'Likod', key: 'likod', tokenEnv: 'TOK_L', group: 'silingan-likod' },
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

test('window starts at <date>T08:00+08:00 (the business day) and runs +7 days', () => {
  assert.deepStrictEqual(receiptWindow('2026-10-03'), {
    min: '2026-10-03T00:00:00.000Z',
    max: '2026-10-10T00:00:00.000Z',
  });
});

test('UTC -> Manila boundary: 2026-10-02T17:30:00Z is 2026-10-03', () => {
  assert.strictEqual(manilaDate('2026-10-02T17:30:00Z'), '2026-10-03');
  assert.strictEqual(manilaDate('2026-10-02T15:59:59Z'), '2026-10-02');
});

// ADR-033: the sales day turns at 8am Manila.
test('businessDate: 07:59 Manila is the previous day, 08:00 is the new one', () => {
  // 2026-10-30T07:59:59 Manila = 2026-10-29T23:59:59Z -> business date 10-29.
  assert.strictEqual(businessDate('2026-10-29T23:59:59Z'), '2026-10-29');
  // 2026-10-30T08:00:00 Manila = 2026-10-30T00:00:00Z -> business date 10-30.
  assert.strictEqual(businessDate('2026-10-30T00:00:00Z'), '2026-10-30');
  // A past-midnight sale (Manila 01:30) still belongs to the day before.
  assert.strictEqual(businessDate('2026-10-02T17:30:00Z'), '2026-10-02');
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
  assert.strictEqual(u.searchParams.get('created_at_min'), '2026-10-03T00:00:00.000Z');
  assert.strictEqual(u.searchParams.get('created_at_max'), '2026-10-10T00:00:00.000Z');
  assert.strictEqual(u.searchParams.get('limit'), '250');
});

test('a late-synced receipt (created days later) is counted', async () => {
  const late = receipt('2026-10-03T05:00:00Z', [['Meatball Pasta', 2]], { created_at: '2026-10-06T01:00:00Z' });
  const r = await computePreview({ date: '2026-10-03', nameMap: MAP, env: ENV, fetchImpl: stubFetch({ 'secret-s': [[late]] }) });
  assert.strictEqual(row(r, 'D001').silingan, 2);
});

test('8am boundary: Manila 08:00 up to next-day 07:59 is kept, either side is not', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: ENV,
    fetchImpl: stubFetch({ 'secret-s': [[
      receipt('2026-10-02T23:59:59Z', [['Meatball Pasta', 1]]), // Manila 10-03 07:59:59 -> biz 10-02, out
      receipt('2026-10-03T00:00:00Z', [['Meatball Pasta', 2]]), // Manila 10-03 08:00:00 -> biz 10-03, in
      receipt('2026-10-03T23:59:59Z', [['Meatball Pasta', 4]]), // Manila 10-04 07:59:59 -> biz 10-03, in
      receipt('2026-10-04T00:00:00Z', [['Meatball Pasta', 8]]), // Manila 10-04 08:00:00 -> biz 10-04, out
    ]] }),
  });
  assert.strictEqual(row(r, 'D001').silingan, 6); // 2 + 4
  assert.strictEqual(r.accounts[0].receiptsScanned, 4);
  assert.strictEqual(r.accounts[0].receiptsKept, 2);
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

// --- multi-name cells ("old | new"): name-map-refresh ---

test('"A | B" matches both names to the same dish; the matched name is the pattern', () => {
  const dishes = [{ dish_code: 'D001', silingan: 'Alpha | Beta', likod: '' }];
  const s = buildResolver(dishes, 'silingan');
  assert.strictEqual(s('Alpha').dish_code, 'D001');
  assert.strictEqual(s('Beta').dish_code, 'D001');
  assert.strictEqual(s('Alpha').pattern, 'Alpha');
  assert.strictEqual(s('Beta').pattern, 'Beta'); // the single name, not the whole cell
});

test('extra spaces around "|" are ignored and an empty part is dropped', () => {
  const dishes = [{ dish_code: 'D001', silingan: '  Alpha   |   Beta  |  ', likod: '' }];
  const s = buildResolver(dishes, 'silingan');
  assert.strictEqual(s('Alpha').dish_code, 'D001');
  assert.strictEqual(s('Beta').dish_code, 'D001');
  assert.strictEqual(s(''), null); // the empty '|' part never matches ''
});

test('a wildcard after "|" works', () => {
  const dishes = [{ dish_code: 'D014', silingan: '', likod: 'French Cut Pork Chop | Grilled French Chop*' }];
  const l = buildResolver(dishes, 'likod');
  assert.strictEqual(l('French Cut Pork Chop').matchedBy, 'exact');
  const w = l('Grilled French Chop Large');
  assert.strictEqual(w.dish_code, 'D014');
  assert.strictEqual(w.matchedBy, 'wildcard');
  assert.strictEqual(w.pattern, 'Grilled French Chop*'); // the single name, not the whole cell
});

test('an exact name in a later row beats a wildcard in an earlier row', () => {
  const dishes = [
    { dish_code: 'D001', silingan: 'Special*', likod: '' },
    { dish_code: 'D002', silingan: 'Pork Special | Special Combo', likod: '' },
  ];
  const s = buildResolver(dishes, 'silingan');
  assert.strictEqual(s('Special Combo').matchedBy, 'exact'); // D002's exact beats D001's wildcard
  assert.strictEqual(s('Special Combo').dish_code, 'D002');
  assert.strictEqual(s('Special Anything').dish_code, 'D001'); // only the wildcard matches
});

// --- account failures ---

test('a missing token fails ONE account with a null column; the other computes', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: { TOK_S: 'secret-s' },
    fetchImpl: stubFetch({ 'secret-s': [[receipt('2026-10-03T04:00:00Z', [['Meatball Pasta', 2]])]] }),
  });
  assert.deepStrictEqual(r.accounts[1], { label: 'Likod', ok: false, receiptsScanned: 0, receiptsKept: 0, receiptTypes: {}, lastReceiptAt: null, error: 'token not set' });
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

// --- dish total when an account fails (#27 Reading B) ---

test('total sums the accounts that succeeded and sell the dish; a down account is not 0', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: { TOK_S: 'secret-s' }, // Likod token missing
    fetchImpl: stubFetch({ 'secret-s': [[receipt('2026-10-03T04:00:00Z', [['Meatball Pasta', 2]])]] }),
  });
  assert.strictEqual(r.accounts[1].ok, false);    // Likod failed
  assert.strictEqual(row(r, 'D001').likod, null); // its column is null, never 0
  assert.strictEqual(row(r, 'D001').total, 2);    // total = the surviving Silingan, not null, not 0
});

test("a dish the failed account doesn't sell gets an exact total (no '' special case)", async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: ENV,
    fetchImpl: stubFetch({
      'secret-l': { status: 500 }, // Likod down
      'secret-s': [[receipt('2026-10-03T04:00:00Z', [['Pan Fry Pork Steak Special', 4]])]],
    }),
  });
  assert.strictEqual(r.accounts[1].ok, false);    // Likod failed
  assert.strictEqual(row(r, 'D003').likod, null); // Likod doesn't sell D003 ('') -> null column
  assert.strictEqual(row(r, 'D003').total, 4);    // exact: only Silingan sells it, Silingan is up
});

test('total is null only when every account that sells the dish failed - both down', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: {}, // both tokens missing
    fetchImpl: stubFetch({}),
  });
  assert.strictEqual(r.accounts[0].ok, false);
  assert.strictEqual(r.accounts[1].ok, false);
  assert.ok(r.dishes.every(d => d.total === null), 'every total is null when all sellers failed');
});

test('a one-account dish is null when that account is down; a two-account dish keeps the survivor', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: { TOK_L: 'secret-l' }, // Silingan token missing
    fetchImpl: stubFetch({ 'secret-l': [[receipt('2026-10-03T04:00:00Z', [['Meatball  pasta', 5]])]] }),
  });
  assert.strictEqual(r.accounts[0].ok, false);  // Silingan failed
  assert.strictEqual(row(r, 'D003').total, null); // D003 is Silingan-only -> its only seller failed
  assert.strictEqual(row(r, 'D001').total, 5);    // D001 sold by both -> surviving Likod = 5
});

// --- lastReceiptAt (loyverse-preview-iv) ---

test('lastReceiptAt is the latest kitchen receipt, even when receipts arrive out of order', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: ENV,
    fetchImpl: stubFetch({ 'secret-s': [[
      receipt('2026-10-03T06:00:00Z', [['Meatball Pasta', 1]]),
      receipt('2026-10-03T10:00:00Z', [['Meatball Pasta', 1]]), // the latest
      receipt('2026-10-03T08:00:00Z', [['Meatball Pasta', 1]]),
    ]] }),
  });
  assert.strictEqual(r.accounts[0].lastReceiptAt, '2026-10-03T10:00:00Z');
});

test('a later drinks-only (all-unmatched) receipt does not advance lastReceiptAt', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: ENV,
    fetchImpl: stubFetch({ 'secret-s': [[
      receipt('2026-10-03T06:00:00Z', [['Meatball Pasta', 1]]),
      receipt('2026-10-03T09:00:00Z', [['Soda', 3]]),
    ]] }),
  });
  assert.strictEqual(r.accounts[0].lastReceiptAt, '2026-10-03T06:00:00Z');
  assert.strictEqual(r.accounts[0].receiptsKept, 2); // still kept, just not a kitchen receipt
});

test('a later cancelled receipt does not advance lastReceiptAt', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: ENV,
    fetchImpl: stubFetch({ 'secret-s': [[
      receipt('2026-10-03T06:00:00Z', [['Meatball Pasta', 1]]),
      receipt('2026-10-03T09:00:00Z', [['Meatball Pasta', 1]], { cancelled_at: '2026-10-03T09:05:00Z' }),
    ]] }),
  });
  assert.strictEqual(r.accounts[0].lastReceiptAt, '2026-10-03T06:00:00Z');
});

test('a kitchen receipt from another business date does not set lastReceiptAt', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: ENV,
    fetchImpl: stubFetch({ 'secret-s': [[
      receipt('2026-10-03T06:00:00Z', [['Meatball Pasta', 1]]),
      receipt('2026-10-04T00:00:00Z', [['Meatball Pasta', 1]]), // Manila 10-04 08:00 -> biz 10-04
    ]] }),
  });
  assert.strictEqual(r.accounts[0].lastReceiptAt, '2026-10-03T06:00:00Z');
});

test('a REFUND with a kitchen line still sets lastReceiptAt', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: ENV,
    fetchImpl: stubFetch({ 'secret-s': [[
      receipt('2026-10-03T06:00:00Z', [['Meatball Pasta', 1]]),
      receipt('2026-10-03T09:00:00Z', [['Meatball Pasta', 1]], { receipt_type: 'REFUND' }),
    ]] }),
  });
  assert.strictEqual(r.accounts[0].lastReceiptAt, '2026-10-03T09:00:00Z');
});

test('an ok account with no kitchen receipt has lastReceiptAt null', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: ENV,
    fetchImpl: stubFetch({ 'secret-s': [[receipt('2026-10-03T06:00:00Z', [['Soda', 2]])]] }),
  });
  assert.strictEqual(r.accounts[0].ok, true);
  assert.strictEqual(r.accounts[0].lastReceiptAt, null);
});

test('a failed account (non-200) has lastReceiptAt null; a healthy one still reports its time', async () => {
  const r = await computePreview({
    date: '2026-10-03', nameMap: MAP, env: ENV,
    fetchImpl: stubFetch({
      'secret-s': { status: 500 },
      'secret-l': [[receipt('2026-10-03T06:00:00Z', [['Meatball  pasta', 1]])]],
    }),
  });
  assert.strictEqual(r.accounts[0].ok, false);
  assert.strictEqual(r.accounts[0].lastReceiptAt, null);
  assert.strictEqual(r.accounts[1].lastReceiptAt, '2026-10-03T06:00:00Z');
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
  assert.deepStrictEqual(Object.keys(r), ['date', 'accounts', 'dishes', 'unmatched', 'idCandidates', 'pizza']);
  assert.strictEqual(r.pizza, null, 'no pizza list in this map');
  const keys = new Set();
  (function walk(v) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); }
  })(r);
  for (const k of keys) assert.ok(!/price|money|cost|discount|tax|tip/i.test(k), `money key in output: ${k}`);
  assert.ok(!JSON.stringify(r).includes('999'), 'a price value leaked');
});

test('the committed name map loads with 44 dishes and resolves the October renames', () => {
  const map = loadNameMap();
  assert.deepStrictEqual(map.accounts.map(a => [a.tokenEnv, a.group]), [
    ['LOYVERSE_SILINGAN_TOKEN', 'silingan-likod'],
    ['LOYVERSE_LIKOD_TOKEN', 'silingan-likod'],
    ['LOYVERSE_FC_TOKEN', 'fc'],
  ]);
  assert.strictEqual(map.dishes.length, 44);
  for (const d of map.dishes) {
    assert.ok(d.dish_code && typeof d.silingan === 'string' && typeof d.likod === 'string', d.dish_code);
  }
  const l = buildResolver(map.dishes, 'likod');
  assert.strictEqual(l('Pompano (Large)').matchedBy, 'wildcard');
  assert.strictEqual(l('Pork Slab Bagnet').dish_code, 'D016');
  assert.strictEqual(l('Whole Chicken').dish_code, 'D022');
  assert.strictEqual(l('Mozzarella stick').dish_code, 'D001');
  assert.strictEqual(l('Beef Nilaga').dish_code, 'D037');
  const s = buildResolver(map.dishes, 'silingan');
  assert.strictEqual(s('Beef Nilaga').dish_code, 'D037');
  assert.strictEqual(s('Braised Beef Trays'), null);
  // 2026-11-22: Silingan's Kare-Kare is D044, exact name only (the head chef).
  assert.strictEqual(s('Kare-Kare').dish_code, 'D044');
  assert.strictEqual(s('Crispy Kare-Kare'), null);
  assert.strictEqual(s('Kare-Kare Trays'), null);
  assert.strictEqual(l('Kare-Kare'), null);
});

test('malformed date is rejected', async () => {
  await assert.rejects(() => computePreview({ date: '2026-13-01', nameMap: MAP, env: ENV, fetchImpl: stubFetch({}) }), /YYYY-MM-DD/);
});

// --- Step loyverse-fc: FC's account in the map ---

const FC_ACCOUNT = { label: 'FC', key: 'fc', tokenEnv: 'TOK_FC', group: 'fc' };
const MAP_FC = { ...MAP, accounts: [...MAP.accounts, FC_ACCOUNT] };

// Routes by path: /receipts pages as stubFetch; /items and /categories from
// `catalog[token]` ({ items, categories } or { itemsStatus / categoriesStatus }).
function stubFetchFc(receiptPages, catalog = {}, calls = []) {
  const receipts = stubFetch(receiptPages, calls);
  return async (url, opts) => {
    const u = new URL(url);
    const token = opts.headers.Authorization.replace('Bearer ', '');
    if (u.pathname.endsWith('/receipts')) return receipts(url, opts);
    calls.push({ token, url: u });
    const c = catalog[token] || {};
    const kind = u.pathname.endsWith('/items') ? 'items' : 'categories';
    const status = c[kind + 'Status'];
    if (status) return { status, text: async () => 'nope ' + token, json: async () => ({}) };
    return { status: 200, text: async () => '', json: async () => ({ [kind]: c[kind] || [], cursor: null }) };
  };
}

const ENV_FC = { ...ENV, TOK_FC: 'secret-fc' };
const D = '2026-10-03T04:00:00Z';

test('loyverse-fc: the dish preview is byte-for-byte the same with FC in the map, token set or not', async () => {
  const pages = {
    'secret-s': [[receipt(D, [['Meatball Pasta', 2], ['Odd', 1]])]],
    'secret-l': [[receipt(D, [['Meatball pasta', 3]])]],
    'secret-fc': [[receipt(D, [['Margherita', 9]])]],
  };
  const base = JSON.stringify(await computePreview({ date: '2026-10-03', nameMap: MAP, env: ENV, fetchImpl: stubFetch(pages) }));
  const calls = [];
  const withToken = JSON.stringify(await computePreview({ date: '2026-10-03', nameMap: MAP_FC, env: ENV_FC, fetchImpl: stubFetch(pages, calls) }));
  const noToken = JSON.stringify(await computePreview({ date: '2026-10-03', nameMap: MAP_FC, env: ENV, fetchImpl: stubFetch(pages) }));
  assert.strictEqual(withToken, base);
  assert.strictEqual(noToken, base);
  assert.ok(calls.every(c => c.token !== 'secret-fc'), 'FC fetched by the dish preview');
});

// --- Step landing-sales: FC's landing lines and the Pizza tables (ADR-094) ---

// The committed map's FC landing and pizza lists, on the test accounts.
const REAL = loadNameMap();
const MAP_LS = { ...MAP_FC, pizza: REAL.pizza, fcLanding: REAL.fcLanding };

function cat(token, categories, items) {
  return { [token]: { categories, items: items.map(([name, category_id, deleted_at = null]) => ({ id: 'i-' + name, item_name: name, category_id, deleted_at })) } };
}
const FC_CAT = cat('secret-fc',
  [{ id: 'c-pz', name: 'Pizza' }, { id: 'c-ap', name: 'ADD-ONS  pizza' }, { id: 'c-k', name: 'Kitchen' }],
  [
    ['Margherita', 'c-pz'], ['Pepperoni', 'c-pz'], ['Extra Cheese', 'c-ap'], ['FREE CHEESE PIZZA', 'c-k'],
    ['Old Hawaiian', 'c-pz', '2026-09-01T00:00:00Z'], ['Gone Veggie', 'c-pz', '2026-09-01T00:00:00Z'],
    ['PORK BAGNET - SOLO', 'c-k'],
  ]);
const LEFT_CAT = {
  ...cat('secret-s', [{ id: 's-pz', name: 'PIZZA' }], [['Margherita', 's-pz'], ['Garlic Bread', 's-pz'], ['Pasta', null]]),
  ...cat('secret-l', [{ id: 'l-pz', name: 'Likod Pizza' }, { id: 'l-x', name: 'PIZZA' }], [['margherita ', 'l-pz'], ['Quattro', 'l-pz'], ['Decoy', 'l-x']]),
};

async function fc(receipts, catalog = FC_CAT, env = ENV_FC) {
  return computeFcLanding({ date: '2026-10-03', nameMap: MAP_LS, env, fetchImpl: stubFetchFc({ 'secret-fc': [receipts] }, catalog) });
}
function line(r, name) { return r.landing.find(l => l.line === name); }

test('landing-sales: a Pork Bagnet platter adds 3 to BAGNET and lists as portions 3', async () => {
  const r = await fc([receipt(D, [['PLATTER - PORK BAGNET', 1], ['Pork Bagnet - Solo', 2]])]);
  const b = line(r, 'BAGNET');
  assert.strictEqual(b.sold, 5);
  assert.deepStrictEqual(b.items, [
    { name: 'Pork Bagnet - Solo', quantity: 2, portions: 1 },
    { name: 'PLATTER - PORK BAGNET', quantity: 1, portions: 3 },
  ]);
  assert.strictEqual(b.taken, 0);
  assert.deepStrictEqual(b.takenBy, []);
});

test('landing-sales: Laing Pork - Solo x2 gives LAING 2 and BAGNET taken 1', async () => {
  const r = await fc([receipt(D, [['LAING PORK - SOLO', 2]])]);
  assert.strictEqual(line(r, 'LAING').sold, 2);
  assert.deepStrictEqual(line(r, 'LAING').items, [{ name: 'LAING PORK - SOLO', quantity: 2, portions: 1 }]);
  assert.strictEqual(line(r, 'BAGNET').sold, 0);
  assert.strictEqual(line(r, 'BAGNET').taken, 1);
  assert.deepStrictEqual(line(r, 'BAGNET').takenBy, [{ name: 'LAING PORK - SOLO', quantity: 2, amount: 0.5 }]);
});

test('landing-sales: CPA takes from Bagnet and Quarter; Half takes 1/2 a Whole Chicken', async () => {
  const r = await fc([receipt(D, [['CHICKEN PORK ADOBO - SOLO', 3], ['PLATTER - CHICKEN PORK ADOBO', 1], ['HALF CHICKEN', 3]])]);
  assert.strictEqual(line(r, 'CPA').sold, 5);
  assert.strictEqual(line(r, 'BAGNET').taken, 2.5);
  assert.strictEqual(line(r, 'QUARTER').taken, 4);
  assert.strictEqual(line(r, 'QUARTER').sold, 0);
  assert.strictEqual(line(r, 'HALF').sold, 3);
  assert.strictEqual(line(r, 'WHOLE CHICKEN').taken, 1.5);
});

test('landing-sales: a burger counts on its patty line and on Burger Buns', async () => {
  const r = await fc([receipt(D, [['HOMEMADE BURGER', 2], ['CHICKEN BURGER', 1]])]);
  assert.strictEqual(line(r, 'BURGER PATTY').sold, 2);
  assert.strictEqual(line(r, 'CHICKEN BRGR').sold, 1);
  assert.strictEqual(line(r, 'BURGER BUNS').sold, 3);
  assert.deepStrictEqual(line(r, 'BURGER BUNS').items.map(i => i.name), ['HOMEMADE BURGER', 'CHICKEN BURGER']);
});

test('landing-sales: an add-on with "pos": {} adds to the line it takes from and to no line of its own', async () => {
  const r = await fc([receipt(D, [['PORK 150grms (Add ons)', 2]])]);
  assert.deepStrictEqual(line(r, 'BAGNET').takenBy, [{ name: 'PORK 150grms (Add ons)', quantity: 2, amount: 1 }]);
  assert.strictEqual(line(r, 'BAGNET').taken, 2);
  for (const l of r.landing) {
    assert.strictEqual(l.sold, 0, l.line);
    assert.deepStrictEqual(l.items, [], l.line);
  }
  assert.deepStrictEqual(r.other, []);
});

test('landing-sales: a refund subtracts from sold and taken; a cancelled receipt counts nothing', async () => {
  const r = await fc([
    receipt(D, [['PLATTER - LAING PORK', 3]]),
    receipt(D, [['PLATTER - LAING PORK', 1]], { receipt_type: 'REFUND' }),
    receipt(D, [['PLATTER - LAING PORK', 50], ['BEEF TAPA', 9]], { cancelled_at: D }),
    receipt('2026-10-04T04:00:00Z', [['BEEF TAPA', 7]]), // another business date
  ]);
  assert.strictEqual(line(r, 'LAING').sold, 4);
  assert.deepStrictEqual(line(r, 'LAING').items, [{ name: 'PLATTER - LAING PORK', quantity: 2, portions: 2 }]);
  assert.strictEqual(line(r, 'BAGNET').taken, 2);
  assert.strictEqual(line(r, 'BEEF TAPA').sold, 0);
  assert.deepStrictEqual(r.accounts[0].receiptTypes, { SALE: 1, REFUND: 1 });
  assert.strictEqual(r.accounts[0].receiptsKept, 2);
});

test('landing-sales: an item refunded to 0 is left out of items and other', async () => {
  const r = await fc([
    receipt(D, [['BEEF TAPA', 1], ['Rice', 2]]),
    receipt(D, [['BEEF TAPA', 1], ['Rice', 2]], { receipt_type: 'REFUND' }),
  ]);
  assert.deepStrictEqual(line(r, 'BEEF TAPA'), { line: 'BEEF TAPA', sold: 0, taken: 0, items: [], takenBy: [] });
  assert.deepStrictEqual(r.other, []);
});

test('landing-sales: an unknown item lands in other, biggest first then by name', async () => {
  const r = await fc([receipt(D, [['Iced Tea', 2], ['Rice', 5], ['banana Shake', 2], ['rice', 1], ['Margherita', 1]])]);
  assert.deepStrictEqual(r.other, [
    { name: 'Rice', quantity: 6 },
    { name: 'banana Shake', quantity: 2 },
    { name: 'Iced Tea', quantity: 2 },
  ]);
});

test('landing-sales: every line in the file order, 0s included (Pork Jowl at 0); no sales -> all 0, other empty', async () => {
  const r = await fc([receipt(D, [['BEEF TAPA', 1]])]);
  assert.deepStrictEqual(r.landing.map(l => l.line), REAL.fcLanding.lines);
  assert.deepStrictEqual(line(r, 'PORK JOWL'), { line: 'PORK JOWL', sold: 0, taken: 0, items: [], takenBy: [] });
  assert.strictEqual(r.landing[0].line, 'PORK JOWL');
  const empty = await fc([]);
  assert.strictEqual(empty.accounts[0].ok, true);
  assert.strictEqual(empty.landing.length, 27);
  assert.ok(empty.landing.every(l => l.sold === 0 && l.taken === 0));
  assert.deepStrictEqual(empty.other, []);
  assert.ok(empty.pizza.rows.every(p => p.fc === 0 && p.total === 0));
});

test('landing-sales: FC body shape; the Pizza table lists every pizza item, unsold at 0, sorted by name', async () => {
  const r = await fc([receipt(D, [['Pepperoni', 2], ['Extra Cheese', 1], ['Gone Veggie', 1]])]);
  assert.deepStrictEqual(Object.keys(r), ['date', 'group', 'accounts', 'landing', 'pizza', 'other']);
  assert.strictEqual(r.group, 'fc');
  assert.deepStrictEqual(Object.keys(r.landing[0]), ['line', 'sold', 'taken', 'items', 'takenBy']);
  assert.deepStrictEqual(r.pizza, {
    columns: ['fc'],
    rows: [
      { name: 'Extra Cheese', fc: 1, total: 1 },
      { name: 'FREE CHEESE PIZZA', fc: 0, total: 0 },
      { name: 'Gone Veggie', fc: 1, total: 1 }, // deleted, but sold that day
      { name: 'Margherita', fc: 0, total: 0 },
      { name: 'Pepperoni', fc: 2, total: 2 },
    ],
  });
  assert.deepStrictEqual(r.other, [], 'a pizza is not in other');
});

test('landing-sales: "FREE * PIZZA" matches "FREE CHEESE PIZZA"', async () => {
  const r = await fc([receipt(D, [['FREE CHEESE PIZZA', 2]])]);
  assert.deepStrictEqual(r.pizza.rows.find(p => p.name === 'FREE CHEESE PIZZA'), { name: 'FREE CHEESE PIZZA', fc: 2, total: 2 });
  const resolve = buildResolver([{ dish_code: 'x', n: 'FREE * PIZZA' }], 'n');
  assert.ok(resolve('free cheese pizza'));
  assert.strictEqual(resolve('FREE PIZZA'), null);
});

test('landing-sales: FC /items or /categories failing -> landing still counts, pizza null, pizza sales in other', async () => {
  for (const failing of ['itemsStatus', 'categoriesStatus']) {
    const catalog = { 'secret-fc': { ...FC_CAT['secret-fc'], [failing]: 500 } };
    const r = await fc([receipt(D, [['Pepperoni', 2], ['PORK BAGNET - SOLO', 1]])], catalog);
    assert.strictEqual(r.accounts[0].ok, true, failing);
    assert.ok(/500/.test(r.accounts[0].catalogError), failing);
    assert.strictEqual(r.pizza, null, failing);
    assert.strictEqual(line(r, 'BAGNET').sold, 1, failing);
    assert.deepStrictEqual(r.other, [{ name: 'Pepperoni', quantity: 2 }], failing);
    assert.ok(!JSON.stringify(r).includes('secret-fc'), 'token leaked (' + failing + ')');
  }
});

test('landing-sales: an unset FC token fails only FC (pizza null); a receipts failure never carries the token', async () => {
  const unset = await fc([], FC_CAT, ENV);
  assert.deepStrictEqual(unset.accounts.map(a => [a.label, a.ok, a.error]), [['FC', false, 'token not set']]);
  assert.strictEqual(unset.pizza, null);
  const bad = await computeFcLanding({
    date: '2026-10-03', nameMap: MAP_LS, env: ENV_FC, fetchImpl: stubFetchFc({ 'secret-fc': { status: 401 } }),
  });
  assert.strictEqual(bad.accounts[0].ok, false);
  assert.ok(/401/.test(bad.accounts[0].error));
  assert.ok(!JSON.stringify(bad).includes('secret-fc'));
  const thrown = await computeFcLanding({
    date: '2026-10-03', nameMap: MAP_LS, env: ENV_FC,
    fetchImpl: async () => { throw new Error('socket hang up for secret-fc'); },
  });
  assert.strictEqual(thrown.accounts[0].ok, false);
  assert.ok(!JSON.stringify(thrown).includes('secret-fc'));
  await assert.rejects(() => computeFcLanding({ date: '2026-13-01', nameMap: MAP_LS, env: ENV_FC, fetchImpl: stubFetchFc({}) }), /YYYY-MM-DD/);
});

function left(pages, catalog = LEFT_CAT, env = ENV_FC) {
  return computePreview({ date: '2026-10-03', nameMap: MAP_LS, env, fetchImpl: stubFetchFc(pages, catalog) });
}

test("landing-sales: the left Pizza table puts one name's Silingan and Likod counts on one row", async () => {
  const r = await left({
    'secret-s': [[receipt(D, [['Margherita', 2], ['Meatball Pasta', 1]])]],
    'secret-l': [[receipt(D, [['margherita ', 3], ['Decoy', 4]])]],
  });
  assert.deepStrictEqual(Object.keys(r), ['date', 'accounts', 'dishes', 'unmatched', 'idCandidates', 'pizza']);
  assert.deepStrictEqual(r.pizza, {
    columns: ['silingan', 'likod'],
    rows: [
      { name: 'Garlic Bread', silingan: 0, likod: 0, total: 0 },
      { name: 'Margherita', silingan: 2, likod: 3, total: 5 },
      { name: 'Quattro', silingan: 0, likod: 0, total: 0 },
    ],
  });
  assert.strictEqual(row(r, 'D001').total, 1, 'the dish table is unchanged');
  assert.ok(r.unmatched.some(u => u.item_name === 'Margherita'), 'pizza still unmatched in the dish table');
});

test('landing-sales: Likod failing gives null in its column and Silingan\'s count as the total', async () => {
  const pages = { 'secret-s': [[receipt(D, [['Margherita', 2]])]], 'secret-l': { status: 401 } };
  const r = await left(pages);
  assert.deepStrictEqual(r.pizza.rows.find(p => p.name === 'Margherita'), { name: 'Margherita', silingan: 2, likod: null, total: 2 });
  assert.deepStrictEqual(r.pizza.rows.map(p => p.name), ['Garlic Bread', 'Margherita']);
  const unset = await left({ 'secret-s': [[receipt(D, [['Margherita', 2]])]] }, LEFT_CAT, { TOK_S: 'secret-s' });
  assert.strictEqual(unset.pizza.rows.find(p => p.name === 'Margherita').likod, null);
  const catalogDown = await left(
    { 'secret-s': [[receipt(D, [['Margherita', 2]])]], 'secret-l': [[receipt(D, [['margherita', 1]])]] },
    { ...LEFT_CAT, 'secret-l': { ...LEFT_CAT['secret-l'], itemsStatus: 503 } },
  );
  assert.ok(/503/.test(catalogDown.accounts[1].catalogError));
  assert.strictEqual(catalogDown.accounts[1].ok, true);
  assert.deepStrictEqual(catalogDown.pizza.rows.find(p => p.name === 'Margherita'), { name: 'Margherita', silingan: 2, likod: null, total: 2 });
  const bothDown = await left({ 'secret-s': { status: 500 }, 'secret-l': { status: 500 } });
  assert.strictEqual(bothDown.pizza, null);
});

test('landing-sales: refunds subtract in the left Pizza table; the dish table keeps counting them', async () => {
  const r = await left({
    'secret-s': [[
      receipt(D, [['Margherita', 3], ['Meatball Pasta', 1]]),
      receipt(D, [['Margherita', 1], ['Meatball Pasta', 1]], { receipt_type: 'REFUND' }),
    ]],
  });
  assert.strictEqual(r.pizza.rows.find(p => p.name === 'Margherita').silingan, 2);
  assert.strictEqual(row(r, 'D001').silingan, 2, 'dish table: refund still counted like a sale');
});

test('landing-sales: no price or money field in either body (the 999 price never leaks)', async () => {
  const bodies = [
    await fc([receipt(D, [['PLATTER - PORK BAGNET', 1], ['Pepperoni', 1], ['Rice', 1]])]),
    await left({ 'secret-s': [[receipt(D, [['Margherita', 2], ['Meatball Pasta', 1]])]] }),
  ];
  for (const b of bodies) {
    const keys = new Set();
    (function walk(v) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); }
    })(b);
    for (const k of keys) assert.ok(!/price|money|cost|discount|tax|tip/i.test(k), `money key in output: ${k}`);
    assert.ok(!JSON.stringify(b).includes('999'), 'a price value leaked');
  }
});

test('landing-sales: the committed map - lines unique, every pos/takes key a line, amounts positive, no name twice', () => {
  const { lines, items } = REAL.fcLanding;
  assert.strictEqual(lines.length, 27);
  assert.strictEqual(new Set(lines).size, lines.length, 'a line name appears twice');
  const seen = new Set();
  for (const item of items) {
    assert.ok(typeof item.name === 'string' && item.name.trim(), 'an item without a name');
    for (const part of item.name.split('|').map(normalize).filter(Boolean)) {
      assert.ok(!seen.has(part), `item name twice: ${part}`);
      seen.add(part);
    }
    assert.ok(item.pos && typeof item.pos === 'object', item.name);
    for (const field of ['pos', 'takes']) {
      for (const [l, n] of Object.entries(item[field] || {})) {
        assert.ok(lines.includes(l), `${item.name}: ${field} key "${l}" is not a line`);
        assert.ok(typeof n === 'number' && Number.isFinite(n) && n > 0, `${item.name}: ${field}.${l} = ${n}`);
      }
    }
  }
  assert.deepStrictEqual(REAL.pizza, {
    silingan: { categories: ['PIZZA'] },
    likod: { categories: ['Likod Pizza'] },
    fc: { categories: ['PIZZA', 'ADD-ONS PIZZA'], items: ['FREE * PIZZA'] },
  });
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
