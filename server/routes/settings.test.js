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

// ---- Commissaries CRUD (step 23b, 2026-08-31) - exact mirror of
// Restaurants above, see settings.js's own comment for the reasoning.

console.log('\nSettings Route Tests (Commissaries CRUD)\n');

function listCommissaries() {
  return db.prepare(`SELECT id, name, code, active FROM commissaries ORDER BY name`).all();
}

function createCommissary({ name, code }) {
  if (!name || !code) {
    return { status: 400, body: { error: 'name and code are required' } };
  }
  try {
    const result = db.prepare(
      `INSERT INTO commissaries (name, code) VALUES (?, ?)`
    ).run(name, code.toUpperCase());
    return { status: 200, body: { ok: true, id: Number(result.lastInsertRowid) } };
  } catch (err) {
    return { status: 400, body: { error: err.message.includes('UNIQUE') ? 'That commissary code already exists.' : err.message } };
  }
}

function updateCommissary(id, { name, active }) {
  if (!name || !name.trim()) {
    return { status: 400, body: { error: 'name is required' } };
  }
  db.prepare(
    `UPDATE commissaries SET name = ?, active = ? WHERE id = ?`
  ).run(name.trim(), active ? 1 : 0, id);
  return { status: 200, body: { ok: true } };
}

test('a fresh commissaries list is empty', () => {
  assert.deepStrictEqual(listCommissaries(), []);
});

test('creating a commissary requires both name and code', () => {
  assert.strictEqual(createCommissary({ name: '', code: 'COM-A' }).status, 400);
  assert.strictEqual(createCommissary({ name: 'Commissary A', code: '' }).status, 400);
});

let commissaryAId;
test('creating a commissary with name and code succeeds, code uppercased, active defaults to 1', () => {
  const result = createCommissary({ name: 'Commissary A', code: 'com-a' });
  assert.strictEqual(result.status, 200);
  commissaryAId = result.body.id;
  const row = db.prepare(`SELECT * FROM commissaries WHERE id = ?`).get(commissaryAId);
  assert.strictEqual(row.code, 'COM-A');
  assert.strictEqual(row.active, 1);
});

test('a duplicate commissary code is rejected with a friendly error', () => {
  const result = createCommissary({ name: 'Commissary A Duplicate', code: 'COM-A' });
  assert.strictEqual(result.status, 400);
  assert.strictEqual(result.body.error, 'That commissary code already exists.');
});

test('editing a commissary updates name/active but leaves code untouched', () => {
  const result = updateCommissary(commissaryAId, { name: 'Commissary A Renamed', active: false });
  assert.strictEqual(result.status, 200);
  const row = db.prepare(`SELECT * FROM commissaries WHERE id = ?`).get(commissaryAId);
  assert.strictEqual(row.name, 'Commissary A Renamed');
  assert.strictEqual(row.active, 0);
  assert.strictEqual(row.code, 'COM-A');
});

test('an inactive commissary still appears in the settings list', () => {
  const rows = listCommissaries();
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].active, 0);
});

// reactivate for the fixtures the commissary-meats section below needs
updateCommissary(commissaryAId, { name: 'Commissary A', active: true });

// ---- Meat Types CRUD (step 23b, 2026-08-31) - exact mirror of
// Adjustment Types, see settings.js's own comment for the reasoning.

console.log('\nSettings Route Tests (Meat Types CRUD)\n');

function listMeatTypes() {
  return db.prepare(`SELECT id, name, active FROM meat_types ORDER BY name`).all();
}

function createMeatType({ name }) {
  if (!name || !name.trim()) {
    return { status: 400, body: { error: 'name is required' } };
  }
  try {
    const result = db.prepare(`INSERT INTO meat_types (name) VALUES (?)`).run(name.trim());
    return { status: 200, body: { ok: true, id: Number(result.lastInsertRowid) } };
  } catch (err) {
    return { status: 400, body: { error: err.message.includes('UNIQUE') ? 'That meat type name already exists.' : err.message } };
  }
}

function updateMeatType(id, { name, active }) {
  if (!name || !name.trim()) {
    return { status: 400, body: { error: 'name is required' } };
  }
  db.prepare(`UPDATE meat_types SET name = ?, active = ? WHERE id = ?`).run(name.trim(), active ? 1 : 0, id);
  return { status: 200, body: { ok: true } };
}

