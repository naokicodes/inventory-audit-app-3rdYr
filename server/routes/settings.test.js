// Tests for the Restaurants section of server/routes/settings.js
// (Round 2 findings item 1, session-status.md): until this step,
// `restaurants` rows only ever came from seed.js reading a JSON file -
// no in-app way to create one. This file is a fresh settings.test.js -
// the old one was deleted during item 4's cleanup pass because it only
// covered the retired commissary-mapping routes, which no longer exist.
//
// Same approach as dailyAudit.test.js/stockReceipts.test.js: a real
// in-memory node:sqlite DB, real schema, plain assertions, no test
// framework - small helpers mirror the exact GET/POST/PUT
// /api/settings/restaurants logic (not a full Express app/HTTP layer).

const { DatabaseSync } = require('node:sqlite');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

console.log('Settings Route Tests (Restaurants CRUD)\n');

const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(schema);

// Mirrors GET /api/settings/restaurants
function listRestaurants() {
  return db.prepare(`SELECT id, name, code, active FROM restaurants ORDER BY name`).all();
}

// Mirrors POST /api/settings/restaurants
function createRestaurant({ name, code }) {
  if (!name || !code) {
    return { status: 400, body: { error: 'name and code are required' } };
  }
  try {
    const result = db.prepare(
      `INSERT INTO restaurants (name, code) VALUES (?, ?)`
    ).run(name, code.toUpperCase());
    return { status: 200, body: { ok: true, id: Number(result.lastInsertRowid) } };
  } catch (err) {
    return { status: 400, body: { error: err.message.includes('UNIQUE') ? 'That restaurant code already exists.' : err.message } };
  }
}

// Mirrors PUT /api/settings/restaurants/:id
function updateRestaurant(id, { name, active }) {
  if (!name || !name.trim()) {
    return { status: 400, body: { error: 'name is required' } };
  }
  db.prepare(
    `UPDATE restaurants SET name = ?, active = ? WHERE id = ?`
  ).run(name.trim(), active ? 1 : 0, id);
  return { status: 200, body: { ok: true } };
}

test('a fresh restaurant list is empty', () => {
  assert.deepStrictEqual(listRestaurants(), []);
});

test('creating a restaurant requires both name and code', () => {
  assert.strictEqual(createRestaurant({ name: '', code: 'RC' }).status, 400);
  assert.strictEqual(createRestaurant({ name: 'Restaurant C', code: '' }).status, 400);
});

test('creating a restaurant with name and code succeeds and defaults active to 1', () => {
  const result = createRestaurant({ name: 'Restaurant C', code: 'rc' });
  assert.strictEqual(result.status, 200);
  assert.ok(result.body.id);
  const row = db.prepare(`SELECT * FROM restaurants WHERE id = ?`).get(result.body.id);
  assert.strictEqual(row.name, 'Restaurant C');
  assert.strictEqual(row.code, 'RC', 'code should be uppercased, same convention as meat_code/dish_code');
  assert.strictEqual(row.active, 1);
});

test('the new restaurant shows up in the list', () => {
  const rows = listRestaurants();
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].name, 'Restaurant C');
});

test('a duplicate code is rejected with a friendly error, same pattern as Meats/Dishes', () => {
  const result = createRestaurant({ name: 'Restaurant C Duplicate', code: 'RC' });
  assert.strictEqual(result.status, 400);
  assert.strictEqual(result.body.error, 'That restaurant code already exists.');
  assert.strictEqual(listRestaurants().length, 1, 'the failed insert must not leave a row behind');
});

let secondId;
test('a second, distinct restaurant can be created', () => {
  const result = createRestaurant({ name: 'Restaurant D', code: 'RD' });
  assert.strictEqual(result.status, 200);
  secondId = result.body.id;
  assert.strictEqual(listRestaurants().length, 2);
});

test('editing requires a non-empty name', () => {
  const result = updateRestaurant(secondId, { name: '   ', active: true });
  assert.strictEqual(result.status, 400);
  const row = db.prepare(`SELECT name FROM restaurants WHERE id = ?`).get(secondId);
  assert.strictEqual(row.name, 'Restaurant D', 'the bad edit must not have touched the row');
});

test('editing updates name and active, but leaves code untouched (not part of the edit shape)', () => {
  const result = updateRestaurant(secondId, { name: 'Restaurant D Renamed', active: false });
  assert.strictEqual(result.status, 200);
  const row = db.prepare(`SELECT * FROM restaurants WHERE id = ?`).get(secondId);
  assert.strictEqual(row.name, 'Restaurant D Renamed');
  assert.strictEqual(row.active, 0);
  assert.strictEqual(row.code, 'RD', 'code is set once at creation and is not part of the PUT body');
});

test('an inactive restaurant still appears in the settings list (unlike the active-only GET /api/restaurants used elsewhere)', () => {
  const rows = listRestaurants();
  assert.strictEqual(rows.length, 2, 'both rows, active and inactive, must still be listed here');
  const renamed = rows.find(r => r.id === secondId);
  assert.strictEqual(renamed.active, 0);
});

test('re-activating via the same PUT works (active is just a normal field, not a one-way flag)', () => {
  updateRestaurant(secondId, { name: 'Restaurant D Renamed', active: true });
  const row = db.prepare(`SELECT active FROM restaurants WHERE id = ?`).get(secondId);
  assert.strictEqual(row.active, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
