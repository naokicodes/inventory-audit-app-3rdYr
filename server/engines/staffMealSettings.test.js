// Step staff-meal-settings: meal slots, budgets and rice rates. In-memory DB
// from schema.sql.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const s = require('./staffMealSettings.js');
const { businessDate } = require('../businessDay.js');

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

console.log('Staff Meal Settings Engine Tests\n');

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  db.prepare("INSERT INTO restaurants (name, code) VALUES ('Restaurant A', 'RA'), ('Restaurant B', 'FC')").run();
  db.prepare("INSERT INTO commissaries (name, code) VALUES ('Commissary A', 'COM-A')").run();
  db.prepare("INSERT INTO roles (name, can_admin) VALUES ('admin', 1)").run();
  db.prepare("INSERT INTO users (name, default_role_id) VALUES ('Test Admin', 1)").run();
  return db;
}
const actor = { id: 1, name: 'Test Admin' };
const status = fn => { try { fn(); } catch (err) { return err.status; } return 200; };
const logs = (db, type) => db.prepare('SELECT * FROM activity_log WHERE entity_type = ?').all(type);

test('a slot name is unique per site, not across sites', () => {
  const db = freshDb();
  s.createSlot(db, { site_code: 'RA', name: 'Evening' }, actor);
  assert.strictEqual(status(() => s.createSlot(db, { site_code: 'RA', name: ' Evening ' }, actor)), 400);
  s.createSlot(db, { site_code: 'FC', name: 'Evening' }, actor);
  const other = s.createSlot(db, { site_code: 'RA', name: 'Afternoon' }, actor);
  assert.strictEqual(status(() => s.updateSlot(db, other.id, { name: 'Evening' }, actor)), 400);
});

test('a commissary site and an unknown site are refused', () => {
  const db = freshDb();
  assert.strictEqual(status(() => s.createSlot(db, { site_code: 'COM-A', name: 'Lunch' }, actor)), 400);
  assert.strictEqual(status(() => s.createSlot(db, { site_code: 'ZZ', name: 'Lunch' }, actor)), 400);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM staff_meal_slots').get().n, 0);
});

test('a negative amount is refused; blank means none', () => {
  const db = freshDb();
  assert.strictEqual(status(() => s.createSlot(db, { site_code: 'RA', name: 'A', fixed_budget: -1 }, actor)), 400);
  assert.strictEqual(status(() => s.createSlot(db, { site_code: 'RA', name: 'A', per_head_rate: '-5' }, actor)), 400);
  const slot = s.createSlot(db, { site_code: 'RA', name: 'A', fixed_budget: '', per_head_rate: '50' }, actor);
  assert.strictEqual(slot.fixed_budget, null);
  assert.strictEqual(slot.per_head_rate, 50);
  assert.strictEqual(status(() => s.updateSlot(db, slot.id, { fixed_budget: -0.5 }, actor)), 400);
});

test('create and update each write one MANUAL activity_log row; no change writes none', () => {
  const db = freshDb();
  const slot = s.createSlot(db, { site_code: 'RA', name: 'Evening', fixed_budget: 500 }, actor);
  assert.strictEqual(s.updateSlot(db, slot.id, { fixed_budget: 500 }, actor).changed, false);
  const { slot: after } = s.updateSlot(db, slot.id, { active: false }, actor);
  assert.strictEqual(after.active, 0);
  const rows = logs(db, 'staff_meal_slots');
  assert.deepStrictEqual(rows.map(r => [r.action, r.source, r.actor]), [['CREATE', 'MANUAL', 'Test Admin'], ['UPDATE', 'MANUAL', 'Test Admin']]);
});

test('listSlots: in order, activeOnly hides an inactive slot', () => {
  const db = freshDb();
  const a = s.createSlot(db, { site_code: 'RA', name: 'Afternoon' }, actor);
  s.createSlot(db, { site_code: 'RA', name: 'Evening' }, actor);
  s.updateSlot(db, a.id, { active: 0 }, actor);
  assert.deepStrictEqual(s.listSlots(db, 'RA').map(x => x.name), ['Afternoon', 'Evening']);
  assert.deepStrictEqual(s.listSlots(db, 'RA', { activeOnly: true }).map(x => x.name), ['Evening']);
});

test('budgetFor: fixed only, rate only, both, neither', () => {
  assert.deepStrictEqual(s.budgetFor({ fixed_budget: 500, per_head_rate: null }, 10), { budget: 500, maximum: null });
  assert.deepStrictEqual(s.budgetFor({ fixed_budget: null, per_head_rate: 60 }, 10), { budget: 600, maximum: 600 });
  assert.deepStrictEqual(s.budgetFor({ fixed_budget: 500, per_head_rate: 60 }, 10), { budget: 500, maximum: 600 });
  assert.deepStrictEqual(s.budgetFor({ fixed_budget: null, per_head_rate: null }, 10), { budget: null, maximum: null });
});

test('riceRateOn: the latest rate not after the date (newest row on a tie), null before the first', () => {
  const db = freshDb();
  const ins = db.prepare('INSERT INTO staff_rice_rates (effective_from, cups_per_head, grams_per_cup, price_per_kg) VALUES (?, ?, ?, ?)');
  ins.run('2026-11-01', 1, 180, 50);
  ins.run('2026-11-10', 1.5, 180, 55);
  ins.run('2026-11-10', 2, 180, 56);
  assert.strictEqual(s.riceRateOn(db, '2026-10-31'), null);
  assert.strictEqual(s.riceRateOn(db, '2026-11-01').price_per_kg, 50);
  assert.strictEqual(s.riceRateOn(db, '2026-11-09').price_per_kg, 50);
  assert.strictEqual(s.riceRateOn(db, '2026-11-10').price_per_kg, 56);
  assert.strictEqual(s.riceRateOn(db, '2026-12-25').price_per_kg, 56);
});

test('addRiceRate: defaults to today, refuses a past day and any value not above 0, logs it', () => {
  const db = freshDb();
  const today = businessDate(new Date());
  const rate = s.addRiceRate(db, { cups_per_head: 1, grams_per_cup: 180, price_per_kg: 52 }, actor);
  assert.strictEqual(rate.effective_from, today);
  assert.strictEqual(rate.created_by_user_id, 1);
  assert.strictEqual(status(() => s.addRiceRate(db, { effective_from: '2000-01-01', cups_per_head: 1, grams_per_cup: 180, price_per_kg: 52 }, actor)), 400);
  assert.strictEqual(status(() => s.addRiceRate(db, { cups_per_head: 0, grams_per_cup: 180, price_per_kg: 52 }, actor)), 400);
  assert.strictEqual(status(() => s.addRiceRate(db, { cups_per_head: 1, grams_per_cup: '', price_per_kg: 52 }, actor)), 400);
  assert.strictEqual(status(() => s.addRiceRate(db, { effective_from: 'soon', cups_per_head: 1, grams_per_cup: 180, price_per_kg: 52 }, actor)), 400);
  s.addRiceRate(db, { effective_from: '2999-01-01', cups_per_head: 2, grams_per_cup: 180, price_per_kg: 60 }, actor);
  assert.strictEqual(s.riceRateOn(db, today).price_per_kg, 52);
  assert.strictEqual(logs(db, 'staff_rice_rates').length, 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
