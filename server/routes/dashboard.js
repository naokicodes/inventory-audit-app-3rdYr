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

// GET /api/dashboard/stock-rollup?date=YYYY-MM-DD&restaurant_ids=1,2
// restaurant_ids is optional CSV - defaults to every active restaurant.
// Rows = every active commissary meat. Each row: Commissary's own
// current balance, plus one reverse-converted total per selected
// restaurant (summed across every one of that restaurant's own meats
// that has a commissary_conversion_standards row pointing back to this
// commissary meat - a commissary meat can legitimately feed several of
// a restaurant's own meats, e.g. Jowl feeding both FC's Bagnet and
// Sisig, and both should count toward Jowl's total under FC's column).
router.get('/dashboard/stock-rollup', (req, res) => {
  const { date, restaurant_ids } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'date is required' });
  }

  const restaurants = restaurant_ids
    ? restaurant_ids.split(',').map(Number).map(id => db.prepare('SELECT id, name FROM restaurants WHERE id = ? AND active = 1').get(id)).filter(Boolean)
    : db.prepare('SELECT id, name FROM restaurants WHERE active = 1 ORDER BY name').all();

  const commissaryMeats = db.prepare('SELECT id, code, name, unit, meat_type_id FROM commissary_meats WHERE active = 1 ORDER BY code').all();

  const rows = commissaryMeats.map(cm => {
    const commissaryAudit = computeCommissaryMeatAudit(db, cm.id, date);
    const commissaryBalance = currentBalance(commissaryAudit);
    const commissaryHasData = commissaryAudit.status !== 'MISSING_BEGINNING_STOCK';

    const byRestaurant = {};
    let grandTotal = commissaryBalance || 0;
    let anyRestaurantHasData = false;

    // Step 23b (2026-08-31): commissary_conversion_standards is now keyed by
    // meat_type_id, not commissary_meat_id - resolve via cm's own tag. An
    // untagged commissary meat has no possible standards (raw/dynamic
    // meats are unaffected, per data-model.md section 10b), same as
    // before this rekey. NOTE: this is the minimal fix to keep this row's
    // OWN rollup correct against the new schema - it does not yet do the
    // fuller cross-commissary grouping (combining, say, Commissary A's and
    // Commissary B's same-meat_type rows into one line) that session-
    // status.md's 23b item 6 describes; that grouping restructure is still
    // open, deliberately not decided here.
    for (const restaurant of restaurants) {
      const standards = cm.meat_type_id === null ? [] : db.prepare(`
        SELECT meat_id, ratio_per_unit FROM commissary_conversion_standards
        WHERE meat_type_id = ? AND restaurant_id = ? AND active = 1
      `).all(cm.meat_type_id, restaurant.id);

      let restaurantTotal = 0;
      let restaurantHasData = false;
      for (const std of standards) {
        const meatAudit = computeMeatAudit(db, restaurant.id, std.meat_id, date);
        const balance = currentBalance(meatAudit);
        if (balance !== null) {
          restaurantTotal += balance / std.ratio_per_unit;
          restaurantHasData = true;
          anyRestaurantHasData = true;
        }
      }

      byRestaurant[restaurant.id] = { total: restaurantTotal, hasData: restaurantHasData, standardCount: standards.length };
      grandTotal += restaurantTotal;
    }

    return {
      commissary_meat_id: cm.id,
      code: cm.code,
      name: cm.name,
      unit: cm.unit,
      commissary_balance: commissaryBalance,
      commissary_has_data: commissaryHasData,
      by_restaurant: byRestaurant,
      grand_total: grandTotal,
      row_has_any_data: commissaryHasData || anyRestaurantHasData
    };
  });

  res.json({ date, restaurants, rows });
});

module.exports = router;