test('a fresh meat types list is empty', () => {
  assert.deepStrictEqual(listMeatTypes(), []);
});

test('creating a meat type requires a name', () => {
  assert.strictEqual(createMeatType({ name: '' }).status, 400);
});

let jowlTypeId;
test('creating a meat type with a name succeeds, active defaults to 1', () => {
  const result = createMeatType({ name: 'Jowl' });
  assert.strictEqual(result.status, 200);
  jowlTypeId = result.body.id;
  const row = db.prepare(`SELECT * FROM meat_types WHERE id = ?`).get(jowlTypeId);
  assert.strictEqual(row.name, 'Jowl');
  assert.strictEqual(row.active, 1);
});

test('a meat type name is NOT required to be unique at the schema level, but this endpoint has no duplicate check either - matches Adjustment Types having a real UNIQUE constraint while meat_types does not', () => {
  // meat_types has no UNIQUE(name) in schema.sql (unlike adjustment_types) -
  // two commissaries could plausibly want independently-created rows that
  // happen to share a name before an admin realizes they should be merged.
  // Confirming this is the real, current schema behavior, not assumed.
  const result = createMeatType({ name: 'Jowl' });
  assert.strictEqual(result.status, 200, 'no UNIQUE constraint on meat_types.name - a duplicate name is currently allowed');
});

test('deactivating a meat type via PUT works', () => {
  const result = updateMeatType(jowlTypeId, { name: 'Jowl', active: false });
  assert.strictEqual(result.status, 200);
  const row = db.prepare(`SELECT active FROM meat_types WHERE id = ?`).get(jowlTypeId);
  assert.strictEqual(row.active, 0);
});

// reactivate for the commissary-meats section below
updateMeatType(jowlTypeId, { name: 'Jowl', active: true });

// ---- Commissary Meats CRUD (step 23b, 2026-08-31) - mirrors Meats
// above but scoped by commissary_id, see settings.js's own comment.

console.log('\nSettings Route Tests (Commissary Meats CRUD)\n');

function listCommissaryMeats(commissaryId) {
  if (!commissaryId) return { status: 400, body: { error: 'commissary_id required' } };
  const rows = db.prepare(
    `SELECT id, code, name, unit, allowed_leeway_pct, cost_per_unit, meat_type_id, active
     FROM commissary_meats WHERE commissary_id = ? ORDER BY code`
  ).all(commissaryId);
  return { status: 200, body: rows };
}

