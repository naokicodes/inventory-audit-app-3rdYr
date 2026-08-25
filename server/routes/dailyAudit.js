// API for the Daily Audit Grid - the single spreadsheet-style screen that
// replaces separate New Stock / Ending Actual / Adjustments screens.
// See docs/daily-workflow.md - this is the consolidated version of that flow.

const express = require('express');
const db = require('../db/connection.js');
const { computeMeatAudit } = require('../engines/auditEngine.js');

const router = express.Router();

router.get('/restaurants', (req, res) => {
  const restaurants = db.prepare(`SELECT id, name, code FROM restaurants WHERE active = 1 ORDER BY name`).all();
  res.json(restaurants);
});

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

  const adjTypes = db.prepare(`SELECT id, name FROM adjustment_types WHERE active = 1`).all();
  const inHouseTypeId = adjTypes.find(t => t.name === 'Staff Meal / In-House')?.id;
  const wastageTypeId = adjTypes.find(t => t.name === 'Wastage')?.id;
  const otherTypeId = adjTypes.find(t => t.name === 'Other / Uncategorized')?.id;

  const getExistingAdjustment = db.prepare(
    `SELECT quantity FROM adjustments WHERE restaurant_id = ? AND meat_id = ? AND business_date = ? AND adjustment_type_id = ?`
  );
  const getNewStock = db.prepare(
    `SELECT quantity FROM new_stock WHERE restaurant_id = ? AND meat_id = ? AND business_date = ?`
  );
  const getRemarks = db.prepare(
    `SELECT notes FROM ending_actual WHERE restaurant_id = ? AND meat_id = ? AND business_date = ?`
  );

  const rows = meats.map(meat => {
    const audit = computeMeatAudit(db, restaurantId, meat.id, date);
    const newStockRow = getNewStock.get(restaurantId, meat.id, date);
    const inHouse = inHouseTypeId ? getExistingAdjustment.get(restaurantId, meat.id, date, inHouseTypeId) : null;
    const wastage = wastageTypeId ? getExistingAdjustment.get(restaurantId, meat.id, date, wastageTypeId) : null;
    const other = otherTypeId ? getExistingAdjustment.get(restaurantId, meat.id, date, otherTypeId) : null;
    const remarksRow = getRemarks.get(restaurantId, meat.id, date);

    return {
      meat_id: meat.id,
      meat_code: meat.meat_code,
      name: meat.name,
      unit: meat.unit,
      beginning: audit.beginning,
      new_stock: newStockRow ? newStockRow.quantity : null,
      usage: audit.usage,
      in_house: inHouse ? inHouse.quantity : null,
      wastage: wastage ? wastage.quantity : null,
      other: other ? other.quantity : null,
      ending_calculated: audit.endingCalculated,
      ending_actual: audit.actual,
      variance: audit.variance,
      unexplained_variance: audit.unexplainedVariance,
      status: audit.status,
      remarks: remarksRow ? remarksRow.notes : ''
    };
  });

  res.json(rows);
});

// POST /api/daily-audit
// Body: { restaurant_id, business_date, rows: [{ meat_id, new_stock, in_house, wastage, other, ending_actual, remarks }] }
// Routes each field to its correct table. Only writes fields that were
// actually provided (not null/empty) - leaves everything else untouched.
router.post('/daily-audit', (req, res) => {
  const { restaurant_id, business_date, rows } = req.body;
  if (!restaurant_id || !business_date || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'restaurant_id, business_date, and rows[] are required' });
  }

  const adjTypes = db.prepare(`SELECT id, name FROM adjustment_types WHERE active = 1`).all();
  const inHouseTypeId = adjTypes.find(t => t.name === 'Staff Meal / In-House')?.id;
  const wastageTypeId = adjTypes.find(t => t.name === 'Wastage')?.id;
  const otherTypeId = adjTypes.find(t => t.name === 'Other / Uncategorized')?.id;

  const upsertNewStock = db.prepare(`
    INSERT INTO new_stock (restaurant_id, meat_id, business_date, quantity)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(restaurant_id, meat_id, business_date) DO UPDATE SET quantity = excluded.quantity
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
    if (row.new_stock !== null && row.new_stock !== undefined && row.new_stock !== '') {
      upsertNewStock.run(restaurant_id, row.meat_id, business_date, Number(row.new_stock));
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
