// Settings API - admin management of meats, dishes, and recipes.
// This is where restaurant setup happens (occasional use, not daily) -
// see docs/daily-workflow.md, this is deliberately separate from the
// auditor's daily screens.

const express = require('express');
const db = require('../db/connection.js');

const router = express.Router();

// ---------- MEATS ----------

router.get('/settings/meats', (req, res) => {
  const restaurantId = Number(req.query.restaurant_id);
  if (!restaurantId) return res.status(400).json({ error: 'restaurant_id required' });
  const meats = db.prepare(
    `SELECT id, meat_code, name, unit, cost_per_unit, active FROM meats WHERE restaurant_id = ? ORDER BY meat_code`
  ).all(restaurantId);
  res.json(meats);
});

router.post('/settings/meats', (req, res) => {
  const { restaurant_id, meat_code, name, unit, cost_per_unit } = req.body;
  if (!restaurant_id || !meat_code || !name || !unit) {
    return res.status(400).json({ error: 'restaurant_id, meat_code, name, and unit are required' });
  }
  if (!['kg', 'unit'].includes(unit)) {
    return res.status(400).json({ error: 'unit must be "kg" or "unit"' });
  }
  try {
    const result = db.prepare(
      `INSERT INTO meats (restaurant_id, meat_code, name, unit, cost_per_unit) VALUES (?, ?, ?, ?, ?)`
    ).run(restaurant_id, meat_code.toUpperCase(), name, unit, cost_per_unit || null);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'That meat code already exists.' : err.message });
  }
});

router.put('/settings/meats/:id', (req, res) => {
  const { name, unit, cost_per_unit, active } = req.body;
  db.prepare(
    `UPDATE meats SET name = ?, unit = ?, cost_per_unit = ?, active = ? WHERE id = ?`
  ).run(name, unit, cost_per_unit || null, active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

// ---------- DISHES ----------

router.get('/settings/dishes', (req, res) => {
  const restaurantId = Number(req.query.restaurant_id);
  if (!restaurantId) return res.status(400).json({ error: 'restaurant_id required' });
  const dishes = db.prepare(
    `SELECT id, dish_code, name, prep_type, cost_per_portion, active FROM dishes WHERE restaurant_id = ? ORDER BY dish_code`
  ).all(restaurantId);
  res.json(dishes);
});

router.post('/settings/dishes', (req, res) => {
  const { restaurant_id, dish_code, name, prep_type, cost_per_portion } = req.body;
  if (!restaurant_id || !dish_code || !name || !prep_type) {
    return res.status(400).json({ error: 'restaurant_id, dish_code, name, and prep_type are required' });
  }
  if (!['DIRECT', 'BATCH_PREPPED'].includes(prep_type)) {
    return res.status(400).json({ error: 'prep_type must be DIRECT or BATCH_PREPPED' });
  }
  try {
    const result = db.prepare(
      `INSERT INTO dishes (restaurant_id, dish_code, name, prep_type, cost_per_portion) VALUES (?, ?, ?, ?, ?)`
    ).run(restaurant_id, dish_code.toUpperCase(), name, prep_type, cost_per_portion || null);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'That dish code already exists.' : err.message });
  }
});

router.put('/settings/dishes/:id', (req, res) => {
  const { name, prep_type, cost_per_portion, active } = req.body;
  db.prepare(
    `UPDATE dishes SET name = ?, prep_type = ?, cost_per_portion = ?, active = ? WHERE id = ?`
  ).run(name, prep_type, cost_per_portion || null, active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

// ---------- RECIPE_BOM ----------
// Returns recipe rows joined with dish/meat names for readability, plus
// the full meat/dish lists separately so the frontend can build "add a
// new ingredient line" dropdowns.

router.get('/settings/recipes', (req, res) => {
  const restaurantId = Number(req.query.restaurant_id);
  if (!restaurantId) return res.status(400).json({ error: 'restaurant_id required' });

  const rows = db.prepare(`
    SELECT r.id, r.dish_id, d.name as dish_name, r.meat_id, m.name as meat_name,
           m.unit, r.quantity, r.effective_from, r.effective_until
    FROM recipe_bom r
    JOIN dishes d ON d.id = r.dish_id
    JOIN meats m ON m.id = r.meat_id
    WHERE d.restaurant_id = ?
      AND (r.effective_until IS NULL OR r.effective_until >= date('now'))
    ORDER BY d.name, m.name
  `).all(restaurantId);

  res.json(rows);
});

router.post('/settings/recipes', (req, res) => {
  const { dish_id, meat_id, quantity } = req.body;
  if (!dish_id || !meat_id || quantity === undefined || quantity === null) {
    return res.status(400).json({ error: 'dish_id, meat_id, and quantity are required' });
  }
  const today = new Date().toISOString().slice(0, 10);
  const result = db.prepare(
    `INSERT INTO recipe_bom (dish_id, meat_id, quantity, effective_from) VALUES (?, ?, ?, ?)`
  ).run(dish_id, meat_id, Number(quantity), today);
  res.json({ ok: true, id: result.lastInsertRowid });
});

// Recipe versioning: don't destroy history, close out the old row and
// open a new one - matches data-model.md's recipe versioning rule.
router.put('/settings/recipes/:id', (req, res) => {
  const { quantity } = req.body;
  const old = db.prepare(`SELECT * FROM recipe_bom WHERE id = ?`).get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Recipe row not found' });

  const today = new Date().toISOString().slice(0, 10);
  db.prepare(`UPDATE recipe_bom SET effective_until = ? WHERE id = ?`).run(today, req.params.id);
  const result = db.prepare(
    `INSERT INTO recipe_bom (dish_id, meat_id, quantity, effective_from) VALUES (?, ?, ?, ?)`
  ).run(old.dish_id, old.meat_id, Number(quantity), today);
  res.json({ ok: true, id: result.lastInsertRowid });
});

router.delete('/settings/recipes/:id', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(`UPDATE recipe_bom SET effective_until = ? WHERE id = ?`).run(today, req.params.id);
  res.json({ ok: true });
});

// ---------- COMMISSARY MAPPING ----------
// commissary_meat_map admin screen (step 8) - see
// docs/commissary-and-stock-receipts.md Part 1 and docs/data-model.md
// section 10a. Config/reference data, not a daily transactional log -
// deliberately NOT wired into activity_log (rules-for-claude-code.md
// rule 9 scopes that to stock_receipts and commissary_yield_log only).
// No PUT/edit for v1 - a wrong mapping is delete + re-add.

router.get('/settings/commissary-mappings', (req, res) => {
  const restaurantId = Number(req.query.restaurant_id);
  if (!restaurantId) return res.status(400).json({ error: 'restaurant_id required' });

  const rows = db.prepare(`
    SELECT cmm.id, cmm.commissary_meat_id, cm.code as commissary_meat_code, cm.name as commissary_meat_name,
           cmm.meat_id, m.meat_code, m.name as meat_name
    FROM commissary_meat_map cmm
    JOIN commissary_meats cm ON cm.id = cmm.commissary_meat_id
    JOIN meats m ON m.id = cmm.meat_id
    WHERE cmm.restaurant_id = ?
    ORDER BY cm.code
  `).all(restaurantId);

  res.json(rows);
});

router.post('/settings/commissary-mappings', (req, res) => {
  const { restaurant_id, commissary_meat_id, meat_id } = req.body;
  if (!restaurant_id || !commissary_meat_id || !meat_id) {
    return res.status(400).json({ error: 'restaurant_id, commissary_meat_id, and meat_id are required' });
  }
  try {
    const result = db.prepare(
      `INSERT INTO commissary_meat_map (commissary_meat_id, restaurant_id, meat_id) VALUES (?, ?, ?)`
    ).run(commissary_meat_id, restaurant_id, meat_id);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'That commissary meat is already mapped for this restaurant.' : err.message });
  }
});

router.delete('/settings/commissary-mappings/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM commissary_meat_map WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Mapping not found' });
  res.json({ ok: true });
});

