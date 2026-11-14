// Tests for GET /api/loyverse/preview (Step loyverse-preview-i). Calls the
// route's exported handler with a stub env + fetch - no network, no DB.
// One test also mounts the real router on an ephemeral port to check the
// HTTP wiring (400 on a malformed date, before any fetch).

const assert = require('assert');
const express = require('express');
const router = require('./loyverse.js');
const { handlePreview } = router;

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

test('loyverse-fc: pos=fc returns FC by category, no money field, token not in the body', async () => {
  const r = await handlePreview({ date: '2026-10-03', pos: 'fc' }, {
    nameMap: MAP_FC, env: { LOYVERSE_SILINGAN_TOKEN: 's', LOYVERSE_LIKOD_TOKEN: 'l', LOYVERSE_FC_TOKEN: 'f' }, fetchImpl: fetchFc(),
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.group, 'fc');
  assert.deepStrictEqual(r.body.accounts.map(a => a.label), ['FC']);
  assert.deepStrictEqual(r.body.categories, [{ name: 'Pizza', items: [{ name: 'Margherita', quantity: 4 }] }]);
  assert.ok(!/price|total|money/i.test(JSON.stringify(r.body)), 'money field in FC body');
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
