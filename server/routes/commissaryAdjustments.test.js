// Tests for step 24b-iii's CRUD routes on commissary_adjustments
// (server/routes/commissary.js). Mirrors the route logic directly against a
// real in-memory node:sqlite DB, same approach as commissary.test.js /
// stockReceipts.test.js - not a live Express server. Self-contained
// fixtures (own commissary_meats rows, own business dates), per the
// pattern established in 24a-b.

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

console.log('Commissary Adjustments Route Tests (step 24b-iii)\n');

const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(schema);

// ---- seed fixtures ----
db.prepare(`INSERT INTO commissaries (id, code, name) VALUES (1, 'COM-A', 'Commissary A')`).run();
db.prepare(`INSERT INTO meat_types (id, name) VALUES (1, 'Jowl')`).run();
db.prepare(`INSERT INTO meat_types (id, name) VALUES (2, 'Beef')`).run();

// id 1: source. id 2: valid destination (same type, same unit).
// id 3: different meat_type, same unit - invalid destination.
// id 4: same meat_type, different unit - invalid destination.
// id 5: same type/unit but inactive - invalid destination (unknown/inactive).
db.prepare(`INSERT INTO commissary_meats (id, commissary_id, code, name, unit, allowed_leeway_pct, meat_type_id) VALUES (1, 1, 'CM01', 'Raw Jowl', 'kg', 0.2, 1)`).run();
db.prepare(`INSERT INTO commissary_meats (id, commissary_id, code, name, unit, allowed_leeway_pct, meat_type_id) VALUES (2, 1, 'CM02', 'Backed Jowl', 'kg', 0.2, 1)`).run();
db.prepare(`INSERT INTO commissary_meats (id, commissary_id, code, name, unit, allowed_leeway_pct, meat_type_id) VALUES (3, 1, 'CM03', 'Beef Cut', 'kg', 0.2, 2)`).run();
db.prepare(`INSERT INTO commissary_meats (id, commissary_id, code, name, unit, allowed_leeway_pct, meat_type_id) VALUES (4, 1, 'CM04', 'Portioned Jowl', 'unit', 0.2, 1)`).run();
db.prepare(`INSERT INTO commissary_meats (id, commissary_id, code, name, unit, allowed_leeway_pct, meat_type_id, active) VALUES (5, 1, 'CM05', 'Retired Jowl', 'kg', 0.2, 1, 0)`).run();

function getAdjustmentRow(id) {
  return db.prepare('SELECT * FROM commissary_adjustments WHERE id = ?').get(id);
}

function isValidDestination(sourceMeat, destMeat) {
  return !!destMeat && destMeat.meat_type_id !== null
    && destMeat.meat_type_id === sourceMeat.meat_type_id
    && destMeat.unit === sourceMeat.unit;
}

