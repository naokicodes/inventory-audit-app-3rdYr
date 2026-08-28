// API for the Daily Audit Grid - the single spreadsheet-style screen that
// replaces separate New Stock / Ending Actual / Adjustments screens.
// See docs/daily-workflow.md - this is the consolidated version of that flow.

const express = require('express');
const db = require('../db/connection.js');
const { computeMeatAudit, computeMixedDailyAudit } = require('../engines/auditEngine.js');

const router = express.Router();

router.get('/restaurants', (req, res) => {
  const restaurants = db.prepare(`SELECT id, name, code FROM restaurants WHERE active = 1 ORDER BY name`).all();
  res.json(restaurants);
});

// Shared by both GET routes below: looks up the existing in_house/wastage/
// other adjustment amounts and the ending_actual remarks for one meat/date,
// so a meat row can show what's already been typed for it (not just the
// calculated columns). Kept as one helper so the two routes can't drift
// out of sync on how this decoration works.
function getMeatInputDecoration(restaurantId, date) {
  const adjTypes = db.prepare(`SELECT id, name FROM adjustment_types WHERE active = 1`).all();
  const inHouseTypeId = adjTypes.find(t => t.name === 'Staff Meal / In-House')?.id;
  const wastageTypeId = adjTypes.find(t => t.name === 'Wastage')?.id;
  const otherTypeId = adjTypes.find(t => t.name === 'Other / Uncategorized')?.id;

  const getExistingAdjustment = db.prepare(
    `SELECT quantity FROM adjustments WHERE restaurant_id = ? AND meat_id = ? AND business_date = ? AND adjustment_type_id = ?`
  );
  const getRemarks = db.prepare(
    `SELECT notes FROM ending_actual WHERE restaurant_id = ? AND meat_id = ? AND business_date = ?`
  );

  return (meatId) => {
    const inHouse = inHouseTypeId ? getExistingAdjustment.get(restaurantId, meatId, date, inHouseTypeId) : null;
    const wastage = wastageTypeId ? getExistingAdjustment.get(restaurantId, meatId, date, wastageTypeId) : null;
    const other = otherTypeId ? getExistingAdjustment.get(restaurantId, meatId, date, otherTypeId) : null;
    const remarksRow = getRemarks.get(restaurantId, meatId, date);
    return {
      in_house: inHouse ? inHouse.quantity : null,
      wastage: wastage ? wastage.quantity : null,
      other: other ? other.quantity : null,
      remarks: remarksRow ? remarksRow.notes : ''
    };
  };
}

// GET /api/daily-audit?restaurant_id=1&date=2026-08-25
// One row per active meat, with every column the grid needs - calculated
// values from the audit engine, plus existing input values if already
// entered for this date.
router.get('/daily-audit', (req, res) => {
  const restaurantId = Number(req.query.restaurant_id);
  const date = req.query.date;
  if (!restaurantId || !date) {
    return res.status(400).json({ error: 'restaurant_id and date are required' });
  }

  const meats = db.prepare(
    `SELECT id, meat_code, name, unit FROM meats WHERE restaurant_id = ? AND active = 1 ORDER BY meat_code`
  ).all(restaurantId);

  const decorate = getMeatInputDecoration(restaurantId, date);

  const rows = meats.map(meat => {
    const audit = computeMeatAudit(db, restaurantId, meat.id, date);
    const inputs = decorate(meat.id);

    return {
      meat_id: meat.id,
      meat_code: meat.meat_code,
      name: meat.name,
      unit: meat.unit,
      beginning: audit.beginning,
      // new_stock is now read-only here - calculated by the audit engine
      // as SUM(stock_receipts), entered on the Stock Receipts page, not
      // this screen. See docs/commissary-and-stock-receipts.md Part 2.
      new_stock: audit.newStock,
      usage: audit.usage,
      in_house: inputs.in_house,
      wastage: inputs.wastage,
      other: inputs.other,
      ending_calculated: audit.endingCalculated,
      ending_actual: audit.actual,
      variance: audit.variance,
      unexplained_variance: audit.unexplainedVariance,
      status: audit.status,
      remarks: inputs.remarks
    };
  });

  res.json(rows);
});

