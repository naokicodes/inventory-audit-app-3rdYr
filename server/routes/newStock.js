// API routes for the New Stock daily entry screen.
// See docs/daily-workflow.md for the intended flow this supports.

const express = require('express');
const db = require('../db/connection.js');

const router = express.Router();

// GET /api/restaurants - list active restaurants, for the dropdown
router.get('/restaurants', (req, res) => {
  const restaurants = db.prepare(
    `SELECT id, name, code FROM restaurants WHERE active = 1 ORDER BY name`
  ).all();
  res.json(restaurants);
});

// GET /api/meats?restaurant_id=1 - list active meats for one restaurant
router.get('/meats', (req, res) => {
  const restaurantId = Number(req.query.restaurant_id);
  if (!restaurantId) {
    return res.status(400).json({ error: 'restaurant_id is required' });
  }
  const meats = db.prepare(
    `SELECT id, meat_code, name, unit FROM meats WHERE restaurant_id = ? AND active = 1 ORDER BY meat_code`
  ).all(restaurantId);
  res.json(meats);
});

// GET /api/new-stock?restaurant_id=1&date=2026-08-25
// Returns every active meat for the restaurant, with existing quantity
// (or null if nothing's been entered yet for that date) - the frontend
// uses this single response to render the whole form pre-filled.
router.get('/new-stock', (req, res) => {
  const restaurantId = Number(req.query.restaurant_id);
  const date = req.query.date;
  if (!restaurantId || !date) {
    return res.status(400).json({ error: 'restaurant_id and date are required' });
  }

  const meats = db.prepare(
    `SELECT id, meat_code, name, unit FROM meats WHERE restaurant_id = ? AND active = 1 ORDER BY meat_code`
  ).all(restaurantId);

  const existing = db.prepare(
    `SELECT meat_id, quantity, photo_path FROM new_stock WHERE restaurant_id = ? AND business_date = ?`
  ).all(restaurantId, date);
  const existingByMeat = Object.fromEntries(existing.map(e => [e.meat_id, e]));

  const result = meats.map(m => ({
    meat_id: m.id,
    meat_code: m.meat_code,
    name: m.name,
    unit: m.unit,
    quantity: existingByMeat[m.id] ? existingByMeat[m.id].quantity : null,
    photo_path: existingByMeat[m.id] ? existingByMeat[m.id].photo_path : null
  }));

  res.json(result);
});

// POST /api/new-stock
// Body: { restaurant_id, business_date, entries: [{ meat_id, quantity, photo_path? }] }
// Upserts each entry - safe to call repeatedly for the same day (corrections).
router.post('/new-stock', (req, res) => {
  const { restaurant_id, business_date, entries } = req.body;

  if (!restaurant_id || !business_date || !Array.isArray(entries)) {
    return res.status(400).json({ error: 'restaurant_id, business_date, and entries[] are required' });
  }

  const upsert = db.prepare(`
    INSERT INTO new_stock (restaurant_id, meat_id, business_date, quantity, photo_path, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(restaurant_id, meat_id, business_date)
    DO UPDATE SET quantity = excluded.quantity, photo_path = excluded.photo_path
  `);

  let saved = 0;
  for (const entry of entries) {
    if (entry.quantity === null || entry.quantity === undefined || entry.quantity === '') continue;
    upsert.run(
      restaurant_id,
      entry.meat_id,
      business_date,
      Number(entry.quantity),
      entry.photo_path || null,
      req.body.created_by || null
    );
    saved++;
  }

  res.json({ ok: true, saved });
});

module.exports = router;
