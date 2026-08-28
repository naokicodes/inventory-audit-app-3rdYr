// API for the Commissary tab - the production side (raw-in/backed-out
// yield tracking), separate from Stock Receipts (the receiving side).
// See docs/commissary-and-stock-receipts.md Part 1.
//
// Same "deliberately not built yet" note as stockReceipts.js: no
// edit/soft-delete endpoints here. rules-for-claude-code.md rule 9
// requires every write to commissary_yield_log to log to activity_log in
// the same transaction, and activity_log isn't wired in yet (step 6).
// Create + read only for now, exactly mirroring step 4's choice for
// stock_receipts.

const express = require('express');
const db = require('../db/connection.js');
const {
  computeYieldRow,
  listCommissaryBalances
} = require('../engines/commissaryYieldEngine.js');

const router = express.Router();

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

// POST /api/commissary/yield-log
// Body: { commissary_meat_id, business_date, raw_weight_in, backed_weight_out, notes }
router.post('/commissary/yield-log', (req, res) => {
  const { commissary_meat_id, business_date, raw_weight_in, backed_weight_out, notes } = req.body;

  if (!commissary_meat_id || !business_date || raw_weight_in === undefined || raw_weight_in === null || raw_weight_in === ''
      || backed_weight_out === undefined || backed_weight_out === null || backed_weight_out === '') {
    return res.status(400).json({ error: 'commissary_meat_id, business_date, raw_weight_in, and backed_weight_out are required' });
  }

  const meat = db.prepare('SELECT id FROM commissary_meats WHERE id = ?').get(commissary_meat_id);
  if (!meat) {
    return res.status(400).json({ error: 'Unknown commissary_meat_id' });
  }

  const result = db.prepare(`
    INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(commissary_meat_id, business_date, Number(raw_weight_in), Number(backed_weight_out), notes || null);

  res.json({ ok: true, id: result.lastInsertRowid });
});

module.exports = router;