// Mirrors POST /api/commissary/adjustments
function createAdjustment({ commissary_meat_id, business_date, kind, quantity, destination_commissary_meat_id, notes, actor }) {
  if (!commissary_meat_id || !business_date || !kind
      || quantity === undefined || quantity === null || quantity === '') {
    return { status: 400, error: 'commissary_meat_id, business_date, kind, and quantity are required' };
  }
  if (kind !== 'LOSS' && kind !== 'ALLOCATION') {
    return { status: 400, error: "kind must be 'LOSS' or 'ALLOCATION'" };
  }
  if (Number(quantity) <= 0) {
    return { status: 400, error: 'quantity must be positive' };
  }

  const sourceMeat = db.prepare('SELECT * FROM commissary_meats WHERE id = ? AND active = 1').get(commissary_meat_id);
  if (!sourceMeat) return { status: 400, error: 'Unknown or inactive commissary_meat_id' };

  const hasDestination = destination_commissary_meat_id !== undefined && destination_commissary_meat_id !== null && destination_commissary_meat_id !== '';
  if (kind === 'LOSS' && hasDestination) {
    return { status: 400, error: 'LOSS must not have a destination_commissary_meat_id' };
  }
  if (kind === 'ALLOCATION' && !hasDestination) {
    return { status: 400, error: 'ALLOCATION requires a destination_commissary_meat_id' };
  }

  if (kind === 'ALLOCATION') {
    const destMeat = db.prepare('SELECT * FROM commissary_meats WHERE id = ? AND active = 1').get(destination_commissary_meat_id);
    if (!destMeat) return { status: 400, error: 'Unknown or inactive destination_commissary_meat_id' };
    if (!isValidDestination(sourceMeat, destMeat)) {
      return { status: 400, error: "destination_commissary_meat_id must share the source meat's meat_type_id and unit" };
    }
  }

  const result = db.prepare(`
    INSERT INTO commissary_adjustments (commissary_meat_id, business_date, kind, quantity, destination_commissary_meat_id, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(commissary_meat_id, business_date, kind, Number(quantity), kind === 'ALLOCATION' ? destination_commissary_meat_id : null, notes || null, actor || null);

  return { status: 200, id: result.lastInsertRowid };
}

// Mirrors GET /api/commissary/adjustments
function listAdjustments({ business_date, commissary_meat_id, commissary_id, kind } = {}) {
  const clauses = ['ca.deleted_at IS NULL'];
  const params = [];
  if (business_date) { clauses.push('ca.business_date = ?'); params.push(business_date); }
  if (commissary_meat_id) { clauses.push('ca.commissary_meat_id = ?'); params.push(Number(commissary_meat_id)); }
  if (commissary_id) { clauses.push('cm.commissary_id = ?'); params.push(Number(commissary_id)); }
  if (kind) { clauses.push('ca.kind = ?'); params.push(kind); }

  return db.prepare(`
    SELECT ca.*, cm.code as commissary_meat_code, cm.name as commissary_meat_name, cm.unit,
           dcm.code as destination_code, dcm.name as destination_name
    FROM commissary_adjustments ca
    JOIN commissary_meats cm ON cm.id = ca.commissary_meat_id
    LEFT JOIN commissary_meats dcm ON dcm.id = ca.destination_commissary_meat_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY ca.created_at DESC, ca.id DESC
  `).all(...params);
}

// Mirrors PATCH /api/commissary/adjustments/:id
function updateAdjustment(id, { business_date, kind, quantity, destination_commissary_meat_id, notes }) {
  const existing = getAdjustmentRow(id);
  if (!existing || existing.deleted_at) return { status: 404, error: 'Adjustment not found' };

  const nextKind = kind !== undefined ? kind : existing.kind;
  if (nextKind !== 'LOSS' && nextKind !== 'ALLOCATION') {
    return { status: 400, error: "kind must be 'LOSS' or 'ALLOCATION'" };
  }
  const nextQuantity = quantity !== undefined && quantity !== null && quantity !== '' ? Number(quantity) : existing.quantity;
  if (nextQuantity <= 0) return { status: 400, error: 'quantity must be positive' };
  const nextDate = business_date || existing.business_date;
  const nextNotes = notes !== undefined ? (notes || null) : existing.notes;
  const nextDestinationId = destination_commissary_meat_id !== undefined
    ? (destination_commissary_meat_id === null || destination_commissary_meat_id === '' ? null : destination_commissary_meat_id)
    : existing.destination_commissary_meat_id;

  if (nextKind === 'LOSS' && nextDestinationId) {
    return { status: 400, error: 'LOSS must not have a destination_commissary_meat_id' };
  }
  if (nextKind === 'ALLOCATION' && !nextDestinationId) {
    return { status: 400, error: 'ALLOCATION requires a destination_commissary_meat_id' };
  }

  if (nextKind === 'ALLOCATION') {
    const sourceMeat = db.prepare('SELECT * FROM commissary_meats WHERE id = ?').get(existing.commissary_meat_id);
    const destMeat = db.prepare('SELECT * FROM commissary_meats WHERE id = ? AND active = 1').get(nextDestinationId);
    if (!destMeat) return { status: 400, error: 'Unknown or inactive destination_commissary_meat_id' };
    if (!isValidDestination(sourceMeat, destMeat)) {
      return { status: 400, error: "destination_commissary_meat_id must share the source meat's meat_type_id and unit" };
    }
  }

  db.prepare(`
    UPDATE commissary_adjustments SET business_date = ?, kind = ?, quantity = ?, destination_commissary_meat_id = ?, notes = ?
    WHERE id = ?
  `).run(nextDate, nextKind, nextQuantity, nextDestinationId, nextNotes, id);

  return { status: 200, id };
}

// Mirrors DELETE /api/commissary/adjustments/:id
function deleteAdjustment(id) {
  const existing = getAdjustmentRow(id);
  if (!existing || existing.deleted_at) return { status: 404, error: 'Adjustment not found' };
  db.prepare(`UPDATE commissary_adjustments SET deleted_at = datetime('now') WHERE id = ?`).run(id);
  return { status: 200, id };
}

// ---- tests ----

test('a LOSS creates and reads back correctly', () => {
  const r = createAdjustment({ commissary_meat_id: 1, business_date: '2026-09-01', kind: 'LOSS', quantity: 3, notes: 'spoilage' });
  assert.strictEqual(r.status, 200);
  const rows = listAdjustments({ business_date: '2026-09-01', kind: 'LOSS' });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].kind, 'LOSS');
  assert.strictEqual(rows[0].quantity, 3);
  assert.strictEqual(rows[0].destination_commissary_meat_id, null);
  assert.strictEqual(rows[0].commissary_meat_code, 'CM01');
});

test('an ALLOCATION creates and reads back correctly, including the destination', () => {
  const r = createAdjustment({ commissary_meat_id: 1, business_date: '2026-09-02', kind: 'ALLOCATION', quantity: 5, destination_commissary_meat_id: 2 });
  assert.strictEqual(r.status, 200);
  const rows = listAdjustments({ business_date: '2026-09-02', kind: 'ALLOCATION' });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].destination_commissary_meat_id, 2);
  assert.strictEqual(rows[0].destination_code, 'CM02');
});

test('a LOSS with a destination is rejected', () => {
  const r = createAdjustment({ commissary_meat_id: 1, business_date: '2026-09-03', kind: 'LOSS', quantity: 1, destination_commissary_meat_id: 2 });
  assert.strictEqual(r.status, 400);
});

test('an ALLOCATION without a destination is rejected', () => {
  const r = createAdjustment({ commissary_meat_id: 1, business_date: '2026-09-03', kind: 'ALLOCATION', quantity: 1 });
  assert.strictEqual(r.status, 400);
});

test('an ALLOCATION to a different meat_type is rejected', () => {
  const r = createAdjustment({ commissary_meat_id: 1, business_date: '2026-09-03', kind: 'ALLOCATION', quantity: 1, destination_commissary_meat_id: 3 });
  assert.strictEqual(r.status, 400);
});

test('an ALLOCATION to the same meat_type but a different unit is rejected', () => {
  const r = createAdjustment({ commissary_meat_id: 1, business_date: '2026-09-03', kind: 'ALLOCATION', quantity: 1, destination_commissary_meat_id: 4 });
  assert.strictEqual(r.status, 400);
});

test('an ALLOCATION to an inactive destination is rejected', () => {
  const r = createAdjustment({ commissary_meat_id: 1, business_date: '2026-09-03', kind: 'ALLOCATION', quantity: 1, destination_commissary_meat_id: 5 });
  assert.strictEqual(r.status, 400);
});

test('an invalid kind is rejected', () => {
  const r = createAdjustment({ commissary_meat_id: 1, business_date: '2026-09-03', kind: 'BONUS', quantity: 1 });
  assert.strictEqual(r.status, 400);
});

test('soft delete removes a row from the list without physically deleting it', () => {
  const created = createAdjustment({ commissary_meat_id: 1, business_date: '2026-09-04', kind: 'LOSS', quantity: 2 });
  assert.strictEqual(created.status, 200);

  const before = listAdjustments({ business_date: '2026-09-04' });
  assert.strictEqual(before.length, 1);

  const del = deleteAdjustment(created.id);
  assert.strictEqual(del.status, 200);

  const after = listAdjustments({ business_date: '2026-09-04' });
  assert.strictEqual(after.length, 0);

  const stillThere = getAdjustmentRow(created.id);
  assert.ok(stillThere, 'the row must still physically exist');
  assert.ok(stillThere.deleted_at, 'deleted_at must be set');
});

test('deleting an already-deleted row 404s', () => {
  const created = createAdjustment({ commissary_meat_id: 1, business_date: '2026-09-05', kind: 'LOSS', quantity: 1 });
  deleteAdjustment(created.id);
  const r = deleteAdjustment(created.id);
  assert.strictEqual(r.status, 404);
});

test('update changes quantity and notes without touching the source meat', () => {
  const created = createAdjustment({ commissary_meat_id: 1, business_date: '2026-09-06', kind: 'LOSS', quantity: 4 });
  const r = updateAdjustment(created.id, { quantity: 7, notes: 'recount' });
  assert.strictEqual(r.status, 200);
  const row = getAdjustmentRow(created.id);
  assert.strictEqual(row.quantity, 7);
  assert.strictEqual(row.notes, 'recount');
  assert.strictEqual(row.commissary_meat_id, 1);
});

test('update rejects flipping to ALLOCATION without a destination', () => {
  const created = createAdjustment({ commissary_meat_id: 1, business_date: '2026-09-07', kind: 'LOSS', quantity: 1 });
  const r = updateAdjustment(created.id, { kind: 'ALLOCATION' });
  assert.strictEqual(r.status, 400);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
