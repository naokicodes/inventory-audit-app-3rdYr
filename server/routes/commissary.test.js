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
db.prepare(`INSERT INTO commissaries (id, code, name) VALUES (1, 'COM-A', 'Commissary A')`).run();
// Step 23b-iv: a second commissary, for the commissary_id filter tests -
// its own separately-catalogued meat, not reused from Commissary A's.
db.prepare(`INSERT INTO commissaries (id, code, name) VALUES (2, 'COM-B', 'Commissary B')`).run();
db.prepare(`INSERT INTO meat_types (id, name) VALUES (1, 'Jowl')`).run();
db.prepare(`INSERT INTO meat_types (id, name, active) VALUES (2, 'Retired Type', 0)`).run();
db.prepare(`INSERT INTO commissary_meats (id, commissary_id, code, name, unit, allowed_leeway_pct, meat_type_id) VALUES (1, 1, 'CM01', 'Jowl', 'kg', 0.2, 1)`).run();
db.prepare(`INSERT INTO commissary_meats (id, commissary_id, code, name, unit, allowed_leeway_pct, active) VALUES (2, 1, 'CM02', 'Retired Meat', 'kg', 0.2, 0)`).run();
db.prepare(`INSERT INTO commissary_meats (id, commissary_id, code, name, unit, allowed_leeway_pct) VALUES (3, 2, 'CM01', 'Beef Cut', 'kg', 0.2)`).run();

// Mirrors GET /api/commissary/meats (step 23b-iv: optional commissary_id filter)
function listCommissaryMeats({ commissary_id } = {}) {
  const clauses = ['active = 1'];
  const params = [];
  if (commissary_id) { clauses.push('commissary_id = ?'); params.push(Number(commissary_id)); }
  return db.prepare(
    `SELECT id, code, name, unit, allowed_leeway_pct, cost_per_unit, meat_type_id
     FROM commissary_meats WHERE ${clauses.join(' AND ')} ORDER BY code`
  ).all(...params);
}

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

// ---- shipment presets ("quick formulas") tests ----
// Mirrors GET/POST/PUT /api/commissary/shipment-presets - closes out
// step 20's deferred piece. Same mirrored-logic approach as the
// shipment tests above.

function getPresetWithLines(presetId) {
  const preset = db.prepare('SELECT * FROM commissary_shipment_presets WHERE id = ?').get(presetId);
  if (!preset) return null;
  const lines = db.prepare('SELECT * FROM commissary_shipment_preset_lines WHERE preset_id = ?').all(presetId);
  return { ...preset, lines };
}

function listPresetsForPair(commissary_meat_id, restaurant_id) {
  if (!commissary_meat_id || !restaurant_id) {
    return { status: 400, error: 'commissary_meat_id and restaurant_id are required' };
  }
  const ids = db.prepare(`
    SELECT id FROM commissary_shipment_presets
    WHERE commissary_meat_id = ? AND restaurant_id = ? AND active = 1
    ORDER BY name
  `).all(commissary_meat_id, restaurant_id);
  return { status: 200, presets: ids.map(({ id }) => getPresetWithLines(id)) };
}

