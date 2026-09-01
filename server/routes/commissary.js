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

// GET /api/commissary/meats?commissary_id=
// Active commissary meats, for the yield-entry form's dropdown. Global
// list (every commissary's meats) when commissary_id is omitted -
// six live pages call this with no param today (commissary.html,
// commissary-shipments.html, terminal.html, stock-receipts.html, and
// settings.html's Shipment Presets and Conversion Standards sections)
// and must keep working unchanged. commissary_id is an OPTIONAL filter,
// not required - deliberately NOT the GET /api/settings/meats convention
// (which requires restaurant_id), same optional-filter convention
// GET /commissary/yield-log and GET /commissary/daily-audit above
// already use. Step 23b-iv (2026-08-31): added the filter itself; no
// page passes it yet - that's 23c-ii's job, landing the commissary
// selector on each consuming page incrementally.
// Step 23c-i-b (2026-08-31): meat_type_id added to the SELECT, purely
// additive, so settings.html's Conversion Standards section can resolve
// a selected commissary meat to its meat_type_id (POST
// /commissary/conversion-standards is keyed by meat_type_id, not
// commissary_meat_id).
// Step 23c-ii-c (2026-09-01): commissary_id + the joined commissary's own
// code/name added, purely additive - lets a consumer disambiguate two
// commissaries' meats sharing the same code (see commissary.html and
// stock-receipts.html's label fixes). Joined columns are aliased
// commissary_code/commissary_name (matches dashboard.js's convention)
// since the meat's own code/name are already in this SELECT unaliased.
// LEFT JOIN, not INNER - SQLite doesn't enforce FKs unless
// PRAGMA foreign_keys=ON, so a dangling commissary_id is reachable; an
// INNER JOIN would silently drop that meat from all six consumers
// instead of just showing a null commissary_code/commissary_name.
router.get('/commissary/meats', (req, res) => {
  const { commissary_id } = req.query;

  const clauses = ['cm.active = 1'];
  const params = [];
  if (commissary_id) { clauses.push('cm.commissary_id = ?'); params.push(Number(commissary_id)); }

  const meats = db.prepare(
    `SELECT cm.id, cm.code, cm.name, cm.unit, cm.allowed_leeway_pct, cm.cost_per_unit, cm.meat_type_id,
            cm.commissary_id, c.code as commissary_code, c.name as commissary_name
     FROM commissary_meats cm
     LEFT JOIN commissaries c ON c.id = cm.commissary_id
     WHERE ${clauses.join(' AND ')} ORDER BY cm.code`
  ).all(...params);
  res.json(meats);
});

