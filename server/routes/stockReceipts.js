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
//
// Step 9: restaurant_id/meat_id are now nullable (see schema.sql +
// migrate.js). NULL on both, only for source = COMMISSARY, represents an
// "Unallocated" shipment - received at the commissary but not yet
// assigned to a restaurant. See "Unallocated receipts" in
// commissary-and-stock-receipts.md Part 2 and data-model.md section 5 for
// the full spec these routes implement. The frontend's commissary-meat
// dropdown for an Unallocated row should reuse GET /api/commissary/meats
// (commissary.js) - no need for a duplicate list endpoint here.

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

// GET /api/stock-receipts?restaurant_id=&business_date=&source=&meat_id=&unallocated=
// Filterable list - all filters optional. Excludes soft-deleted rows.
// Ordered newest-first (by created_at) so the most recent entries are on
// top of the running list.
//
// restaurants/meats are LEFT JOINed (not INNER) as of step 9 - an
// Unallocated row has NULL restaurant_id/meat_id and would silently
// vanish from every list behind an INNER JOIN, which defeats the point
// of a page that's supposed to let someone find and assign it later.
// restaurant_name/meat_code/etc. come back null for such a row; the
// frontend uses that (or the unallocated=true filter) to render an
// "Unallocated" badge and an Assign action.
router.get('/stock-receipts', (req, res) => {
  const { restaurant_id, business_date, source, meat_id, unallocated } = req.query;

  const clauses = ['sr.deleted_at IS NULL'];
  const params = [];

  if (unallocated === 'true') {
    clauses.push('sr.restaurant_id IS NULL');
  } else if (restaurant_id) {
    clauses.push('sr.restaurant_id = ?');
    params.push(Number(restaurant_id));
  }
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
// Body: { restaurant_id?, meat_id?, business_date, quantity, source, notes, actor, commissary_meat_id? }
//
// restaurant_id/meat_id are normally required together, EXCEPT when
// source = COMMISSARY and both are left unset - that creates an
// "Unallocated" shipment (received at the commissary, not yet assigned
// to a restaurant). See commissary-and-stock-receipts.md Part 2.
//
// commissary_meat_id is normally never accepted from the client - it's
// resolved server-side from commissary_meat_map so it can never disagree
// with the mapping (or point at a meat that isn't mapped at all). The
// ONE exception is an Unallocated row: with no restaurant+meat pair yet,
// there is nothing to resolve a mapping through, so the client must pick
// the commissary meat directly (e.g. from GET /api/commissary/meats) and
// send commissary_meat_id explicitly. That value is still validated
// server-side against commissary_meats before use.
router.post('/stock-receipts', (req, res) => {
  const { restaurant_id, meat_id, business_date, quantity, source, notes, actor, commissary_meat_id } = req.body;

  if (!business_date || quantity === undefined || quantity === null || quantity === '' || !source) {
    return res.status(400).json({ error: 'business_date, quantity, and source are required' });
  }
  if (!['DIRECT', 'COMMISSARY'].includes(source)) {
    return res.status(400).json({ error: 'source must be DIRECT or COMMISSARY' });
  }

  const hasRestaurant = restaurant_id !== undefined && restaurant_id !== null && restaurant_id !== '';
  const hasMeat = meat_id !== undefined && meat_id !== null && meat_id !== '';

  if (hasRestaurant !== hasMeat) {
    return res.status(400).json({ error: 'restaurant_id and meat_id must be provided together' });
  }
  if (!hasRestaurant && source !== 'COMMISSARY') {
    return res.status(400).json({ error: 'restaurant_id and meat_id are required for a DIRECT receipt - only a COMMISSARY receipt can be left Unallocated' });
  }

  let commissaryMeatId = null;

  if (hasRestaurant) {
    if (source === 'COMMISSARY') {
      const mapping = db.prepare(
        `SELECT commissary_meat_id FROM commissary_meat_map WHERE restaurant_id = ? AND meat_id = ?`
      ).get(restaurant_id, meat_id);
      if (!mapping) {
        return res.status(400).json({ error: 'This meat is not mapped to a commissary meat yet - set this up in Settings.' });
      }
      commissaryMeatId = mapping.commissary_meat_id;
    }
  } else {
    // Unallocated: no restaurant meat to resolve a mapping through, so
    // the commissary meat comes straight from the client, validated
    // against the real table rather than trusted blindly.
    if (!commissary_meat_id) {
      return res.status(400).json({ error: 'commissary_meat_id is required for an Unallocated receipt' });
    }
    const commissaryMeat = db.prepare(
      `SELECT id FROM commissary_meats WHERE id = ? AND active = 1`
    ).get(commissary_meat_id);
    if (!commissaryMeat) {
      return res.status(400).json({ error: 'Unknown or inactive commissary_meat_id' });
    }
    commissaryMeatId = commissary_meat_id;
  }

  try {
    const id = withTransaction(db, () => {
      const result = db.prepare(`
        INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source, commissary_meat_id, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        hasRestaurant ? restaurant_id : null,
        hasRestaurant ? meat_id : null,
        business_date, Number(quantity), source, commissaryMeatId, notes || null, actor || null
      );

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
// Body: { quantity?, business_date?, source?, notes?, actor, restaurant_id?, meat_id? }
//
// Editable fields: quantity, business_date, source, notes - as before.
// restaurant_id/meat_id remain not editable on an already-assigned
// receipt (that's effectively a different receipt; delete + re-create
// instead) - EXCEPT the one new case step 9 adds: assigning a previously
// Unallocated row (restaurant_id/meat_id both NULL) to a restaurant for
// the first time. That's a genuinely new capability, not just relaxing
// the old rule - see commissary-and-stock-receipts.md Part 2.
//
// Continuity requirement (data-model.md section 5): the
// commissary_meat_map lookup for the chosen restaurant+meat must resolve
// to the SAME commissary_meat_id already stored on the row. Reject
// otherwise - without this check, assignment could silently misattribute
// which physical commissary pool a shipment was actually drawn from.
//
// If source changes to/within COMMISSARY (on an already-allocated row),
// commissary_meat_id is re-resolved server-side the same way POST does -
// never trusted from the client.
router.patch('/stock-receipts/:id', (req, res) => {
  const id = Number(req.params.id);
  const { quantity, business_date, source, notes, actor, restaurant_id, meat_id } = req.body;

  const existing = getReceiptRow(id);
  if (!existing || existing.deleted_at) {
    return res.status(404).json({ error: 'Receipt not found' });
  }

  const isUnallocated = existing.restaurant_id === null && existing.meat_id === null;
  const wantsAssignment = restaurant_id !== undefined || meat_id !== undefined;

  if (wantsAssignment && !isUnallocated) {
    return res.status(400).json({ error: 'restaurant_id and meat_id are only settable once, to assign a previously Unallocated receipt - this receipt is already assigned. Delete and re-create instead.' });
  }

  let nextRestaurantId = existing.restaurant_id;
  let nextMeatId = existing.meat_id;
  let commissaryMeatId = existing.commissary_meat_id;

  if (wantsAssignment) {
    if (!restaurant_id || !meat_id) {
      return res.status(400).json({ error: 'restaurant_id and meat_id must be provided together when assigning an Unallocated receipt' });
    }
    const mapping = db.prepare(
      `SELECT commissary_meat_id FROM commissary_meat_map WHERE restaurant_id = ? AND meat_id = ?`
    ).get(restaurant_id, meat_id);
    if (!mapping) {
      return res.status(400).json({ error: 'This meat is not mapped to a commissary meat yet - set this up in Settings.' });
    }
    if (mapping.commissary_meat_id !== existing.commissary_meat_id) {
      return res.status(400).json({ error: 'This receipt was drawn from a different commissary meat pool than the chosen restaurant meat maps to - assignment rejected to avoid misattributing stock.' });
    }
    nextRestaurantId = restaurant_id;
    nextMeatId = meat_id;
    // commissaryMeatId is unchanged - the continuity check above already
    // confirmed it matches what the mapping would have produced.
  }

  const nextSource = source !== undefined ? source : existing.source;
  if (!['DIRECT', 'COMMISSARY'].includes(nextSource)) {
    return res.status(400).json({ error: 'source must be DIRECT or COMMISSARY' });
  }

  const stillUnallocated = nextRestaurantId === null && nextMeatId === null;
  if (stillUnallocated && nextSource !== 'COMMISSARY') {
    return res.status(400).json({ error: 'An Unallocated receipt must stay source = COMMISSARY - assign it to a restaurant first' });
  }

  // Re-resolve commissary_meat_id for an ordinary (non-assignment) edit
  // on an already-allocated row, exactly like POST does. Skipped for the
  // assignment branch above (handled by the continuity check) and for a
  // row that's still Unallocated (nothing to resolve a mapping through).
  if (!wantsAssignment && nextRestaurantId !== null && nextMeatId !== null) {
    if (nextSource === 'COMMISSARY') {
      const mapping = db.prepare(
        `SELECT commissary_meat_id FROM commissary_meat_map WHERE restaurant_id = ? AND meat_id = ?`
      ).get(nextRestaurantId, nextMeatId);
      if (!mapping) {
        return res.status(400).json({ error: 'This meat is not mapped to a commissary meat yet - set this up in Settings.' });
      }
      commissaryMeatId = mapping.commissary_meat_id;
    } else {
      commissaryMeatId = null;
    }
  }

  const nextQuantity = quantity !== undefined && quantity !== null && quantity !== '' ? Number(quantity) : existing.quantity;
  const nextDate = business_date || existing.business_date;
  const nextNotes = notes !== undefined ? (notes || null) : existing.notes;

  try {
    withTransaction(db, () => {
      db.prepare(`
        UPDATE stock_receipts SET restaurant_id = ?, meat_id = ?, quantity = ?, business_date = ?, source = ?, commissary_meat_id = ?, notes = ?
        WHERE id = ?
      `).run(nextRestaurantId, nextMeatId, nextQuantity, nextDate, nextSource, commissaryMeatId, nextNotes, id);

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
