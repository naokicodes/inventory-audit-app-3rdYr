// Step user-id-authorship: a write made while logged in stamps
// created_by_user_id with the logged-in user; logged out leaves it NULL.
// The real routers and currentUser over HTTP on an ephemeral port, against a
// throwaway DB file (DB_PATH set before the connection opens) - the same
// harness as sideItems.test.js.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const TEST_DB = path.join(os.tmpdir(), `authorship-test-${process.pid}.db`);
process.env.DB_PATH = TEST_DB;
const db = require('../db/connection.js');
const { currentUser } = require('./auth.js');

console.log('Authorship (created_by_user_id) Route Tests\n');

const roleId = Number(db.prepare(
  'INSERT INTO roles (name, can_enter_counts, can_finalize, can_admin, read_only) VALUES (?, 1, 1, 1, 0)'
).run('authorship-admin').lastInsertRowid);
const userId = Number(db.prepare('INSERT INTO users (name, default_role_id) VALUES (?, ?)').run('Ana Counter', roleId).lastInsertRowid);
const restaurantId = Number(db.prepare("INSERT INTO restaurants (name, code) VALUES ('Restaurant A', 'RA')").run().lastInsertRowid);
const meatId = Number(db.prepare("INSERT INTO meats (restaurant_id, meat_code, name, unit) VALUES (?, 'M01', 'Chicken', 'kg')").run(restaurantId).lastInsertRowid);
const dishId = Number(db.prepare("INSERT INTO dishes (restaurant_id, dish_code, name, prep_type) VALUES (?, 'D01', 'Adobo', 'BATCH_PREPPED')").run(restaurantId).lastInsertRowid);
const typeId = Number(db.prepare("INSERT INTO adjustment_types (name) VALUES ('Authorship test wastage')").run().lastInsertRowid);
// An opening in November so the ending counts below are not blocked.
db.prepare("INSERT INTO opening_stock (restaurant_id, meat_id, business_date, quantity, opening_source) VALUES (?, ?, '2026-11-01', 10, 'RECOUNT')").run(restaurantId, meatId);

const app = express();
app.use(express.json());
app.use('/api', currentUser);
app.use('/api', require('./dailyAudit.js'));
app.use('/api', require('./stockReceipts.js'));
app.use('/api', require('./allocations.js'));

let base;
const post = async (url, loggedIn, body) => {
  const res = await fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(loggedIn ? { Cookie: `user_id=${userId}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};
const ok = r => assert.strictEqual(r.status, 200, JSON.stringify(r.body));

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('an ending count saved while logged in stamps created_by_user_id and the counter name', async () => {
  ok(await post('/api/daily-audit', true, {
    restaurant_id: restaurantId, business_date: '2026-11-05', rows: [{ meat_id: meatId, ending_actual: 4, touched: true }]
  }));
  const row = db.prepare('SELECT created_by, created_by_user_id FROM ending_actual WHERE meat_id = ? AND business_date = ?').get(meatId, '2026-11-05');
  assert.deepStrictEqual({ ...row }, { created_by: 'Ana Counter', created_by_user_id: userId });
});

test('the page re-posting an untouched, unchanged row (logged out) keeps the original author', async () => {
  ok(await post('/api/daily-audit', false, {
    restaurant_id: restaurantId, business_date: '2026-11-05', rows: [{ meat_id: meatId, ending_actual: 4, touched: false }]
  }));
  const row = db.prepare('SELECT created_by, created_by_user_id FROM ending_actual WHERE meat_id = ? AND business_date = ?').get(meatId, '2026-11-05');
  assert.deepStrictEqual({ ...row }, { created_by: 'Ana Counter', created_by_user_id: userId });
});

test('prepped and portion counts saved while logged in are stamped; prepped.created_by stays NULL (provenance)', async () => {
  ok(await post('/api/daily-audit/portions', true, {
    restaurant_id: restaurantId, business_date: '2026-11-05', rows: [{ dish_id: dishId, prepped: 30, portion_actual: 12, touched: true }]
  }));
  const prepped = db.prepare('SELECT created_by, created_by_user_id FROM prepped WHERE dish_id = ?').get(dishId);
  assert.deepStrictEqual({ ...prepped }, { created_by: null, created_by_user_id: userId });
  const portion = db.prepare('SELECT created_by, created_by_user_id FROM portion_ending_actual WHERE dish_id = ?').get(dishId);
  assert.deepStrictEqual({ ...portion }, { created_by: 'Ana Counter', created_by_user_id: userId });
});

test('a SYSTEM prepped row corrected by a logged-in human gets the human id, stamp cleared', async () => {
  db.prepare("INSERT INTO prepped (restaurant_id, dish_id, business_date, portions_produced, created_by) VALUES (?, ?, '2026-11-06', 20, 'SYSTEM:sync-batch-stock')").run(restaurantId, dishId);
  ok(await post('/api/daily-audit/portions', true, {
    restaurant_id: restaurantId, business_date: '2026-11-06', rows: [{ dish_id: dishId, prepped: 25 }]
  }));
  const row = db.prepare("SELECT created_by, created_by_user_id FROM prepped WHERE dish_id = ? AND business_date = '2026-11-06'").get(dishId);
  assert.deepStrictEqual({ ...row }, { created_by: null, created_by_user_id: userId });
});

test('a stock receipt and an allocation saved while logged in are stamped', async () => {
  const receipt = await post('/api/stock-receipts', true, {
    restaurant_id: restaurantId, meat_id: meatId, business_date: '2026-11-05', quantity: 3, source: 'DIRECT'
  });
  ok(receipt);
  assert.strictEqual(db.prepare('SELECT created_by_user_id FROM stock_receipts WHERE id = ?').get(receipt.body.id).created_by_user_id, userId);
  const alloc = await post('/api/allocations', true, {
    restaurant_id: restaurantId, meat_id: meatId, business_date: '2026-11-05', adjustment_type_id: typeId, quantity: 1
  });
  ok(alloc);
  assert.strictEqual(db.prepare('SELECT created_by_user_id FROM adjustments WHERE id = ?').get(alloc.body.id).created_by_user_id, userId);
});

test('a write while logged out leaves created_by_user_id NULL', async () => {
  const receipt = await post('/api/stock-receipts', false, {
    restaurant_id: restaurantId, meat_id: meatId, business_date: '2026-11-07', quantity: 2, source: 'DIRECT'
  });
  ok(receipt);
  assert.strictEqual(db.prepare('SELECT created_by_user_id FROM stock_receipts WHERE id = ?').get(receipt.body.id).created_by_user_id, null);
});

test('created_by_user_id is a foreign key to users', () => {
  const fk = db.prepare('PRAGMA foreign_key_list(ending_actual)').all().find(f => f.from === 'created_by_user_id');
  assert.strictEqual(fk && fk.table, 'users');
});

(async () => {
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log(`  PASS: ${name}`); passed++; }
    catch (err) { console.log(`  FAIL: ${name}\n    ${err.message}`); failed++; }
  }
  server.close();
  db.close();
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
