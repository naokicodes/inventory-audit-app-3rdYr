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
const { siteCodeFor } = require('../db/siteAccess.js');

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
const likodReceipt = insert("INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source) VALUES (?, ?, '2026-11-01', 3, 'DIRECT')", likod, likodMeat);

const role = (name, flags) => insert(
  'INSERT INTO roles (name, can_enter_counts, can_finalize, can_admin, read_only) VALUES (?, ?, ?, ?, ?)', name, ...flags);
const user = (name, roleId, sites) => {
  const id = insert('INSERT INTO users (name, default_role_id) VALUES (?, ?)', name, roleId);
  for (const s of sites) db.prepare('INSERT INTO user_sites (user_id, site_code) VALUES (?, ?)').run(id, s);
  return id;
};
const checkerRole = role('sft-checker', [1, 0, 0, 0]);
const ana = user('SFT Ana', checkerRole, ['SFT-SIL']);              // one restaurant
const flo = user('SFT Flo', checkerRole, ['SFT-SIL', 'SFT-LIK']);   // floater
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
  assert.notStrictEqual(res.status, 403);
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
