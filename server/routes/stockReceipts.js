// API for the Stock Receipts log - the single unified "commi downlist"
// covering both commissary shipments and direct deliveries to a
// restaurant. Replaces the old per-restaurant New Stock cell on Landing
// (see docs/commissary-and-stock-receipts.md Part 2, docs/data-model.md
// section 5).
//
// Step 6: every create/update/soft-delete here writes a matching
// activity_log row in the same transaction (rules-for-claude-code.md
// rule 9), via the shared withTransaction/logActivity helpers. No hard
// DELETE - "delete" means UPDATE ... SET deleted_at.

const express = require('express');
const db = require('../db/connection.js');
const { withTransaction, logActivity } = require('../db/activityLog.js');

const router = express.Router();

function getReceiptRow(id) {
  return db.prepare('SELECT * FROM stock_receipts WHERE id = ?').get(id);
}

// GET /api/stock-receipts/meats?restaurant_id=1
// Active meats for the restaurant, each flagged with the commissary_meat_id
// it maps to (if any) - null means "not mapped yet", which the frontend
// uses to explain why COMMISSARY isn't selectable for that meat. Never
// inferred from matching codes - see rules-for-claude-code.md rule 15.
router.get('/stock-receipts/meats', (req, res) => {
  const restaurantId = Number(req.query.restaurant_id);
  if (!restaurantId) return res.status(400).json({ error: 'restaurant_id is required' });

  const meats = db.prepare(`
    SELECT m.id, m.meat_code, m.name, m.unit, cmm.commissary_meat_id
    FROM meats m
    LEFT JOIN commissary_meat_map cmm
      ON cmm.meat_id = m.id AND cmm.restaurant_id = m.restaurant_id
    WHERE m.restaurant_id = ? AND m.active = 1
    ORDER BY m.meat_code
  `).all(restaurantId);

  res.json(meats);
});

// GET /api/stock-receipts?restaurant_id=&business_date=&source=&meat_id=
// Filterable list - all filters optional. Excludes soft-deleted rows.
// Ordered newest-first (by created_at) so the most recent entries are on
// top of the running list.
router.get('/stock-receipts', (req, res) => {
  const { restaurant_id, business_date, source, meat_id } = req.query;

  const clauses = ['sr.deleted_at IS NULL'];
  const params = [];

  if (restaurant_id) { clauses.push('sr.restaurant_id = ?'); params.push(Number(restaurant_id)); }
  if (business_date) { clauses.push('sr.business_date = ?'); params.push(business_date); }
  if (source) { clauses.push('sr.source = ?'); params.push(source); }
  if (meat_id) { clauses.push('sr.meat_id = ?'); params.push(Number(meat_id)); }

  const rows = db.prepare(`
    SELECT sr.id, sr.restaurant_id, r.name as restaurant_name,
           sr.meat_id, m.meat_code, m.name as meat_name, m.unit,
           sr.business_date, sr.quantity, sr.source,
           sr.commissary_meat_id, cm.code as commissary_meat_code, cm.name as commissary_meat_name,
           sr.notes, sr.created_at
    FROM stock_receipts sr
    JOIN restaurants r ON r.id = sr.restaurant_id
    JOIN meats m ON m.id = sr.meat_id
    LEFT JOIN commissary_meats cm ON cm.id = sr.commissary_meat_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY sr.created_at DESC, sr.id DESC
  `).all(...params);

  res.json(rows);
});

