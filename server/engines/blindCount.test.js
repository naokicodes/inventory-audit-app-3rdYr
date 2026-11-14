// Tests for step blind-count. Runs the real dailyAudit router and the
// currentUser middleware over HTTP on an ephemeral port, against a
// throwaway database file in the OS temp dir (DB_PATH, set before the
// connection opens) - never the live inventory.db. Same shape as
// server/routes/auth.test.js.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const DB_FILE = path.join(os.tmpdir(), `blind-count-test-${process.pid}.db`);
process.env.DB_PATH = DB_FILE;
const db = require('../db/connection.js');
const { currentUser } = require('../routes/auth.js');
const dailyAudit = require('../routes/dailyAudit.js');
const { recordRecount } = require('./monthOpening.js');
const { computeMixedDailyAudit } = require('./auditEngine.js');
const { isBlind, canOrderRecount, saveCount } = require('./blindCount.js');
const { ensureRoleDefaults } = require('../db/permissions.js');

let passed = 0, failed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

console.log('Blind Count Tests (step blind-count)\n');

const DATE = '2026-11-01';
db.prepare(`INSERT INTO restaurants (id, name, code) VALUES (1, 'Restaurant A', 'A')`).run();
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit) VALUES (1, 1, 'M01', 'Whole Chicken', 'kg')`).run();
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit) VALUES (2, 1, 'M02', 'Pork Belly', 'kg')`).run();
db.prepare(`INSERT INTO dishes (id, restaurant_id, dish_code, name, prep_type) VALUES (1, 1, 'D01', 'Mozzarella Sticks', 'BATCH_PREPPED')`).run();
// Meat 1 has its month opening; meat 2 stays blocked.
recordRecount(db, 'restaurant', 1, 1, DATE, 10);

const roleId = (name, flags) => Number(db.prepare(
  'INSERT INTO roles (name, can_enter_counts, can_finalize, can_admin, read_only) VALUES (?, ?, ?, ?, ?)'
).run(name, ...flags).lastInsertRowid);
const userId = (name, role, active = 1) => {
  const id = Number(db.prepare('INSERT INTO users (name, default_role_id, active) VALUES (?, ?, ?)').run(name, role, active).lastInsertRowid);
  db.prepare(`INSERT INTO user_sites (user_id, site_code) VALUES (?, 'A')`).run(id);
  return id;
};
const checker = roleId('checker', [1, 0, 0, 0]);
const headChef = roleId('head-chef', [1, 1, 0, 0]);
const management = roleId('management', [0, 0, 0, 1]);
// Step role-assignments: blind = no sees_expected switch, so the test roles
// get the default switch rows, exactly as server start gives a real database.
ensureRoleDefaults(db);
const cara = userId('Cara', checker);
const dee = userId('Dee', checker);
const hugo = userId('Hugo', headChef);
const mona = userId('Mona', management);
const gone = userId('Gone', checker, 0);

const app = express();
app.use(express.json());
app.use('/api', currentUser);
app.use('/api', dailyAudit);

