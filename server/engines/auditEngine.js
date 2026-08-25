// Audit engine - the calculation core of the app.
// Matches the formulas in docs/data-model.md exactly. Every function here
// is a pure read/calculation - none of them write data. See
// docs/rules-for-claude-code.md: calculated values are never stored,
// always computed from the input tables.
//
// Sign convention (fixed, see rules-for-claude-code.md):
//   positive variance = shortage (meat missing)
//   negative variance = surplus (more on hand than expected)

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Beginning stock = yesterday's actual ending count.
 * Falls back to the one-time opening_stock entry if no prior day exists
 * (i.e. this is the first day this meat has ever been tracked).
 * Returns null if neither exists - meaning the caller is missing data
 * needed to compute anything further (should surface as "needs setup",
 * not silently treated as zero).
 */
function getBeginningStock(db, restaurantId, meatId, businessDate) {
  const priorDate = addDays(businessDate, -1);
  const prev = db.prepare(
    `SELECT quantity FROM ending_actual WHERE restaurant_id = ? AND meat_id = ? AND business_date = ?`
  ).get(restaurantId, meatId, priorDate);
  if (prev) return prev.quantity;

  const opening = db.prepare(
    `SELECT quantity FROM opening_stock WHERE restaurant_id = ? AND meat_id = ?`
  ).get(restaurantId, meatId);
  if (opening) return opening.quantity;

  return null;
}

function getNewStock(db, restaurantId, meatId, businessDate) {
  const row = db.prepare(
    `SELECT quantity FROM new_stock WHERE restaurant_id = ? AND meat_id = ? AND business_date = ?`
  ).get(restaurantId, meatId, businessDate);
  return row ? row.quantity : 0;
}

/**
 * Theoretical usage for one meat on one date:
 *   sum over DIRECT dishes:        sales(dish, date) * recipe_qty
 *   + sum over BATCH_PREPPED dishes: prepped(dish, date) * recipe_qty
 * Only considers recipe_bom rows whose effective date range covers
 * businessDate - preserves recipe versioning per data-model.md.
 */
function getUsage(db, restaurantId, meatId, businessDate) {
  const bomRows = db.prepare(`
    SELECT r.quantity, d.id as dish_id, d.prep_type
    FROM recipe_bom r
    JOIN dishes d ON d.id = r.dish_id
    WHERE r.meat_id = ?
      AND d.restaurant_id = ?
      AND r.effective_from <= ?
      AND (r.effective_until IS NULL OR r.effective_until >= ?)
  `).all(meatId, restaurantId, businessDate, businessDate);

  let total = 0;
  for (const row of bomRows) {
    if (row.prep_type === 'DIRECT') {
      const sale = db.prepare(
        `SELECT SUM(quantity) as qty FROM sales WHERE restaurant_id = ? AND dish_id = ? AND business_date = ?`
      ).get(restaurantId, row.dish_id, businessDate);
      total += (sale.qty || 0) * row.quantity;
    } else if (row.prep_type === 'BATCH_PREPPED') {
      const prep = db.prepare(
        `SELECT SUM(portions_produced) as qty FROM prepped WHERE restaurant_id = ? AND dish_id = ? AND business_date = ?`
      ).get(restaurantId, row.dish_id, businessDate);
      total += (prep.qty || 0) * row.quantity;
    }
  }
  return total;
}

/** Sum of known/documented adjustments (waste, transfers, etc.) for one meat/date. */
function getAdjustmentsTotal(db, restaurantId, meatId, businessDate) {
  const row = db.prepare(
    `SELECT SUM(quantity) as qty FROM adjustments WHERE restaurant_id = ? AND meat_id = ? AND business_date = ?`
  ).get(restaurantId, meatId, businessDate);
  return row.qty || 0;
}

function getEndingActual(db, restaurantId, meatId, businessDate) {
  const row = db.prepare(
    `SELECT quantity FROM ending_actual WHERE restaurant_id = ? AND meat_id = ? AND business_date = ?`
  ).get(restaurantId, meatId, businessDate);
  return row ? row.quantity : null;
}

/**
 * Full audit computation for one meat, one date.
 * Returns null fields where data is missing rather than guessing.
 */
function computeMeatAudit(db, restaurantId, meatId, businessDate) {
  const beginning = getBeginningStock(db, restaurantId, meatId, businessDate);
  const newStock = getNewStock(db, restaurantId, meatId, businessDate);
  const usage = getUsage(db, restaurantId, meatId, businessDate);
  const adjustments = getAdjustmentsTotal(db, restaurantId, meatId, businessDate);
  const actual = getEndingActual(db, restaurantId, meatId, businessDate);

  if (beginning === null) {
    return { beginning: null, newStock, usage, adjustments, actual, endingCalculated: null, variance: null, expectedEnding: null, unexplainedVariance: null, status: 'MISSING_BEGINNING_STOCK' };
  }

  const endingCalculated = beginning + newStock - usage;
  const expectedEnding = endingCalculated - adjustments;

  if (actual === null) {
    return { beginning, newStock, usage, adjustments, actual: null, endingCalculated, expectedEnding, variance: null, unexplainedVariance: null, status: 'MISSING_ACTUAL_COUNT' };
  }

  const variance = endingCalculated - actual;               // raw, before adjustments
  const unexplainedVariance = expectedEnding - actual;       // after known adjustments

  const EPSILON = 0.01; // float rounding tolerance
  let status;
  if (Math.abs(unexplainedVariance) <= EPSILON) status = 'OK';
  else if (unexplainedVariance > 0) status = 'SHORTAGE';
  else status = 'SURPLUS';

  return { beginning, newStock, usage, adjustments, actual, endingCalculated, expectedEnding, variance, unexplainedVariance, status };
}

/** Runs computeMeatAudit for every active meat in a restaurant, for one date. */
function computeDailyAudit(db, restaurantId, businessDate) {
  const meats = db.prepare(
    `SELECT id, meat_code, name, unit FROM meats WHERE restaurant_id = ? AND active = 1 ORDER BY meat_code`
  ).all(restaurantId);

  return meats.map(meat => ({
    meat_id: meat.id,
    meat_code: meat.meat_code,
    name: meat.name,
    unit: meat.unit,
    ...computeMeatAudit(db, restaurantId, meat.id, businessDate)
  }));
}

module.exports = {
  addDays,
  getBeginningStock,
  getNewStock,
  getUsage,
  getAdjustmentsTotal,
  getEndingActual,
  computeMeatAudit,
  computeDailyAudit
};