// Mirrors POST /api/commissary/shipment-presets
function createPreset({ commissary_meat_id, restaurant_id, name, lines }) {
  if (!commissary_meat_id || !restaurant_id || !name) {
    return { status: 400, error: 'commissary_meat_id, restaurant_id, and name are required' };
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return { status: 400, error: 'At least one preset line is required' };
  }
  for (const line of lines) {
    if (!line || !line.meat_id || line.default_quantity === undefined || line.default_quantity === null || line.default_quantity === '') {
      return { status: 400, error: 'Each line requires meat_id and default_quantity' };
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

  const presetId = withTransaction(db, () => {
    const result = db.prepare(`
      INSERT INTO commissary_shipment_presets (commissary_meat_id, restaurant_id, name)
      VALUES (?, ?, ?)
    `).run(commissary_meat_id, restaurant_id, name);
    const newPresetId = result.lastInsertRowid;
    for (const line of lines) {
      db.prepare(`
        INSERT INTO commissary_shipment_preset_lines (preset_id, meat_id, default_quantity)
        VALUES (?, ?, ?)
      `).run(newPresetId, line.meat_id, Number(line.default_quantity));
    }
    return newPresetId;
  });

  return { status: 200, id: presetId };
}

// Mirrors PUT /api/commissary/shipment-presets/:id
function updatePreset(id, { name, active, lines }) {
  const existing = db.prepare('SELECT * FROM commissary_shipment_presets WHERE id = ?').get(id);
  if (!existing) return { status: 404, error: 'Preset not found' };

  if (lines !== undefined) {
    if (!Array.isArray(lines) || lines.length === 0) {
      return { status: 400, error: 'At least one preset line is required' };
    }
    for (const line of lines) {
      if (!line || !line.meat_id || line.default_quantity === undefined || line.default_quantity === null || line.default_quantity === '') {
        return { status: 400, error: 'Each line requires meat_id and default_quantity' };
      }
      const meat = db.prepare('SELECT id FROM meats WHERE id = ? AND restaurant_id = ? AND active = 1').get(line.meat_id, existing.restaurant_id);
      if (!meat) return { status: 400, error: `meat_id ${line.meat_id} is not an active meat belonging to restaurant_id ${existing.restaurant_id}` };
    }
  }

  withTransaction(db, () => {
    db.prepare(`UPDATE commissary_shipment_presets SET name = ?, active = ? WHERE id = ?`)
      .run(name !== undefined ? name : existing.name, active !== undefined ? (active ? 1 : 0) : existing.active, id);
    if (lines !== undefined) {
      db.prepare('DELETE FROM commissary_shipment_preset_lines WHERE preset_id = ?').run(id);
      for (const line of lines) {
        db.prepare(`
          INSERT INTO commissary_shipment_preset_lines (preset_id, meat_id, default_quantity)
          VALUES (?, ?, ?)
        `).run(id, line.meat_id, Number(line.default_quantity));
      }
    }
  });

  return { status: 200 };
}

test('preset list requires both commissary_meat_id and restaurant_id', () => {
  const r = listPresetsForPair(null, 1);
  assert.strictEqual(r.status, 400);
});

test('preset list for a pair with no presets returns an empty array', () => {
  const r = listPresetsForPair(1, 1);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.presets, []);
});

test('creating a preset with missing name is rejected', () => {
  const r = createPreset({ commissary_meat_id: 1, restaurant_id: 1, lines: [{ meat_id: 1, default_quantity: 3 }] });
  assert.strictEqual(r.status, 400);
});

test('creating a preset with no lines is rejected', () => {
  const r = createPreset({ commissary_meat_id: 1, restaurant_id: 1, name: 'Standard split', lines: [] });
  assert.strictEqual(r.status, 400);
});

test('creating a preset for an inactive commissary meat is rejected', () => {
  const r = createPreset({ commissary_meat_id: 2, restaurant_id: 1, name: 'Bad', lines: [{ meat_id: 1, default_quantity: 3 }] });
  assert.strictEqual(r.status, 400);
});

test('creating a preset with a line meat from a different restaurant is rejected', () => {
  const r = createPreset({ commissary_meat_id: 1, restaurant_id: 1, name: 'Bad', lines: [{ meat_id: 4, default_quantity: 3 }] });
  assert.strictEqual(r.status, 400);
});

let presetId;
test('a valid preset with two lines is created', () => {
  const r = createPreset({
    commissary_meat_id: 1, restaurant_id: 1, name: 'Standard Jowl split',
    lines: [{ meat_id: 1, default_quantity: 4 }, { meat_id: 2, default_quantity: 5 }]
  });
  assert.strictEqual(r.status, 200);
  presetId = r.id;
});

test('the preset and both lines were written, and active defaults to 1', () => {
  const preset = getPresetWithLines(presetId);
  assert.strictEqual(preset.commissary_meat_id, 1);
  assert.strictEqual(preset.restaurant_id, 1);
  assert.strictEqual(preset.active, 1);
  assert.strictEqual(preset.lines.length, 2);
});

test('the list route now returns this preset for its exact (commissary_meat_id, restaurant_id) pair', () => {
  const r = listPresetsForPair(1, 1);
  assert.strictEqual(r.presets.length, 1);
  assert.strictEqual(r.presets[0].id, presetId);
});

test('the list route returns nothing for a different pair', () => {
  const r = listPresetsForPair(1, 2);
  assert.strictEqual(r.presets.length, 0);
});

test('editing a nonexistent preset is rejected', () => {
  const r = updatePreset(999, { name: 'x' });
  assert.strictEqual(r.status, 404);
});

test('editing just the name leaves lines untouched', () => {
  const r = updatePreset(presetId, { name: 'Renamed split' });
  assert.strictEqual(r.status, 200);
  const preset = getPresetWithLines(presetId);
  assert.strictEqual(preset.name, 'Renamed split');
  assert.strictEqual(preset.lines.length, 2);
});

test('editing lines fully replaces the old set', () => {
  const r = updatePreset(presetId, { lines: [{ meat_id: 1, default_quantity: 7 }] });
  assert.strictEqual(r.status, 200);
  const preset = getPresetWithLines(presetId);
  assert.strictEqual(preset.lines.length, 1);
  assert.strictEqual(preset.lines[0].default_quantity, 7);
});

test('editing lines with an inactive meat is rejected and leaves the old lines intact', () => {
  const before = getPresetWithLines(presetId).lines.length;
  const r = updatePreset(presetId, { lines: [{ meat_id: 3, default_quantity: 1 }] });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(getPresetWithLines(presetId).lines.length, before);
});

test('deactivating a preset (active: false) removes it from the pair listing', () => {
  const r = updatePreset(presetId, { active: false });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(getPresetWithLines(presetId).active, 0);
  const list = listPresetsForPair(1, 1);
  assert.strictEqual(list.presets.length, 0);
});

test('deactivated presets are excluded from the pair listing but a NEW active preset for the same pair still shows', () => {
  const r2 = createPreset({
    commissary_meat_id: 1, restaurant_id: 1, name: 'Second formula',
    lines: [{ meat_id: 2, default_quantity: 2 }]
  });
  assert.strictEqual(r2.status, 200);
  const list = listPresetsForPair(1, 1);
  assert.strictEqual(list.presets.length, 1);
  assert.strictEqual(list.presets[0].id, r2.id);
});

// ---- Mirrors GET/POST/PUT /api/commissary/conversion-standards - item
// 5 of the 2026-08-29 "Future considerations" list. See
// session-status.md's item 5 entry for the full design reasoning.
//
// Step 23b (2026-08-31): the table is now keyed by meat_type_id, not
// commissary_meat_id. listStandardsForPair keeps its PUBLIC signature
// (commissaryMeatId, restaurantId) - same as the real GET route - and
// resolves internally via that meat's tag. createStandard/updateStandard
// mirror POST/PUT, whose own contracts did change (POST now takes
// meat_type_id directly).

function listStandardsForPair(commissaryMeatId, restaurantId) {
  if (!commissaryMeatId || !restaurantId) {
    return { status: 400, error: 'commissary_meat_id and restaurant_id are required' };
  }
  const commissaryMeat = db.prepare('SELECT meat_type_id FROM commissary_meats WHERE id = ?').get(commissaryMeatId);
  if (!commissaryMeat || commissaryMeat.meat_type_id === null) {
    return { status: 200, rows: [] };
  }
  const rows = db.prepare(`
    SELECT cs.id, cs.meat_type_id, cs.restaurant_id, cs.meat_id,
           m.meat_code, m.name as meat_name, cs.ratio_per_unit, cs.notes, cs.active
    FROM commissary_conversion_standards cs
    JOIN meats m ON m.id = cs.meat_id
    WHERE cs.meat_type_id = ? AND cs.restaurant_id = ? AND cs.active = 1
    ORDER BY m.meat_code
  `).all(commissaryMeat.meat_type_id, restaurantId);
  return { status: 200, rows };
}

function createStandard({ meat_type_id, restaurant_id, meat_id, ratio_per_unit, notes }) {
  if (!meat_type_id || !restaurant_id || !meat_id
      || ratio_per_unit === undefined || ratio_per_unit === null || ratio_per_unit === '') {
    return { status: 400, error: 'meat_type_id, restaurant_id, meat_id, and ratio_per_unit are required' };
  }
  if (Number(ratio_per_unit) <= 0) {
    return { status: 400, error: 'ratio_per_unit must be positive' };
  }
  const meatType = db.prepare('SELECT id FROM meat_types WHERE id = ? AND active = 1').get(meat_type_id);
  if (!meatType) return { status: 400, error: 'Unknown or inactive meat_type_id' };
  const restaurant = db.prepare('SELECT id FROM restaurants WHERE id = ? AND active = 1').get(restaurant_id);
  if (!restaurant) return { status: 400, error: 'Unknown or inactive restaurant_id' };
  const meat = db.prepare('SELECT id FROM meats WHERE id = ? AND restaurant_id = ? AND active = 1').get(meat_id, restaurant_id);
  if (!meat) return { status: 400, error: `meat_id ${meat_id} is not an active meat belonging to restaurant_id ${restaurant_id}` };
  const existing = db.prepare(`
    SELECT id FROM commissary_conversion_standards WHERE meat_type_id = ? AND restaurant_id = ? AND meat_id = ?
  `).get(meat_type_id, restaurant_id, meat_id);
  if (existing) return { status: 400, error: 'A standard for this exact pairing already exists - edit it instead of creating another' };

  const result = db.prepare(`
    INSERT INTO commissary_conversion_standards (meat_type_id, restaurant_id, meat_id, ratio_per_unit, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(meat_type_id, restaurant_id, meat_id, Number(ratio_per_unit), notes || null);
  return { status: 200, ok: true, id: result.lastInsertRowid };
}

function updateStandard(id, { ratio_per_unit, notes, active }) {
  const existing = db.prepare('SELECT * FROM commissary_conversion_standards WHERE id = ?').get(id);
  if (!existing) return { status: 404, error: 'Conversion standard not found' };
  if (ratio_per_unit !== undefined && Number(ratio_per_unit) <= 0) {
    return { status: 400, error: 'ratio_per_unit must be positive' };
  }
  db.prepare(`UPDATE commissary_conversion_standards SET ratio_per_unit = ?, notes = ?, active = ? WHERE id = ?`).run(
    ratio_per_unit !== undefined ? Number(ratio_per_unit) : existing.ratio_per_unit,
    notes !== undefined ? notes : existing.notes,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    id
  );
  return { status: 200, ok: true };
}

test('standards list requires both commissary_meat_id and restaurant_id', () => {
  const r = listStandardsForPair(null, 1);
  assert.strictEqual(r.status, 400);
});

test('standards list for a pair with none returns an empty array', () => {
  const r = listStandardsForPair(1, 2);
  assert.deepStrictEqual(r.rows, []);
});

test('creating a standard with missing ratio_per_unit is rejected', () => {
  const r = createStandard({ meat_type_id: 1, restaurant_id: 1, meat_id: 1 });
  assert.strictEqual(r.status, 400);
});

test('a zero or negative ratio_per_unit is rejected', () => {
  const r1 = createStandard({ meat_type_id: 1, restaurant_id: 1, meat_id: 1, ratio_per_unit: 0 });
  assert.strictEqual(r1.status, 400);
  const r2 = createStandard({ meat_type_id: 1, restaurant_id: 1, meat_id: 1, ratio_per_unit: -0.3 });
  assert.strictEqual(r2.status, 400);
});

test('creating a standard for an inactive meat_type is rejected', () => {
  const r = createStandard({ meat_type_id: 2, restaurant_id: 1, meat_id: 1, ratio_per_unit: 0.3 });
  assert.strictEqual(r.status, 400);
  assert.match(r.error, /meat_type_id/);
});

test('creating a standard with a meat from a different restaurant is rejected', () => {
  const r = createStandard({ meat_type_id: 1, restaurant_id: 1, meat_id: 4, ratio_per_unit: 0.3 });
  assert.strictEqual(r.status, 400);
  assert.match(r.error, /not an active meat belonging to restaurant_id/);
});

test('a valid standard is created - the real Jowl-to-Bagnet example, 0.3 units per kg', () => {
  const r = createStandard({ meat_type_id: 1, restaurant_id: 1, meat_id: 1, ratio_per_unit: 0.3, notes: 'from contractor spec' });
  assert.strictEqual(r.ok, true);
  const row = db.prepare('SELECT * FROM commissary_conversion_standards WHERE id = ?').get(r.id);
  assert.strictEqual(row.ratio_per_unit, 0.3);
  assert.strictEqual(row.active, 1, 'active defaults to 1');
});

test('creating a second standard for the exact same pairing is rejected', () => {
  const r = createStandard({ meat_type_id: 1, restaurant_id: 1, meat_id: 1, ratio_per_unit: 0.5 });
  assert.strictEqual(r.status, 400);
  assert.match(r.error, /already exists/);
});

test('a standard for a different meat under the same meat type/restaurant is a separate, valid row', () => {
  const r = createStandard({ meat_type_id: 1, restaurant_id: 1, meat_id: 2, ratio_per_unit: 0.25 });
  assert.strictEqual(r.ok, true);
});

test('the list route now returns both standards for this pair, ordered by meat_code', () => {
  const r = listStandardsForPair(1, 1);
  assert.strictEqual(r.rows.length, 2);
  assert.strictEqual(r.rows[0].meat_code, 'M01');
  assert.strictEqual(r.rows[1].meat_code, 'M02');
});

test('editing a nonexistent standard is rejected', () => {
  const r = updateStandard(9999, { ratio_per_unit: 0.4 });
  assert.strictEqual(r.status, 404);
});

test('editing ratio_per_unit to zero is rejected, existing value untouched', () => {
  const existingId = db.prepare(`
    SELECT id FROM commissary_conversion_standards WHERE meat_type_id = 1 AND restaurant_id = 1 AND meat_id = 1
  `).get().id;
  const r = updateStandard(existingId, { ratio_per_unit: 0 });
  assert.strictEqual(r.status, 400);
  const row = db.prepare('SELECT * FROM commissary_conversion_standards WHERE id = ?').get(existingId);
  assert.strictEqual(row.ratio_per_unit, 0.3, 'the bad edit must not have taken effect - still the original 0.3');
});

test('deactivating a standard removes it from the pair listing', () => {
  const before = listStandardsForPair(1, 1);
  const targetId = before.rows[0].id;
  const r = updateStandard(targetId, { active: false });
  assert.strictEqual(r.status, 200);
  const after = listStandardsForPair(1, 1);
  assert.strictEqual(after.rows.length, before.rows.length - 1);
});

test('the implied-input math this feature exists for: ratio_per_unit correctly inverts to an implied input amount', () => {
  // The real point of this table: given a shipment line's OUTPUT
  // quantity and the pairing's ratio (output units per unit of input),
  // the form should be able to compute the IMPLIED input. This is a
  // pure arithmetic check on the stored number, not a new endpoint -
  // the division happens client-side per session-status.md's item 5
  // ("live on the shipment form"), this just confirms the stored ratio
  // supports it correctly for the real Jowl->Bagnet example.
  const row = db.prepare(`
    SELECT ratio_per_unit FROM commissary_conversion_standards WHERE meat_type_id = 1 AND restaurant_id = 1 AND meat_id = 2
  `).get();
  const outputQuantity = 3; // e.g. 3 Sisig units on a shipment line
  const impliedInputKg = outputQuantity / row.ratio_per_unit;
  assert.strictEqual(row.ratio_per_unit, 0.25);
  assert.strictEqual(impliedInputKg, 12, '3 units at 0.25 units/kg implies 12kg of input');
});

console.log('\nCommissary Route Tests (GET /commissary/meats: step 23b-iv optional commissary_id filter)\n');

test('omitted commissary_id returns every active meat across every commissary, exactly as before', () => {
  const rows = listCommissaryMeats();
  // CM01 (Commissary A, id 1) + CM01 (Commissary B, id 3) - CM02 (id 2) is inactive, correctly excluded.
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(rows.map(r => r.id).sort(), [1, 3]);
});

test('a commissary_id filters to only that commissary\'s meats', () => {
  const rows = listCommissaryMeats({ commissary_id: 1 });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].id, 1);
  assert.strictEqual(rows[0].meat_type_id, 1, 'meat_type_id (added by 23c-i-b) must still be present in the filtered response');
});

test('a second commissary\'s meats are excluded when filtering to the first', () => {
  const rows = listCommissaryMeats({ commissary_id: 1 });
  assert.ok(!rows.some(r => r.id === 3), 'Commissary B\'s meat must not appear when filtering to Commissary A');
});

test('filtering to the second commissary returns only its own meat', () => {
  const rows = listCommissaryMeats({ commissary_id: 2 });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].id, 3);
  assert.strictEqual(rows[0].code, 'CM01', 'same code as Commissary A\'s own CM01 - codes are unique per commissary, not globally');
});

test('an unknown commissary_id returns an empty array, not an error', () => {
  const rows = listCommissaryMeats({ commissary_id: 9999 });
  assert.deepStrictEqual(rows, []);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
