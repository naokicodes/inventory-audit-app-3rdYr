// API for the Commissary tab - the production side (raw-in/backed-out
// yield tracking), separate from Stock Receipts (the receiving side).
// See docs/commissary-and-stock-receipts.md Part 1.
//
// Step 6: every create/update/soft-delete here writes a matching
// activity_log row in the same transaction (rules-for-claude-code.md
// rule 9), via the shared withTransaction/logActivity helpers. No hard
// DELETE - "delete" means UPDATE ... SET deleted_at.

const express = require('express');
const db = require('../db/connection.js');
const { computeYieldRow } = require('../engines/commissaryYieldEngine.js');
const { computeCommissaryDailyAudit } = require('../engines/commissaryAuditEngine.js');
const { withTransaction, logActivity } = require('../db/activityLog.js');

const router = express.Router();

function getYieldLogRow(id) {
  return db.prepare('SELECT * FROM commissary_yield_log WHERE id = ?').get(id);
}

function getStockReceiptRow(id) {
  return db.prepare('SELECT * FROM stock_receipts WHERE id = ?').get(id);
}

function getShipmentWithLines(shipmentId) {
  const shipment = db.prepare('SELECT * FROM commissary_shipments WHERE id = ?').get(shipmentId);
  const lines = db.prepare('SELECT * FROM commissary_shipment_lines WHERE shipment_id = ?').all(shipmentId);
  return { ...shipment, lines };
}

// GET /api/commissary/meats
// Active commissary meats, for the yield-entry form's dropdown. Global
// list, independent of any restaurant's own meats table.
router.get('/commissary/meats', (req, res) => {
  const meats = db.prepare(
    `SELECT id, code, name, unit, allowed_leeway_pct, cost_per_unit
     FROM commissary_meats WHERE active = 1 ORDER BY code`
  ).all();
  res.json(meats);
});

// GET /api/commissary/yield-log?business_date=&commissary_meat_id=
// Filterable list, newest first, excluding soft-deleted rows. Each row
// includes the computed actual_loss_pct/status/excess_loss (never
// stored - see rules-for-claude-code.md rule 4).
router.get('/commissary/yield-log', (req, res) => {
  const { business_date, commissary_meat_id } = req.query;

  const clauses = ['cyl.deleted_at IS NULL'];
  const params = [];
  if (business_date) { clauses.push('cyl.business_date = ?'); params.push(business_date); }
  if (commissary_meat_id) { clauses.push('cyl.commissary_meat_id = ?'); params.push(Number(commissary_meat_id)); }

  const ids = db.prepare(`
    SELECT cyl.id
    FROM commissary_yield_log cyl
    WHERE ${clauses.join(' AND ')}
    ORDER BY cyl.created_at DESC, cyl.id DESC
  `).all(...params);

  const rows = ids.map(({ id }) => {
    const computed = computeYieldRow(db, id);
    const meat = db.prepare('SELECT code, name, unit FROM commissary_meats WHERE id = ?').get(computed.commissary_meat_id);
    return { ...computed, commissary_meat_code: meat.code, commissary_meat_name: meat.name, unit: meat.unit };
  });

  res.json(rows);
});

// GET /api/commissary/daily-audit?date=2026-08-25&commissary_meat_id=5
// Step 20b (session-status.md): Commissary's own audit engine exposed as a
// read route, mirroring GET /api/daily-audit's job for restaurants but
// with Commissary's two-inflow/shipment-usage shape (see
// commissaryAuditEngine.js). `date` is required. `commissary_meat_id` is
// an optional filter for a single meat/date lookup - same optional-filter
// convention GET /api/commissary/yield-log above already uses. Always
// returns an ARRAY, whether filtered to one commissary meat or listing
// every active one for the date - a consistent shape either way, rather
// than a single-object response when an id is given. Flagged for the
// architect conversation as a shape choice, not an obviously-only-correct
// one: session-status.md left "one meat/date at a time, or a mixed-grid
// -style list" as an open call.
router.get('/commissary/daily-audit', (req, res) => {
  const date = req.query.date;
  if (!date) {
    return res.status(400).json({ error: 'date is required' });
  }

  const commissaryMeatId = req.query.commissary_meat_id ? Number(req.query.commissary_meat_id) : null;
  const rows = computeCommissaryDailyAudit(db, date, commissaryMeatId);
  res.json(rows);
});

