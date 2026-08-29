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
const {
  computeYieldRow,
  listCommissaryBalances
} = require('../engines/commissaryYieldEngine.js');
const { computeCommissaryDailyAudit } = require('../engines/commissaryAuditEngine.js');
const { withTransaction, logActivity } = require('../db/activityLog.js');

const router = express.Router();

function getYieldLogRow(id) {
  return db.prepare('SELECT * FROM commissary_yield_log WHERE id = ?').get(id);
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

// GET /api/commissary/balances
// Live on-hand balance per active commissary meat (backed-in minus
// shipped-out). See commissaryYieldEngine.js for the formula and its
// verification note.
router.get('/commissary/balances', (req, res) => {
  res.json(listCommissaryBalances(db));
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
