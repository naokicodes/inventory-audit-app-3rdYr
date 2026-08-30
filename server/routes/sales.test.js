// Tests for step 16's Sales backend (GET month matrix, PATCH single
// cell). Same approach as commands.test.js/stockReceipts.test.js: a
// real in-memory node:sqlite DB, real schema (including the partial
// unique index this route relies on), plain assertions. Full flow was
// ALSO smoke-tested against a real running server this session (see the
// changelog entry) - not re-run here since it needs a live process, but
// the logic under test is identical.

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

console.log('Sales Route Tests (step 16)\n');

function freshDb() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(schema);
  db.prepare(`INSERT INTO restaurants (id, name, code) VALUES (1, 'Restaurant A', 'A')`).run();
  db.prepare(`INSERT INTO restaurants (id, name, code) VALUES (2, 'Restaurant B', 'B')`).run();
  db.prepare(`INSERT INTO dishes (id, restaurant_id, dish_code, name, prep_type) VALUES (1, 1, 'D01', 'Direct Dish', 'DIRECT')`).run();
  db.prepare(`INSERT INTO dishes (id, restaurant_id, dish_code, name, prep_type) VALUES (2, 1, 'D02', 'Batch Dish', 'BATCH_PREPPED')`).run();
  db.prepare(`INSERT INTO dishes (id, restaurant_id, dish_code, name, prep_type, active) VALUES (3, 1, 'D03', 'Inactive Dish', 'DIRECT', 0)`).run();
  return db;
}

