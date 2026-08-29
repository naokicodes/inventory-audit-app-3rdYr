// Tests for step 20c's POST /api/commissary/shipments - mirrors
// commissary.js's exact route logic (not a live Express server) against a
// real in-memory node:sqlite DB, same approach as stockReceipts.test.js /
// commands.test.js. NOT a live-server run - see docs/session-status.md's
// step 20c entry for why (no network this session for npm install, so no
// Express available to boot a real server; same limitation steps 12-19's
// sessions hit before step 20b's git access came back).

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

console.log('Commissary Route Tests (step 20c: shipment write route)\n');

const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(schema);

// ---- seed fixtures ----
// Restaurant A (FC's own catalog, keeping it simple): Bagnet + Sisig, both
// active, plus one inactive meat to confirm it's rejected as a line target.
db.prepare(`INSERT INTO restaurants (id, name, code) VALUES (1, 'FC', 'FC')`).run();
db.prepare(`INSERT INTO restaurants (id, name, code, active) VALUES (2, 'Closed Branch', 'CB', 0)`).run();
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit) VALUES (1, 1, 'M01', 'Bagnet', 'kg')`).run();
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit) VALUES (2, 1, 'M02', 'Sisig', 'kg')`).run();
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit, active) VALUES (3, 1, 'M03', 'Retired Cut', 'kg', 0)`).run();
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit) VALUES (4, 2, 'M01', 'Some Meat', 'kg')`).run();
db.prepare(`INSERT INTO commissary_meats (id, code, name, unit, allowed_leeway_pct) VALUES (1, 'CM01', 'Jowl', 'kg', 0.2)`).run();
db.prepare(`INSERT INTO commissary_meats (id, code, name, unit, allowed_leeway_pct, active) VALUES (2, 'CM02', 'Retired Meat', 'kg', 0.2, 0)`).run();

function getReceiptRow(id) {
  return db.prepare('SELECT * FROM stock_receipts WHERE id = ?').get(id);
}
function getShipmentWithLines(shipmentId) {
  const shipment = db.prepare('SELECT * FROM commissary_shipments WHERE id = ?').get(shipmentId);
  const lines = db.prepare('SELECT * FROM commissary_shipment_lines WHERE shipment_id = ?').all(shipmentId);
  return { ...shipment, lines };
}

