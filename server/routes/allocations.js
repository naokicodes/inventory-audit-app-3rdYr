// API for the Allocations page - step 22 (session-status.md). Replaces
// Landing's old In-House/Wastage/Other three input boxes with a single
// dedicated entry log, same pattern as the 2026-08-27 change did for
// New Stock (stock_receipts / stock-receipts.html). Landing's meat row
// now shows one read-only `adjustments` cell (already computed by
// computeMeatAudit as SUM(quantity) FROM adjustments - see
// dailyAudit.js), fed entirely by this page instead of three hardcoded
// per-type writes on the Landing save handler.
//
// Append-only (GET list + POST create, no PUT/DELETE) - `adjustments`
// is explicitly on scope.md's deferred-activity-logging list, same
// treatment as `sales`/`commissary_stock_receipts` got. Landing's old
// behavior was itself a delete-then-insert singleton per (restaurant,
// meat, date, type); this page instead treats each entry as its own
// log row, closer to how stock_receipts already works and how the
// audit engine already sums adjustments (SUM across every row that
// day, not "the one row for this type") - a real, deliberate behavior
// change from the old three-box UI, not just a relocation of it.
//
// Meat/restaurant dropdowns reuse existing endpoints
// (GET /api/restaurants, GET /api/stock-receipts/meats?restaurant_id=)
// rather than duplicating them here. Adjustment types and locations
// come from the new GET /api/settings/adjustment-types and
// GET /api/settings/locations (step 22) - the frontend filters to
// active=1 itself, same as it already does for meats/restaurants
// elsewhere in the app.

const express = require('express');
const db = require('../db/connection.js');

const router = express.Router();

// GET /api/allocations?restaurant_id=&meat_id=&business_date=&adjustment_type_id=
// Filterable list - all filters optional. Ordered newest-first, same
// convention as GET /api/stock-receipts.
router.get('/allocations', (req, res) => {
  const { restaurant_id, meat_id, business_date, adjustment_type_id } = req.query;

  const clauses = [];
  const params = [];

  if (restaurant_id) { clauses.push('a.restaurant_id = ?'); params.push(Number(restaurant_id)); }
  if (meat_id) { clauses.push('a.meat_id = ?'); params.push(Number(meat_id)); }
  if (business_date) { clauses.push('a.business_date = ?'); params.push(business_date); }
  if (adjustment_type_id) { clauses.push('a.adjustment_type_id = ?'); params.push(Number(adjustment_type_id)); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT
      a.id, a.restaurant_id, r.name as restaurant_name,
      a.meat_id, m.meat_code, m.name as meat_name, m.unit,
      a.business_date, a.quantity,
      a.adjustment_type_id, at.name as adjustment_type_name, at.requires_transfer_locations,
      a.from_location_id, fl.name as from_location_name,
      a.to_location_id, tl.name as to_location_name,
      a.notes, a.created_by
    FROM adjustments a
    JOIN restaurants r ON r.id = a.restaurant_id
    JOIN meats m ON m.id = a.meat_id
    JOIN adjustment_types at ON at.id = a.adjustment_type_id
    LEFT JOIN locations fl ON fl.id = a.from_location_id
    LEFT JOIN locations tl ON tl.id = a.to_location_id
    ${where}
    ORDER BY a.id DESC
  `).all(...params);

  res.json(rows);
});

// POST /api/allocations
// Body: { restaurant_id, meat_id, business_date, adjustment_type_id,
//         quantity, from_location_id?, to_location_id?, notes? }
//
// from_location_id/to_location_id are required together when the chosen
// type has requires_transfer_locations = 1, and rejected (not silently
// ignored) when it doesn't - a client sending them for a plain Wastage
// entry is almost certainly a bug worth surfacing, not data worth
// quietly dropping.
router.post('/allocations', (req, res) => {
  const {
    restaurant_id, meat_id, business_date, adjustment_type_id, quantity,
    from_location_id, to_location_id, notes, created_by
  } = req.body;

  if (!restaurant_id || !meat_id || !business_date || !adjustment_type_id
      || quantity === undefined || quantity === null || quantity === '') {
    return res.status(400).json({ error: 'restaurant_id, meat_id, business_date, adjustment_type_id, and quantity are required' });
  }

  const restaurant = db.prepare('SELECT id FROM restaurants WHERE id = ? AND active = 1').get(restaurant_id);
  if (!restaurant) return res.status(400).json({ error: 'Unknown or inactive restaurant_id' });

  const meat = db.prepare('SELECT id FROM meats WHERE id = ? AND restaurant_id = ? AND active = 1').get(meat_id, restaurant_id);
  if (!meat) return res.status(400).json({ error: `meat_id ${meat_id} is not an active meat belonging to restaurant_id ${restaurant_id}` });

  const type = db.prepare('SELECT id, name, requires_transfer_locations FROM adjustment_types WHERE id = ? AND active = 1').get(adjustment_type_id);
  if (!type) return res.status(400).json({ error: 'Unknown or inactive adjustment_type_id' });

  if (type.requires_transfer_locations) {
    if (!from_location_id || !to_location_id) {
      return res.status(400).json({ error: `"${type.name}" requires both a from and a to location` });
    }
    const fromLoc = db.prepare('SELECT id FROM locations WHERE id = ? AND active = 1').get(from_location_id);
    if (!fromLoc) return res.status(400).json({ error: 'Unknown or inactive from_location_id' });
    const toLoc = db.prepare('SELECT id FROM locations WHERE id = ? AND active = 1').get(to_location_id);
    if (!toLoc) return res.status(400).json({ error: 'Unknown or inactive to_location_id' });
  } else if (from_location_id || to_location_id) {
    return res.status(400).json({ error: `"${type.name}" doesn't use from/to locations - leave both blank` });
  }

  const result = db.prepare(`
    INSERT INTO adjustments (restaurant_id, meat_id, business_date, quantity, adjustment_type_id, from_location_id, to_location_id, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    restaurant_id, meat_id, business_date, Number(quantity), adjustment_type_id,
    type.requires_transfer_locations ? from_location_id : null,
    type.requires_transfer_locations ? to_location_id : null,
    notes || null, created_by || null
  );

  res.json({ ok: true, id: result.lastInsertRowid });
});

module.exports = router;
