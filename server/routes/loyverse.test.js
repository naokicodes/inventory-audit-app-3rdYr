// Tests for GET /api/loyverse/preview (Step loyverse-preview-i). Calls the
// route's exported handler with a stub env + fetch - no network, no DB.
// One test also mounts the real router on an ephemeral port to check the
// HTTP wiring (400 on a malformed date, before any fetch).

const assert = require('assert');
const express = require('express');
const router = require('./loyverse.js');
const { createCache } = router;
// Every test gets its own cache (Step sales-cache) and a fixed now unless it
// passes one, so results never leak between tests.
const FIXED_NOW = new Date('2026-10-03T04:00:00Z'); // Manila 10-03 12:00, business date 10-03
const handlePreview = (query, deps = {}) => router.handlePreview(query, { cache: createCache(), now: FIXED_NOW, ...deps });

let passed = 0, failed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

console.log('Loyverse Preview Route Tests (loyverse-preview-i)\n');

const MAP = {
  accounts: [
    { label: 'Silingan', key: 'silingan', tokenEnv: 'LOYVERSE_SILINGAN_TOKEN', group: 'silingan-likod' },
    { label: 'Likod', key: 'likod', tokenEnv: 'LOYVERSE_LIKOD_TOKEN', group: 'silingan-likod' },
  ],
  dishes: [
    { dish_code: 'D001', name: 'Meatball Pasta', silingan: 'Meatball Pasta', likod: 'Meatball Pasta', note: '' },
    { dish_code: 'D002', name: 'Hummus', silingan: 'Hummus', likod: '', note: '' },
  ],
};

function fetchServing(receiptsByToken, calls = []) {
  return async (url, opts) => {
    const token = opts.headers.Authorization.replace('Bearer ', '');
    calls.push(new URL(url));
    return { status: 200, text: async () => '', json: async () => ({ receipts: receiptsByToken[token] || [], cursor: null }) };
  };
}

test('malformed date -> 400, nothing fetched', async () => {
  for (const date of ['2026-10-3', 'yesterday', '2026-02-30']) {
    const calls = [];
    const r = await handlePreview({ date }, { nameMap: MAP, env: {}, fetchImpl: fetchServing({}, calls) });
    assert.strictEqual(r.status, 400, date);
    assert.strictEqual(calls.length, 0);
  }
});

test("no date -> today's business date (ADR-033: past-midnight is the day before)", async () => {
  const calls = [];
  const r = await handlePreview({}, {
    nameMap: MAP, env: { LOYVERSE_SILINGAN_TOKEN: 's', LOYVERSE_LIKOD_TOKEN: 'l' },
    fetchImpl: fetchServing({}, calls), now: new Date('2026-10-02T17:30:00Z'), // Manila 10-03 01:30
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.date, '2026-10-02'); // 01:30am belongs to the 10-02 business day
  assert.strictEqual(calls[0].searchParams.get('created_at_min'), '2026-10-02T00:00:00.000Z');
});

test('response shape: date, accounts, dishes (all rows, zeros), unmatched, idCandidates', async () => {
  const r = await handlePreview({ date: '2026-10-03' }, {
    nameMap: MAP, env: { LOYVERSE_SILINGAN_TOKEN: 's', LOYVERSE_LIKOD_TOKEN: 'l' },
    fetchImpl: fetchServing({
      s: [{ receipt_date: '2026-10-03T03:00:00Z', receipt_type: 'SALE', cancelled_at: null,
        line_items: [{ item_name: 'Meatball Pasta', quantity: 2, item_id: 'a', variant_id: 'b', price: 120 }, { item_name: 'Odd', quantity: 1 }] }],
      l: [{ receipt_date: '2026-10-03T03:00:00Z', receipt_type: 'SALE', cancelled_at: null,
        line_items: [{ item_name: 'Meatball Pasta', quantity: 3, item_id: 'a', variant_id: 'b' }] }],
    }),
  });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.accounts, [
    { label: 'Silingan', ok: true, receiptsScanned: 1, receiptsKept: 1, receiptTypes: { SALE: 1 }, lastReceiptAt: '2026-10-03T03:00:00Z' },
    { label: 'Likod', ok: true, receiptsScanned: 1, receiptsKept: 1, receiptTypes: { SALE: 1 }, lastReceiptAt: '2026-10-03T03:00:00Z' },
  ]);
  assert.deepStrictEqual(r.body.dishes, [
    { dish_code: 'D001', name: 'Meatball Pasta', silingan: 2, likod: 3, total: 5 },
    { dish_code: 'D002', name: 'Hummus', silingan: 0, likod: 0, total: 0 },
  ]);
  assert.deepStrictEqual(r.body.unmatched, [{ account: 'Silingan', item_name: 'Odd', quantity: 1 }]);
  assert.strictEqual(r.body.idCandidates.length, 2);
  assert.ok(!/price|money/i.test(JSON.stringify(r.body)), 'money field in response');
});