// GET /api/commissary/yield-log?business_date=&commissary_meat_id=&commissary_id=
// Filterable list, newest first, excluding soft-deleted rows. Each row
// includes the computed actual_loss_pct/status/excess_loss (never
// stored - see rules-for-claude-code.md rule 4).
// Step 23b-v (2026-08-31): commissary_id added as a third, independent
// optional filter. commissary_yield_log has no commissary_id column of
// its own - the commissary lives on the joined commissary_meats row - so
// this always joins to it rather than assuming a column that isn't there.
router.get('/commissary/yield-log', (req, res) => {
  const { business_date, commissary_meat_id, commissary_id } = req.query;

  const clauses = ['cyl.deleted_at IS NULL'];
  const params = [];
  if (business_date) { clauses.push('cyl.business_date = ?'); params.push(business_date); }
  if (commissary_meat_id) { clauses.push('cyl.commissary_meat_id = ?'); params.push(Number(commissary_meat_id)); }
  if (commissary_id) { clauses.push('cm.commissary_id = ?'); params.push(Number(commissary_id)); }

  const ids = db.prepare(`
    SELECT cyl.id
    FROM commissary_yield_log cyl
    JOIN commissary_meats cm ON cm.id = cyl.commissary_meat_id
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

// GET /api/commissary/daily-audit?date=2026-08-25&commissary_meat_id=5&commissary_id=
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
// Step 23b-v (2026-08-31): commissary_id added as a second, independent
// optional filter (same optional-param convention as 23b-iv's GET
// /commissary/meats) - restricts the meats listed to one commissary. No
// page passes it yet; that's 23c-ii's job.
router.get('/commissary/daily-audit', (req, res) => {
  const date = req.query.date;
  if (!date) {
    return res.status(400).json({ error: 'date is required' });
  }

  const commissaryMeatId = req.query.commissary_meat_id ? Number(req.query.commissary_meat_id) : null;
  const commissaryId = req.query.commissary_id ? Number(req.query.commissary_id) : null;
  const rows = computeCommissaryDailyAudit(db, date, commissaryMeatId, commissaryId);
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
// Step 23b (2026-08-31): the table itself is now keyed by meat_type_id,
// not commissary_meat_id (see data-model.md section 10b), but this GET's
// PUBLIC contract is deliberately unchanged - callers (the Shipment form)
// still only know which specific commissary_meat they're shipping, not
// its meat_type. Resolved internally: look up that meat's meat_type_id,
// then join standards through it. An untagged commissary meat (no
// meat_type_id) has no possible standards - returns [], same as an
// unknown commissary_meat_id always did, not an error (raw/dynamic
// meats are unaffected, per design).
router.get('/commissary/conversion-standards', (req, res) => {
  const commissaryMeatId = Number(req.query.commissary_meat_id);
  const restaurantId = Number(req.query.restaurant_id);
  if (!commissaryMeatId || !restaurantId) {
    return res.status(400).json({ error: 'commissary_meat_id and restaurant_id are required' });
  }

  const commissaryMeat = db.prepare('SELECT meat_type_id FROM commissary_meats WHERE id = ?').get(commissaryMeatId);
  if (!commissaryMeat || commissaryMeat.meat_type_id === null) {
    return res.json([]);
  }

  const rows = db.prepare(`
    SELECT cs.id, cs.meat_type_id, cs.restaurant_id, cs.meat_id,
           m.meat_code, m.name as meat_name, cs.ratio_per_unit, cs.notes, cs.active
    FROM commissary_conversion_standards cs
    JOIN meats m ON m.id = cs.meat_id
    WHERE cs.meat_type_id = ? AND cs.restaurant_id = ? AND cs.active = 1
    ORDER BY m.meat_code
  `).all(commissaryMeat.meat_type_id, restaurantId);

  res.json(rows);
});

// POST /api/commissary/conversion-standards
// Body: { meat_type_id, restaurant_id, meat_id, ratio_per_unit, notes? }
// Admin creation of one standard. Step 23b (2026-08-31): keyed by
// meat_type_id now, not commissary_meat_id - a Standard applies to
// everything tagged with that type, across every commissary, not one
// specific commissary's catalog row. Same up-front validation shape as
// shipment-presets. UNIQUE(meat_type_id, restaurant_id, meat_id) in the
// schema is the real guarantee of "exactly one per pairing" - this check
// is just a clearer error message before hitting it.
//
// KNOWN GAP, flagged not fixed here (23c's job): settings.html's "Create
// Standard" admin form still posts commissary_meat_id - it will fail this
// route's validation until 23c adds a meat-type-aware picker. GET (above)
// and PUT (below) are unaffected since their own contracts didn't change.
router.post('/commissary/conversion-standards', (req, res) => {
  const { meat_type_id, restaurant_id, meat_id, ratio_per_unit, notes } = req.body;

  if (!meat_type_id || !restaurant_id || !meat_id
      || ratio_per_unit === undefined || ratio_per_unit === null || ratio_per_unit === '') {
    return res.status(400).json({ error: 'meat_type_id, restaurant_id, meat_id, and ratio_per_unit are required' });
  }
  if (Number(ratio_per_unit) <= 0) {
    return res.status(400).json({ error: 'ratio_per_unit must be positive' });
  }

  const meatType = db.prepare('SELECT id FROM meat_types WHERE id = ? AND active = 1').get(meat_type_id);
  if (!meatType) return res.status(400).json({ error: 'Unknown or inactive meat_type_id' });

  const restaurant = db.prepare('SELECT id FROM restaurants WHERE id = ? AND active = 1').get(restaurant_id);
  if (!restaurant) return res.status(400).json({ error: 'Unknown or inactive restaurant_id' });

  const meat = db.prepare('SELECT id FROM meats WHERE id = ? AND restaurant_id = ? AND active = 1').get(meat_id, restaurant_id);
  if (!meat) return res.status(400).json({ error: `meat_id ${meat_id} is not an active meat belonging to restaurant_id ${restaurant_id}` });

  const existing = db.prepare(`
    SELECT id FROM commissary_conversion_standards
    WHERE meat_type_id = ? AND restaurant_id = ? AND meat_id = ?
  `).get(meat_type_id, restaurant_id, meat_id);
  if (existing) {
    return res.status(400).json({ error: 'A standard for this exact pairing already exists - edit it instead of creating another' });
  }

  const result = db.prepare(`
    INSERT INTO commissary_conversion_standards (meat_type_id, restaurant_id, meat_id, ratio_per_unit, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(meat_type_id, restaurant_id, meat_id, Number(ratio_per_unit), notes || null);

  res.json({ ok: true, id: result.lastInsertRowid });
});

// PUT /api/commissary/conversion-standards/:id
// Body: { ratio_per_unit?, notes?, active? }
// meat_type_id/restaurant_id/meat_id are not editable here - a
// different pairing is a different standard (deactivate + create a
// new one), same reasoning shipment-presets already uses for its own
// non-editable identifying fields. Unaffected by step 23b's rekey -
// this route never touched the key fields either way.
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

// ---------- ADJUSTMENTS (LOSS / ALLOCATION) ----------
// Step 24b-iii: HTTP surface on top of the commissary_adjustments table
// (data-model.md section 10b, landed by 24b-ii in commit 837c3ab, along with
// its two balance effects in commissaryAuditEngine.js). Not activity_log
// scoped - rule 9 names only stock_receipts/commissary_yield_log;
// commissary_adjustments gets the restaurant adjustments table's treatment
// (soft delete via deleted_at, nothing more), same as commissary_shipment_lines.

function getAdjustmentRow(id) {
  return db.prepare('SELECT * FROM commissary_adjustments WHERE id = ?').get(id);
}

// ALLOCATION's destination must share the source meat's meat_type_id AND its
// unit (session-status.md's 24b-iii bullet) - this is what keeps every
// allocation 1-for-1, so the yield log stays the only place a unit ever
// changes. destMeat.meat_type_id === null would make this pass by accident
// (null === null in JS) if sourceMeat were also untagged - guarded explicitly.
function isValidDestination(sourceMeat, destMeat) {
  return !!destMeat && destMeat.meat_type_id !== null
    && destMeat.meat_type_id === sourceMeat.meat_type_id
    && destMeat.unit === sourceMeat.unit;
}

// GET /api/commissary/adjustments?business_date=&commissary_meat_id=&commissary_id=&kind=
// Filterable list, newest first, excluding soft-deleted rows. Same optional-
// filter convention as GET /commissary/yield-log above, including the join
// to commissary_meats for the commissary_id filter (the row itself has no
// commissary_id column).
router.get('/commissary/adjustments', (req, res) => {
  const { business_date, commissary_meat_id, commissary_id, kind } = req.query;

  const clauses = ['ca.deleted_at IS NULL'];
  const params = [];
  if (business_date) { clauses.push('ca.business_date = ?'); params.push(business_date); }
  if (commissary_meat_id) { clauses.push('ca.commissary_meat_id = ?'); params.push(Number(commissary_meat_id)); }
  if (commissary_id) { clauses.push('cm.commissary_id = ?'); params.push(Number(commissary_id)); }
  if (kind) { clauses.push('ca.kind = ?'); params.push(kind); }

  const rows = db.prepare(`
    SELECT ca.*, cm.code as commissary_meat_code, cm.name as commissary_meat_name, cm.unit,
           dcm.code as destination_code, dcm.name as destination_name
    FROM commissary_adjustments ca
    JOIN commissary_meats cm ON cm.id = ca.commissary_meat_id
    LEFT JOIN commissary_meats dcm ON dcm.id = ca.destination_commissary_meat_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY ca.created_at DESC, ca.id DESC
  `).all(...params);

  res.json(rows);
});

// GET /api/commissary/adjustments/destinations?commissary_meat_id=
// The natural shape for 24c's Allocate form: valid destinations for one
// source meat, i.e. every OTHER active commissary meat sharing its
// meat_type_id and unit. An untagged source (no meat_type_id) has no valid
// destinations - returns [], same as conversion-standards' untagged case.
router.get('/commissary/adjustments/destinations', (req, res) => {
  const commissaryMeatId = Number(req.query.commissary_meat_id);
  if (!commissaryMeatId) {
    return res.status(400).json({ error: 'commissary_meat_id is required' });
  }

  const sourceMeat = db.prepare('SELECT * FROM commissary_meats WHERE id = ?').get(commissaryMeatId);
  if (!sourceMeat || sourceMeat.meat_type_id === null) {
    return res.json([]);
  }

  const rows = db.prepare(`
    SELECT id, code, name, unit, commissary_id, meat_type_id
    FROM commissary_meats
    WHERE active = 1 AND meat_type_id = ? AND unit = ? AND id != ?
    ORDER BY code
  `).all(sourceMeat.meat_type_id, sourceMeat.unit, commissaryMeatId);

  res.json(rows);
});

// POST /api/commissary/adjustments
// Body: { commissary_meat_id, business_date, kind, quantity, destination_commissary_meat_id, notes, actor }
// quantity is in the source meat's own unit - never converted here.
router.post('/commissary/adjustments', (req, res) => {
  const { commissary_meat_id, business_date, kind, quantity, destination_commissary_meat_id, notes, actor } = req.body;

  if (!commissary_meat_id || !business_date || !kind
      || quantity === undefined || quantity === null || quantity === '') {
    return res.status(400).json({ error: 'commissary_meat_id, business_date, kind, and quantity are required' });
  }
  if (kind !== 'LOSS' && kind !== 'ALLOCATION') {
    return res.status(400).json({ error: "kind must be 'LOSS' or 'ALLOCATION'" });
  }
  if (Number(quantity) <= 0) {
    return res.status(400).json({ error: 'quantity must be positive' });
  }

  const sourceMeat = db.prepare('SELECT * FROM commissary_meats WHERE id = ? AND active = 1').get(commissary_meat_id);
  if (!sourceMeat) {
    return res.status(400).json({ error: 'Unknown or inactive commissary_meat_id' });
  }

  const hasDestination = destination_commissary_meat_id !== undefined && destination_commissary_meat_id !== null && destination_commissary_meat_id !== '';
  if (kind === 'LOSS' && hasDestination) {
    return res.status(400).json({ error: 'LOSS must not have a destination_commissary_meat_id' });
  }
  if (kind === 'ALLOCATION' && !hasDestination) {
    return res.status(400).json({ error: 'ALLOCATION requires a destination_commissary_meat_id' });
  }

  if (kind === 'ALLOCATION') {
    const destMeat = db.prepare('SELECT * FROM commissary_meats WHERE id = ? AND active = 1').get(destination_commissary_meat_id);
    if (!destMeat) {
      return res.status(400).json({ error: 'Unknown or inactive destination_commissary_meat_id' });
    }
    if (!isValidDestination(sourceMeat, destMeat)) {
      return res.status(400).json({ error: "destination_commissary_meat_id must share the source meat's meat_type_id and unit" });
    }
  }

  try {
    const result = db.prepare(`
      INSERT INTO commissary_adjustments (commissary_meat_id, business_date, kind, quantity, destination_commissary_meat_id, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(commissary_meat_id, business_date, kind, Number(quantity), kind === 'ALLOCATION' ? destination_commissary_meat_id : null, notes || null, actor || null);

    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save adjustment: ' + err.message });
  }
});

// PATCH /api/commissary/adjustments/:id
// Body: { business_date?, kind?, quantity?, destination_commissary_meat_id?, notes?, actor }
// commissary_meat_id (the source) is not editable here - a different source
// is a different adjustment, same reasoning yield-log's PATCH already uses.
router.patch('/commissary/adjustments/:id', (req, res) => {
  const id = Number(req.params.id);
  const { business_date, kind, quantity, destination_commissary_meat_id, notes } = req.body;

  const existing = getAdjustmentRow(id);
  if (!existing || existing.deleted_at) {
    return res.status(404).json({ error: 'Adjustment not found' });
  }

  const nextKind = kind !== undefined ? kind : existing.kind;
  if (nextKind !== 'LOSS' && nextKind !== 'ALLOCATION') {
    return res.status(400).json({ error: "kind must be 'LOSS' or 'ALLOCATION'" });
  }
  const nextQuantity = quantity !== undefined && quantity !== null && quantity !== '' ? Number(quantity) : existing.quantity;
  if (nextQuantity <= 0) {
    return res.status(400).json({ error: 'quantity must be positive' });
  }
  const nextDate = business_date || existing.business_date;
  const nextNotes = notes !== undefined ? (notes || null) : existing.notes;
  const nextDestinationId = destination_commissary_meat_id !== undefined
    ? (destination_commissary_meat_id === null || destination_commissary_meat_id === '' ? null : destination_commissary_meat_id)
    : existing.destination_commissary_meat_id;

  if (nextKind === 'LOSS' && nextDestinationId) {
    return res.status(400).json({ error: 'LOSS must not have a destination_commissary_meat_id' });
  }
  if (nextKind === 'ALLOCATION' && !nextDestinationId) {
    return res.status(400).json({ error: 'ALLOCATION requires a destination_commissary_meat_id' });
  }

  if (nextKind === 'ALLOCATION') {
    // Source's own row - looked up without the active=1 filter used at
    // create time, since the source isn't being changed here and shouldn't
    // block an otherwise-valid edit just because it went inactive since.
    const sourceMeat = db.prepare('SELECT * FROM commissary_meats WHERE id = ?').get(existing.commissary_meat_id);
    const destMeat = db.prepare('SELECT * FROM commissary_meats WHERE id = ? AND active = 1').get(nextDestinationId);
    if (!destMeat) {
      return res.status(400).json({ error: 'Unknown or inactive destination_commissary_meat_id' });
    }
    if (!isValidDestination(sourceMeat, destMeat)) {
      return res.status(400).json({ error: "destination_commissary_meat_id must share the source meat's meat_type_id and unit" });
    }
  }

  try {
    db.prepare(`
      UPDATE commissary_adjustments SET business_date = ?, kind = ?, quantity = ?, destination_commissary_meat_id = ?, notes = ?
      WHERE id = ?
    `).run(nextDate, nextKind, nextQuantity, nextDestinationId, nextNotes, id);

    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update adjustment: ' + err.message });
  }
});

// DELETE /api/commissary/adjustments/:id
// Soft delete only - sets deleted_at, never a hard DELETE. Body may include
// { actor } but it's unused (no activity_log entry - see module note above).
router.delete('/commissary/adjustments/:id', (req, res) => {
  const id = Number(req.params.id);

  const existing = getAdjustmentRow(id);
  if (!existing || existing.deleted_at) {
    return res.status(404).json({ error: 'Adjustment not found' });
  }

  try {
    db.prepare(`UPDATE commissary_adjustments SET deleted_at = datetime('now') WHERE id = ?`).run(id);
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete adjustment: ' + err.message });
  }
});

module.exports = router;
