// Tests for the Stock Receipts routes, focused on step 9 (Unallocated
// receipts). Same approach as history.test.js/settings.test.js: a real
// in-memory node:sqlite DB, real schema, plain assertions, no framework -
// small helpers here mirror stockReceipts.js's exact route logic (not a
// live Express server), so this suite runs standalone with no port/child
// process needed. The Unallocated workflow was ALSO verified against a
// real running server via live HTTP requests this session (see the
// changelog entry for step 9) - that's not re-run here since it needs a
// live process, but the logic under test is identical.

const { DatabaseSync } = require('node:sqlite');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { withTransaction, logActivity } = require('../db/activityLog.js');

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

console.log('Stock Receipts Route Tests (step 9: Unallocated receipts)\n');

const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(schema);

// ---- seed fixtures ----
db.prepare(`INSERT INTO restaurants (id, name, code) VALUES (1, 'Restaurant A', 'A')`).run();
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit) VALUES (1, 1, 'M01', 'Whole Chicken', 'kg')`).run();
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit) VALUES (2, 1, 'M02', 'Pork Belly', 'kg')`).run();
db.prepare(`INSERT INTO commissary_meats (id, code, name, unit, allowed_leeway_pct) VALUES (1, 'M01', 'Whole Chicken', 'kg', 0.2)`).run();
db.prepare(`INSERT INTO commissary_meats (id, code, name, unit, allowed_leeway_pct) VALUES (2, 'M02', 'Belly Slab', 'kg', 0.15)`).run();
db.prepare(`INSERT INTO commissary_meat_map (commissary_meat_id, restaurant_id, meat_id) VALUES (1, 1, 1)`).run();
db.prepare(`INSERT INTO commissary_meat_map (commissary_meat_id, restaurant_id, meat_id) VALUES (2, 1, 2)`).run();

function getReceiptRow(id) {
  return db.prepare('SELECT * FROM stock_receipts WHERE id = ?').get(id);
}