// --- Mirrors PATCH /api/sales's core upsert-or-clear logic ---
function patchSales(db, { restaurant_id, dish_id, business_date, quantity }) {
  if (!restaurant_id || !dish_id || !business_date) {
    return { status: 400, body: { error: 'restaurant_id, dish_id, and business_date are required' } };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(business_date)) {
    return { status: 400, body: { error: 'business_date must be YYYY-MM-DD' } };
  }

  const dish = db.prepare(`SELECT id FROM dishes WHERE id = ? AND restaurant_id = ? AND active = 1`).get(dish_id, restaurant_id);
  if (!dish) return { status: 400, body: { error: 'Unknown dish_id for this restaurant, or dish is inactive' } };

  const isClearing = quantity === null || quantity === undefined || quantity === '';
  if (!isClearing && Number(quantity) < 0) return { status: 400, body: { error: 'quantity cannot be negative' } };

  db.prepare(`DELETE FROM sales WHERE restaurant_id = ? AND dish_id = ? AND business_date = ? AND source = 'MANUAL'`)
    .run(restaurant_id, dish_id, business_date);

  if (isClearing) return { status: 200, body: { ok: true, cleared: true } };

  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity, source) VALUES (?, ?, ?, ?, 'MANUAL')`)
    .run(restaurant_id, dish_id, business_date, Number(quantity));
  return { status: 200, body: { ok: true, cleared: false, quantity: Number(quantity) } };
}

// --- Mirrors GET /api/sales's matrix-building logic ---
function getSalesMatrix(db, restaurantId, year, month) {
  const numDays = new Date(year, month, 0).getDate();
  const pad2 = n => String(n).padStart(2, '0');
  const monthPrefix = `${year}-${pad2(month)}`;
  const firstDay = `${monthPrefix}-01`;
  const lastDay = `${monthPrefix}-${pad2(numDays)}`;

  const dishes = db.prepare(`SELECT id, dish_code, name, prep_type FROM dishes WHERE restaurant_id = ? AND active = 1 ORDER BY dish_code`).all(restaurantId);
  const salesRows = db.prepare(`SELECT dish_id, business_date, quantity, source FROM sales WHERE restaurant_id = ? AND business_date >= ? AND business_date <= ?`).all(restaurantId, firstDay, lastDay);

  const byDish = new Map();
  for (const row of salesRows) {
    if (!byDish.has(row.dish_id)) byDish.set(row.dish_id, new Map());
    const byDate = byDish.get(row.dish_id);
    const existing = byDate.get(row.business_date);
    if (existing) { existing.quantity += row.quantity; existing.sources.add(row.source); }
    else byDate.set(row.business_date, { quantity: row.quantity, sources: new Set([row.source]) });
  }

  return dishes.map(dish => {
    const byDate = byDish.get(dish.id);
    const days = {};
    for (let d = 1; d <= numDays; d++) {
      const dateStr = `${monthPrefix}-${pad2(d)}`;
      const cell = byDate ? byDate.get(dateStr) : undefined;
      days[dateStr] = cell ? { quantity: cell.quantity, source: cell.sources.size > 1 ? 'MIXED' : [...cell.sources][0] } : null;
    }
    return { dish_id: dish.id, dish_code: dish.dish_code, name: dish.name, prep_type: dish.prep_type, days };
  });
}

test('PATCH creates a MANUAL row for a fresh cell', () => {
  const db = freshDb();
  const result = patchSales(db, { restaurant_id: 1, dish_id: 1, business_date: '2026-08-05', quantity: 10 });
  assert.strictEqual(result.status, 200);
  const row = db.prepare(`SELECT * FROM sales WHERE dish_id = 1 AND business_date = '2026-08-05'`).get();
  assert.strictEqual(row.quantity, 10);
  assert.strictEqual(row.source, 'MANUAL');
});

test('PATCH on an already-filled cell replaces it, not adds a second row (upsert, not append)', () => {
  const db = freshDb();
  patchSales(db, { restaurant_id: 1, dish_id: 1, business_date: '2026-08-05', quantity: 10 });
  patchSales(db, { restaurant_id: 1, dish_id: 1, business_date: '2026-08-05', quantity: 25 });
  const rows = db.prepare(`SELECT * FROM sales WHERE dish_id = 1 AND business_date = '2026-08-05'`).all();
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].quantity, 25);
});

test('PATCH with quantity null clears an existing cell', () => {
  const db = freshDb();
  patchSales(db, { restaurant_id: 1, dish_id: 1, business_date: '2026-08-05', quantity: 10 });
  const result = patchSales(db, { restaurant_id: 1, dish_id: 1, business_date: '2026-08-05', quantity: null });
  assert.strictEqual(result.body.cleared, true);
  const row = db.prepare(`SELECT * FROM sales WHERE dish_id = 1 AND business_date = '2026-08-05'`).get();
  assert.strictEqual(row, undefined);
});

test('PATCH rejects a negative quantity', () => {
  const db = freshDb();
  const result = patchSales(db, { restaurant_id: 1, dish_id: 1, business_date: '2026-08-05', quantity: -5 });
  assert.strictEqual(result.status, 400);
});

test('PATCH rejects a dish_id that does not belong to the given restaurant', () => {
  const db = freshDb();
  const result = patchSales(db, { restaurant_id: 2, dish_id: 1, business_date: '2026-08-05', quantity: 10 });
  assert.strictEqual(result.status, 400);
});

test('PATCH rejects an inactive dish', () => {
  const db = freshDb();
  const result = patchSales(db, { restaurant_id: 1, dish_id: 3, business_date: '2026-08-05', quantity: 10 });
  assert.strictEqual(result.status, 400);
});

test('the partial unique index rejects a second MANUAL row for the same cell inserted directly (defense in depth beyond the route logic)', () => {
  const db = freshDb();
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity, source) VALUES (1, 1, '2026-08-05', 10, 'MANUAL')`).run();
  assert.throws(() => {
    db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity, source) VALUES (1, 1, '2026-08-05', 5, 'MANUAL')`).run();
  });
});

test('the partial unique index allows multiple LOYVERSE rows for the same cell (future sync scenario)', () => {
  const db = freshDb();
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity, source) VALUES (1, 1, '2026-08-05', 10, 'LOYVERSE')`).run();
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity, source) VALUES (1, 1, '2026-08-05', 5, 'LOYVERSE')`).run();
  const rows = db.prepare(`SELECT * FROM sales WHERE dish_id = 1 AND business_date = '2026-08-05'`).all();
  assert.strictEqual(rows.length, 2);
});

test('PATCH with a missing required field is rejected', () => {
  const db = freshDb();
  const result = patchSales(db, { dish_id: 1, business_date: '2026-08-05', quantity: 10 });
  assert.strictEqual(result.status, 400);
});

test('PATCH with a malformed business_date is rejected', () => {
  const db = freshDb();
  const result = patchSales(db, { restaurant_id: 1, dish_id: 1, business_date: '08/05/2026', quantity: 10 });
  assert.strictEqual(result.status, 400);
});

test('GET matrix returns every active dish, every day of the month, empty cells as null', () => {
  const db = freshDb();
  const matrix = getSalesMatrix(db, 1, 2026, 8);
  assert.strictEqual(matrix.length, 2); // dish 3 is inactive, excluded
  assert.strictEqual(Object.keys(matrix[0].days).length, 31);
  assert.strictEqual(matrix[0].days['2026-08-01'], null);
});

test('GET matrix reflects a MANUAL cell correctly', () => {
  const db = freshDb();
  patchSales(db, { restaurant_id: 1, dish_id: 1, business_date: '2026-08-15', quantity: 42 });
  const matrix = getSalesMatrix(db, 1, 2026, 8);
  const dishRow = matrix.find(r => r.dish_id === 1);
  assert.deepStrictEqual(dishRow.days['2026-08-15'], { quantity: 42, source: 'MANUAL' });
});

test('GET matrix sums multiple LOYVERSE rows for the same day into one cell', () => {
  const db = freshDb();
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity, source) VALUES (1, 1, '2026-08-15', 10, 'LOYVERSE')`).run();
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity, source) VALUES (1, 1, '2026-08-15', 5, 'LOYVERSE')`).run();
  const matrix = getSalesMatrix(db, 1, 2026, 8);
  const dishRow = matrix.find(r => r.dish_id === 1);
  assert.deepStrictEqual(dishRow.days['2026-08-15'], { quantity: 15, source: 'LOYVERSE' });
});

test('GET matrix does not leak sales from a different restaurant', () => {
  const db = freshDb();
  db.prepare(`INSERT INTO dishes (id, restaurant_id, dish_code, name, prep_type) VALUES (4, 2, 'D01', 'Restaurant B Dish', 'DIRECT')`).run();
  patchSales(db, { restaurant_id: 2, dish_id: 4, business_date: '2026-08-15', quantity: 99 });
  const matrixA = getSalesMatrix(db, 1, 2026, 8);
  const allCellsEmpty = matrixA.every(row => Object.values(row.days).every(v => v === null));
  assert.ok(allCellsEmpty, 'restaurant A matrix should show no sales from restaurant B');
});

test('GET matrix does not leak sales from outside the requested month', () => {
  const db = freshDb();
  patchSales(db, { restaurant_id: 1, dish_id: 1, business_date: '2026-07-31', quantity: 7 });
  patchSales(db, { restaurant_id: 1, dish_id: 1, business_date: '2026-09-01', quantity: 8 });
  const matrix = getSalesMatrix(db, 1, 2026, 8);
  const dishRow = matrix.find(r => r.dish_id === 1);
  const allEmpty = Object.values(dishRow.days).every(v => v === null);
  assert.ok(allEmpty, 'August matrix should not include July 31 or September 1 sales');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
