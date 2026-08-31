// Backend for item 2 of the 2026-08-29 "Future considerations" list -
// the management dashboard, cross-location stock rollup. Envisioned
// shape (session-status.md): rows = Commissary meat items (the root
// meats), columns = each location (toggleable), grand total column.
//
// Unblocked by item 5's commissary_conversion_standards table - the
// existence of that table is what makes reverse-conversion possible
// (a restaurant's portioned stock, back to a commissary-meat-
// equivalent), which is what a correct grand total actually needs.

const express = require('express');
const db = require('../db/connection.js');
const { computeMeatAudit } = require('../engines/auditEngine.js');
const { computeCommissaryMeatAudit } = require('../engines/commissaryAuditEngine.js');

const router = express.Router();

// A meat/date's "current balance" for rollup purposes: the real
// physical count if one exists, otherwise the calculated ending -
// same "prefer actual over calculated" reasoning used everywhere else
// in this app for a "what do we currently have" question. Missing
// data (MISSING_BEGINNING_STOCK - beginning not yet established for
// this meat at all) contributes 0 to sums rather than breaking the
// rollup, but is flagged per-cell so the frontend can show it
// differently than a genuine zero.
function currentBalance(auditResult) {
  if (auditResult.actual !== null && auditResult.actual !== undefined) return auditResult.actual;
  if (auditResult.endingCalculated !== null && auditResult.endingCalculated !== undefined) return auditResult.endingCalculated;
  return null; // MISSING_BEGINNING_STOCK - no data at all for this meat/date yet
}

// Reverse-converted restaurant totals for ONE meat_type_id, computed once
// per grouped row (never per commissary) - this is the actual fix for the
// double-count bug described below. Mirrors the per-restaurant loop this
// route always had, just factored out so a group of several commissary
// meats sharing a meat_type_id calls it exactly once.
function computeRestaurantTotals(db, date, restaurants, meatTypeId) {
  const byRestaurant = {};
  let restaurantsSum = 0;
  let anyHasData = false;

  for (const restaurant of restaurants) {
    const standards = meatTypeId === null ? [] : db.prepare(`
      SELECT meat_id, ratio_per_unit FROM commissary_conversion_standards
      WHERE meat_type_id = ? AND restaurant_id = ? AND active = 1
    `).all(meatTypeId, restaurant.id);

    let restaurantTotal = 0;
    let restaurantHasData = false;
    for (const std of standards) {
      const meatAudit = computeMeatAudit(db, restaurant.id, std.meat_id, date);
      const balance = currentBalance(meatAudit);
      if (balance !== null) {
        restaurantTotal += balance / std.ratio_per_unit;
        restaurantHasData = true;
        anyHasData = true;
      }
    }

    byRestaurant[restaurant.id] = { total: restaurantTotal, hasData: restaurantHasData, standardCount: standards.length };
    restaurantsSum += restaurantTotal;
  }

  return { byRestaurant, restaurantsSum, anyHasData };
}

