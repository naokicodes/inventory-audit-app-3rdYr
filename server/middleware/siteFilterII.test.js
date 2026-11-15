// Tests for Step site-filter-ii: two-site requests check one owner site,
// cross-site lists narrow to the user's sites, the restaurant list carries
// can_use, the rollup drops other sites, and the two commands are bypass-only.
// Runs currentUser, the site guard and the real route files over HTTP on an
// ephemeral port, against a throwaway database file in the OS temp dir
// (DB_PATH, set before the connection opens) - never the live inventory.db.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const DB_FILE = path.join(os.tmpdir(), `site-filter-ii-test-${process.pid}.db`);
process.env.DB_PATH = DB_FILE;
const db = require('../db/connection.js');
const { currentUser } = require('../routes/auth.js');
const requireSiteAccess = require('./requireSiteAccess.js');
const { canUseSite, usableSiteCodes } = require('../db/siteAccess.js');

let passed = 0, failed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

console.log('Site Filter II Tests (two-site routes, cross-site lists)\n');

const DAY = '2026-11-01';
const insert = (sql, ...args) => Number(db.prepare(sql).run(...args).lastInsertRowid);
const ra = insert("INSERT INTO restaurants (name, code) VALUES ('Resto A II', 'SF2-RA')");
const fc = insert("INSERT INTO restaurants (name, code) VALUES ('Resto FC II', 'SF2-FC')");
const com = insert("INSERT INTO commissaries (name, code) VALUES ('Commi II', 'SF2-COM')");
const cob = insert("INSERT INTO commissaries (name, code) VALUES ('Commi B II', 'SF2-COB')");
const meatType = insert("INSERT INTO meat_types (name) VALUES ('SF2 Pork')");
const raMeat = insert("INSERT INTO meats (restaurant_id, meat_code, name, unit) VALUES (?, 'SF2A', 'Pork A', 'kg')", ra);
const raMeat2 = insert("INSERT INTO meats (restaurant_id, meat_code, name, unit) VALUES (?, 'SF2B', 'Pork B', 'kg')", ra);
const fcMeat = insert("INSERT INTO meats (restaurant_id, meat_code, name, unit) VALUES (?, 'SF2F', 'Pork F', 'kg')", fc);
const comMeat = insert("INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct, meat_type_id) VALUES (?, 'SF2C', 'Belly C', 'kg', 5, ?)", com, meatType);
const comMeat2 = insert("INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct, meat_type_id) VALUES (?, 'SF2D', 'Belly D', 'kg', 5, ?)", com, meatType);
const cobMeat = insert("INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, 'SF2E', 'Chicken E', 'kg', 5)", cob);
const wastage = insert("INSERT INTO adjustment_types (name) VALUES ('SF2 Wastage')");
db.prepare("INSERT OR IGNORE INTO adjustment_types (name) VALUES ('Portion Conversion')").run();

const role = (name, flags) => insert(
  'INSERT INTO roles (name, can_enter_counts, can_finalize, can_admin, read_only) VALUES (?, ?, ?, ?, ?)', name, ...flags);
const user = (name, roleId, sites) => {
  const id = insert('INSERT INTO users (name, default_role_id) VALUES (?, ?)', name, roleId);
  for (const s of sites) db.prepare('INSERT INTO user_sites (user_id, site_code) VALUES (?, ?)').run(id, s);
  return id;
};
const assign = (userId, roleId, site, until) => db.prepare(
  'INSERT INTO user_roles (user_id, role_id, site_code, until_date) VALUES (?, ?, ?, ?)').run(userId, roleId, site, until);