// POST /api/stock-receipts
// Body: { restaurant_id, meat_id, business_date, quantity, source, notes, actor }
// commissary_meat_id is never accepted from the client - resolved
// server-side from commissary_meat_map so it can never disagree with the
// mapping (or point at a meat that isn't mapped at all).
router.post('/stock-receipts', (req, res) => {
  const { restaurant_id, meat_id, business_date, quantity, source, notes, actor } = req.body;

  if (!restaurant_id || !meat_id || !business_date || quantity === undefined || quantity === null || quantity === '' || !source) {
    return res.status(400).json({ error: 'restaurant_id, meat_id, business_date, quantity, and source are required' });
  }
  if (!['DIRECT', 'COMMISSARY'].includes(source)) {
    return res.status(400).json({ error: 'source must be DIRECT or COMMISSARY' });
  }

  let commissaryMeatId = null;
  if (source === 'COMMISSARY') {
    const mapping = db.prepare(
      `SELECT commissary_meat_id FROM commissary_meat_map WHERE restaurant_id = ? AND meat_id = ?`
    ).get(restaurant_id, meat_id);
    if (!mapping) {
      return res.status(400).json({ error: 'This meat is not mapped to a commissary meat yet - set this up in Settings.' });
    }
    commissaryMeatId = mapping.commissary_meat_id;
  }

  try {
    const id = withTransaction(db, () => {
      const result = db.prepare(`
        INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source, commissary_meat_id, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(restaurant_id, meat_id, business_date, Number(quantity), source, commissaryMeatId, notes || null, actor || null);

      const after = getReceiptRow(result.lastInsertRowid);
      logActivity(db, {
        actor: actor || null,
        entityType: 'stock_receipts',
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
    res.status(500).json({ error: 'Failed to save receipt: ' + err.message });
  }
});

// PATCH /api/stock-receipts/:id
// Body: { quantity?, business_date?, source?, notes?, actor }
// Editable fields only - restaurant_id and meat_id are not editable here
// (that's effectively a different receipt; delete + re-create instead).
// If source changes to/within COMMISSARY, commissary_meat_id is
// re-resolved server-side the same way POST does - never trusted from
// the client.
router.patch('/stock-receipts/:id', (req, res) => {
  const id = Number(req.params.id);
  const { quantity, business_date, source, notes, actor } = req.body;

  const existing = getReceiptRow(id);
  if (!existing || existing.deleted_at) {
    return res.status(404).json({ error: 'Receipt not found' });
  }

  const nextSource = source !== undefined ? source : existing.source;
  if (!['DIRECT', 'COMMISSARY'].includes(nextSource)) {
    return res.status(400).json({ error: 'source must be DIRECT or COMMISSARY' });
  }

  let commissaryMeatId = existing.commissary_meat_id;
  if (nextSource === 'COMMISSARY') {
    const mapping = db.prepare(
      `SELECT commissary_meat_id FROM commissary_meat_map WHERE restaurant_id = ? AND meat_id = ?`
    ).get(existing.restaurant_id, existing.meat_id);
    if (!mapping) {
      return res.status(400).json({ error: 'This meat is not mapped to a commissary meat yet - set this up in Settings.' });
    }
    commissaryMeatId = mapping.commissary_meat_id;
  } else {
    commissaryMeatId = null;
  }

  const nextQuantity = quantity !== undefined && quantity !== null && quantity !== '' ? Number(quantity) : existing.quantity;
  const nextDate = business_date || existing.business_date;
  const nextNotes = notes !== undefined ? (notes || null) : existing.notes;

  try {
    withTransaction(db, () => {
      db.prepare(`
        UPDATE stock_receipts SET quantity = ?, business_date = ?, source = ?, commissary_meat_id = ?, notes = ?
        WHERE id = ?
      `).run(nextQuantity, nextDate, nextSource, commissaryMeatId, nextNotes, id);

      const after = getReceiptRow(id);
      logActivity(db, {
        actor: actor || null,
        entityType: 'stock_receipts',
        entityId: id,
        action: 'UPDATE',
        before: existing,
        after,
        source: 'MANUAL'
      });
    });

    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update receipt: ' + err.message });
  }
});

// DELETE /api/stock-receipts/:id
// Soft delete only - sets deleted_at, never a hard DELETE. Body may
// include { actor } for the activity log.
router.delete('/stock-receipts/:id', (req, res) => {
  const id = Number(req.params.id);
  const { actor } = req.body || {};

  const existing = getReceiptRow(id);
  if (!existing || existing.deleted_at) {
    return res.status(404).json({ error: 'Receipt not found' });
  }

  try {
    withTransaction(db, () => {
      db.prepare(`UPDATE stock_receipts SET deleted_at = datetime('now') WHERE id = ?`).run(id);
      logActivity(db, {
        actor: actor || null,
        entityType: 'stock_receipts',
        entityId: id,
        action: 'DELETE',
        before: existing,
        after: null,
        source: 'MANUAL'
      });
    });

    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete receipt: ' + err.message });
  }
});

module.exports = router;