// Mirrors POST /api/commissary/shipments
function createShipment({ commissary_meat_id, restaurant_id, business_date, total_quantity, notes, actor, lines }) {
  if (!commissary_meat_id || !restaurant_id || !business_date
      || total_quantity === undefined || total_quantity === null || total_quantity === '') {
    return { status: 400, error: 'commissary_meat_id, restaurant_id, business_date, and total_quantity are required' };
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return { status: 400, error: 'At least one output line is required' };
  }
  for (const line of lines) {
    if (!line || !line.meat_id || line.quantity === undefined || line.quantity === null || line.quantity === '') {
      return { status: 400, error: 'Each line requires meat_id and quantity' };
    }
  }

  const commissaryMeat = db.prepare('SELECT id FROM commissary_meats WHERE id = ? AND active = 1').get(commissary_meat_id);
  if (!commissaryMeat) return { status: 400, error: 'Unknown or inactive commissary_meat_id' };
  const restaurant = db.prepare('SELECT id FROM restaurants WHERE id = ? AND active = 1').get(restaurant_id);
  if (!restaurant) return { status: 400, error: 'Unknown or inactive restaurant_id' };

  for (const line of lines) {
    const meat = db.prepare('SELECT id FROM meats WHERE id = ? AND restaurant_id = ? AND active = 1').get(line.meat_id, restaurant_id);
    if (!meat) return { status: 400, error: `meat_id ${line.meat_id} is not an active meat belonging to restaurant_id ${restaurant_id}` };
  }

  const shipmentId = withTransaction(db, () => {
    const shipmentResult = db.prepare(`
      INSERT INTO commissary_shipments (commissary_meat_id, restaurant_id, business_date, total_quantity, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(commissary_meat_id, restaurant_id, business_date, Number(total_quantity), notes || null, actor || null);

    const newShipmentId = shipmentResult.lastInsertRowid;

    for (const line of lines) {
      db.prepare(`
        INSERT INTO commissary_shipment_lines (shipment_id, meat_id, quantity)
        VALUES (?, ?, ?)
      `).run(newShipmentId, line.meat_id, Number(line.quantity));

      const receiptResult = db.prepare(`
        INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source, commissary_meat_id, notes, created_by)
        VALUES (?, ?, ?, ?, 'COMMISSARY', ?, ?, ?)
      `).run(restaurant_id, line.meat_id, business_date, Number(line.quantity), commissary_meat_id, notes || null, actor || null);

      const after = getReceiptRow(receiptResult.lastInsertRowid);
      logActivity(db, {
        actor: actor || null,
        entityType: 'stock_receipts',
        entityId: receiptResult.lastInsertRowid,
        action: 'CREATE',
        before: null,
        after,
        source: 'MANUAL'
      });
    }

    return newShipmentId;
  });

  return { status: 200, id: shipmentId };
}

// ---- tests ----

test('missing required top-level fields is rejected', () => {
  const r = createShipment({ commissary_meat_id: 1, restaurant_id: 1, business_date: '2026-08-29', total_quantity: '', lines: [{ meat_id: 1, quantity: 1 }] });
  assert.strictEqual(r.status, 400);
});

test('no lines is rejected', () => {
  const r = createShipment({ commissary_meat_id: 1, restaurant_id: 1, business_date: '2026-08-29', total_quantity: 10, lines: [] });
  assert.strictEqual(r.status, 400);
});

test('a line missing quantity is rejected', () => {
  const r = createShipment({ commissary_meat_id: 1, restaurant_id: 1, business_date: '2026-08-29', total_quantity: 10, lines: [{ meat_id: 1 }] });
  assert.strictEqual(r.status, 400);
});

test('unknown commissary_meat_id is rejected', () => {
  const r = createShipment({ commissary_meat_id: 999, restaurant_id: 1, business_date: '2026-08-29', total_quantity: 10, lines: [{ meat_id: 1, quantity: 5 }] });
  assert.strictEqual(r.status, 400);
});

test('inactive commissary_meat_id is rejected', () => {
  const r = createShipment({ commissary_meat_id: 2, restaurant_id: 1, business_date: '2026-08-29', total_quantity: 10, lines: [{ meat_id: 1, quantity: 5 }] });
  assert.strictEqual(r.status, 400);
});

test('unknown restaurant_id is rejected', () => {
  const r = createShipment({ commissary_meat_id: 1, restaurant_id: 999, business_date: '2026-08-29', total_quantity: 10, lines: [{ meat_id: 1, quantity: 5 }] });
  assert.strictEqual(r.status, 400);
});

test('inactive (closed) restaurant_id is rejected', () => {
  const r = createShipment({ commissary_meat_id: 1, restaurant_id: 2, business_date: '2026-08-29', total_quantity: 10, lines: [{ meat_id: 4, quantity: 5 }] });
  assert.strictEqual(r.status, 400);
});

test('a line meat_id belonging to a DIFFERENT restaurant than the shipment is rejected', () => {
  // meat_id 4 belongs to restaurant 2, shipment targets restaurant 1
  const r = createShipment({ commissary_meat_id: 1, restaurant_id: 1, business_date: '2026-08-29', total_quantity: 10, lines: [{ meat_id: 4, quantity: 5 }] });
  assert.strictEqual(r.status, 400);
});

test('a line meat_id that is inactive is rejected', () => {
  const r = createShipment({ commissary_meat_id: 1, restaurant_id: 1, business_date: '2026-08-29', total_quantity: 10, lines: [{ meat_id: 3, quantity: 5 }] });
  assert.strictEqual(r.status, 400);
});

let shipmentId;
test('a valid shipment with two output lines is created', () => {
  const r = createShipment({
    commissary_meat_id: 1, restaurant_id: 1, business_date: '2026-08-29', total_quantity: 10, actor: 'tester',
    lines: [{ meat_id: 1, quantity: 4 }, { meat_id: 2, quantity: 5 }]
  });
  assert.strictEqual(r.status, 200);
  shipmentId = r.id;
});

test('the shipment row and both lines were written', () => {
  const shipment = getShipmentWithLines(shipmentId);
  assert.strictEqual(shipment.commissary_meat_id, 1);
  assert.strictEqual(shipment.restaurant_id, 1);
  assert.strictEqual(shipment.total_quantity, 10);
  assert.strictEqual(shipment.lines.length, 2);
});

test('sum of line quantities is allowed to differ from total_quantity (4 + 5 = 9, not 10) - no reconciliation enforced', () => {
  const shipment = getShipmentWithLines(shipmentId);
  const lineSum = shipment.lines.reduce((s, l) => s + l.quantity, 0);
  assert.strictEqual(lineSum, 9);
  assert.notStrictEqual(lineSum, shipment.total_quantity);
});

test('each line wrote its own stock_receipts row for the destination restaurant, source=COMMISSARY', () => {
  const receipts = db.prepare(`
    SELECT * FROM stock_receipts WHERE restaurant_id = 1 AND business_date = '2026-08-29' AND source = 'COMMISSARY' ORDER BY meat_id
  `).all();
  assert.strictEqual(receipts.length, 2);
  assert.strictEqual(receipts[0].meat_id, 1);
  assert.strictEqual(receipts[0].quantity, 4);
  assert.strictEqual(receipts[0].commissary_meat_id, 1);
  assert.strictEqual(receipts[1].meat_id, 2);
  assert.strictEqual(receipts[1].quantity, 5);
});

test('each stock_receipts write got its own activity_log CREATE row', () => {
  const receipts = db.prepare(`SELECT id FROM stock_receipts WHERE restaurant_id = 1 AND business_date = '2026-08-29' AND source = 'COMMISSARY'`).all();
  for (const r of receipts) {
    const entries = db.prepare(`SELECT action FROM activity_log WHERE entity_type = 'stock_receipts' AND entity_id = ?`).all(r.id);
    assert.deepStrictEqual(entries.map(e => e.action), ['CREATE']);
  }
});

test('commissary_shipments/commissary_shipment_lines themselves get NO activity_log entries (not in rule 9 scope)', () => {
  const entries = db.prepare(`SELECT * FROM activity_log WHERE entity_type IN ('commissary_shipments', 'commissary_shipment_lines')`).all();
  assert.strictEqual(entries.length, 0);
});

test('the new stock_receipts rows feed getNewStock for the destination restaurant/meat/date', () => {
  const row = db.prepare(`
    SELECT SUM(quantity) as qty FROM stock_receipts
    WHERE restaurant_id = 1 AND meat_id = 1 AND business_date = '2026-08-29' AND deleted_at IS NULL
  `).get();
  assert.strictEqual(row.qty, 4);
});

test('a failed line (inactive meat) rolls back the whole transaction - no partial shipment row, no partial stock_receipts row', () => {
  const before = db.prepare(`SELECT COUNT(*) as c FROM commissary_shipments`).get().c;
  const beforeReceipts = db.prepare(`SELECT COUNT(*) as c FROM stock_receipts`).get().c;

  const r = createShipment({
    commissary_meat_id: 1, restaurant_id: 1, business_date: '2026-08-30', total_quantity: 10, actor: 'tester',
    lines: [{ meat_id: 1, quantity: 2 }, { meat_id: 3, quantity: 1 }] // meat_id 3 is inactive
  });
  assert.strictEqual(r.status, 400);

  // Rejected before the transaction even starts (up-front validation), so
  // nothing should have been written at all.
  assert.strictEqual(db.prepare(`SELECT COUNT(*) as c FROM commissary_shipments`).get().c, before);
  assert.strictEqual(db.prepare(`SELECT COUNT(*) as c FROM stock_receipts`).get().c, beforeReceipts);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
