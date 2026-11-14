// Tests for Step site-filter: requireSiteAccess + canUseSite/siteCodeFor.
// Runs currentUser, the site guard and the real route files over HTTP on an
// ephemeral port, against a throwaway database file in the OS temp dir
// (DB_PATH, set before the connection opens) - never the live inventory.db.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const DB_FILE = path.join(os.tmpdir(), `site-filter-test-${process.pid}.db`);
process.env.DB_PATH = DB_FILE;
const db = require('../db/connection.js');
const { currentUser } = require('../routes/auth.js');
const requireSiteAccess = require('./requireSiteAccess.js');
const { siteCodeFor, siteOfRow } = require('../db/siteAccess.js');

let passed = 0, failed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

console.log('Site Filter Tests (requireSiteAccess)\n');

const insert = (sql, ...args) => Number(db.prepare(sql).run(...args).lastInsertRowid);
const silt = insert("INSERT INTO restaurants (name, code) VALUES ('Silang T', 'SFT-SIL')");
const likod = insert("INSERT INTO restaurants (name, code) VALUES ('Likod T', 'SFT-LIK')");
const comA = insert("INSERT INTO commissaries (name, code) VALUES ('Commissary T', 'SFT-COM')");
const likodMeat = insert("INSERT INTO meats (restaurant_id, meat_code, name, unit) VALUES (?, 'SFT1', 'Pork T', 'kg')", likod);
const comMeat = insert("INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, 'SFTC', 'Beef T', 'kg', 5)", comA);
const comB = insert("INSERT INTO commissaries (name, code) VALUES ('Commissary T2', 'SFT-COB')");
const comBMeat = insert("INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, 'SFTD', 'Chicken T', 'kg', 5)", comB);
const likodReceipt = insert("INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source) VALUES (?, ?, '2026-11-01', 3, 'DIRECT')", likod, likodMeat);
// ADR-074: leftover "Unallocated" receipts - no restaurant, shipped by A or B, or neither.
const noRestaurantReceipt = cmId => insert("INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source, commissary_meat_id) VALUES (NULL, NULL, '2026-11-01', 2, 'COMMISSARY', ?)", cmId);

const role = (name, flags) => insert(
  'INSERT INTO roles (name, can_enter_counts, can_finalize, can_admin, read_only) VALUES (?, ?, ?, ?, ?)', name, ...flags);
const user = (name, roleId, sites) => {
  const id = insert('INSERT INTO users (name, default_role_id) VALUES (?, ?)', name, roleId);
  for (const s of sites) db.prepare('INSERT INTO user_sites (user_id, site_code) VALUES (?, ?)').run(id, s);
  return id;
};
const checkerRole = role('sft-checker', [1, 0, 0, 0]);
const ana = user('SFT Ana', checkerRole, ['SFT-SIL']);              // one restaurant
const cora = user('SFT Cora', checkerRole, ['SFT-COM']);          // commissary A only
const flo = user('SFT Flo', checkerRole, ['SFT-SIL', 'SFT-LIK']);   // floater
const bea = user('SFT Bea', checkerRole, ['SFT-COB']);          // commissary B only
const bypass = {
  admin: user('SFT Admin', role('sft-admin', [1, 1, 1, 0]), []),
  'super-admin': user('SFT Super', role('sft-super', [1, 1, 1, 0]), []),
  management: user('SFT Mgmt', role('sft-mgmt', [0, 0, 0, 1]), []),
};

const app = express();
app.use(express.json());
app.use('/api', currentUser);
app.use('/api', requireSiteAccess);
for (const r of ['dailyAudit', 'stockReceipts', 'sales', 'commissary']) app.use('/api', require(`../routes/${r}.js`));

