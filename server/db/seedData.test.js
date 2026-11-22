// Step fc-landing-lines: the starting data a fresh install gets - FC's 27
// paper landing lines in the paper's order, no FC dishes or recipes, two meal
// slots for FC, and Silingan's Kare-Kare placeholder meat and dish.
//
// Runs seed.js against a scratch file in the OS temp directory, never the
// live inventory.db.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

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

console.log('Seed Data Tests\n');

const ROOT = path.join(__dirname, '..', '..');
const SEED = path.join(__dirname, 'seed.js');
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-data-test-'));
const scratchDb = path.join(scratchDir, 'dev.db');

function runSeed() {
  const env = { ...process.env, DB_PATH: scratchDb };
  return spawnSync(process.execPath, [SEED], { cwd: ROOT, env, encoding: 'utf8' });
}

function withDb(fn) {
  const db = new DatabaseSync(scratchDb);
  try { return fn(db); } finally { db.close(); }
}

const rid = (db, code) => db.prepare('SELECT id FROM restaurants WHERE code = ?').get(code).id;

const FC_LINES = [
  'Pork Jowl', 'Paella', 'Baglaw Tuna', 'Tuna Tinola', 'Tuna Steak', 'Skewers', 'Pork Chops',
  'Beef Tapa', 'Garlic Beef', 'Bagnet', 'Laing', 'ASG', 'CPA', 'Sisig', 'Sinigang', 'Dinuguan',
  'Salpicao', 'Tinola', 'Pancit', 'Daing', 'Arrabiatta', 'Burger Patty', 'Chicken Brgr',
  'Burger Buns', 'Whole Chicken', 'Half', 'Quarter',
];

const first = runSeed();
test('a fresh seed runs cleanly', () => {
  assert.strictEqual(first.status, 0, first.stderr);
});

test("FC gets 27 active meats in the paper's order, M01 to M27", () => {
  const rows = withDb(db => db.prepare(
    'SELECT meat_code, name, unit, cost_per_unit, active FROM meats WHERE restaurant_id = ? ORDER BY meat_code'
  ).all(rid(db, 'FC')));
  assert.strictEqual(rows.length, 27);
  assert.deepStrictEqual(rows.map(r => r.name), FC_LINES);
  rows.forEach((r, i) => {
    assert.strictEqual(r.meat_code, 'M' + String(i + 1).padStart(2, '0'));
    assert.strictEqual(r.active, 1);
    assert.strictEqual(r.cost_per_unit, null);
  });
});

test('Pork Jowl is in kg, the other 26 FC lines in pieces', () => {
  const rows = withDb(db => db.prepare(
    'SELECT name, unit FROM meats WHERE restaurant_id = ? ORDER BY meat_code'
  ).all(rid(db, 'FC')));
  assert.strictEqual(rows[0].name, 'Pork Jowl');
  assert.strictEqual(rows[0].unit, 'kg');
  assert.ok(rows.slice(1).every(r => r.unit === 'unit'));
});

test('FC has no seeded dishes and no recipe lines', () => {
  withDb(db => {
    const fc = rid(db, 'FC');
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM dishes WHERE restaurant_id = ?').get(fc).n, 0);
    assert.strictEqual(db.prepare(
      'SELECT COUNT(*) AS n FROM recipe_bom rb JOIN dishes d ON d.id = rb.dish_id WHERE d.restaurant_id = ?'
    ).get(fc).n, 0);
  });
});

test('FC gets two meal slots, Meal 1 and Meal 2', () => {
  const names = withDb(db => db.prepare(
    "SELECT name FROM staff_meal_slots WHERE site_code = 'FC' ORDER BY sort_order"
  ).all().map(r => r.name));
  assert.deepStrictEqual(names, ['Meal 1', 'Meal 2']);
});

test('Restaurant A gains M12 "Kare-Kare meat" (kg) and D044 "Kare-Kare" with no recipe line', () => {
  withDb(db => {
    const ra = rid(db, 'RA');
    const meat = db.prepare('SELECT name, unit, cost_per_unit FROM meats WHERE restaurant_id = ? AND meat_code = ?').get(ra, 'M12');
    assert.deepStrictEqual({ ...meat }, { name: 'Kare-Kare meat', unit: 'kg', cost_per_unit: null });
    const dish = db.prepare('SELECT id, name, prep_type, cost_per_portion FROM dishes WHERE restaurant_id = ? AND dish_code = ?').get(ra, 'D044');
    assert.strictEqual(dish.name, 'Kare-Kare');
    assert.strictEqual(dish.prep_type, 'DIRECT');
    assert.strictEqual(dish.cost_per_portion, null);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM recipe_bom WHERE dish_id = ?').get(dish.id).n, 0);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM meats WHERE restaurant_id = ?').get(ra).n, 12);
  });
});

test('Restaurant A keeps its two meal slots', () => {
  const names = withDb(db => db.prepare(
    "SELECT name FROM staff_meal_slots WHERE site_code = 'RA' ORDER BY sort_order"
  ).all().map(r => r.name));
  assert.deepStrictEqual(names, ['Afternoon', 'Evening']);
});

test('seeding twice adds nothing', () => {
  const count = () => withDb(db => ['meats', 'dishes', 'recipe_bom', 'staff_meal_slots']
    .map(t => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n));
  const before = count();
  const again = runSeed();
  assert.strictEqual(again.status, 0, again.stderr);
  assert.deepStrictEqual(count(), before);
});

fs.rmSync(scratchDir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
