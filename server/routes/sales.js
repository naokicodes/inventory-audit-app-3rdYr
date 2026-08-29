// Sales backend - step 16 (session-status.md). CRUD for manual sales
// entry shaped for a monthly grid: GET a month's matrix for a
// restaurant's dishes, PATCH a single day's cell. Backend + tests only
// per the step's own scope - no frontend here (that's step 17).
//
// See docs/data-model.md's "sales" section for the source/LOYVERSE-vs-
// MANUAL design and the partial unique index this route relies on for
// upsert safety.

const express = require('express');
const db = require('../db/connection.js');

const router = express.Router();

function daysInMonth(year, month) {
  // month is 1-12. new Date(year, month, 0) gives the last day of
  // `month` (1-indexed) because JS Date months are 0-indexed.
  return new Date(year, month, 0).getDate();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// GET /api/sales?restaurant_id=1&year=2026&month=8
// One row per active dish for the restaurant, each with a `days` map
// keyed by full ISO date ("2026-08-01") covering every day in that
// month. A day with no sales row at all is `null`. A day with sales is
// { quantity, source } - source is included so a future frontend can
// treat LOYVERSE cells differently (e.g. read-only) without a second
// request, even though only MANUAL exists today (Loyverse sync isn't
// built yet - rule 14). If more than one row exists for a day (only
// possible for LOYVERSE, MANUAL is constrained to one via the partial
// unique index), quantities are summed and source becomes 'LOYVERSE'
// (mixed-source summing shouldn't happen in practice pre-sync, but the
// summed number is still meaningful either way).
router.get('/sales', (req, res) => {
  const restaurantId = Number(req.query.restaurant_id);
  const year = Number(req.query.year);
  const month = Number(req.query.month);

  if (!restaurantId || !year || !month || month < 1 || month > 12) {
    return res.status(400).json({ error: 'restaurant_id, year, and month (1-12) are required' });
  }

  const restaurant = db.prepare(`SELECT id FROM restaurants WHERE id = ?`).get(restaurantId);
  if (!restaurant) {
    return res.status(404).json({ error: 'Unknown restaurant_id' });
  }

  const numDays = daysInMonth(year, month);
  const monthPrefix = `${year}-${pad2(month)}`;
  const firstDay = `${monthPrefix}-01`;
  const lastDay = `${monthPrefix}-${pad2(numDays)}`;

  const dishes = db.prepare(
    `SELECT id, dish_code, name, prep_type FROM dishes WHERE restaurant_id = ? AND active = 1 ORDER BY dish_code`
  ).all(restaurantId);

  const salesRows = db.prepare(
    `SELECT dish_id, business_date, quantity, source
     FROM sales
     WHERE restaurant_id = ? AND business_date >= ? AND business_date <= ?`
  ).all(restaurantId, firstDay, lastDay);

  // dish_id -> business_date -> { quantity, sources: Set }
  const byDish = new Map();
  for (const row of salesRows) {
    if (!byDish.has(row.dish_id)) byDish.set(row.dish_id, new Map());
    const byDate = byDish.get(row.dish_id);
    const existing = byDate.get(row.business_date);
    if (existing) {
      existing.quantity += row.quantity;
      existing.sources.add(row.source);
    } else {
      byDate.set(row.business_date, { quantity: row.quantity, sources: new Set([row.source]) });
    }
  }

  const rows = dishes.map(dish => {
    const byDate = byDish.get(dish.id);
    const days = {};
    for (let d = 1; d <= numDays; d++) {
      const dateStr = `${monthPrefix}-${pad2(d)}`;
      const cell = byDate ? byDate.get(dateStr) : undefined;
      days[dateStr] = cell
        ? { quantity: cell.quantity, source: cell.sources.size > 1 ? 'MIXED' : [...cell.sources][0] }
        : null;
    }
    return {
      dish_id: dish.id,
      dish_code: dish.dish_code,
      name: dish.name,
      prep_type: dish.prep_type,
      days
    };
  });

  res.json({ restaurant_id: restaurantId, year, month, days_in_month: numDays, dishes: rows });
});

// PATCH /api/sales
// Body: { restaurant_id, dish_id, business_date, quantity }
// Upserts the MANUAL row for that cell. quantity null/undefined/''
// clears the cell (deletes the MANUAL row, if any) - this is how a
// filled-in cell gets erased from the grid. Never touches LOYVERSE rows
// for the same cell (there shouldn't be any yet, but if there ever are,
// this only ever targets source = 'MANUAL').
router.patch('/sales', (req, res) => {
  const { restaurant_id, dish_id, business_date, quantity } = req.body || {};

  if (!restaurant_id || !dish_id || !business_date) {
    return res.status(400).json({ error: 'restaurant_id, dish_id, and business_date are required' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(business_date)) {
    return res.status(400).json({ error: 'business_date must be YYYY-MM-DD' });
  }

  const dish = db.prepare(`SELECT id FROM dishes WHERE id = ? AND restaurant_id = ? AND active = 1`).get(dish_id, restaurant_id);
  if (!dish) {
    return res.status(400).json({ error: 'Unknown dish_id for this restaurant, or dish is inactive' });
  }

  const isClearing = quantity === null || quantity === undefined || quantity === '';
  if (!isClearing && (typeof quantity !== 'number' && isNaN(Number(quantity)))) {
    return res.status(400).json({ error: 'quantity must be a number, or null/omitted to clear the cell' });
  }
  if (!isClearing && Number(quantity) < 0) {
    return res.status(400).json({ error: 'quantity cannot be negative' });
  }

  const deleteManual = db.prepare(
    `DELETE FROM sales WHERE restaurant_id = ? AND dish_id = ? AND business_date = ? AND source = 'MANUAL'`
  );
  deleteManual.run(restaurant_id, dish_id, business_date);

  if (isClearing) {
    return res.json({ ok: true, cleared: true });
  }

  db.prepare(
    `INSERT INTO sales (restaurant_id, dish_id, business_date, quantity, source) VALUES (?, ?, ?, ?, 'MANUAL')`
  ).run(restaurant_id, dish_id, business_date, Number(quantity));

  res.json({ ok: true, cleared: false, quantity: Number(quantity) });
});

module.exports = router;