let base;
const call = (method, url, { body, as } = {}) => fetch(base + url, {
  method,
  headers: { 'Content-Type': 'application/json', ...(as ? { Cookie: `user_id=${as}` } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const listLikod = `/api/stock-receipts?restaurant_id=${likod}`;               // group (a)
const patchLikodReceipt = ['PATCH', `/api/stock-receipts/${likodReceipt}`, { body: { quantity: 4 } }]; // group (b)

test('siteCodeFor maps ids to codes through the site tables; missing -> null', () => {
  assert.strictEqual(siteCodeFor(db, 'restaurant', likod), 'SFT-LIK');
  assert.strictEqual(siteCodeFor(db, 'commissary', comA), 'SFT-COM');
  assert.strictEqual(siteCodeFor(db, 'commissary_meat', comMeat), 'SFT-COM');
  assert.strictEqual(siteCodeFor(db, 'stock_receipt', likodReceipt), 'SFT-LIK');
  assert.strictEqual(siteCodeFor(db, 'stock_receipt', 999999), null);
});

test('logged out passes, as today', async () => {
  assert.strictEqual((await call('GET', listLikod)).status, 200);
  const [m, u, o] = patchLikodReceipt;
  assert.strictEqual((await call(m, u, o)).status, 200);
});

test('checker without the site: 403 on a named-site route (a)', async () => {
  const res = await call('GET', listLikod, { as: ana });
  assert.strictEqual(res.status, 403);
  assert.deepStrictEqual(await res.json(), { error: 'No access to site SFT-LIK' });
  const com = await call('GET', `/api/commissary/meats?commissary_id=${comA}`, { as: ana });
  assert.strictEqual(com.status, 403);
});

test('checker without the site: 403 on a row-found route (b)', async () => {
  const [m, u, o] = patchLikodReceipt;
  assert.strictEqual((await call(m, u, { ...o, as: ana })).status, 403);
  const opening = await call('PATCH', '/api/commissary/opening-stock',
    { as: ana, body: { commissary_meat_id: comMeat, business_date: '2026-11-01', quantity: 1 } });
  assert.strictEqual(opening.status, 403);
});

test('checker passes at their own site', async () => {
  assert.strictEqual((await call('GET', `/api/stock-receipts?restaurant_id=${silt}`, { as: ana })).status, 200);
});

test('floater with both sites passes at both', async () => {
  assert.strictEqual((await call('GET', `/api/stock-receipts?restaurant_id=${silt}`, { as: flo })).status, 200);
  assert.strictEqual((await call('GET', listLikod, { as: flo })).status, 200);
  const [m, u, o] = patchLikodReceipt;
  assert.strictEqual((await call(m, u, { ...o, as: flo })).status, 200);
});

for (const [name, id] of Object.entries(bypass)) {
  test(`${name} (no user_sites rows) passes everywhere`, async () => {
    assert.strictEqual((await call('GET', listLikod, { as: id })).status, 200);
    assert.strictEqual((await call('GET', `/api/commissary/meats?commissary_id=${comA}`, { as: id })).status, 200);
    const [m, u, o] = patchLikodReceipt;
    assert.strictEqual((await call(m, u, { ...o, as: id })).status, 200);
  });
}

test('a missing row id still gets 404, not 403', async () => {
  assert.strictEqual((await call('PATCH', '/api/stock-receipts/999999', { as: ana, body: { quantity: 1 } })).status, 404);
  assert.strictEqual((await call('DELETE', '/api/commissary/yield-log/999999', { as: ana })).status, 404);
});

test('a two-site route (group c) is left open for site-filter-ii', async () => {
  const res = await call('GET', `/api/commissary/adjustments/destinations?commissary_meat_id=${comMeat}`, { as: ana });
  assert.strictEqual(res.status, 200);
});

test('every row-found kind maps to its site: yield log, adjustment, recount order', async () => {
  const yieldRow = insert("INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out) VALUES (?, '2026-11-01', 5, 4)", comMeat);
  const adjRow = insert("INSERT INTO commissary_adjustments (commissary_meat_id, business_date, kind, quantity) VALUES (?, '2026-11-01', 'LOSS', 1)", comMeat);
  const recount = insert("INSERT INTO recount_orders (restaurant_id, business_date, kind, item_id, ordered_by_user_id, assigned_user_id) VALUES (?, '2026-11-01', 'MEAT', ?, ?, ?)", likod, likodMeat, flo, flo);
  assert.strictEqual(siteCodeFor(db, 'yield_log', yieldRow), 'SFT-COM');
  assert.strictEqual(siteCodeFor(db, 'adjustment', adjRow), 'SFT-COM');
  assert.strictEqual(siteCodeFor(db, 'recount_order', recount), 'SFT-LIK');
  const refused = [
    ['PATCH', `/api/commissary/yield-log/${yieldRow}`, bea, 'SFT-COM'],
    ['DELETE', `/api/commissary/yield-log/${yieldRow}`, bea, 'SFT-COM'],
    ['PATCH', `/api/commissary/adjustments/${adjRow}`, bea, 'SFT-COM'],
    ['DELETE', `/api/commissary/adjustments/${adjRow}`, bea, 'SFT-COM'],
    ['POST', `/api/daily-audit/recount-orders/${recount}/cancel`, ana, 'SFT-LIK'],
  ];
  for (const [method, url, as, code] of refused) {
    const res = await call(method, url, { as, body: {} });
    assert.strictEqual(res.status, 403, `${method} ${url}`);
    assert.deepStrictEqual(await res.json(), { error: `No access to site ${code}` });
  }
  assert.strictEqual((await call('DELETE', `/api/commissary/yield-log/${yieldRow}`, { as: cora })).status, 200);
  assert.strictEqual((await call('DELETE', `/api/commissary/adjustments/${adjRow}`, { as: cora })).status, 200);
});

// Decisions 2026-11-11 (issue #60).
for (const route of ['/api/commissary/daily-audit?date=2026-11-01&', '/api/commissary/yield-log?',
  '/api/commissary/adjustments?']) {
  test(`Q1: a meat id from another commissary gets 403 on GET ${route.split('?')[0]}`, async () => {
    const res = await call('GET', `${route}commissary_id=${comA}&commissary_meat_id=${comBMeat}`, { as: cora });
    assert.strictEqual(res.status, 403);
    assert.deepStrictEqual(await res.json(), { error: 'No access to site SFT-COB' });
    const own = await call('GET', `${route}commissary_id=${comA}&commissary_meat_id=${comMeat}`, { as: cora });
    assert.strictEqual(own.status, 200);
  });
}

test('Q2: a body row from another commissary refuses the whole save and writes nothing', async () => {
  const count = () => db.prepare(
    "SELECT COUNT(*) AS n FROM commissary_ending_actual WHERE business_date = '2026-11-02'").get().n;
  const res = await call('POST', '/api/commissary/daily-audit', { as: cora, body: {
    commissary_id: comA, business_date: '2026-11-02',
    rows: [{ commissary_meat_id: comMeat, ending_actual: 5 }, { commissary_meat_id: comBMeat, ending_actual: 7 }],
  } });
  assert.strictEqual(res.status, 403);
  assert.deepStrictEqual(await res.json(), { error: 'No access to site SFT-COB' });
  assert.strictEqual(count(), 0);
});

test('Q4: /stock-receipts/meats answers a logged-in checker for any restaurant', async () => {
  const res = await call('GET', `/api/stock-receipts/meats?restaurant_id=${likod}`, { as: ana });
  assert.strictEqual(res.status, 200);
});

// Decisions 2026-11-14 (issue #68; ADR-074).
const ONE_NUMBER = name => ({ error: `${name} must be one whole number` });
for (const route of ['/api/commissary/daily-audit?date=2026-11-01&', '/api/commissary/yield-log?',
  '/api/commissary/adjustments?']) {
  const path = route.split('?')[0];
  test(`malformed ids get 400 on GET ${path}, logged in or not`, async () => {
    for (const as of [cora, undefined]) {
      const bad = [
        [`commissary_id=${comA}&commissary_meat_id=abc`, 'commissary_meat_id'],
        ['commissary_id=1abc', 'commissary_id'],
        [`commissary_id=${comA}&commissary_id=${comB}`, 'commissary_id'],
        ['commissary_id=1.5', 'commissary_id'],
        ['commissary_id=0', 'commissary_id'],
        ['commissary_id=-1', 'commissary_id'],
      ];
      for (const [qs, name] of bad) {
        const res = await call('GET', route + qs, { as });
        assert.strictEqual(res.status, 400, qs);
        assert.deepStrictEqual(await res.json(), ONE_NUMBER(name));
      }
    }
  });
  test(`a missing or empty id still passes on GET ${path}`, async () => {
    assert.strictEqual((await call('GET', `${route}commissary_id=${comA}&commissary_meat_id=`, { as: cora })).status, 200);
    assert.strictEqual((await call('GET', `${route}commissary_id=${comA}`, { as: cora })).status, 200);
  });
}

test('HEAD reads the query string like GET', async () => {
  assert.strictEqual((await call('HEAD', `/api/commissary/meats?commissary_id=${comB}`, { as: cora })).status, 403);
  assert.strictEqual((await call('HEAD', '/api/commissary/meats?commissary_id=abc')).status, 400);
});

test('a malformed rows[].commissary_meat_id refuses the save with 400 and writes nothing', async () => {
  const count = () => db.prepare(
    "SELECT COUNT(*) AS n FROM commissary_ending_actual WHERE business_date = '2026-11-03'").get().n;
  for (const badId of ['abc', '1abc', 1.5, 0, -2, [comMeat]]) {
    const res = await call('POST', '/api/commissary/daily-audit', { as: cora, body: {
      commissary_id: comA, business_date: '2026-11-03',
      rows: [{ commissary_meat_id: comMeat, ending_actual: 5 }, { commissary_meat_id: badId, ending_actual: 7 }],
    } });
    assert.strictEqual(res.status, 400, JSON.stringify(badId));
    assert.deepStrictEqual(await res.json(), ONE_NUMBER('rows[].commissary_meat_id'));
  }
  assert.strictEqual(count(), 0);
});

test('a malformed :id gets 400; a well-formed missing one still 404', async () => {
  const res = await call('PATCH', '/api/stock-receipts/abc', { body: { quantity: 1 } });
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(await res.json(), ONE_NUMBER('id'));
  assert.strictEqual((await call('DELETE', '/api/commissary/yield-log/1abc', { as: cora })).status, 400);
  assert.strictEqual((await call('PATCH', '/api/stock-receipts/999999', { as: ana, body: { quantity: 1 } })).status, 404);
});

test('a no-restaurant receipt belongs to the commissary that shipped it', async () => {
  const aReceipt = noRestaurantReceipt(comMeat);
  const bReceipt = noRestaurantReceipt(comBMeat);
  assert.strictEqual(siteCodeFor(db, 'stock_receipt', aReceipt), 'SFT-COM');
  for (const method of ['PATCH', 'DELETE']) {
    const res = await call(method, `/api/stock-receipts/${aReceipt}`, { as: bea, body: { quantity: 4 } });
    assert.strictEqual(res.status, 403, method);
    assert.deepStrictEqual(await res.json(), { error: 'No access to site SFT-COM' });
  }
  assert.strictEqual((await call('PATCH', `/api/stock-receipts/${bReceipt}`, { as: bea, body: { quantity: 4 } })).status, 200);
  assert.strictEqual((await call('DELETE', `/api/stock-receipts/${bReceipt}`, { as: bea })).status, 200);
});

test('a receipt with neither restaurant nor commissary is admin-only', async () => {
  const lost = noRestaurantReceipt(null);
  assert.deepStrictEqual(siteOfRow(db, 'stock_receipt', lost), { code: null });
  assert.strictEqual(siteOfRow(db, 'stock_receipt', 999999), undefined);
  for (const as of [undefined, cora, bea, bypass.management]) {
    for (const method of ['PATCH', 'DELETE']) {
      const res = await call(method, `/api/stock-receipts/${lost}`, { as, body: { quantity: 4 } });
      assert.strictEqual(res.status, 403, `${method} as ${as}`);
      assert.deepStrictEqual(await res.json(), { error: 'Only an admin can change a receipt with no site' });
    }
  }
  assert.strictEqual((await call('PATCH', `/api/stock-receipts/${lost}`, { as: bypass.admin, body: { quantity: 4 } })).status, 200);
  assert.strictEqual((await call('DELETE', `/api/stock-receipts/${lost}`, { as: bypass['super-admin'] })).status, 200);
});

const server = app.listen(0, async () => {
  base = `http://localhost:${server.address().port}`;
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
  server.close();
  db.close();
  for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) fs.rmSync(f, { force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
});