// GET /api/daily-audit/mixed?restaurant_id=1&date=2026-08-25
// Step 11 (session-status.md): backs the Landing mixed grid - meats and
// BATCH_PREPPED dishes together in one array, each row tagged `type`
// ('MEAT' or 'DISH'). MEAT rows are now decorated with the same
// in_house/wastage/other/remarks lookup GET /api/daily-audit uses, via
// the shared helper above - the Landing UI keeps editing meat rows in
// place, so it needs to see what's already been typed, same as before.
// DISH rows carry only what computeDishAudit already returns (prepped,
// sold, portion beginning/ending/actual, status) - read-only for this
// step, per session-status.md; there's no write path for prepped/
// portion_ending_actual yet, so nothing to decorate there.
// GET /api/daily-audit above is untouched and still works standalone.
router.get('/daily-audit/mixed', (req, res) => {
  const restaurantId = Number(req.query.restaurant_id);
  const date = req.query.date;
  if (!restaurantId || !date) {
    return res.status(400).json({ error: 'restaurant_id and date are required' });
  }

  const decorate = getMeatInputDecoration(restaurantId, date);
  const rows = computeMixedDailyAudit(db, restaurantId, date).map(row => {
    if (row.type !== 'MEAT') return row;
    return { ...row, ...decorate(row.item_id) };
  });

  res.json(rows);
});

// POST /api/daily-audit
// Body: { restaurant_id, business_date, rows: [{ meat_id, in_house, wastage, other, ending_actual, remarks, opening_stock }] }
// Routes each field to its correct table. Only writes fields that were
// actually provided (not null/empty) - leaves everything else untouched.
// Note: new_stock is no longer accepted here - it's entered on the Stock
// Receipts page now (see docs/commissary-and-stock-receipts.md Part 2).
//
// opening_stock (step 12, session-status.md): a one-time value, only
// meaningful the first time a meat has no computable beginning stock
// (see auditEngine.js's getBeginningStock - no prior ending_actual and
// no existing opening_stock row). `INSERT OR IGNORE` relies on
// opening_stock's own UNIQUE(restaurant_id, meat_id) constraint
// (schema.sql) to make the write-once guarantee a DB-level fact, not
// just a frontend convention - a stale client that already has a
// beginning value and resubmits it anyway is silently a no-op here,
// never a second write or an error. Deliberately not run through
// activity_log per rule 9 - that logging is scoped to stock_receipts
// and commissary_yield_log only, not silently extended to every input
// table.
router.post('/daily-audit', (req, res) => {
  const { restaurant_id, business_date, rows } = req.body;
  if (!restaurant_id || !business_date || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'restaurant_id, business_date, and rows[] are required' });
  }

  const adjTypes = db.prepare(`SELECT id, name FROM adjustment_types WHERE active = 1`).all();
  const inHouseTypeId = adjTypes.find(t => t.name === 'Staff Meal / In-House')?.id;
  const wastageTypeId = adjTypes.find(t => t.name === 'Wastage')?.id;
  const otherTypeId = adjTypes.find(t => t.name === 'Other / Uncategorized')?.id;

  const insertOpeningStock = db.prepare(`
    INSERT OR IGNORE INTO opening_stock (restaurant_id, meat_id, business_date, quantity)
    VALUES (?, ?, ?, ?)
  `);

  const upsertEndingActual = db.prepare(`
    INSERT INTO ending_actual (restaurant_id, meat_id, business_date, quantity, notes)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(restaurant_id, meat_id, business_date) DO UPDATE SET quantity = excluded.quantity, notes = excluded.notes
  `);
  const deleteAdjustment = db.prepare(
    `DELETE FROM adjustments WHERE restaurant_id = ? AND meat_id = ? AND business_date = ? AND adjustment_type_id = ?`
  );
  const insertAdjustment = db.prepare(`
    INSERT INTO adjustments (restaurant_id, meat_id, business_date, quantity, adjustment_type_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  function upsertAdjustment(meatId, typeId, value) {
    deleteAdjustment.run(restaurant_id, meatId, business_date, typeId);
    if (value !== null && value !== undefined && value !== '' && Number(value) !== 0) {
      insertAdjustment.run(restaurant_id, meatId, business_date, Number(value), typeId);
    }
  }

  let saved = 0;
  for (const row of rows) {
    if (row.opening_stock !== null && row.opening_stock !== undefined && row.opening_stock !== '') {
      insertOpeningStock.run(restaurant_id, row.meat_id, business_date, Number(row.opening_stock));
    }
    if (row.ending_actual !== null && row.ending_actual !== undefined && row.ending_actual !== '') {
      upsertEndingActual.run(restaurant_id, row.meat_id, business_date, Number(row.ending_actual), row.remarks || null);
    }
    if (inHouseTypeId) upsertAdjustment(row.meat_id, inHouseTypeId, row.in_house);
    if (wastageTypeId) upsertAdjustment(row.meat_id, wastageTypeId, row.wastage);
    if (otherTypeId) upsertAdjustment(row.meat_id, otherTypeId, row.other);
    saved++;
  }

  res.json({ ok: true, saved });
});

module.exports = router;
