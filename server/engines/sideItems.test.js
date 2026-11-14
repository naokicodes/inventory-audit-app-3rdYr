// Step side-items: the side-item engine - quantities, unit conversion and the
// write helpers' log rows. In-memory DB from schema.sql.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const s = require('./sideItems.js');

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

console.log('Side Items Engine Tests\n');

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  db.prepare("INSERT INTO restaurants (name, code) VALUES ('Restaurant A', 'RA')").run();
  return db;
}
const logCount = db => db.prepare('SELECT COUNT(*) AS n FROM activity_log').get().n;

test('parseQuantity: whole, decimal, fraction and mixed numbers', () => {
  assert.strictEqual(s.parseQuantity('1 1/2'), 1.5);
  assert.strictEqual(s.parseQuantity('3/4'), 0.75);
  assert.strictEqual(s.parseQuantity('1/8'), 0.125);
  assert.strictEqual(s.parseQuantity('2.25'), 2.25);
  assert.strictEqual(s.parseQuantity(' 4 '), 4);
  assert.strictEqual(s.parseQuantity('0'), 0);
});

test('parseQuantity: negatives, words and x/0 are rejected', () => {
  for (const bad of ['-1', '-1/2', 'abc', '1 1/0', '', '1/2/3', '1,5']) {
    assert.strictEqual(s.parseQuantity(bad), null, bad);
  }
});

test('toMain: main unit as is, a conversion multiplies, an unknown unit is null', () => {
  const db = freshDb();
  const rice = s.createItem(db, { name: 'Rice', main_unit: 'KG ' });
  assert.strictEqual(rice.main_unit, 'kg', 'units stored lowercased and trimmed');
  s.setUnit(db, rice.id, ' Sack', 25);
  assert.strictEqual(s.toMain(db, rice.id, 2, 'kg'), 2);
  assert.strictEqual(s.toMain(db, rice.id, 1.5, 'sack'), 37.5);
  assert.strictEqual(s.toMain(db, rice.id, 1, 'tray'), null, 'never a guess');
});

test('"Onion" and "onion " are one item', () => {
  const db = freshDb();
  const onion = s.createItem(db, { name: 'Onion', main_unit: 'kg' });
  assert.strictEqual(s.findItemByName(db, 'onion ').id, onion.id);
  assert.throws(() => s.createItem(db, { name: ' ONION', main_unit: 'kg' }), /already an item/);
});

test('a peso item is priced 1 per peso', () => {
  const db = freshDb();
  const load = s.createItem(db, { name: 'Load', main_unit: 'Peso', cost_per_unit: 5 });
  assert.strictEqual(load.cost_per_unit, 1);
});

test('each write logs one MANUAL row; a no-op writes nothing', () => {
  const db = freshDb();
  const item = s.createItem(db, { name: 'Egg', main_unit: 'pc' }, { actor: 'Kim' });
  assert.strictEqual(logCount(db), 1);
  assert.strictEqual(s.updateItem(db, item.id, { how_bought: 'supplier' }).changed, true);
  assert.strictEqual(s.updateItem(db, item.id, { how_bought: 'SUPPLIER' }).changed, false);
  assert.strictEqual(s.setUnit(db, item.id, 'tray', 30), true);
  assert.strictEqual(s.setUnit(db, item.id, 'tray', 30), false);
  const sheet = db.prepare("INSERT INTO sheet_definitions (site_code, category, engine_type) VALUES ('RA', 'Bar', 'SIDE')").run().lastInsertRowid;
  assert.strictEqual(s.setLink(db, sheet, item.id, { sort_order: 0 }), true);
  assert.strictEqual(s.setLink(db, sheet, item.id, { sort_order: 0, active: 1 }), false);
  assert.strictEqual(logCount(db), 4);
  const row = db.prepare('SELECT actor, source, entity_type FROM activity_log ORDER BY id LIMIT 1').get();
  assert.deepStrictEqual({ ...row }, { actor: 'Kim', source: 'MANUAL', entity_type: 'side_items' });
});

test('bad input is refused with a 400 and writes nothing', () => {
  const db = freshDb();
  const item = s.createItem(db, { name: 'Egg', main_unit: 'pc' });
  const before = logCount(db);
  assert.throws(() => s.updateItem(db, item.id, { how_bought: 'friend' }), e => e.status === 400);
  assert.throws(() => s.updateItem(db, item.id, { cost_per_unit: -1 }), e => e.status === 400);
  assert.throws(() => s.setUnit(db, item.id, 'tray', 0), e => e.status === 400);
  assert.throws(() => s.setUnit(db, item.id, 'pc', 2), e => e.status === 400);
  const meat = db.prepare("INSERT INTO sheet_definitions (site_code, category, engine_type) VALUES ('RA', 'Landing', 'MEAT')").run().lastInsertRowid;
  assert.throws(() => s.setLink(db, meat, item.id, {}), /not a side sheet/);
  assert.strictEqual(logCount(db), before);
});

test('siteSideSheets leaves the cost out unless asked', () => {
  const db = freshDb();
  const item = s.createItem(db, { name: 'Egg', main_unit: 'pc', cost_per_unit: 8 });
  const sheet = db.prepare("INSERT INTO sheet_definitions (site_code, category, engine_type) VALUES ('RA', 'Bar', 'SIDE')").run().lastInsertRowid;
  s.setLink(db, sheet, item.id, {});
  assert.ok(!('cost_per_unit' in s.siteSideSheets(db, 'RA')[0].items[0]));
  assert.strictEqual(s.siteSideSheets(db, 'RA', { withCost: true })[0].items[0].cost_per_unit, 8);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