// POST /api/commissary/shipments
// Step 20c (session-status.md): logs one outbound batch from the
// Commissary to a destination restaurant, with its named-portion
// breakdown - one commissary_shipments row + N commissary_shipment_lines
// rows, in one transaction. See commissary-and-stock-receipts.md /
// data-model.md's step-20 draft for the shape.
//
// Body: {
//   commissary_meat_id, restaurant_id, business_date, total_quantity,
//   notes?, actor?,
//   lines: [ { meat_id, quantity }, ... ]   // meat_id = destination
//     restaurant's OWN meat row (e.g. FC's "Bagnet"), not a commissary meat
// }
//
// Each line ALSO writes a normal stock_receipts row for the destination
// restaurant (source='COMMISSARY', commissary_meat_id set) - this reuses
// the existing, already-tested destination-side mechanics unchanged (same
// table/columns POST /api/stock-receipts already writes for a normal
// COMMISSARY receipt). That stock_receipts write gets its own
// activity_log CREATE row in the same transaction, per rule 9 - the
// commissary_shipments/commissary_shipment_lines rows themselves are NOT
// activity_log-scoped (rule 9 names only stock_receipts and
// commissary_yield_log; commissary_shipment_lines is a new table, same
// treatment as commissary_stock_receipts got in step 20a).
//
// commissary_meat_map is NOT consulted here - per session-status.md's
// "commissary_meat_map's fate" resolution, the auditor picks the
// destination meat live in this form; the mapping table is vestigial
// once this route exists (not touched, not deleted - rule 3/7, that's a
// separate future decision).
//
// No reconciliation is enforced between total_quantity and the sum of
// line quantities - different units on each side (e.g. kg of a raw
// commissary meat vs. portion-units of a named output) make a strict
// equality check not generally meaningful. Purely informational if a
// caller wants to compute it; not computed or returned here.
router.post('/commissary/shipments', (req, res) => {
  const { commissary_meat_id, restaurant_id, business_date, total_quantity, notes, actor, lines } = req.body;

  if (!commissary_meat_id || !restaurant_id || !business_date
      || total_quantity === undefined || total_quantity === null || total_quantity === '') {
    return res.status(400).json({ error: 'commissary_meat_id, restaurant_id, business_date, and total_quantity are required' });
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'At least one output line is required' });
  }
  for (const line of lines) {
    if (!line || !line.meat_id || line.quantity === undefined || line.quantity === null || line.quantity === '') {
      return res.status(400).json({ error: 'Each line requires meat_id and quantity' });
    }
  }

  const commissaryMeat = db.prepare('SELECT id FROM commissary_meats WHERE id = ? AND active = 1').get(commissary_meat_id);
  if (!commissaryMeat) {
    return res.status(400).json({ error: 'Unknown or inactive commissary_meat_id' });
  }
  const restaurant = db.prepare('SELECT id FROM restaurants WHERE id = ? AND active = 1').get(restaurant_id);
  if (!restaurant) {
    return res.status(400).json({ error: 'Unknown or inactive restaurant_id' });
  }

  // Every line's meat_id must be one of THIS restaurant's own active meats
  // - checked up front, before the transaction starts, so a bad line fails
  // the whole request cleanly rather than partway through the writes.
  for (const line of lines) {
    const meat = db.prepare('SELECT id FROM meats WHERE id = ? AND restaurant_id = ? AND active = 1').get(line.meat_id, restaurant_id);
    if (!meat) {
      return res.status(400).json({ error: `meat_id ${line.meat_id} is not an active meat belonging to restaurant_id ${restaurant_id}` });
    }
  }

  try {
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

        // Reuses the exact same stock_receipts shape as a normal
        // COMMISSARY receipt (POST /api/stock-receipts) - destination-side
        // mechanics are unchanged, not reinvented here.
        const receiptResult = db.prepare(`
          INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source, commissary_meat_id, notes, created_by)
          VALUES (?, ?, ?, ?, 'COMMISSARY', ?, ?, ?)
        `).run(restaurant_id, line.meat_id, business_date, Number(line.quantity), commissary_meat_id, notes || null, actor || null);

        const after = getStockReceiptRow(receiptResult.lastInsertRowid);
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

    res.json({ ok: true, id: shipmentId, ...getShipmentWithLines(shipmentId) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save shipment: ' + err.message });
  }
});