// ---------- ADJUSTMENT TYPES ----------
// Step 22 (session-status.md): minimal admin CRUD for adjustment_types,
// built alongside the new Allocations page since one of the six real
// types ("Allocation / Transfer") needs a way to exist beyond hand-
// editing schema.sql's seed rows. Global list - not restaurant-scoped
// (adjustment_types has no restaurant_id column). Same pattern as
// Meats/Dishes above (name + a flag + active, edit-in-place). Not wired
// into activity_log - config data, not a daily transactional log, same
// reasoning as Commissary Mapping above.

router.get('/settings/adjustment-types', (req, res) => {
  const rows = db.prepare(
    `SELECT id, name, requires_transfer_locations, active FROM adjustment_types ORDER BY name`
  ).all();
  res.json(rows);
});

router.post('/settings/adjustment-types', (req, res) => {
  const { name, requires_transfer_locations } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const result = db.prepare(
      `INSERT INTO adjustment_types (name, requires_transfer_locations) VALUES (?, ?)`
    ).run(name.trim(), requires_transfer_locations ? 1 : 0);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'That adjustment type name already exists.' : err.message });
  }
});

router.put('/settings/adjustment-types/:id', (req, res) => {
  const { name, requires_transfer_locations, active } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    db.prepare(
      `UPDATE adjustment_types SET name = ?, requires_transfer_locations = ?, active = ? WHERE id = ?`
    ).run(name.trim(), requires_transfer_locations ? 1 : 0, active ? 1 : 0, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'That adjustment type name already exists.' : err.message });
  }
});

// ---------- LOCATIONS ----------
// Step 22: minimal admin CRUD for locations, the from/to picklist for
// any adjustment type with requires_transfer_locations = 1. Global list
// spanning every restaurant plus shared/central locations
// (restaurant_id = null, e.g. the commissary) - deliberately not
// filtered by whichever restaurant is selected elsewhere on the
// Settings page, since a transfer can span two different restaurants
// and the picklist needs to offer all of them. Not wired into
// activity_log - same reasoning as Commissary Mapping/Adjustment Types.

router.get('/settings/locations', (req, res) => {
  const rows = db.prepare(`
    SELECT l.id, l.name, l.restaurant_id, r.name as restaurant_name, l.is_restaurant_level, l.active
    FROM locations l
    LEFT JOIN restaurants r ON r.id = l.restaurant_id
    ORDER BY r.name IS NULL DESC, r.name, l.name
  `).all();
  res.json(rows);
});

router.post('/settings/locations', (req, res) => {
  const { name, restaurant_id, is_restaurant_level } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  const result = db.prepare(
    `INSERT INTO locations (name, restaurant_id, is_restaurant_level) VALUES (?, ?, ?)`
  ).run(name.trim(), restaurant_id || null, is_restaurant_level ? 1 : 0);
  res.json({ ok: true, id: result.lastInsertRowid });
});

router.put('/settings/locations/:id', (req, res) => {
  const { name, restaurant_id, is_restaurant_level, active } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  db.prepare(
    `UPDATE locations SET name = ?, restaurant_id = ?, is_restaurant_level = ?, active = ? WHERE id = ?`
  ).run(name.trim(), restaurant_id || null, is_restaurant_level ? 1 : 0, active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