function createCommissaryMeat({ commissary_id, code, name, unit, allowed_leeway_pct, cost_per_unit, meat_type_id }) {
  if (!commissary_id || !code || !name || !unit
      || allowed_leeway_pct === undefined || allowed_leeway_pct === null || allowed_leeway_pct === '') {
    return { status: 400, body: { error: 'commissary_id, code, name, unit, and allowed_leeway_pct are required' } };
  }
  if (!['kg', 'unit'].includes(unit)) {
    return { status: 400, body: { error: 'unit must be "kg" or "unit"' } };
  }
  try {
    const result = db.prepare(
      `INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct, cost_per_unit, meat_type_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(commissary_id, code.toUpperCase(), name, unit, Number(allowed_leeway_pct), cost_per_unit || null, meat_type_id || null);
    return { status: 200, body: { ok: true, id: Number(result.lastInsertRowid) } };
  } catch (err) {
    return { status: 400, body: { error: err.message.includes('UNIQUE') ? 'That code already exists for this commissary.' : err.message } };
  }
}

function updateCommissaryMeat(id, { name, unit, allowed_leeway_pct, cost_per_unit, meat_type_id, active }) {
  db.prepare(
    `UPDATE commissary_meats
     SET name = ?, unit = ?, allowed_leeway_pct = ?, cost_per_unit = ?, meat_type_id = ?, active = ?
     WHERE id = ?`
  ).run(name, unit, Number(allowed_leeway_pct), cost_per_unit || null, meat_type_id || null, active ? 1 : 0, id);
  return { status: 200, body: { ok: true } };
}

test('listing commissary meats requires commissary_id', () => {
  assert.strictEqual(listCommissaryMeats(null).status, 400);
});

test('a fresh commissary meats list for Commissary A is empty', () => {
  assert.deepStrictEqual(listCommissaryMeats(commissaryAId).body, []);
});

test('creating a commissary meat requires code, name, unit, and allowed_leeway_pct', () => {
  assert.strictEqual(createCommissaryMeat({ commissary_id: commissaryAId, name: 'Jowl', unit: 'kg' }).status, 400);
});

test('creating a commissary meat with an invalid unit is rejected', () => {
  const result = createCommissaryMeat({ commissary_id: commissaryAId, code: 'M05', name: 'Jowl', unit: 'lbs', allowed_leeway_pct: 0.2 });
  assert.strictEqual(result.status, 400);
});

let jowlMeatId;
test('a valid commissary meat is created, tagged with a meat_type_id', () => {
  const result = createCommissaryMeat({
    commissary_id: commissaryAId, code: 'm05', name: 'Jowl', unit: 'kg',
    allowed_leeway_pct: 0.2, meat_type_id: jowlTypeId
  });
  assert.strictEqual(result.status, 200);
  jowlMeatId = result.body.id;
  const row = db.prepare(`SELECT * FROM commissary_meats WHERE id = ?`).get(jowlMeatId);
  assert.strictEqual(row.code, 'M05', 'code should be uppercased, same convention as meats/dishes/restaurants');
  assert.strictEqual(row.commissary_id, commissaryAId);
  assert.strictEqual(row.meat_type_id, jowlTypeId);
  assert.strictEqual(row.active, 1);
});

test('the new commissary meat shows up in the Commissary A list', () => {
  const rows = listCommissaryMeats(commissaryAId).body;
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].code, 'M05');
});

test('a duplicate code under the SAME commissary is rejected', () => {
  const result = createCommissaryMeat({ commissary_id: commissaryAId, code: 'M05', name: 'Dup', unit: 'kg', allowed_leeway_pct: 0.1 });
  assert.strictEqual(result.status, 400);
  assert.strictEqual(result.body.error, 'That code already exists for this commissary.');
});

test('the SAME code under a DIFFERENT commissary is allowed - codes are unique per commissary, not globally', () => {
  const commissaryB = createCommissary({ name: 'Commissary B', code: 'COM-B' });
  const result = createCommissaryMeat({ commissary_id: commissaryB.body.id, code: 'M05', name: 'Jowl (Commissary B)', unit: 'kg', allowed_leeway_pct: 0.2 });
  assert.strictEqual(result.status, 200);
  assert.strictEqual(listCommissaryMeats(commissaryB.body.id).body.length, 1);
  assert.strictEqual(listCommissaryMeats(commissaryAId).body.length, 1, 'Commissary A\'s own list is unaffected');
});

test('editing a commissary meat updates its fields including meat_type_id, but not code/commissary_id', () => {
  const result = updateCommissaryMeat(jowlMeatId, {
    name: 'Jowl Renamed', unit: 'kg', allowed_leeway_pct: 0.25, cost_per_unit: 10, meat_type_id: null, active: true
  });
  assert.strictEqual(result.status, 200);
  const row = db.prepare(`SELECT * FROM commissary_meats WHERE id = ?`).get(jowlMeatId);
  assert.strictEqual(row.name, 'Jowl Renamed');
  assert.strictEqual(row.allowed_leeway_pct, 0.25);
  assert.strictEqual(row.cost_per_unit, 10);
  assert.strictEqual(row.meat_type_id, null, 'meat_type_id is editable - can be untagged again');
  assert.strictEqual(row.code, 'M05', 'code is set once at creation, not part of the PUT body');
  assert.strictEqual(row.commissary_id, commissaryAId, 'commissary_id is not part of the PUT body');
});

test('deactivating a commissary meat via PUT still leaves it listed (inactive included, same as Meats)', () => {
  updateCommissaryMeat(jowlMeatId, { name: 'Jowl Renamed', unit: 'kg', allowed_leeway_pct: 0.25, active: false });
  const rows = listCommissaryMeats(commissaryAId).body;
  const row = rows.find(r => r.id === jowlMeatId);
  assert.ok(row, 'inactive rows must still appear in the admin list');
  assert.strictEqual(row.active, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
