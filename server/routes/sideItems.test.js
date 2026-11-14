// Step side-items: the real side-items router and currentUser over HTTP on an
// ephemeral port, against a throwaway DB file (DB_PATH set before the
// connection opens) - the same harness as settings.test.js's guard tests.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const TEST_DB = path.join(os.tmpdir(), `side-items-test-${process.pid}.db`);
process.env.DB_PATH = TEST_DB;
const db = require('../db/connection.js');
const { currentUser } = require('./auth.js');
const router = require('./sideItems.js');

console.log('Side Items Route Tests\n');

const roleUser = (name, flags) => {
  const role = Number(db.prepare(
    'INSERT INTO roles (name, can_enter_counts, can_finalize, can_admin, read_only) VALUES (?, ?, ?, ?, ?)'
  ).run(name, ...flags).lastInsertRowid);
  return Number(db.prepare('INSERT INTO users (name, default_role_id) VALUES (?, ?)').run(`U ${name}`, role).lastInsertRowid);
};
const users = {
  admin: roleUser('admin', [1, 1, 1, 0]),
  management: roleUser('management', [0, 0, 0, 1]),
  'head-chef': roleUser('head-chef', [1, 1, 0, 0]),
  checker: roleUser('checker', [1, 0, 0, 0]),
};
db.prepare("INSERT INTO restaurants (name, code) VALUES ('Restaurant A', 'RA')").run();
const sheetId = Number(db.prepare(
  "INSERT INTO sheet_definitions (site_code, category, engine_type) VALUES ('RA', 'Bar Sides', 'SIDE')"
).run().lastInsertRowid);

const app = express();
app.use(express.json());
app.use('/api', currentUser);
app.use('/api', router);

let base;
const call = async (method, url, as, body) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(as ? { Cookie: `user_id=${users[as]}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

let itemId;
test('admin creates an item, adds a conversion and puts it on a sheet; each is logged', async () => {
  const created = await call('POST', '/api/side-items', 'admin', { name: 'Test Rice', main_unit: 'kg', cost_per_unit: 50, how_bought: 'supplier' });
  assert.strictEqual(created.status, 200, JSON.stringify(created.body));
  itemId = created.body.item.id;
  assert.strictEqual((await call('POST', `/api/side-items/${itemId}/units`, 'admin', { unit: 'Sack', per_main: 25 })).status, 200);
  assert.strictEqual((await call('POST', '/api/side-item-links', 'admin', { sheet_id: sheetId, side_item_id: itemId, sort_order: 0 })).status, 200);
  const log = db.prepare("SELECT actor, source FROM activity_log WHERE entity_type LIKE 'side_item%'").all();
  assert.strictEqual(log.length, 3);
  assert.ok(log.every(l => l.actor === 'U admin' && l.source === 'MANUAL'));
});

test('GET shows the cost to an admin and leaves it out for anyone else', async () => {
  const asAdmin = await call('GET', '/api/side-items?site=RA', 'admin');
  assert.strictEqual(asAdmin.body[0].items[0].cost_per_unit, 50);
  assert.deepStrictEqual(asAdmin.body[0].items[0].units, [{ unit: 'sack', per_main: 25 }]);
  for (const as of ['checker', 'head-chef', 'management', null]) {
    const res = await call('GET', '/api/side-items?site=RA', as);
    assert.strictEqual(res.status, 200);
    assert.ok(!('cost_per_unit' in res.body[0].items[0]), `${as} sees no cost`);
  }
});

test('non-admin writes -> 403 (logged out -> 401), nothing written', async () => {
  const writes = [
    ['POST', '/api/side-items', { name: 'Test X', main_unit: 'kg' }],
    ['PUT', `/api/side-items/${itemId}`, { name: 'Renamed' }],
    ['POST', `/api/side-items/${itemId}/units`, { unit: 'tray', per_main: 2 }],
    ['PUT', `/api/side-items/${itemId}/units`, { unit: 'tray', per_main: 2 }],
    ['PUT', '/api/side-item-links', { sheet_id: sheetId, side_item_id: itemId, active: false }],
  ];
  const logs = db.prepare('SELECT COUNT(*) AS n FROM activity_log').get().n;
  for (const as of ['checker', 'head-chef', 'management']) {
    for (const [m, url, body] of writes) {
      const res = await call(m, url, as, body);
      assert.strictEqual(res.status, 403, `${as} ${m} ${url}`);
      assert.deepStrictEqual(res.body, { error: 'Only an admin can change settings' });
    }
  }
  for (const [m, url, body] of writes) assert.strictEqual((await call(m, url, null, body)).status, 401);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM activity_log').get().n, logs);
});

test('a bad save answers 400 with the message; switching off keeps the link', async () => {
  const bad = await call('PUT', `/api/side-items/${itemId}`, 'admin', { how_bought: 'friend' });
  assert.strictEqual(bad.status, 400);
  assert.match(bad.body.error, /supplier, buyer, commi/);
  const off = await call('PUT', '/api/side-item-links', 'admin', { sheet_id: sheetId, side_item_id: itemId, active: false });
  assert.strictEqual(off.status, 200);
  const items = (await call('GET', '/api/side-items?site=RA', 'admin')).body[0].items;
  assert.strictEqual(items[0].link_active, 0);
});

test('an empty site lists no sheets; a missing site is a 400', async () => {
  assert.deepStrictEqual((await call('GET', '/api/side-items?site=ZZ', 'admin')).body, []);
  assert.strictEqual((await call('GET', '/api/side-items', 'admin')).status, 400);
});

const server = app.listen(0, async () => {
  base = `http://127.0.0.1:${server.address().port}`;
  let passed = 0, failed = 0;
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
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) fs.rmSync(f, { force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
});