test('a missing token -> that account { ok:false, error:"token not set" }, its column null', async () => {
  const r = await handlePreview({ date: '2026-10-03' }, {
    nameMap: MAP, env: { LOYVERSE_SILINGAN_TOKEN: 's' }, fetchImpl: fetchServing({}),
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.accounts[0].ok, true);
  assert.strictEqual(r.body.accounts[1].ok, false);
  assert.strictEqual(r.body.accounts[1].error, 'token not set');
  assert.deepStrictEqual(r.body.dishes.map(d => [d.silingan, d.likod]), [[0, null], [0, null]]);
});

test('HTTP: router mounted under /api answers 400 for a malformed date', async () => {
  const app = express();
  app.use('/api', router);
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/api/loyverse/preview?date=bad`);
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error: 'date must be YYYY-MM-DD' });
  } finally {
    server.close();
  }
});

// --- Step loyverse-fc: ?pos= ---

const MAP_FC = {
  ...MAP,
  accounts: [...MAP.accounts, { label: 'FC', key: 'fc', tokenEnv: 'LOYVERSE_FC_TOKEN', group: 'fc' }],
};
const SL_RECEIPTS = {
  s: [{ receipt_date: '2026-10-03T03:00:00Z', receipt_type: 'SALE', cancelled_at: null,
    line_items: [{ item_name: 'Meatball Pasta', quantity: 2, item_id: 'a', variant_id: 'b' }] }],
  l: [],
  f: [{ receipt_date: '2026-10-03T03:00:00Z', receipt_type: 'SALE', cancelled_at: null,
    line_items: [{ item_name: 'Margherita', quantity: 4, item_id: 'm', variant_id: 'v', price: 450, total_money: 1800 }] }],
};
// Receipts as fetchServing; /items and /categories for FC's token only.
function fetchFc(calls = []) {
  const receipts = fetchServing(SL_RECEIPTS, calls);
  return async (url, opts) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/receipts')) return receipts(url, opts);
    calls.push(u);
    const body = u.pathname.endsWith('/items')
      ? { items: [{ id: 'm', item_name: 'Margherita', category_id: 'p' }], cursor: null }
      : { categories: [{ id: 'p', name: 'Pizza' }], cursor: null };
    return { status: 200, text: async () => '', json: async () => body };
  };
}

test('loyverse-fc: no pos and pos=silingan-likod return the same body as before FC, FC token set or not', async () => {
  const before = await handlePreview({ date: '2026-10-03' }, {
    nameMap: MAP, env: { LOYVERSE_SILINGAN_TOKEN: 's', LOYVERSE_LIKOD_TOKEN: 'l' }, fetchImpl: fetchFc(),
  });
  for (const pos of [undefined, '', 'silingan-likod']) {
    for (const env of [
      { LOYVERSE_SILINGAN_TOKEN: 's', LOYVERSE_LIKOD_TOKEN: 'l' },
      { LOYVERSE_SILINGAN_TOKEN: 's', LOYVERSE_LIKOD_TOKEN: 'l', LOYVERSE_FC_TOKEN: 'f' },
    ]) {
      const calls = [];
      const r = await handlePreview({ date: '2026-10-03', pos }, { nameMap: MAP_FC, env, fetchImpl: fetchFc(calls) });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(JSON.stringify(r.body), JSON.stringify(before.body), `pos=${pos}`);
      assert.ok(calls.every(u => u.pathname.endsWith('/receipts')), 'catalog fetched for the dish preview');
    }
  }
});

// Step landing-sales (ADR-094): FC's side is its landing lines, a Pizza table
// and everything else sold. The rows' `total` is a count, not money.
const MAP_LS = {
  ...MAP_FC,
  pizza: { fc: { categories: ['PIZZA'] } },
  fcLanding: { lines: ['BEEF TAPA', 'PORK JOWL'], items: [{ name: 'BEEF TAPA', pos: { 'BEEF TAPA': 1 } }] },
};

test('landing-sales: pos=fc returns the landing body, no money field, token not in the body', async () => {
  const r = await handlePreview({ date: '2026-10-03', pos: 'fc' }, {
    nameMap: MAP_LS, env: { LOYVERSE_SILINGAN_TOKEN: 's', LOYVERSE_LIKOD_TOKEN: 'l', LOYVERSE_FC_TOKEN: 'f' }, fetchImpl: fetchFc(),
  });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(Object.keys(r.body), ['date', 'group', 'accounts', 'landing', 'pizza', 'other', 'fetchedAt']);
  assert.strictEqual(r.body.group, 'fc');
  assert.deepStrictEqual(r.body.accounts.map(a => a.label), ['FC']);
  assert.deepStrictEqual(r.body.landing, [
    { line: 'BEEF TAPA', sold: 0, taken: 0, items: [], takenBy: [] },
    { line: 'PORK JOWL', sold: 0, taken: 0, items: [], takenBy: [] },
  ]);
  assert.deepStrictEqual(r.body.pizza, { columns: ['fc'], rows: [{ name: 'Margherita', fc: 4, total: 4 }] });
  assert.deepStrictEqual(r.body.other, []);
  const text = JSON.stringify(r.body);
  assert.ok(!/price|money|cost/i.test(text), 'money field in FC body');
  assert.ok(!text.includes('450') && !text.includes('1800'), 'a money value leaked');
  assert.ok(!text.includes('"f"'), 'token in the body');
});

test('landing-sales: pos=fc with the committed map lists its 27 lines in order; the left body gains pizza', async () => {
  const env = { LOYVERSE_SILINGAN_TOKEN: 's', LOYVERSE_LIKOD_TOKEN: 'l', LOYVERSE_FC_TOKEN: 'f' };
  const r = await handlePreview({ date: '2026-10-03', pos: 'fc' }, { env, fetchImpl: fetchFc() });
  assert.strictEqual(r.body.landing.length, 27);
  assert.strictEqual(r.body.landing[0].line, 'PORK JOWL');
  assert.strictEqual(r.body.landing[26].line, 'QUARTER');
  const leftSide = await handlePreview({ date: '2026-10-03' }, { env, fetchImpl: fetchFc() });
  assert.deepStrictEqual(leftSide.body.pizza.columns, ['silingan', 'likod']);
});

test('loyverse-fc: an unset FC token fails only FC; the left side is untouched', async () => {
  const env = { LOYVERSE_SILINGAN_TOKEN: 's', LOYVERSE_LIKOD_TOKEN: 'l' };
  const fc = await handlePreview({ date: '2026-10-03', pos: 'fc' }, { nameMap: MAP_FC, env, fetchImpl: fetchFc() });
  assert.strictEqual(fc.status, 200);
  assert.deepStrictEqual(fc.body.accounts.map(a => [a.label, a.ok, a.error]), [['FC', false, 'token not set']]);
  const left = await handlePreview({ date: '2026-10-03' }, { nameMap: MAP_FC, env, fetchImpl: fetchFc() });
  assert.ok(left.body.accounts.every(a => a.ok));
});

test('loyverse-fc: pos=nope -> 400, nothing fetched', async () => {
  const calls = [];
  const r = await handlePreview({ date: '2026-10-03', pos: 'nope' }, { nameMap: MAP_FC, env: {}, fetchImpl: fetchFc(calls) });
  assert.strictEqual(r.status, 400);
  assert.deepStrictEqual(r.body, { error: 'pos must be one of: silingan-likod, fc' });
  assert.strictEqual(calls.length, 0);
});

// --- Step sales-cache (ADR-112) ---

const ENV_SL = { LOYVERSE_SILINGAN_TOKEN: 's', LOYVERSE_LIKOD_TOKEN: 'l', LOYVERSE_FC_TOKEN: 'f' };
const at = (base, minutes) => new Date(base.getTime() + minutes * 60 * 1000);
// A counting stub fetch: every Loyverse call lands in `calls`.
function counting() {
  const calls = [];
  return { calls, fetchImpl: fetchFc(calls) };
}

test('sales-cache: today is reused within 2 minutes and fetched after', async () => {
  const { calls, fetchImpl } = counting();
  const deps = { nameMap: MAP_FC, env: ENV_SL, fetchImpl, cache: createCache() };
  await handlePreview({ date: '2026-10-03' }, { ...deps, now: FIXED_NOW });
  const n = calls.length;
  assert.ok(n > 0);
  await handlePreview({ date: '2026-10-03' }, { ...deps, now: at(FIXED_NOW, 1.9) });
  assert.strictEqual(calls.length, n, 'a Loyverse call within 2 minutes');
  await handlePreview({ date: '2026-10-03' }, { ...deps, now: at(FIXED_NOW, 2.1) });
  assert.strictEqual(calls.length, 2 * n, 'no call after 2 minutes');
});

test('sales-cache: a date 3 days back is reused within 30 minutes and fetched after', async () => {
  const { calls, fetchImpl } = counting();
  const deps = { nameMap: MAP_FC, env: ENV_SL, fetchImpl, cache: createCache() };
  await handlePreview({ date: '2026-09-30' }, { ...deps, now: FIXED_NOW });
  const n = calls.length;
  await handlePreview({ date: '2026-09-30' }, { ...deps, now: at(FIXED_NOW, 29) });
  assert.strictEqual(calls.length, n);
  await handlePreview({ date: '2026-09-30' }, { ...deps, now: at(FIXED_NOW, 31) });
  assert.strictEqual(calls.length, 2 * n);
});

test('sales-cache: a date 10 days back is reused after an hour', async () => {
  const { calls, fetchImpl } = counting();
  const deps = { nameMap: MAP_FC, env: ENV_SL, fetchImpl, cache: createCache() };
  await handlePreview({ date: '2026-09-23' }, { ...deps, now: FIXED_NOW });
  const n = calls.length;
  await handlePreview({ date: '2026-09-23' }, { ...deps, now: at(FIXED_NOW, 61) });
  await handlePreview({ date: '2026-09-23' }, { ...deps, now: at(FIXED_NOW, 24 * 60) });
  assert.strictEqual(calls.length, n);
});

test('sales-cache: fresh=1 always calls and replaces the kept result', async () => {
  const { calls, fetchImpl } = counting();
  const deps = { nameMap: MAP_FC, env: ENV_SL, fetchImpl, cache: createCache() };
  await handlePreview({ date: '2026-10-03' }, { ...deps, now: FIXED_NOW });
  const n = calls.length;
  const r = await handlePreview({ date: '2026-10-03', fresh: '1' }, { ...deps, now: at(FIXED_NOW, 1) });
  assert.strictEqual(calls.length, 2 * n);
  assert.strictEqual(r.body.fetchedAt, at(FIXED_NOW, 1).toISOString());
  const again = await handlePreview({ date: '2026-10-03' }, { ...deps, now: at(FIXED_NOW, 1.5) });
  assert.strictEqual(calls.length, 2 * n);
  assert.strictEqual(again.body.fetchedAt, at(FIXED_NOW, 1).toISOString(), 'the replaced result is reused');
});

test('sales-cache: a result with a failed account is returned but never kept', async () => {
  const cache = createCache();
  const { calls, fetchImpl } = counting();
  const deps = { nameMap: MAP_FC, env: { LOYVERSE_SILINGAN_TOKEN: 's' }, fetchImpl, cache };
  const r = await handlePreview({ date: '2026-10-03' }, { ...deps, now: FIXED_NOW });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.accounts[1].ok, false);
  const n = calls.length;
  await handlePreview({ date: '2026-10-03' }, { ...deps, now: at(FIXED_NOW, 0.5) });
  assert.strictEqual(calls.length, 2 * n, 'a failed result was reused');
  assert.strictEqual(cache.kept.size, 0);
});

test('sales-cache: FC and Silingan + Likod are kept apart', async () => {
  const { calls, fetchImpl } = counting();
  const deps = { nameMap: MAP_LS, env: ENV_SL, fetchImpl, cache: createCache(), now: FIXED_NOW };
  const left = await handlePreview({ date: '2026-10-03' }, deps);
  const fc = await handlePreview({ date: '2026-10-03', pos: 'fc' }, deps);
  assert.ok(left.body.dishes && !left.body.landing);
  assert.ok(fc.body.landing && !fc.body.dishes);
  const n = calls.length;
  const left2 = await handlePreview({ date: '2026-10-03', pos: 'silingan-likod' }, deps);
  const fc2 = await handlePreview({ date: '2026-10-03', pos: 'fc' }, deps);
  assert.strictEqual(calls.length, n);
  assert.deepStrictEqual(left2.body, left.body);
  assert.deepStrictEqual(fc2.body, fc.body);
});

test('sales-cache: fetchedAt is the time of the call, also on a reused result', async () => {
  const deps = { nameMap: MAP_FC, env: ENV_SL, fetchImpl: fetchFc(), cache: createCache() };
  const r1 = await handlePreview({ date: '2026-10-03' }, { ...deps, now: FIXED_NOW });
  assert.strictEqual(r1.body.fetchedAt, FIXED_NOW.toISOString());
  const r2 = await handlePreview({ date: '2026-10-03' }, { ...deps, now: at(FIXED_NOW, 1) });
  assert.strictEqual(r2.body.fetchedAt, FIXED_NOW.toISOString());
});

test('sales-cache: two requests at once make one set of calls', async () => {
  const cache = createCache();
  const { calls, fetchImpl } = counting();
  const deps = { nameMap: MAP_FC, env: ENV_SL, fetchImpl, cache, now: FIXED_NOW };
  const [a, b] = await Promise.all([
    handlePreview({ date: '2026-10-03' }, deps),
    handlePreview({ date: '2026-10-03' }, deps),
  ]);
  assert.strictEqual(calls.filter(u => u.pathname.endsWith('/receipts')).length, 2, 'one call per account');
  assert.deepStrictEqual(a.body, b.body);
  assert.strictEqual(cache.inflight.size, 0, 'the settled fetch was not dropped');
});

test('sales-cache: the 121st result drops the oldest', async () => {
  const cache = createCache();
  const { calls, fetchImpl } = counting();
  const deps = { nameMap: MAP_FC, env: ENV_SL, fetchImpl, cache };
  const day0 = Date.parse('2026-01-01T00:00:00Z');
  const dates = Array.from({ length: 121 }, (_, i) => new Date(day0 + i * 86400000).toISOString().slice(0, 10));
  for (let i = 0; i < dates.length; i++) await handlePreview({ date: dates[i] }, { ...deps, now: at(FIXED_NOW, i) });
  assert.strictEqual(cache.kept.size, 120);
  assert.ok(!cache.kept.has(`silingan-likod|${dates[0]}`));
  assert.ok(cache.kept.has(`silingan-likod|${dates[1]}`));
  const n = calls.length;
  await handlePreview({ date: dates[1] }, { ...deps, now: at(FIXED_NOW, 200) });
  assert.strictEqual(calls.length, n, 'a kept older date was fetched again');
  await handlePreview({ date: dates[0] }, { ...deps, now: at(FIXED_NOW, 200) });
  assert.ok(calls.length > n, 'the dropped date was reused');
});

test('sales-cache: the 400s are unchanged and nothing is kept', async () => {
  const cache = createCache();
  const { calls, fetchImpl } = counting();
  const deps = { nameMap: MAP_FC, env: ENV_SL, fetchImpl, cache };
  const bad = await handlePreview({ date: 'bad', fresh: '1' }, deps);
  assert.deepStrictEqual([bad.status, bad.body], [400, { error: 'date must be YYYY-MM-DD' }]);
  const nope = await handlePreview({ date: '2026-10-03', pos: 'nope' }, deps);
  assert.deepStrictEqual([nope.status, nope.body], [400, { error: 'pos must be one of: silingan-likod, fc' }]);
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(cache.kept.size, 0);
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
