// Tests for the Commissary Mapping admin routes (step 8).
//
// Same approach as history.test.js: a real in-memory node:sqlite DB, real
// schema, real data, plain assertions - no framework, no mocking of the DB
// layer. This drives the same SQL the settings.js route handlers run, via
// small helpers that mirror them, so the test proves the actual list/
// create/unique-constraint/delete logic without needing to spin up
// Express. Only commissary_meat_map is covered here - it's the only new
// table-facing logic step 8 adds (Meats/Dishes/Recipes routes are
// unchanged, already implicitly covered by the app having run against
// them in earlier sessions).

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

console.log('Commissary Mapping Route Tests\n');

const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(schema);

// ---- seed fixtures ----
db.prepare(`INSERT INTO restaurants (id, name, code) VALUES (1, 'Restaurant A', 'A')`).run();
db.prepare(`INSERT INTO restaurants (id, name, code) VALUES (2, 'Restaurant B', 'B')`).run();

db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit) VALUES (1, 1, 'M01', 'Whole Chicken Raw', 'kg')`).run();
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit) VALUES (2, 1, 'M02', 'Beef Shank', 'kg')`).run();
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit) VALUES (3, 2, 'M01', 'Pork Belly', 'kg')`).run();

db.prepare(`INSERT INTO commissary_meats (id, code, name, unit, allowed_leeway_pct) VALUES (1, 'M01', 'Whole Chicken', 'kg', 0.2)`).run();
db.prepare(`INSERT INTO commissary_meats (id, code, name, unit, allowed_leeway_pct) VALUES (2, 'M02', 'Belly Slab', 'kg', 0.15)`).run();

// Mirrors GET /api/settings/commissary-mappings
function listMappings(db, restaurantId) {
  return db.prepare(`
    SELECT cmm.id, cmm.commissary_meat_id, cm.code as commissary_meat_code, cm.name as commissary_meat_name,
           cmm.meat_id, m.meat_code, m.name as meat_name
    FROM commissary_meat_map cmm
    JOIN commissary_meats cm ON cm.id = cmm.commissary_meat_id
    JOIN meats m ON m.id = cmm.meat_id
    WHERE cmm.restaurant_id = ?
    ORDER BY cm.code
  `).all(restaurantId);
}

// Mirrors POST /api/settings/commissary-mappings
function createMapping(db, { restaurant_id, commissary_meat_id, meat_id }) {
  return db.prepare(
    `INSERT INTO commissary_meat_map (commissary_meat_id, restaurant_id, meat_id) VALUES (?, ?, ?)`
  ).run(commissary_meat_id, restaurant_id, meat_id);
}

// Mirrors DELETE /api/settings/commissary-mappings/:id
function deleteMapping(db, id) {
  return db.prepare(`DELETE FROM commissary_meat_map WHERE id = ?`).run(id);
}

test('list is empty before any mapping exists for a restaurant', () => {
  assert.deepStrictEqual(listMappings(db, 1), []);
});

test('create a mapping row (commissary meat x restaurant meat)', () => {
  const result = createMapping(db, { restaurant_id: 1, commissary_meat_id: 1, meat_id: 1 });
  assert.strictEqual(typeof result.lastInsertRowid, 'number');
});

test('list returns the mapping joined with readable code/name fields', () => {
  const rows = listMappings(db, 1);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].commissary_meat_code, 'M01');
  assert.strictEqual(rows[0].commissary_meat_name, 'Whole Chicken');
  assert.strictEqual(rows[0].meat_code, 'M01');
  assert.strictEqual(rows[0].meat_name, 'Whole Chicken Raw');
});

test('a second, different restaurant\'s mapping does not leak into the first restaurant\'s list', () => {
  createMapping(db, { restaurant_id: 2, commissary_meat_id: 1, meat_id: 3 });
  assert.strictEqual(listMappings(db, 1).length, 1);
  assert.strictEqual(listMappings(db, 2).length, 1);
});

test('UNIQUE (commissary_meat_id, restaurant_id) rejects a duplicate mapping for the same restaurant', () => {
  assert.throws(() => {
    createMapping(db, { restaurant_id: 1, commissary_meat_id: 1, meat_id: 2 });
  }, /UNIQUE/);
});

test('the same commissary meat CAN map to a different restaurant (not blocked by the UNIQUE constraint)', () => {
  // Already proven by the earlier restaurant-2 insert above (commissary_meat_id=1
  // is mapped for both restaurant 1 and restaurant 2) - re-assert explicitly here.
  const rows = listMappings(db, 2);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].commissary_meat_id, 1);
});

test('a restaurant can map a second, different commissary meat without conflict', () => {
  createMapping(db, { restaurant_id: 1, commissary_meat_id: 2, meat_id: 2 });
  assert.strictEqual(listMappings(db, 1).length, 2);
});

test('delete removes the mapping row', () => {
  const rows = listMappings(db, 1);
  const idToDelete = rows.find(r => r.commissary_meat_id === 2).id;
  const result = deleteMapping(db, idToDelete);
  assert.strictEqual(result.changes, 1);
  assert.strictEqual(listMappings(db, 1).length, 1);
});

test('deleting an already-gone id reports zero changes (route treats this as 404)', () => {
  const result = deleteMapping(db, 99999);
  assert.strictEqual(result.changes, 0);
});

test('after delete, re-adding the same pairing succeeds (delete + re-add is the v1 "edit" path)', () => {
  // commissary_meat_id=2/restaurant_id=1 was deleted above - re-adding it
  // should work now that the UNIQUE slot is free again.
  const result = createMapping(db, { restaurant_id: 1, commissary_meat_id: 2, meat_id: 2 });
  assert.strictEqual(typeof result.lastInsertRowid, 'number');
  assert.strictEqual(listMappings(db, 1).length, 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