// Mirrors POST /api/stock-receipts
function createReceipt({ restaurant_id, meat_id, business_date, quantity, source, notes, actor, commissary_meat_id }) {
  if (!business_date || quantity === undefined || quantity === null || quantity === '' || !source) {
    return { status: 400, error: 'business_date, quantity, and source are required' };
  }
  if (!['DIRECT', 'COMMISSARY'].includes(source)) {
    return { status: 400, error: 'source must be DIRECT or COMMISSARY' };
  }

  const hasRestaurant = restaurant_id !== undefined && restaurant_id !== null && restaurant_id !== '';
  const hasMeat = meat_id !== undefined && meat_id !== null && meat_id !== '';

  if (hasRestaurant !== hasMeat) {
    return { status: 400, error: 'restaurant_id and meat_id must be provided together' };
  }
  if (!hasRestaurant && source !== 'COMMISSARY') {
    return { status: 400, error: 'restaurant_id and meat_id are required for a DIRECT receipt' };
  }

  let commissaryMeatId = null;
  if (hasRestaurant) {
    if (source === 'COMMISSARY') {
      const mapping = db.prepare(
        `SELECT commissary_meat_id FROM commissary_meat_map WHERE restaurant_id = ? AND meat_id = ?`
      ).get(restaurant_id, meat_id);
      if (!mapping) return { status: 400, error: 'not mapped' };
      commissaryMeatId = mapping.commissary_meat_id;
    }
  } else {
    if (!commissary_meat_id) return { status: 400, error: 'commissary_meat_id is required for an Unallocated receipt' };
    const cm = db.prepare(`SELECT id FROM commissary_meats WHERE id = ? AND active = 1`).get(commissary_meat_id);
    if (!cm) return { status: 400, error: 'Unknown or inactive commissary_meat_id' };
    commissaryMeatId = commissary_meat_id;
  }

  const id = withTransaction(db, () => {
    const result = db.prepare(`
      INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source, commissary_meat_id, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(hasRestaurant ? restaurant_id : null, hasRestaurant ? meat_id : null, business_date, Number(quantity), source, commissaryMeatId, notes || null, actor || null);
    const after = getReceiptRow(result.lastInsertRowid);
    logActivity(db, { actor: actor || null, entityType: 'stock_receipts', entityId: result.lastInsertRowid, action: 'CREATE', before: null, after, source: 'MANUAL' });
    return result.lastInsertRowid;
  });

  return { status: 200, id };
}

// Mirrors PATCH /api/stock-receipts/:id
function patchReceipt(id, { quantity, business_date, source, notes, actor, restaurant_id, meat_id }) {
  const existing = getReceiptRow(id);
  if (!existing || existing.deleted_at) return { status: 404, error: 'Receipt not found' };

  const isUnallocated = existing.restaurant_id === null && existing.meat_id === null;
  const wantsAssignment = restaurant_id !== undefined || meat_id !== undefined;

  if (wantsAssignment && !isUnallocated) {
    return { status: 400, error: 'already assigned' };
  }

  let nextRestaurantId = existing.restaurant_id;
  let nextMeatId = existing.meat_id;
  let commissaryMeatId = existing.commissary_meat_id;

  if (wantsAssignment) {
    if (!restaurant_id || !meat_id) return { status: 400, error: 'restaurant_id and meat_id must be provided together' };
    const mapping = db.prepare(
      `SELECT commissary_meat_id FROM commissary_meat_map WHERE restaurant_id = ? AND meat_id = ?`
    ).get(restaurant_id, meat_id);
    if (!mapping) return { status: 400, error: 'not mapped' };
    if (mapping.commissary_meat_id !== existing.commissary_meat_id) {
      return { status: 400, error: 'different commissary meat pool' };
    }
    nextRestaurantId = restaurant_id;
    nextMeatId = meat_id;
  }

  const nextSource = source !== undefined ? source : existing.source;
  if (!['DIRECT', 'COMMISSARY'].includes(nextSource)) return { status: 400, error: 'bad source' };

  const stillUnallocated = nextRestaurantId === null && nextMeatId === null;
  if (stillUnallocated && nextSource !== 'COMMISSARY') {
    return { status: 400, error: 'must stay COMMISSARY while unallocated' };
  }

  if (!wantsAssignment && nextRestaurantId !== null && nextMeatId !== null) {
    if (nextSource === 'COMMISSARY') {
      const mapping = db.prepare(
        `SELECT commissary_meat_id FROM commissary_meat_map WHERE restaurant_id = ? AND meat_id = ?`
      ).get(nextRestaurantId, nextMeatId);
      if (!mapping) return { status: 400, error: 'not mapped' };
      commissaryMeatId = mapping.commissary_meat_id;
    } else {
      commissaryMeatId = null;
    }
  }

  const nextQuantity = quantity !== undefined && quantity !== null && quantity !== '' ? Number(quantity) : existing.quantity;
  const nextDate = business_date || existing.business_date;
  const nextNotes = notes !== undefined ? (notes || null) : existing.notes;

  withTransaction(db, () => {
    db.prepare(`
      UPDATE stock_receipts SET restaurant_id = ?, meat_id = ?, quantity = ?, business_date = ?, source = ?, commissary_meat_id = ?, notes = ?
      WHERE id = ?
    `).run(nextRestaurantId, nextMeatId, nextQuantity, nextDate, nextSource, commissaryMeatId, nextNotes, id);
    const after = getReceiptRow(id);
    logActivity(db, { actor: actor || null, entityType: 'stock_receipts', entityId: id, action: 'UPDATE', before: existing, after, source: 'MANUAL' });
  });

  return { status: 200, id };
}

// Mirrors GET /api/stock-receipts (list, LEFT JOIN)
function listReceipts({ unallocated } = {}) {
  const clauses = ['sr.deleted_at IS NULL'];
  if (unallocated) clauses.push('sr.restaurant_id IS NULL');
  return db.prepare(`
    SELECT sr.id, sr.restaurant_id, sr.meat_id, sr.commissary_meat_id, sr.quantity
    FROM stock_receipts sr
    LEFT JOIN restaurants r ON r.id = sr.restaurant_id
    LEFT JOIN meats m ON m.id = sr.meat_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY sr.id
  `).all();
}

// ---- tests ----

test('DIRECT receipt still requires restaurant_id and meat_id', () => {
  const r = createReceipt({ business_date: '2026-08-28', quantity: 3, source: 'DIRECT' });
  assert.strictEqual(r.status, 400);
});

test('COMMISSARY receipt with no restaurant AND no commissary_meat_id is rejected', () => {
  const r = createReceipt({ business_date: '2026-08-28', quantity: 5, source: 'COMMISSARY' });
  assert.strictEqual(r.status, 400);
});

test('COMMISSARY receipt with an unknown commissary_meat_id is rejected', () => {
  const r = createReceipt({ business_date: '2026-08-28', quantity: 5, source: 'COMMISSARY', commissary_meat_id: 999 });
  assert.strictEqual(r.status, 400);
});

let unallocatedId;
test('Unallocated COMMISSARY receipt can be created', () => {
  const r = createReceipt({ business_date: '2026-08-28', quantity: 5, source: 'COMMISSARY', commissary_meat_id: 2, actor: 'tester' });
  assert.strictEqual(r.status, 200);
  unallocatedId = r.id;
  const row = getReceiptRow(unallocatedId);
  assert.strictEqual(row.restaurant_id, null);
  assert.strictEqual(row.meat_id, null);
  assert.strictEqual(row.commissary_meat_id, 2);
});

test('Unallocated row appears via unallocated=true filter', () => {
  const rows = listReceipts({ unallocated: true });
  assert.ok(rows.find(r => r.id === unallocatedId));
});

test('Unallocated row also appears in the unfiltered list (LEFT JOIN, not swallowed)', () => {
  const rows = listReceipts();
  assert.ok(rows.find(r => r.id === unallocatedId));
});

let directId;
test('Normal DIRECT receipt creation is unaffected', () => {
  const r = createReceipt({ restaurant_id: 1, meat_id: 1, business_date: '2026-08-28', quantity: 10, source: 'DIRECT', actor: 'tester' });
  assert.strictEqual(r.status, 200);
  directId = r.id;
});

test('Assigning to a meat mapped to a DIFFERENT commissary meat is rejected (continuity check)', () => {
  // meat_id=1 maps to commissary_meat_id=1, but unallocatedId was drawn from commissary_meat_id=2
  const r = patchReceipt(unallocatedId, { restaurant_id: 1, meat_id: 1, actor: 'tester' });
  assert.strictEqual(r.status, 400);
});

test('Assigning to a meat mapped to the SAME commissary meat succeeds', () => {
  const r = patchReceipt(unallocatedId, { restaurant_id: 1, meat_id: 2, actor: 'tester' });
  assert.strictEqual(r.status, 200);
  const row = getReceiptRow(unallocatedId);
  assert.strictEqual(row.restaurant_id, 1);
  assert.strictEqual(row.meat_id, 2);
  assert.strictEqual(row.commissary_meat_id, 2, 'commissary_meat_id must be unchanged by assignment');
});

test('Assigned row is now excluded from the unallocated=true filter', () => {
  const rows = listReceipts({ unallocated: true });
  assert.ok(!rows.find(r => r.id === unallocatedId));
});

test('Re-assigning an already-assigned row is rejected', () => {
  const r = patchReceipt(unallocatedId, { restaurant_id: 1, meat_id: 1, actor: 'tester' });
  assert.strictEqual(r.status, 400);
});

test('An already-assigned (never-unallocated) receipt still cannot have restaurant_id/meat_id changed', () => {
  const r = patchReceipt(directId, { restaurant_id: 1, meat_id: 2, actor: 'tester' });
  assert.strictEqual(r.status, 400);
});

test('Ordinary field edit (quantity) on a now-assigned row still works', () => {
  const r = patchReceipt(unallocatedId, { quantity: 6, actor: 'tester' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(getReceiptRow(unallocatedId).quantity, 6);
});

test('activity_log recorded a CREATE for the Unallocated row and an UPDATE for its assignment', () => {
  const entries = db.prepare(
    `SELECT action FROM activity_log WHERE entity_type = 'stock_receipts' AND entity_id = ? ORDER BY id`
  ).all(unallocatedId);
  assert.deepStrictEqual(entries.map(e => e.action), ['CREATE', 'UPDATE', 'UPDATE']);
});

test('DIRECT source cannot be combined with leaving restaurant/meat unset', () => {
  const r = createReceipt({ business_date: '2026-08-28', quantity: 2, source: 'DIRECT', commissary_meat_id: 1 });
  assert.strictEqual(r.status, 400);
});

test('CHECK constraint at the DB layer independently rejects NULL+NULL+DIRECT even bypassing app validation', () => {
  assert.throws(() => {
    db.prepare(`INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source) VALUES (NULL, NULL, '2026-08-28', 1, 'DIRECT')`).run();
  });
});

test('CHECK constraint rejects one-sided NULL (restaurant set, meat NULL)', () => {
  assert.throws(() => {
    db.prepare(`INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source) VALUES (1, NULL, '2026-08-28', 1, 'DIRECT')`).run();
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