// ---------- SHIPMENT PRESETS ("quick formulas") ----------
// Closes out step 20's commissary_shipment_presets piece, explicitly
// deferred by 20c (see session-status.md's step-20c entry). Tables
// already existed since step 20a. Settings-managed, occasional-use data
// (like meats/dishes/commissary-mappings in settings.js) rather than a
// daily transactional log - but scoped to commissary_shipments'
// neighborhood, so it lives here rather than in settings.js.
//
// Pure autofill: loading a preset on the shipment form never locks or
// validates against it (see commissary-shipments.html). Not in rule 9's
// activity_log scope - same treatment commissary_shipment_lines and
// commissary_stock_receipts already got.

function getPresetWithLines(presetId) {
  const preset = db.prepare('SELECT * FROM commissary_shipment_presets WHERE id = ?').get(presetId);
  if (!preset) return null;
  const lines = db.prepare('SELECT * FROM commissary_shipment_preset_lines WHERE preset_id = ?').all(presetId);
  return { ...preset, lines };
}

// GET /api/commissary/shipment-presets?commissary_meat_id=&restaurant_id=
// Active presets (+ their lines) for one (commissary_meat_id,
// restaurant_id) pair - the shipment form's "Load preset" dropdown only
// makes sense once both are picked, so both are required here.
router.get('/commissary/shipment-presets', (req, res) => {
  const commissaryMeatId = Number(req.query.commissary_meat_id);
  const restaurantId = Number(req.query.restaurant_id);
  if (!commissaryMeatId || !restaurantId) {
    return res.status(400).json({ error: 'commissary_meat_id and restaurant_id are required' });
  }

  const presetIds = db.prepare(`
    SELECT id FROM commissary_shipment_presets
    WHERE commissary_meat_id = ? AND restaurant_id = ? AND active = 1
    ORDER BY name
  `).all(commissaryMeatId, restaurantId);

  res.json(presetIds.map(({ id }) => getPresetWithLines(id)));
});

// POST /api/commissary/shipment-presets
// Body: { commissary_meat_id, restaurant_id, name, lines: [{ meat_id, default_quantity }, ...] }
// Admin creation of a new preset. Same up-front validation shape as
// POST /api/commissary/shipments (active commissary meat, active
// restaurant, every line's meat belongs to that restaurant and is
// active) so a preset can never point at something the shipment form
// itself wouldn't allow.
router.post('/commissary/shipment-presets', (req, res) => {
  const { commissary_meat_id, restaurant_id, name, lines } = req.body;

  if (!commissary_meat_id || !restaurant_id || !name) {
    return res.status(400).json({ error: 'commissary_meat_id, restaurant_id, and name are required' });
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'At least one preset line is required' });
  }
  for (const line of lines) {
    if (!line || !line.meat_id || line.default_quantity === undefined || line.default_quantity === null || line.default_quantity === '') {
      return res.status(400).json({ error: 'Each line requires meat_id and default_quantity' });
    }
  }

  const commissaryMeat = db.prepare('SELECT id FROM commissary_meats WHERE id = ? AND active = 1').get(commissary_meat_id);
  if (!commissaryMeat) {
    return res.status(400).json({ error: 'Unknown or inactive commissary_meat_id' });
  }
  const restaurant = db.prepare('SELECT id FROM restaurants WHERE id = ? AND active = 1').get(restaurant_id);
  if (!restaurant) {
    return res.status(400).json({ error: 'Unknown or inactive restaurant_id' });
  }
  for (const line of lines) {
    const meat = db.prepare('SELECT id FROM meats WHERE id = ? AND restaurant_id = ? AND active = 1').get(line.meat_id, restaurant_id);
    if (!meat) {
      return res.status(400).json({ error: `meat_id ${line.meat_id} is not an active meat belonging to restaurant_id ${restaurant_id}` });
    }
  }

  try {
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

    res.json({ ok: true, id: presetId, ...getPresetWithLines(presetId) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save preset: ' + err.message });
  }
});

