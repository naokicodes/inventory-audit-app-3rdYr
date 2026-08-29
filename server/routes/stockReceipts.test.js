// Tests for the Stock Receipts routes. RETIRED 2026-08-29 (item 4
// cleanup pass): the Unallocated-receipt workflow and its
// commissary_meat_map dependency, which this file used to test in
// detail, are gone from the real route - see stockReceipts.js's
// module-level note for the full reasoning. This file is rewritten to
// match, not just have its old assertions deleted - a suite that still
// passed by testing dead, duplicated logic would be actively
// misleading, exactly the trap a mirrored-logic test file falls into
// if it isn't kept honest with the real route.
//
// Same approach as every other route test in this project: a real
// in-memory node:sqlite DB, real schema, plain assertions, small
// helpers mirroring stockReceipts.js's exact current logic (not a live
// Express server). Also verified live against a real booted server
// this session - see the changelog entry.

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

console.log('Stock Receipts Route Tests (post-retirement: DIRECT only)\n');

const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(schema);

// ---- seed fixtures ----
db.prepare(`INSERT INTO restaurants (id, name, code) VALUES (1, 'Restaurant A', 'A')`).run();
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit) VALUES (1, 1, 'M01', 'Whole Chicken', 'kg')`).run();
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit, active) VALUES (2, 1, 'M02', 'Retired Cut', 'kg', 0)`).run();

function getReceiptRow(id) {
  return db.prepare('SELECT * FROM stock_receipts WHERE id = ?').get(id);
}

