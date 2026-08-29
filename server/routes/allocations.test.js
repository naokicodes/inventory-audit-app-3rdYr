// Tests for step 22's new allocations.js routes - mirrors the route's
// exact logic (not a live Express server) against a real in-memory
// node:sqlite DB, same approach as stockReceipts.test.js/commissary.test.js.
// Also verified against a real running server via live HTTP requests in
// this session (see the changelog entry for step 22) - not re-run here
// since that needs a live process, but the logic under test is identical.

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

console.log('Allocations Route Tests (step 22: Allocations page)\n');

const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(schema);

// ---- seed fixtures ----
db.prepare(`INSERT INTO restaurants (id, name, code) VALUES (1, 'Restaurant A', 'A')`).run();
db.prepare(`INSERT INTO restaurants (id, name, code, active) VALUES (2, 'Closed Branch', 'CB', 0)`).run();
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit) VALUES (1, 1, 'M01', 'Whole Chicken', 'kg')`).run();
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit, active) VALUES (2, 1, 'M02', 'Retired Cut', 'kg', 0)`).run();
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit) VALUES (3, 2, 'M01', 'Some Meat', 'kg')`).run();

// Schema seeds the real six adjustment_types via INSERT OR IGNORE - fetch
// their real ids rather than assuming, same defensive pattern
// dailyAudit.js used for these before step 22.
const wastageTypeId = db.prepare(`SELECT id FROM adjustment_types WHERE name = 'Wastage'`).get().id;
const transferTypeId = db.prepare(`SELECT id FROM adjustment_types WHERE name = 'Allocation / Transfer'`).get().id;
db.prepare(`INSERT INTO adjustment_types (name, requires_transfer_locations, active) VALUES ('Retired Type', 0, 0)`).run();
const retiredTypeId = db.prepare(`SELECT id FROM adjustment_types WHERE name = 'Retired Type'`).get().id;

db.prepare(`INSERT INTO locations (id, restaurant_id, name, is_restaurant_level) VALUES (1, 1, 'Restaurant A Kitchen', 1)`).run();
db.prepare(`INSERT INTO locations (id, restaurant_id, name, is_restaurant_level) VALUES (2, NULL, 'Commissary', 0)`).run();
db.prepare(`INSERT INTO locations (id, restaurant_id, name, is_restaurant_level, active) VALUES (3, 1, 'Retired Location', 1, 0)`).run();

// Mirrors POST /api/allocations
function createAllocation({ restaurant_id, meat_id, business_date, adjustment_type_id, quantity, from_location_id, to_location_id, notes, created_by }) {
  if (!restaurant_id || !meat_id || !business_date || !adjustment_type_id
      || quantity === undefined || quantity === null || quantity === '') {
    return { status: 400, error: 'restaurant_id, meat_id, business_date, adjustment_type_id, and quantity are required' };
  }

  const restaurant = db.prepare('SELECT id FROM restaurants WHERE id = ? AND active = 1').get(restaurant_id);
  if (!restaurant) return { status: 400, error: 'Unknown or inactive restaurant_id' };

  const meat = db.prepare('SELECT id FROM meats WHERE id = ? AND restaurant_id = ? AND active = 1').get(meat_id, restaurant_id);
  if (!meat) return { status: 400, error: `meat_id ${meat_id} is not an active meat belonging to restaurant_id ${restaurant_id}` };

  const type = db.prepare('SELECT id, name, requires_transfer_locations FROM adjustment_types WHERE id = ? AND active = 1').get(adjustment_type_id);
  if (!type) return { status: 400, error: 'Unknown or inactive adjustment_type_id' };

  if (type.requires_transfer_locations) {
    if (!from_location_id || !to_location_id) {
      return { status: 400, error: `"${type.name}" requires both a from and a to location` };
    }
    const fromLoc = db.prepare('SELECT id FROM locations WHERE id = ? AND active = 1').get(from_location_id);
    if (!fromLoc) return { status: 400, error: 'Unknown or inactive from_location_id' };
    const toLoc = db.prepare('SELECT id FROM locations WHERE id = ? AND active = 1').get(to_location_id);
    if (!toLoc) return { status: 400, error: 'Unknown or inactive to_location_id' };
  } else if (from_location_id || to_location_id) {
    return { status: 400, error: `"${type.name}" doesn't use from/to locations - leave both blank` };
  }

  const result = db.prepare(`
    INSERT INTO adjustments (restaurant_id, meat_id, business_date, quantity, adjustment_type_id, from_location_id, to_location_id, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    restaurant_id, meat_id, business_date, Number(quantity), adjustment_type_id,
    type.requires_transfer_locations ? from_location_id : null,
    type.requires_transfer_locations ? to_location_id : null,
    notes || null, created_by || null
  );

  return { status: 200, ok: true, id: result.lastInsertRowid };
}

test('A plain (non-transfer) allocation with valid fields is created', () => {
  const result = createAllocation({ restaurant_id: 1, meat_id: 1, business_date: '2026-08-29', adjustment_type_id: wastageTypeId, quantity: 2.5, notes: 'dropped tray' });
  assert.strictEqual(result.ok, true);
  const row = db.prepare('SELECT * FROM adjustments WHERE id = ?').get(result.id);
  assert.strictEqual(row.quantity, 2.5);
  assert.strictEqual(row.adjustment_type_id, wastageTypeId);
  assert.strictEqual(row.from_location_id, null);
  assert.strictEqual(row.to_location_id, null);
});

test('Missing required fields is rejected with 400', () => {
  const result = createAllocation({ restaurant_id: 1, meat_id: 1, business_date: '2026-08-29', adjustment_type_id: wastageTypeId, quantity: '' });
  assert.strictEqual(result.status, 400);
});

test('An inactive restaurant_id is rejected', () => {
  const result = createAllocation({ restaurant_id: 2, meat_id: 3, business_date: '2026-08-29', adjustment_type_id: wastageTypeId, quantity: 1 });
  assert.strictEqual(result.status, 400);
  assert.match(result.error, /restaurant_id/);
});

test('A meat belonging to a different restaurant than restaurant_id is rejected', () => {
  const result = createAllocation({ restaurant_id: 1, meat_id: 3, business_date: '2026-08-29', adjustment_type_id: wastageTypeId, quantity: 1 });
  assert.strictEqual(result.status, 400);
  assert.match(result.error, /not an active meat belonging to restaurant_id/);
});

test('An inactive meat_id is rejected', () => {
  const result = createAllocation({ restaurant_id: 1, meat_id: 2, business_date: '2026-08-29', adjustment_type_id: wastageTypeId, quantity: 1 });
  assert.strictEqual(result.status, 400);
});

test('An inactive adjustment_type_id is rejected', () => {
  const result = createAllocation({ restaurant_id: 1, meat_id: 1, business_date: '2026-08-29', adjustment_type_id: retiredTypeId, quantity: 1 });
  assert.strictEqual(result.status, 400);
  assert.match(result.error, /adjustment_type_id/);
});

test('A type NOT requiring transfer locations rejects from/to being supplied anyway', () => {
  const result = createAllocation({ restaurant_id: 1, meat_id: 1, business_date: '2026-08-29', adjustment_type_id: wastageTypeId, quantity: 1, from_location_id: 1, to_location_id: 2 });
  assert.strictEqual(result.status, 400);
  assert.match(result.error, /doesn't use from\/to locations/);
});

test('A type requiring transfer locations rejects a missing from/to', () => {
  const result = createAllocation({ restaurant_id: 1, meat_id: 1, business_date: '2026-08-29', adjustment_type_id: transferTypeId, quantity: 1 });
  assert.strictEqual(result.status, 400);
  assert.match(result.error, /requires both a from and a to location/);
});

test('A type requiring transfer locations rejects an inactive from_location_id', () => {
  const result = createAllocation({ restaurant_id: 1, meat_id: 1, business_date: '2026-08-29', adjustment_type_id: transferTypeId, quantity: 1, from_location_id: 3, to_location_id: 2 });
  assert.strictEqual(result.status, 400);
  assert.match(result.error, /from_location_id/);
});

test('A valid transfer with real from/to locations is created and stores both', () => {
  const result = createAllocation({ restaurant_id: 1, meat_id: 1, business_date: '2026-08-29', adjustment_type_id: transferTypeId, quantity: 5, from_location_id: 1, to_location_id: 2 });
  assert.strictEqual(result.ok, true);
  const row = db.prepare('SELECT * FROM adjustments WHERE id = ?').get(result.id);
  assert.strictEqual(row.from_location_id, 1);
  assert.strictEqual(row.to_location_id, 2);
});

test('computeMeatAudit-facing sum: multiple allocation entries for the same meat/date all count toward the SUM(quantity), not just the latest one', () => {
  // This is the deliberate behavior change from the old Landing three-box
  // UI (one row per type per day, delete-then-insert) to an append-only
  // log matching how the audit engine already sums adjustments.
  createAllocation({ restaurant_id: 1, meat_id: 1, business_date: '2026-08-30', adjustment_type_id: wastageTypeId, quantity: 1 });
  createAllocation({ restaurant_id: 1, meat_id: 1, business_date: '2026-08-30', adjustment_type_id: wastageTypeId, quantity: 2 });
  const sum = db.prepare(`SELECT SUM(quantity) as total FROM adjustments WHERE restaurant_id = 1 AND meat_id = 1 AND business_date = '2026-08-30'`).get().total;
  assert.strictEqual(sum, 3, 'two separate wastage entries the same day must both count, not overwrite each other');
});

// Mirrors POST /api/allocations/conversion
function createConversion({ restaurant_id, business_date, from_meat_id, from_quantity, to_meat_id, to_quantity, notes, created_by }) {
  if (!restaurant_id || !business_date || !from_meat_id || !to_meat_id
      || from_quantity === undefined || from_quantity === null || from_quantity === ''
      || to_quantity === undefined || to_quantity === null || to_quantity === '') {
    return { status: 400, error: 'restaurant_id, business_date, from_meat_id, from_quantity, to_meat_id, and to_quantity are required' };
  }
  if (from_meat_id === to_meat_id) {
    return { status: 400, error: 'from_meat_id and to_meat_id must be different - this converts one item into another' };
  }
  if (Number(from_quantity) <= 0 || Number(to_quantity) <= 0) {
    return { status: 400, error: 'from_quantity and to_quantity must both be positive - the direction is implied, not signed by the caller' };
  }

  const restaurant = db.prepare('SELECT id FROM restaurants WHERE id = ? AND active = 1').get(restaurant_id);
  if (!restaurant) return { status: 400, error: 'Unknown or inactive restaurant_id' };

  const fromMeat = db.prepare('SELECT id FROM meats WHERE id = ? AND restaurant_id = ? AND active = 1').get(from_meat_id, restaurant_id);
  if (!fromMeat) return { status: 400, error: `from_meat_id ${from_meat_id} is not an active meat belonging to restaurant_id ${restaurant_id}` };

  const toMeat = db.prepare('SELECT id FROM meats WHERE id = ? AND restaurant_id = ? AND active = 1').get(to_meat_id, restaurant_id);
  if (!toMeat) return { status: 400, error: `to_meat_id ${to_meat_id} is not an active meat belonging to restaurant_id ${restaurant_id}` };

  const type = db.prepare(`SELECT id FROM adjustment_types WHERE name = 'Portion Conversion' AND active = 1`).get();
  if (!type) return { status: 500, error: 'Portion Conversion type missing' };

  const fromResult = db.prepare(`
    INSERT INTO adjustments (restaurant_id, meat_id, business_date, quantity, adjustment_type_id, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(restaurant_id, from_meat_id, business_date, Number(from_quantity), type.id, notes || null, created_by || null);

  const toResult = db.prepare(`
    INSERT INTO adjustments (restaurant_id, meat_id, business_date, quantity, adjustment_type_id, linked_adjustment_id, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(restaurant_id, to_meat_id, business_date, -Number(to_quantity), type.id, fromResult.lastInsertRowid, notes || null, created_by || null);

  return { status: 200, ok: true, from_adjustment_id: fromResult.lastInsertRowid, to_adjustment_id: toResult.lastInsertRowid };
}

// New meat for conversion tests - a second FC-style portioned item.
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit) VALUES (4, 1, 'M03', 'Dinuguan', 'unit')`).run();

test('a valid conversion writes two rows with correct, opposite-signed quantities', () => {
  const result = createConversion({ restaurant_id: 1, business_date: '2026-08-31', from_meat_id: 1, from_quantity: 2, to_meat_id: 4, to_quantity: 2 });
  assert.strictEqual(result.ok, true);
  const fromRow = db.prepare('SELECT * FROM adjustments WHERE id = ?').get(result.from_adjustment_id);
  const toRow = db.prepare('SELECT * FROM adjustments WHERE id = ?').get(result.to_adjustment_id);
  assert.strictEqual(fromRow.quantity, 2, 'source item quantity should be positive (leaves stock)');
  assert.strictEqual(toRow.quantity, -2, 'target item quantity should be negative (enters stock)');
});

test('the target row links back to the source row via linked_adjustment_id', () => {
  const result = createConversion({ restaurant_id: 1, business_date: '2026-08-31', from_meat_id: 1, from_quantity: 1, to_meat_id: 4, to_quantity: 1 });
  const toRow = db.prepare('SELECT * FROM adjustments WHERE id = ?').get(result.to_adjustment_id);
  assert.strictEqual(toRow.linked_adjustment_id, result.from_adjustment_id);
  const fromRow = db.prepare('SELECT * FROM adjustments WHERE id = ?').get(result.from_adjustment_id);
  assert.strictEqual(fromRow.linked_adjustment_id, null, 'the source row itself has no link - only the target row points back');
});

test('both rows use the real Portion Conversion type, not a client-supplied one', () => {
  const conversionTypeId = db.prepare(`SELECT id FROM adjustment_types WHERE name = 'Portion Conversion'`).get().id;
  const result = createConversion({ restaurant_id: 1, business_date: '2026-08-31', from_meat_id: 1, from_quantity: 1, to_meat_id: 4, to_quantity: 1 });
  const fromRow = db.prepare('SELECT * FROM adjustments WHERE id = ?').get(result.from_adjustment_id);
  const toRow = db.prepare('SELECT * FROM adjustments WHERE id = ?').get(result.to_adjustment_id);
  assert.strictEqual(fromRow.adjustment_type_id, conversionTypeId);
  assert.strictEqual(toRow.adjustment_type_id, conversionTypeId);
});

test('converting an item into itself is rejected', () => {
  const result = createConversion({ restaurant_id: 1, business_date: '2026-08-31', from_meat_id: 1, from_quantity: 1, to_meat_id: 1, to_quantity: 1 });
  assert.strictEqual(result.status, 400);
  assert.match(result.error, /must be different/);
});

test('a zero or negative quantity on either side is rejected', () => {
  const result1 = createConversion({ restaurant_id: 1, business_date: '2026-08-31', from_meat_id: 1, from_quantity: 0, to_meat_id: 4, to_quantity: 1 });
  assert.strictEqual(result1.status, 400);
  const result2 = createConversion({ restaurant_id: 1, business_date: '2026-08-31', from_meat_id: 1, from_quantity: 1, to_meat_id: 4, to_quantity: -3 });
  assert.strictEqual(result2.status, 400);
});

test('a to_meat_id belonging to a different restaurant is rejected', () => {
  const result = createConversion({ restaurant_id: 1, business_date: '2026-08-31', from_meat_id: 1, from_quantity: 1, to_meat_id: 3, to_quantity: 1 });
  assert.strictEqual(result.status, 400);
  assert.match(result.error, /to_meat_id/);
});

test('computeMeatAudit-facing sum: the source item nets out correctly after a conversion combined with other adjustments', () => {
  // Source item already has +3 from an earlier test this run at this
  // point in the file (2 + 1 from the two conversions above) plus
  // whatever wastage entries exist from earlier tests in this file -
  // isolate with a fresh date instead of trying to track a running total.
  createConversion({ restaurant_id: 1, business_date: '2026-09-01', from_meat_id: 1, from_quantity: 4, to_meat_id: 4, to_quantity: 4 });
  const fromSum = db.prepare(`SELECT SUM(quantity) as total FROM adjustments WHERE restaurant_id = 1 AND meat_id = 1 AND business_date = '2026-09-01'`).get().total;
  const toSum = db.prepare(`SELECT SUM(quantity) as total FROM adjustments WHERE restaurant_id = 1 AND meat_id = 4 AND business_date = '2026-09-01'`).get().total;
  assert.strictEqual(fromSum, 4, 'source item lost 4 units this date');
  assert.strictEqual(toSum, -4, 'target item gained 4 units this date (negative adjustment = expectedEnding increases)');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