// PUT /api/commissary/shipment-presets/:id
// Body: { name?, active?, lines? }
// Admin edit. commissary_meat_id/restaurant_id are not editable here - a
// different pair is a different preset (delete/deactivate + re-create),
// same reasoning as yield-log's "meat isn't editable" rule. `lines`, if
// given, fully replaces the existing set (delete-then-reinsert, same
// transaction) - there's no per-line active flag in the schema to
// version against, and this is settings data, not an audited log.
// Omitting `lines` leaves the existing lines untouched (e.g. a
// deactivate-only call).
router.put('/commissary/shipment-presets/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, active, lines } = req.body;

  const existing = db.prepare('SELECT * FROM commissary_shipment_presets WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Preset not found' });
  }

  if (lines !== undefined) {
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: 'At least one preset line is required' });
    }
    for (const line of lines) {
      if (!line || !line.meat_id || line.default_quantity === undefined || line.default_quantity === null || line.default_quantity === '') {
        return res.status(400).json({ error: 'Each line requires meat_id and default_quantity' });
      }
      const meat = db.prepare('SELECT id FROM meats WHERE id = ? AND restaurant_id = ? AND active = 1').get(line.meat_id, existing.restaurant_id);
      if (!meat) {
        return res.status(400).json({ error: `meat_id ${line.meat_id} is not an active meat belonging to restaurant_id ${existing.restaurant_id}` });
      }
    }
  }

  try {
    withTransaction(db, () => {
      db.prepare(`
        UPDATE commissary_shipment_presets SET name = ?, active = ? WHERE id = ?
      `).run(name !== undefined ? name : existing.name, active !== undefined ? (active ? 1 : 0) : existing.active, id);

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

    res.json({ ok: true, ...getPresetWithLines(id) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update preset: ' + err.message });
  }
});

// GET /api/commissary/conversion-standards?commissary_meat_id=&restaurant_id=
// Item 5 of the 2026-08-29 "Future considerations" list - see
// session-status.md's item 5 entry for the full reasoning. Deliberately
// NOT the same table as shipment_presets: a preset is a demand
// decision (the mix, can have several valid answers), a standard is a
// rate fact (the conversion efficiency, exactly one per pairing).
//
// Both params required, same reasoning as shipment-presets: the
// shipment form only wants this once both are picked. Returns every
// active standard for that pair (rarely more than a handful of output
// meats per commissary meat), so the form can compute implied input as
// the auditor types each line, without a request per line.
router.get('/commissary/conversion-standards', (req, res) => {
  const commissaryMeatId = Number(req.query.commissary_meat_id);
  const restaurantId = Number(req.query.restaurant_id);
  if (!commissaryMeatId || !restaurantId) {
    return res.status(400).json({ error: 'commissary_meat_id and restaurant_id are required' });
  }

  const rows = db.prepare(`
    SELECT cs.id, cs.commissary_meat_id, cs.restaurant_id, cs.meat_id,
           m.meat_code, m.name as meat_name, cs.ratio_per_unit, cs.notes, cs.active
    FROM commissary_conversion_standards cs
    JOIN meats m ON m.id = cs.meat_id
    WHERE cs.commissary_meat_id = ? AND cs.restaurant_id = ? AND cs.active = 1
    ORDER BY m.meat_code
  `).all(commissaryMeatId, restaurantId);

  res.json(rows);
});

// POST /api/commissary/conversion-standards
// Body: { commissary_meat_id, restaurant_id, meat_id, ratio_per_unit, notes? }
// Admin creation of one standard. Same up-front validation shape as
// shipment-presets. UNIQUE(commissary_meat_id, restaurant_id, meat_id)
// in the schema is the real guarantee of "exactly one per pairing" -
// this check is just a clearer error message before hitting it.
router.post('/commissary/conversion-standards', (req, res) => {
  const { commissary_meat_id, restaurant_id, meat_id, ratio_per_unit, notes } = req.body;

  if (!commissary_meat_id || !restaurant_id || !meat_id
      || ratio_per_unit === undefined || ratio_per_unit === null || ratio_per_unit === '') {
    return res.status(400).json({ error: 'commissary_meat_id, restaurant_id, meat_id, and ratio_per_unit are required' });
  }
  if (Number(ratio_per_unit) <= 0) {
    return res.status(400).json({ error: 'ratio_per_unit must be positive' });
  }

  const commissaryMeat = db.prepare('SELECT id FROM commissary_meats WHERE id = ? AND active = 1').get(commissary_meat_id);
  if (!commissaryMeat) return res.status(400).json({ error: 'Unknown or inactive commissary_meat_id' });

  const restaurant = db.prepare('SELECT id FROM restaurants WHERE id = ? AND active = 1').get(restaurant_id);
  if (!restaurant) return res.status(400).json({ error: 'Unknown or inactive restaurant_id' });

  const meat = db.prepare('SELECT id FROM meats WHERE id = ? AND restaurant_id = ? AND active = 1').get(meat_id, restaurant_id);
  if (!meat) return res.status(400).json({ error: `meat_id ${meat_id} is not an active meat belonging to restaurant_id ${restaurant_id}` });

  const existing = db.prepare(`
    SELECT id FROM commissary_conversion_standards
    WHERE commissary_meat_id = ? AND restaurant_id = ? AND meat_id = ?
  `).get(commissary_meat_id, restaurant_id, meat_id);
  if (existing) {
    return res.status(400).json({ error: 'A standard for this exact pairing already exists - edit it instead of creating another' });
  }

  const result = db.prepare(`
    INSERT INTO commissary_conversion_standards (commissary_meat_id, restaurant_id, meat_id, ratio_per_unit, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(commissary_meat_id, restaurant_id, meat_id, Number(ratio_per_unit), notes || null);

  res.json({ ok: true, id: result.lastInsertRowid });
});

// PUT /api/commissary/conversion-standards/:id
// Body: { ratio_per_unit?, notes?, active? }
// commissary_meat_id/restaurant_id/meat_id are not editable here - a
// different pairing is a different standard (deactivate + create a
// new one), same reasoning shipment-presets already uses for its own
// non-editable identifying fields.
router.put('/commissary/conversion-standards/:id', (req, res) => {
  const id = Number(req.params.id);
  const { ratio_per_unit, notes, active } = req.body;

  const existing = db.prepare('SELECT * FROM commissary_conversion_standards WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Conversion standard not found' });

  if (ratio_per_unit !== undefined && Number(ratio_per_unit) <= 0) {
    return res.status(400).json({ error: 'ratio_per_unit must be positive' });
  }

  db.prepare(`
    UPDATE commissary_conversion_standards SET ratio_per_unit = ?, notes = ?, active = ? WHERE id = ?
  `).run(
    ratio_per_unit !== undefined ? Number(ratio_per_unit) : existing.ratio_per_unit,
    notes !== undefined ? notes : existing.notes,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    id
  );

  res.json({ ok: true });
});

// POST /api/commissary/yield-log
// Body: { commissary_meat_id, business_date, raw_weight_in, backed_weight_out, notes, actor }
router.post('/commissary/yield-log', (req, res) => {
  const { commissary_meat_id, business_date, raw_weight_in, backed_weight_out, notes, actor } = req.body;

  if (!commissary_meat_id || !business_date || raw_weight_in === undefined || raw_weight_in === null || raw_weight_in === ''
      || backed_weight_out === undefined || backed_weight_out === null || backed_weight_out === '') {
    return res.status(400).json({ error: 'commissary_meat_id, business_date, raw_weight_in, and backed_weight_out are required' });
  }

  const meat = db.prepare('SELECT id FROM commissary_meats WHERE id = ?').get(commissary_meat_id);
  if (!meat) {
    return res.status(400).json({ error: 'Unknown commissary_meat_id' });
  }

  try {
    const id = withTransaction(db, () => {
      const result = db.prepare(`
        INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(commissary_meat_id, business_date, Number(raw_weight_in), Number(backed_weight_out), notes || null, actor || null);

      const after = getYieldLogRow(result.lastInsertRowid);
      logActivity(db, {
        actor: actor || null,
        entityType: 'commissary_yield_log',
        entityId: result.lastInsertRowid,
        action: 'CREATE',
        before: null,
        after,
        source: 'MANUAL'
      });
      return result.lastInsertRowid;
    });

    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save yield event: ' + err.message });
  }
});

