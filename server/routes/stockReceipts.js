// API for the Stock Receipts log - the single unified "commi downlist"
// covering both commissary shipments and direct deliveries to a
// restaurant. Replaces the old per-restaurant New Stock cell on Landing
// (see docs/commissary-and-stock-receipts.md Part 2, docs/data-model.md
// section 5).
//
// No edit/soft-delete endpoints yet - every write to this table is
// required to log to activity_log in the same transaction (see
// docs/rules-for-claude-code.md rule 9), and activity_log isn't wired in
// yet (that's step 6). Create + read only for now.

const express = require('express');
const db = require('../db/connection.js');

const router = express.Router();

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
// Body: { restaurant_id, meat_id, business_date, quantity, source, notes }
// commissary_meat_id is never accepted from the client - resolved
// server-side from commissary_meat_map so it can never disagree with the
// mapping (or point at a meat that isn't mapped at all).
router.post('/stock-receipts', (req, res) => {
  const { restaurant_id, meat_id, business_date, quantity, source, notes } = req.body;

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

  const result = db.prepare(`
    INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source, commissary_meat_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(restaurant_id, meat_id, business_date, Number(quantity), source, commissaryMeatId, notes || null);

  res.json({ ok: true, id: result.lastInsertRowid });
});

module.exports = router;