const checkerRole = role('sf2-checker', [1, 0, 0, 0]);
const commi = user('SF2 Commi', checkerRole, ['SF2-COM']);     // commissary only
const raUser = user('SF2 Resto', checkerRole, ['SF2-RA']);     // restaurant A only
const fcHelper = user('SF2 Helper', checkerRole, ['SF2-RA']);  // + a role assignment at FC
assign(fcHelper, checkerRole, 'SF2-FC', null);
const pastHelper = user('SF2 Past', checkerRole, ['SF2-RA']);  // FC assignment that ended
assign(pastHelper, checkerRole, 'SF2-FC', '2020-01-01');
const admin = user('SF2 Admin', role('sf2-admin', [1, 1, 1, 0]), []);
const superAdmin = user('SF2 Super', role('sf2-super', [1, 1, 1, 0]), []);
const management = user('SF2 Mgmt', role('sf2-mgmt', [0, 0, 0, 1]), []);
const userRow = id => db.prepare(`SELECT u.id, r.can_admin, r.read_only FROM users u
  JOIN roles r ON r.id = u.default_role_id WHERE u.id = ?`).get(id);

const app = express();
app.use(express.json());
app.use('/api', currentUser);
app.use('/api', requireSiteAccess);
for (const r of ['dailyAudit', 'stockReceipts', 'commissary', 'allocations', 'dashboard', 'commands']) {
  app.use('/api', require(`../routes/${r}.js`));
}