let base;
const as = id => (id ? `user_id=${id}` : undefined);
const call = (method, url, { body, user } = {}) => fetch(base + url, {
  method,
  headers: { 'Content-Type': 'application/json', ...(as(user) ? { Cookie: as(user) } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const getJson = async (url, user) => (await call('GET', url, { user })).json();
const postMeat = (user, rows) => call('POST', '/api/daily-audit', { user, body: { restaurant_id: 1, business_date: DATE, rows } });
const postDish = (user, rows) => call('POST', '/api/daily-audit/portions', { user, body: { restaurant_id: 1, business_date: DATE, rows } });
const order = (user, assigned, items) => call('POST', '/api/daily-audit/recount-orders', {
  user, body: { restaurant_id: 1, business_date: DATE, assigned_user_id: assigned, items }
});
const entries = (kind, itemId) => db.prepare(
  `SELECT quantity, remark, entry_type, user_id, user_name FROM count_entries WHERE kind = ? AND item_id = ? ORDER BY id`
).all(kind, itemId).map(r => ({ ...r }));
const BLIND_KEYS = ['count', 'item_id', 'name', 'recount_open', 'remark', 'type', 'unit'];
const MIXED = `/api/daily-audit/mixed?restaurant_id=1&date=${DATE}`;

test('isBlind / canOrderRecount: checker and no user are blind; head chef and admin order; management sees, never orders', () => {
  // Step role-assignments: the answer comes from the person's role rows, so
  // these are real users (as req.user carries them), not bare flag objects.
  const asUser = (id, f, c, a, r) => ({ id, can_enter_counts: f, can_finalize: c, can_admin: a, read_only: r });
  const adminRole = roleId('admin', [1, 1, 1, 0]);
  const ada = Number(db.prepare('INSERT INTO users (name, default_role_id) VALUES (?, ?)').run('Ada', adminRole).lastInsertRowid);
  const checkerUser = asUser(cara, 1, 0, 0, 0);
  const chefUser = asUser(hugo, 1, 1, 0, 0);
  const adminUser = asUser(ada, 1, 1, 1, 0);
  const managementUser = asUser(mona, 0, 0, 0, 1);
  assert.strictEqual(isBlind(null, 'A'), true);
  assert.strictEqual(isBlind(checkerUser, 'A'), true);
  for (const u of [chefUser, adminUser, managementUser]) assert.strictEqual(isBlind(u, 'A'), false);
  assert.strictEqual(canOrderRecount(null, 'A'), false);
  assert.strictEqual(canOrderRecount(checkerUser, 'A'), false);
  assert.strictEqual(canOrderRecount(managementUser, 'A'), false);
  assert.strictEqual(canOrderRecount(chefUser, 'A'), true);
  assert.strictEqual(canOrderRecount(adminUser, 'A'), true);
});

test('a blind response (checker, and no user) has only ids, name, unit, count, remark, recount flag - meat and portion rows, both GET routes', async () => {
  for (const user of [cara, null]) {
    const mixed = await getJson(MIXED, user);
    assert.strictEqual(mixed.blind, true);
    assert.deepStrictEqual(mixed.rows.map(r => r.type), ['MEAT', 'MEAT', 'DISH']);
    for (const r of mixed.rows) assert.deepStrictEqual(Object.keys(r).sort(), BLIND_KEYS);
    const plain = await getJson(`/api/daily-audit?restaurant_id=1&date=${DATE}`, user);
    assert.strictEqual(plain.blind, true);
    for (const r of plain.rows) assert.deepStrictEqual(Object.keys(r).sort(), BLIND_KEYS);
  }
});

test('a head-chef (and management) response is unchanged from today', async () => {
  const expected = computeMixedDailyAudit(db, 1, DATE).map(r => (r.type === 'MEAT' ? { ...r, remarks: '' } : r));
  assert.deepStrictEqual(await getJson(MIXED, hugo), JSON.parse(JSON.stringify(expected)));
  assert.deepStrictEqual(await getJson(MIXED, mona), JSON.parse(JSON.stringify(expected)));
});

test('a save writes the current value and one COUNT row together; the next change is an EDIT', async () => {
  assert.strictEqual((await postMeat(cara, [{ meat_id: 1, ending_actual: '8', remarks: 'two bags', touched: true }])).status, 200);
  const ending = db.prepare(`SELECT quantity, notes FROM ending_actual WHERE meat_id = 1 AND business_date = ?`).get(DATE);
  assert.deepStrictEqual({ ...ending }, { quantity: 8, notes: 'two bags' });
  assert.deepStrictEqual(entries('MEAT', 1), [{ quantity: 8, remark: 'two bags', entry_type: 'COUNT', user_id: cara, user_name: 'Cara' }]);
  const row = (await getJson(MIXED, cara)).rows[0];
  assert.deepStrictEqual([row.count, row.remark], [8, 'two bags']);

  await postMeat(hugo, [{ meat_id: 1, ending_actual: '7.5', remarks: 'two bags' }]);
  assert.deepStrictEqual(entries('MEAT', 1).map(e => [e.entry_type, e.quantity, e.user_name]), [['COUNT', 8, 'Cara'], ['EDIT', 7.5, 'Hugo']]);
});

test('an untouched repost of the same value writes no history; a touched same value does', async () => {
  await postMeat(cara, [{ meat_id: 1, ending_actual: '7.5', remarks: 'two bags' }, { meat_id: 2, ending_actual: '' }]);
  assert.strictEqual(entries('MEAT', 1).length, 2);
  await postMeat(cara, [{ meat_id: 1, ending_actual: '7.5', remarks: 'two bags', touched: true }]);
  assert.deepStrictEqual(entries('MEAT', 1).map(e => e.entry_type), ['COUNT', 'EDIT', 'EDIT']);
});

test('a failed save writes no history row (one transaction)', () => {
  const before = entries('PORTION', 1).length;
  assert.throws(() => saveCount(db, { restaurantId: 1, date: DATE, kind: 'PORTION', itemId: 1, quantity: 3, touched: true, user: null },
    () => { throw new Error('disk full'); }));
  assert.strictEqual(entries('PORTION', 1).length, before);
});

test('checker, management and no user get 403 on ordering; nothing is created', async () => {
  for (const user of [cara, mona, null]) {
    assert.strictEqual((await order(user, dee, [{ kind: 'MEAT', item_id: 1 }])).status, 403);
  }
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM recount_orders').get().n, 0);
});

test('no order on a blocked item, an inactive person, or an unknown item', async () => {
  assert.strictEqual((await order(hugo, dee, [{ kind: 'MEAT', item_id: 2 }])).status, 400);
  assert.strictEqual((await order(hugo, gone, [{ kind: 'MEAT', item_id: 1 }])).status, 400);
  assert.strictEqual((await order(hugo, dee, [{ kind: 'MEAT', item_id: 99 }])).status, 400);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM recount_orders').get().n, 0);
});

test('picking the first counter returns the warning and still creates the order; cancel closes it', async () => {
  const res = await order(hugo, cara, [{ kind: 'MEAT', item_id: 1 }]);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual(body.warnings, [{ kind: 'MEAT', item_id: 1, warning: 'did the first count' }]);
  const cancel = id => call('POST', `/api/daily-audit/recount-orders/${id}/cancel`, { user: cara, body: { restaurant_id: 1 } });
  assert.strictEqual((await cancel(body.ids[0])).status, 403);
  const ok = await call('POST', `/api/daily-audit/recount-orders/${body.ids[0]}/cancel`, { user: hugo, body: { restaurant_id: 1 } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(db.prepare('SELECT status FROM recount_orders WHERE id = ?').get(body.ids[0]).status, 'CANCELLED');
});

test('a recount closes its order and becomes the count; the first count stays in history', async () => {
  const res = await order(hugo, dee, [{ kind: 'MEAT', item_id: 1 }]);
  assert.deepStrictEqual((await res.json()).warnings, []);
  const flags = (await getJson(MIXED, dee)).rows.map(r => r.recount_open);
  assert.deepStrictEqual(flags, [true, false, false]);
  assert.deepStrictEqual((await getJson(MIXED, cara)).rows.map(r => r.recount_open), [false, false, false]);

  await postMeat(dee, [{ meat_id: 1, ending_actual: '6', remarks: 'two bags', touched: true }]);
  assert.strictEqual(db.prepare(`SELECT quantity FROM ending_actual WHERE meat_id = 1 AND business_date = ?`).get(DATE).quantity, 6);
  const history = entries('MEAT', 1);
  assert.deepStrictEqual(history[0], { quantity: 8, remark: 'two bags', entry_type: 'COUNT', user_id: cara, user_name: 'Cara' });
  assert.deepStrictEqual(history[history.length - 1].entry_type, 'RECOUNT');
  assert.strictEqual(db.prepare(`SELECT status FROM recount_orders WHERE assigned_user_id = ?`).get(dee).status, 'DONE');
  assert.deepStrictEqual((await getJson(MIXED, dee)).rows.map(r => r.recount_open), [false, false, false]);
});

test('a portion remark round-trips; a save without a remark keeps it', async () => {
  await postDish(cara, [{ dish_id: 1, portion_actual: '12', remark: 'two burnt', touched: true }]);
  assert.strictEqual((await getJson(MIXED, cara)).rows[2].remark, 'two burnt');
  await postDish(hugo, [{ dish_id: 1, prepped: '', portion_actual: '11' }]);
  assert.deepStrictEqual(entries('PORTION', 1).map(e => [e.entry_type, e.quantity, e.remark]), [['COUNT', 12, 'two burnt'], ['EDIT', 11, 'two burnt']]);
  assert.deepStrictEqual([(await getJson(MIXED, cara)).rows[2].count, (await getJson(MIXED, cara)).rows[2].remark], [11, 'two burnt']);
});

test('month opening: 403 for a blind user (beginning numbers); the head chef still gets it', async () => {
  const url = `/api/daily-audit/month-opening?restaurant_id=1&date=${DATE}`;
  assert.strictEqual((await call('GET', url, { user: cara })).status, 403);
  assert.strictEqual((await call('GET', url)).status, 403);
  assert.strictEqual((await call('GET', url, { user: hugo })).status, 200);
});

test('count history: 403 for a blind user; the head chef sees entries, orders and who can be picked', async () => {
  const url = `/api/daily-audit/count-history?restaurant_id=1&date=${DATE}`;
  assert.strictEqual((await call('GET', url, { user: cara })).status, 403);
  assert.strictEqual((await call('GET', url)).status, 403);
  const h = await getJson(url, hugo);
  assert.strictEqual(h.can_order, true);
  assert.ok(h.entries.length >= 5);
  assert.deepStrictEqual(h.people.map(p => p.name), ['Cara', 'Dee', 'Hugo']);
  assert.strictEqual((await getJson(url, mona)).can_order, false);
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
