// API for the Stock Receipts log - the single unified "commi downlist"
// covering direct deliveries to a restaurant. Replaces the old
// per-restaurant New Stock cell on Landing (see
// docs/commissary-and-stock-receipts.md Part 2, docs/data-model.md
// section 5).
//
// Step 6: every create/update/soft-delete here writes a matching
// activity_log row in the same transaction (rules-for-claude-code.md
// rule 9), via the shared withTransaction/logActivity helpers. No hard
// DELETE - "delete" means UPDATE ... SET deleted_at.
//
// RETIRED 2026-08-29 (item 4, "Future considerations" cleanup pass -
// see session-status.md's step-20 "commissary_meat_map's fate" entry
// for the full reasoning, which was designed there and only actually
// implemented now): manual entry of a COMMISSARY-sourced receipt, the
// commissary_meat_map lookup it depended on, and the whole "Unallocated"
// receipt concept (restaurant_id/meat_id left NULL pending assignment).
// Once Commissary always names the destination restaurant up front (a
// required field on POST /api/commissary/shipments, step 20c), there's
// no remaining legitimate case for a human typing "this is a COMMISSARY
// receipt" here - COMMISSARY-sourced stock_receipts rows are only ever
// written as a side effect of a real Shipment now. This route accepts
// DIRECT only. commissary_meat_map the TABLE is untouched (no DROP
// TABLE, no destructive schema change) - only the code paths reading/
// writing it here are gone. Assumes no real "Unallocated" rows exist in
// any actual database yet (this app has no production deployment as of
// this change) - if that assumption turns out wrong for someone's real
// data, those old rows just become permanently un-assignable through
// this route; flag it if that ever actually matters.

const express = require('express');
const db = require('../db/connection.js');
const { withTransaction, logActivity } = require('../db/activityLog.js');

const router = express.Router();

function getReceiptRow(id) {
  return db.prepare('SELECT * FROM stock_receipts WHERE id = ?').get(id);
}

// GET /api/stock-receipts/meats?restaurant_id=1
// Active meats for the restaurant. No longer flags a commissary_meat_id
// mapping - that concept is retired (see the module-level note above).
router.get('/stock-receipts/meats', (req, res) => {
  const restaurantId = Number(req.query.restaurant_id);
  if (!restaurantId) return res.status(400).json({ error: 'restaurant_id is required' });

  const meats = db.prepare(`
    SELECT id, meat_code, name, unit
    FROM meats
    WHERE restaurant_id = ? AND active = 1
    ORDER BY meat_code
  `).all(restaurantId);

  res.json(meats);
});

// GET /api/stock-receipts?restaurant_id=&business_date=&source=&meat_id=
// Filterable list - all filters optional. Excludes soft-deleted rows.
// Ordered newest-first (by created_at) so the most recent entries are on
// top of the running list. restaurant_id/meat_id are always populated
// now (no more Unallocated rows possible through this route), but the
// JOINs stay LEFT rather than INNER - harmless either way, and safer if
// an old pre-retirement Unallocated row does turn out to exist somewhere.
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
    LEFT JOIN restaurants r ON r.id = sr.restaurant_id
    LEFT JOIN meats m ON m.id = sr.meat_id
    LEFT JOIN commissary_meats cm ON cm.id = sr.commissary_meat_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY sr.created_at DESC, sr.id DESC
  `).all(...params);

  res.json(rows);
});

// POST /api/stock-receipts
// Body: { restaurant_id, meat_id, business_date, quantity, source, notes, actor }
//
// source must be DIRECT - see the module-level retirement note above.
// A COMMISSARY-sourced row only ever gets written by
// POST /api/commissary/shipments now, not through this route.
router.post('/stock-receipts', (req, res) => {
  const { restaurant_id, meat_id, business_date, quantity, source, notes, actor } = req.body;

  if (!restaurant_id || !meat_id || !business_date || quantity === undefined || quantity === null || quantity === '' || !source) {
    return res.status(400).json({ error: 'restaurant_id, meat_id, business_date, quantity, and source are required' });
  }
  if (source !== 'DIRECT') {
    return res.status(400).json({ error: 'Manual stock receipt entry is DIRECT only - a COMMISSARY-sourced receipt is created automatically by logging a Shipment on the Commissary Shipments page, not entered here.' });
  }

  try {
    const id = withTransaction(db, () => {
      const result = db.prepare(`
        INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source, commissary_meat_id, notes, created_by)
        VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
      `).run(restaurant_id, meat_id, business_date, Number(quantity), source, notes || null, actor || null);

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
// Body: { quantity?, business_date?, notes?, actor }
//
// restaurant_id/meat_id/source are NOT editable - a manual receipt is
// always DIRECT (see the module-level retirement note above), and
// changing which restaurant/meat a receipt belongs to is effectively a
// different receipt (delete + re-create instead). This is narrower
// than the route used to be - the "assign a previously Unallocated
// receipt" capability it had is retired along with Unallocated itself.
router.patch('/stock-receipts/:id', (req, res) => {
  const id = Number(req.params.id);
  const { quantity, business_date, notes, actor } = req.body;

  const existing = getReceiptRow(id);
  if (!existing || existing.deleted_at) {
    return res.status(404).json({ error: 'Receipt not found' });
  }

  const nextQuantity = quantity !== undefined && quantity !== null && quantity !== '' ? Number(quantity) : existing.quantity;
  const nextDate = business_date || existing.business_date;
  const nextNotes = notes !== undefined ? (notes || null) : existing.notes;

  try {
    withTransaction(db, () => {
      db.prepare(`
        UPDATE stock_receipts SET quantity = ?, business_date = ?, notes = ?
        WHERE id = ?
      `).run(nextQuantity, nextDate, nextNotes, id);

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