let base;
const call = (method, url, { body, as } = {}) => fetch(base + url, {
  method,
  headers: { 'Content-Type': 'application/json', ...(as ? { Cookie: `user_id=${as}` } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const noAccess = code => ({ error: `No access to site ${code}` });
const NOT_ADMIN = { error: 'Only an admin can change settings' };
const LOG_IN = { error: 'Log in first' };
async function expect(res, status, body) {
  assert.strictEqual(res.status, status);
  if (body !== undefined) assert.deepStrictEqual(await res.json(), body);
}

// ---- siteAccess.js ----

test('usableSiteCodes: memberships plus live role assignments; bypass gets every site', () => {
  assert.deepStrictEqual(usableSiteCodes(db, userRow(commi)), ['SF2-COM']);
  assert.deepStrictEqual(usableSiteCodes(db, userRow(fcHelper)), ['SF2-FC', 'SF2-RA']);
  assert.deepStrictEqual(usableSiteCodes(db, userRow(pastHelper)), ['SF2-RA']);
  assert.deepStrictEqual(usableSiteCodes(db, userRow(pastHelper), '2019-12-31'), ['SF2-FC', 'SF2-RA']);
  for (const code of ['SF2-RA', 'SF2-FC', 'SF2-COM', 'SF2-COB']) {
    assert.ok(usableSiteCodes(db, userRow(management)).includes(code), code);
  }
});

test('canUseSite agrees with usableSiteCodes for every user and site', () => {
  for (const id of [commi, raUser, fcHelper, pastHelper, admin, management]) {
    const u = userRow(id);
    const codes = usableSiteCodes(db, u);
    for (const code of ['SF2-RA', 'SF2-FC', 'SF2-COM', 'SF2-COB']) {
      assert.strictEqual(canUseSite(db, u, code, null), codes.includes(code), `${id} ${code}`);
    }
  }
});

// ---- Two sites in one request: one owner site ----

const shipment = () => ({ commissary_meat_id: comMeat, restaurant_id: ra, business_date: DAY,
  total_quantity: 2, lines: [{ meat_id: raMeat, quantity: 2 }] });

test('a commi-only user ships to RA; a restaurant-only user cannot ship', async () => {
  await expect(await call('POST', '/api/commissary/shipments', { as: commi, body: shipment() }), 200);
  await expect(await call('POST', '/api/commissary/shipments', { as: raUser, body: shipment() }), 403, noAccess('SF2-COM'));
});

test('destinations follow the commissary', async () => {
  const url = `/api/commissary/adjustments/destinations?commissary_meat_id=${comMeat}`;
  await expect(await call('GET', url, { as: commi }), 200);
  await expect(await call('GET', url, { as: raUser }), 403, noAccess('SF2-COM'));
});

let presetId;
test('presets follow the commissary; saving one needs an admin, a checker still loads them', async () => {
  const url = `/api/commissary/shipment-presets?commissary_meat_id=${comMeat}&restaurant_id=${ra}`;
  const body = { commissary_meat_id: comMeat, restaurant_id: ra, name: 'SF2 mix', lines: [{ meat_id: raMeat, default_quantity: 1 }] };
  await expect(await call('POST', '/api/commissary/shipment-presets', { body }), 401, LOG_IN);
  await expect(await call('POST', '/api/commissary/shipment-presets', { as: commi, body }), 403, NOT_ADMIN);
  const made = await call('POST', '/api/commissary/shipment-presets', { as: admin, body });
  assert.strictEqual(made.status, 200);
  presetId = (await made.json()).id;
  await expect(await call('PUT', `/api/commissary/shipment-presets/${presetId}`, { as: commi, body: { name: 'x' } }), 403, NOT_ADMIN);
  await expect(await call('PUT', `/api/commissary/shipment-presets/${presetId}`, { as: raUser, body: { name: 'x' } }), 403, noAccess('SF2-COM'));
  await expect(await call('PUT', `/api/commissary/shipment-presets/${presetId}`, { as: superAdmin, body: { name: 'SF2 mix 2' } }), 200);
  const loaded = await call('GET', url, { as: commi });
  assert.strictEqual(loaded.status, 200);
  assert.deepStrictEqual((await loaded.json()).map(p => p.name), ['SF2 mix 2']);
  await expect(await call('GET', url, { as: raUser }), 403, noAccess('SF2-COM'));
});

test('conversion standards follow the restaurant; saving one needs an admin, a checker still loads them', async () => {
  const url = `/api/commissary/conversion-standards?commissary_meat_id=${comMeat}&restaurant_id=${ra}`;
  const body = { meat_type_id: meatType, restaurant_id: ra, meat_id: raMeat, ratio_per_unit: 4 };
  await expect(await call('POST', '/api/commissary/conversion-standards', { body }), 401, LOG_IN);
  await expect(await call('POST', '/api/commissary/conversion-standards', { as: raUser, body }), 403, NOT_ADMIN);
  const made = await call('POST', '/api/commissary/conversion-standards', { as: admin, body });
  assert.strictEqual(made.status, 200);
  const id = (await made.json()).id;
  await expect(await call('PUT', `/api/commissary/conversion-standards/${id}`, { as: raUser, body: { ratio_per_unit: 5 } }), 403, NOT_ADMIN);
  await expect(await call('PUT', `/api/commissary/conversion-standards/${id}`, { as: commi, body: { ratio_per_unit: 5 } }), 403, noAccess('SF2-RA'));
  await expect(await call('PUT', `/api/commissary/conversion-standards/${id}`, { as: admin, body: { ratio_per_unit: 5 } }), 200);
  const loaded = await call('GET', url, { as: raUser });
  assert.strictEqual(loaded.status, 200);
  assert.deepStrictEqual((await loaded.json()).map(s => s.ratio_per_unit), [5]);
  await expect(await call('GET', url, { as: commi }), 403, noAccess('SF2-RA'));
});

test('allocations follow restaurant_id', async () => {
  const entry = { restaurant_id: ra, meat_id: raMeat, business_date: DAY, adjustment_type_id: wastage, quantity: 1 };
  const conversion = { restaurant_id: ra, business_date: DAY, from_meat_id: raMeat, from_quantity: 1, to_meat_id: raMeat2, to_quantity: 1 };
  await expect(await call('GET', `/api/allocations?restaurant_id=${ra}`, { as: raUser }), 200);
  await expect(await call('GET', `/api/allocations?restaurant_id=${fc}`, { as: raUser }), 403, noAccess('SF2-FC'));
  await expect(await call('POST', '/api/allocations', { as: raUser, body: entry }), 200);
  await expect(await call('POST', '/api/allocations', { as: commi, body: entry }), 403, noAccess('SF2-RA'));
  await expect(await call('POST', '/api/allocations/conversion', { as: raUser, body: conversion }), 200);
  await expect(await call('POST', '/api/allocations/conversion', { as: commi, body: conversion }), 403, noAccess('SF2-RA'));
});

test('logged out passes the site checks', async () => {
  await expect(await call('POST', '/api/commissary/shipments', { body: shipment() }), 200);
  await expect(await call('GET', `/api/commissary/shipment-presets?commissary_meat_id=${comMeat}&restaurant_id=${ra}`), 200);
  await expect(await call('GET', `/api/commissary/conversion-standards?commissary_meat_id=${comMeat}&restaurant_id=${ra}`), 200);
  await expect(await call('GET', `/api/commissary/adjustments/destinations?commissary_meat_id=${comMeat}`), 200);
  await expect(await call('GET', `/api/allocations?restaurant_id=${fc}`), 200);
  await expect(await call('POST', '/api/allocations', { body: {
    restaurant_id: fc, meat_id: fcMeat, business_date: DAY, adjustment_type_id: wastage, quantity: 1 } }), 200);
});

// ---- The restaurant list: every restaurant, with can_use ----

const ourRestaurants = async as => {
  const res = await call('GET', '/api/restaurants', { as });
  assert.strictEqual(res.status, 200);
  return Object.fromEntries((await res.json()).filter(r => r.code.startsWith('SF2-')).map(r => [r.code, r.can_use]));
};

test('a commi-only user gets every restaurant with can_use false, and still ships to RA', async () => {
  assert.deepStrictEqual(await ourRestaurants(commi), { 'SF2-FC': false, 'SF2-RA': false });
  await expect(await call('POST', '/api/commissary/shipments', { as: commi, body: shipment() }), 200);
});

test('a role assignment at FC with no FC membership: can_use true for FC', async () => {
  assert.deepStrictEqual(await ourRestaurants(fcHelper), { 'SF2-FC': true, 'SF2-RA': true });
  assert.deepStrictEqual(await ourRestaurants(raUser), { 'SF2-FC': false, 'SF2-RA': true });
});

test('management, admin and logged out get can_use true on every row', async () => {
  for (const as of [management, admin, undefined]) {
    const res = await call('GET', '/api/restaurants', { as });
    const rows = await res.json();
    assert.ok(rows.length >= 2);
    assert.ok(rows.every(r => r.can_use === true), String(as));
  }
});

// ---- Lists with no site id ----

const raReceipt = insert("INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source) VALUES (?, ?, ?, 3, 'DIRECT')", ra, raMeat, DAY);
const fcReceipt = insert("INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source) VALUES (?, ?, ?, 3, 'DIRECT')", fc, fcMeat, DAY);
// ADR-074: no restaurant -> the commissary that shipped it; neither -> no site.
const comReceipt = insert("INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source, commissary_meat_id) VALUES (NULL, NULL, ?, 2, 'COMMISSARY', ?)", DAY, comMeat);
const lostReceipt = insert("INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source) VALUES (NULL, NULL, ?, 2, 'COMMISSARY')", DAY);
const comYield = insert("INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out) VALUES (?, ?, 5, 4)", comMeat, DAY);
const cobYield = insert("INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out) VALUES (?, ?, 5, 4)", cobMeat, DAY);
const comAdj = insert("INSERT INTO commissary_adjustments (commissary_meat_id, business_date, kind, quantity) VALUES (?, ?, 'LOSS', 1)", comMeat, DAY);
const cobAdj = insert("INSERT INTO commissary_adjustments (commissary_meat_id, business_date, kind, quantity) VALUES (?, ?, 'LOSS', 1)", cobMeat, DAY);

const ids = async (url, as, key = 'id') => {
  const res = await call('GET', url, { as });
  assert.strictEqual(res.status, 200, url);
  return (await res.json()).map(r => r[key]);
};
const has = (list, wanted, unwanted) => {
  for (const id of wanted) assert.ok(list.includes(id), `missing ${id}`);
  for (const id of unwanted) assert.ok(!list.includes(id), `unexpected ${id}`);
};
const receipts = `/api/stock-receipts?business_date=${DAY}`;

test("a checker's unfiltered stock receipts hold only their sites' rows", async () => {
  has(await ids(receipts, raUser), [raReceipt], [fcReceipt, comReceipt, lostReceipt]);
  has(await ids(receipts, fcHelper), [raReceipt, fcReceipt], [comReceipt, lostReceipt]);
  has(await ids(receipts, commi), [comReceipt], [raReceipt, fcReceipt, lostReceipt]);
  // A named restaurant is the guard's job, unchanged.
  has(await ids(`${receipts}&restaurant_id=${ra}`, raUser), [raReceipt], []);
});

test('management and logged out get every stock receipt', async () => {
  for (const as of [management, undefined]) {
    has(await ids(receipts, as), [raReceipt, fcReceipt, comReceipt, lostReceipt], []);
  }
});

test("a checker's unfiltered commissary lists hold only their commissaries' rows; management's every one", async () => {
  has(await ids('/api/commissary/yield-log', commi), [comYield], [cobYield]);
  has(await ids('/api/commissary/adjustments', commi), [comAdj], [cobAdj]);
  has(await ids(`/api/commissary/daily-audit?date=${DAY}`, commi, 'commissary_meat_id'), [comMeat, comMeat2], [cobMeat]);
  for (const url of ['/api/commissary/yield-log', '/api/commissary/adjustments']) {
    assert.deepStrictEqual(await ids(url, raUser), [], url);
  }
  for (const as of [management, undefined]) {
    has(await ids('/api/commissary/yield-log', as), [comYield, cobYield], []);
    has(await ids('/api/commissary/adjustments', as), [comAdj, cobAdj], []);
    has(await ids(`/api/commissary/daily-audit?date=${DAY}`, as, 'commissary_meat_id'), [comMeat, cobMeat], []);
  }
});

test('/commissary/meats lists every commissary for a checker', async () => {
  has(await ids('/api/commissary/meats', commi), [comMeat, cobMeat], []);
});

// ---- The dashboard rollup ----

const rollup = (as, restaurantIds) => call('GET',
  `/api/dashboard/stock-rollup?date=${DAY}${restaurantIds ? `&restaurant_ids=${restaurantIds}` : ''}`, { as });

test('the rollup drops restaurants the user may not use', async () => {
  const res = await rollup(raUser, `${ra},${fc}`);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual((await res.json()).restaurants.map(r => r.id), [ra]);
  const helper = await (await rollup(fcHelper, `${ra},${fc}`)).json();
  assert.deepStrictEqual(helper.restaurants.map(r => r.id).sort(), [ra, fc].sort());
  const all = await (await rollup(raUser)).json();
  assert.deepStrictEqual(all.restaurants.map(r => r.id), [ra]);
});

test('a rollup with no usable restaurant is an empty result, not an error', async () => {
  const res = await rollup(commi, `${ra},${fc}`);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { date: DAY, restaurants: [], rows: [] });
});

test('management and logged out keep every restaurant in the rollup', async () => {
  for (const as of [management, undefined]) {
    const body = await (await rollup(as, `${ra},${fc}`)).json();
    assert.deepStrictEqual(body.restaurants.map(r => r.id).sort(), [ra, fc].sort());
    assert.ok(body.rows.length > 0);
  }
});

// ---- The commands: bypass roles only ----

test('a checker gets 403 on both commands', async () => {
  await expect(await call('GET', '/api/commands/oversold-check', { as: raUser }), 403,
    { error: 'Only an admin or management can run this check' });
  await expect(await call('POST', '/api/commands/sync-batch-stock', { as: raUser }), 403,
    { error: 'Only an admin can run this command' });
});

test('management reads oversold-check but gets 403 on sync-batch-stock', async () => {
  await expect(await call('GET', '/api/commands/oversold-check', { as: management }), 200);
  await expect(await call('POST', '/api/commands/sync-batch-stock', { as: management }), 403,
    { error: 'Only an admin can run this command' });
});

test('admin and super-admin run both commands', async () => {
  for (const as of [admin, superAdmin]) {
    await expect(await call('GET', '/api/commands/oversold-check', { as }), 200);
    await expect(await call('POST', '/api/commands/sync-batch-stock', { as }), 200);
  }
});

test('logged out gets 401 on both commands', async () => {
  await expect(await call('GET', '/api/commands/oversold-check'), 401, LOG_IN);
  await expect(await call('POST', '/api/commands/sync-batch-stock'), 401, LOG_IN);
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
