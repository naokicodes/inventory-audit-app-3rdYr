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
    { label: 'Silingan', key: 'silingan', tokenEnv: 'LOYVERSE_SILINGAN_TOKEN' },
    { label: 'Likod', key: 'likod', tokenEnv: 'LOYVERSE_LIKOD_TOKEN' },
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

test('no date -> today in Manila', async () => {
  const calls = [];
  const r = await handlePreview({}, {
    nameMap: MAP, env: { LOYVERSE_SILINGAN_TOKEN: 's', LOYVERSE_LIKOD_TOKEN: 'l' },
    fetchImpl: fetchServing({}, calls), now: new Date('2026-10-02T17:30:00Z'),
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.date, '2026-10-03');
  assert.strictEqual(calls[0].searchParams.get('created_at_min'), '2026-10-02T16:00:00.000Z');
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
    { label: 'Silingan', ok: true, receiptsScanned: 1, receiptsKept: 1, receiptTypes: { SALE: 1 } },
    { label: 'Likod', ok: true, receiptsScanned: 1, receiptsKept: 1, receiptTypes: { SALE: 1 } },
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