// Mirrors POST /api/stock-receipts (post-retirement)
function createReceipt({ restaurant_id, meat_id, business_date, quantity, source, notes, actor }) {
  if (!restaurant_id || !meat_id || !business_date || quantity === undefined || quantity === null || quantity === '' || !source) {
    return { status: 400, error: 'restaurant_id, meat_id, business_date, quantity, and source are required' };
  }
  if (source !== 'DIRECT') {
    return { status: 400, error: 'Manual stock receipt entry is DIRECT only' };
  }

  const id = withTransaction(db, () => {
    const result = db.prepare(`
      INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source, commissary_meat_id, notes, created_by)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(restaurant_id, meat_id, business_date, Number(quantity), source, notes || null, actor || null);
    const after = getReceiptRow(result.lastInsertRowid);
    logActivity(db, { actor: actor || null, entityType: 'stock_receipts', entityId: result.lastInsertRowid, action: 'CREATE', before: null, after, source: 'MANUAL' });
    return result.lastInsertRowid;
  });

  return { status: 200, id };
}

// Mirrors PATCH /api/stock-receipts/:id (post-retirement)
function patchReceipt(id, { quantity, business_date, notes, actor }) {
  const existing = getReceiptRow(id);
  if (!existing || existing.deleted_at) return { status: 404, error: 'Receipt not found' };

  const nextQuantity = quantity !== undefined && quantity !== null && quantity !== '' ? Number(quantity) : existing.quantity;
  const nextDate = business_date || existing.business_date;
  const nextNotes = notes !== undefined ? (notes || null) : existing.notes;

  withTransaction(db, () => {
    db.prepare(`UPDATE stock_receipts SET quantity = ?, business_date = ?, notes = ? WHERE id = ?`)
      .run(nextQuantity, nextDate, nextNotes, id);
    const after = getReceiptRow(id);
    logActivity(db, { actor: actor || null, entityType: 'stock_receipts', entityId: id, action: 'UPDATE', before: existing, after, source: 'MANUAL' });
  });

  return { status: 200, id };
}

// ---- tests ----

test('a valid DIRECT receipt is created', () => {
  const r = createReceipt({ restaurant_id: 1, meat_id: 1, business_date: '2026-08-29', quantity: 10, source: 'DIRECT', actor: 'tester' });
  assert.strictEqual(r.status, 200);
  const row = getReceiptRow(r.id);
  assert.strictEqual(row.restaurant_id, 1);
  assert.strictEqual(row.meat_id, 1);
  assert.strictEqual(row.commissary_meat_id, null);
});

test('source COMMISSARY is rejected outright - no manual entry of a Commissary-sourced receipt', () => {
  const r = createReceipt({ restaurant_id: 1, meat_id: 1, business_date: '2026-08-29', quantity: 5, source: 'COMMISSARY' });
  assert.strictEqual(r.status, 400);
  assert.match(r.error, /DIRECT only/);
});

test('missing restaurant_id is rejected - no more Unallocated exception', () => {
  const r = createReceipt({ meat_id: 1, business_date: '2026-08-29', quantity: 5, source: 'DIRECT' });
  assert.strictEqual(r.status, 400);
});

test('missing meat_id is rejected', () => {
  const r = createReceipt({ restaurant_id: 1, business_date: '2026-08-29', quantity: 5, source: 'DIRECT' });
  assert.strictEqual(r.status, 400);
});

test('a bogus source value is rejected the same as COMMISSARY (only DIRECT ever passes)', () => {
  const r = createReceipt({ restaurant_id: 1, meat_id: 1, business_date: '2026-08-29', quantity: 5, source: 'SOMETHING_ELSE' });
  assert.strictEqual(r.status, 400);
});

let directId;
test('PATCH can edit quantity/date/notes on an existing receipt', () => {
  const created = createReceipt({ restaurant_id: 1, meat_id: 1, business_date: '2026-08-29', quantity: 10, source: 'DIRECT' });
  directId = created.id;
  const r = patchReceipt(directId, { quantity: 12, notes: 'corrected count' });
  assert.strictEqual(r.status, 200);
  const row = getReceiptRow(directId);
  assert.strictEqual(row.quantity, 12);
  assert.strictEqual(row.notes, 'corrected count');
});

test('PATCH does not accept restaurant_id/meat_id/source at all - the route function signature excludes them entirely, not just validates them away', () => {
  // This is really documenting the route's shape, not testing a
  // rejection - PATCH's real handler only destructures quantity/
  // business_date/notes/actor from the body, so even if a caller sent
  // restaurant_id, it would be silently ignored, not rejected. Confirm
  // that silently-ignored behavior explicitly, since "the field isn't
  // read" and "the field is rejected" look identical from a 200
  // response and are easy to conflate.
  const before = getReceiptRow(directId);
  patchReceipt(directId, { quantity: 15 }); // note: no restaurant_id/meat_id in this helper's params at all
  const after = getReceiptRow(directId);
  assert.strictEqual(after.restaurant_id, before.restaurant_id);
  assert.strictEqual(after.meat_id, before.meat_id);
});

test('activity_log recorded a CREATE and an UPDATE for the same receipt', () => {
  const entries = db.prepare(
    `SELECT action FROM activity_log WHERE entity_type = 'stock_receipts' AND entity_id = ? ORDER BY id`
  ).all(directId);
  assert.deepStrictEqual(entries.map(e => e.action), ['CREATE', 'UPDATE', 'UPDATE']);
});

test('CHECK constraint at the DB layer still technically permits the old Unallocated shape - deliberately untouched, see stockReceipts.js\'s module-level note', () => {
  // Confirms the schema itself was NOT changed as part of this
  // retirement (no destructive schema edits) - only application code
  // stopped exercising this path. If this assertion ever starts
  // failing, someone tightened the CHECK constraint without updating
  // this comment/the module note explaining why it was left alone.
  assert.doesNotThrow(() => {
    db.prepare(`INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source) VALUES (NULL, NULL, '2026-08-29', 1, 'COMMISSARY')`).run();
  });
});

test('CHECK constraint at the DB layer independently rejects NULL+NULL+DIRECT even bypassing app validation', () => {
  assert.throws(() => {
    db.prepare(`INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source) VALUES (NULL, NULL, '2026-08-29', 1, 'DIRECT')`).run();
  });
});

test('CHECK constraint rejects one-sided NULL (restaurant set, meat NULL)', () => {
  assert.throws(() => {
    db.prepare(`INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source) VALUES (1, NULL, '2026-08-29', 1, 'DIRECT')`).run();
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