// PATCH /api/commissary/yield-log/:id
// Body: { raw_weight_in?, backed_weight_out?, business_date?, notes?, actor }
// commissary_meat_id is not editable here - a different meat is a
// different event; delete + re-create instead.
router.patch('/commissary/yield-log/:id', (req, res) => {
  const id = Number(req.params.id);
  const { raw_weight_in, backed_weight_out, business_date, notes, actor } = req.body;

  const existing = getYieldLogRow(id);
  if (!existing || existing.deleted_at) {
    return res.status(404).json({ error: 'Yield log entry not found' });
  }

  const nextRawIn = raw_weight_in !== undefined && raw_weight_in !== null && raw_weight_in !== '' ? Number(raw_weight_in) : existing.raw_weight_in;
  const nextBackedOut = backed_weight_out !== undefined && backed_weight_out !== null && backed_weight_out !== '' ? Number(backed_weight_out) : existing.backed_weight_out;
  const nextDate = business_date || existing.business_date;
  const nextNotes = notes !== undefined ? (notes || null) : existing.notes;

  try {
    withTransaction(db, () => {
      db.prepare(`
        UPDATE commissary_yield_log SET raw_weight_in = ?, backed_weight_out = ?, business_date = ?, notes = ?
        WHERE id = ?
      `).run(nextRawIn, nextBackedOut, nextDate, nextNotes, id);

      const after = getYieldLogRow(id);
      logActivity(db, {
        actor: actor || null,
        entityType: 'commissary_yield_log',
        entityId: id,
        action: 'UPDATE',
        before: existing,
        after,
        source: 'MANUAL'
      });
    });

    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update yield event: ' + err.message });
  }
});

// DELETE /api/commissary/yield-log/:id
// Soft delete only - sets deleted_at, never a hard DELETE. Body may
// include { actor } for the activity log.
router.delete('/commissary/yield-log/:id', (req, res) => {
  const id = Number(req.params.id);
  const { actor } = req.body || {};

  const existing = getYieldLogRow(id);
  if (!existing || existing.deleted_at) {
    return res.status(404).json({ error: 'Yield log entry not found' });
  }

  try {
    withTransaction(db, () => {
      db.prepare(`UPDATE commissary_yield_log SET deleted_at = datetime('now') WHERE id = ?`).run(id);
      logActivity(db, {
        actor: actor || null,
        entityType: 'commissary_yield_log',
        entityId: id,
        action: 'DELETE',
        before: existing,
        after: null,
        source: 'MANUAL'
      });
    });

    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete yield event: ' + err.message });
  }
});

module.exports = router;