// GET /api/dashboard/stock-rollup?date=YYYY-MM-DD&restaurant_ids=1,2
// restaurant_ids is optional CSV - defaults to every active restaurant.
// No commissary_id filter - the Dashboard is deliberately cross-commissary.
//
// Step 23b-vi-a (2026-08-31): rows are now GROUPED by (meat_type_id, unit)
// per data-model.md section 10c, not one row per commissary meat. This is
// a correctness fix, not just a display change: commissary_conversion_
// standards is keyed by meat_type_id, so two commissary meats sharing a
// type (now possible since 23c-i's Commissary-creation UI shipped) would
// otherwise both resolve the SAME standards and double-count the same
// restaurant stock. Grouping computes computeRestaurantTotals ONCE per
// group, on the parent row, structurally ruling that out. Grouping key is
// (meat_type_id, unit), not meat_type_id alone - meat_types has no unit
// column, and a type whose members disagree on unit (kg vs unit) would
// otherwise sum into a meaningless number; see data-model.md section 10c
// for the full reasoning, including the deliberately-unresolved question
// of whether meat_types should someday get its own authoritative unit
// column. An untagged commissary meat (meat_type_id IS NULL) gets its own
// kind:"untagged" row rather than being grouped or omitted - real stock
// must not silently vanish from an audit screen. Sort order is by name
// (meat_type name for grouped rows, the meat's own name for untagged
// rows) - a grouped row has no single code to sort by, unlike before.
router.get('/dashboard/stock-rollup', (req, res) => {
  const { date, restaurant_ids } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'date is required' });
  }

  const restaurants = restaurant_ids
    ? restaurant_ids.split(',').map(Number).map(id => db.prepare('SELECT id, name FROM restaurants WHERE id = ? AND active = 1').get(id)).filter(Boolean)
    : db.prepare('SELECT id, name FROM restaurants WHERE active = 1 ORDER BY name').all();

  // LEFT JOIN, not INNER - SQLite doesn't enforce FKs unless
  // PRAGMA foreign_keys=ON, so a dangling commissary_id is reachable; an
  // INNER JOIN would silently drop that meat's real stock from the whole
  // Dashboard instead of just leaving commissary_code/commissary_name
  // null. Same fix as 23c-ii-c's GET /api/commissary/meats.
  const commissaryMeats = db.prepare(`
    SELECT cm.id, cm.code, cm.name, cm.unit, cm.meat_type_id, cm.commissary_id,
           c.code as commissary_code, c.name as commissary_name
    FROM commissary_meats cm
    LEFT JOIN commissaries c ON c.id = cm.commissary_id
    WHERE cm.active = 1
  `).all();

  // Each commissary meat's own balance, computed once regardless of
  // whether it ends up grouped or standalone.
  const perMeat = commissaryMeats.map(cm => {
    const commissaryAudit = computeCommissaryMeatAudit(db, cm.id, date);
    return {
      ...cm,
      balance: currentBalance(commissaryAudit),
      hasData: commissaryAudit.status !== 'MISSING_BEGINNING_STOCK'
    };
  });

  const groups = new Map(); // `${meat_type_id}::${unit}` -> commissary meats sharing that group
  const untaggedMeats = [];
  for (const m of perMeat) {
    if (m.meat_type_id === null) {
      untaggedMeats.push(m);
      continue;
    }
    const key = `${m.meat_type_id}::${m.unit}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }

  const meatTypeRows = [...groups.values()].map(members => {
    const meatTypeId = members[0].meat_type_id;
    const unit = members[0].unit;
    // Step 23b-vi-b: SQLite doesn't enforce FKs unless PRAGMA
    // foreign_keys=ON, so a dangling meat_type_id (the row it pointed to
    // was deleted, or never existed) must not throw and 500 the whole
    // Dashboard - degrade this one row instead, same "missing data is
    // shown, not fatal" treatment as every other gap in this route.
    const meatType = db.prepare('SELECT name, active FROM meat_types WHERE id = ?').get(meatTypeId);
    const meatTypeName = meatType ? meatType.name : `(unknown meat type #${meatTypeId})`;
    const meatTypeActive = meatType ? !!meatType.active : false;

    const commissaryBalance = members.reduce((sum, m) => sum + (m.balance || 0), 0);
    const commissaryHasData = members.some(m => m.hasData);
    // Same "missing data is shown, not fatal" guard as the dangling
    // meat_type_id case above (23b-vi-b) - a dangling commissary_id (LEFT
    // JOIN above) leaves commissary_code/commissary_name null rather than
    // dropping the row, so it must degrade to a labeled fallback here
    // rather than surfacing null/undefined, and .sort() below needs a
    // real string to compare regardless.
    const byCommissary = members
      .map(m => ({
        commissary_id: m.commissary_id,
        code: m.commissary_code !== null ? m.commissary_code : `(unknown commissary #${m.commissary_id})`,
        name: m.commissary_name !== null ? m.commissary_name : `(unknown commissary #${m.commissary_id})`,
        commissary_meat_id: m.id,
        balance: m.balance,
        has_data: m.hasData
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    const { byRestaurant, restaurantsSum, anyHasData } = computeRestaurantTotals(db, date, restaurants, meatTypeId);

    return {
      kind: 'meat_type',
      meat_type_id: meatTypeId,
      name: meatTypeName,
      unit,
      // Step 23b-vi-b (data-model.md section 10c): additive, informational
      // only - rows are NEVER filtered on this. Deactivating a meat type is
      // a cataloguing statement, not a claim the stock vanished; hiding it
      // would be exactly the kind of silent-drop this audit tool must not do.
      meat_type_active: meatTypeActive,
      commissary_balance: commissaryBalance,
      commissary_has_data: commissaryHasData,
      by_commissary: byCommissary,
      by_restaurant: byRestaurant,
      grand_total: commissaryBalance + restaurantsSum,
      row_has_any_data: commissaryHasData || anyHasData
    };
  });

  const untaggedRows = untaggedMeats.map(m => ({
    kind: 'untagged',
    commissary_meat_id: m.id,
    code: m.code,
    name: m.name,
    unit: m.unit,
    commissary_balance: m.balance,
    commissary_has_data: m.hasData,
    by_restaurant: {},
    grand_total: m.balance || 0,
    row_has_any_data: m.hasData
  }));

  const rows = [...meatTypeRows, ...untaggedRows].sort((a, b) => a.name.localeCompare(b.name));

  res.json({ date, restaurants, rows });
});

module.exports = router;
