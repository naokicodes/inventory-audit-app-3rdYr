// Commissary's own audit engine - step 20b (session-status.md).
// Mirrors computeMeatAudit's beginning/inflow/usage/ending/variance shape
// (server/engines/auditEngine.js), but Commissary has two real differences
// from every existing usage source in this app:
//   1. Two separate inflows, not one "new stock": Stock In (raw meat
//      arriving from an outside supplier, commissary_stock_receipts) and
//      Backed Up (the existing yield engine's output, commissary_yield_log
//      .backed_weight_out - unchanged, just read here).
//   2. Usage is the SUM of commissary_shipments.total_quantity across every
//      destination restaurant for that commissary meat/date - not
//      sales x recipe, not prepped-portions. Commissary doesn't sell to end
//      customers; its "usage" is everything shipped out to restaurants.
//
// Beginning derives from the prior day's commissary_ending_actual, falling
// back to commissary_opening_stock only on the very first day a meat is
// tracked - step 12's exact pattern (see getBeginningStock in
// auditEngine.js), just against the commissary_* tables. addDays is
// reused from auditEngine.js rather than duplicated - it's generic date
// math, not restaurant-specific.
//
// Ending is the real physical count from commissary_ending_actual, same as
// every other actual-vs-calculated comparison in this app.
//
// FLAGGED (not silently resolved - see rules-for-claude-code.md rule 3/7):
// computeMeatAudit has an `adjustments` layer (expectedEnding =
// endingCalculated - adjustments, from the `adjustments` table). None of
// step 20a's six commissary tables is an adjustments-equivalent - there is
// no commissary adjustments/waste-log table yet. So here `expectedEnding`
// always equals `endingCalculated`, and `unexplainedVariance` always
// equals `variance`. Both fields are still returned (for shape parity with
// computeMeatAudit and so a future commissary adjustments concept doesn't
// need a field rename), but right now they're redundant. If the architect
// conversation wants a real adjustments layer for Commissary (e.g. a
// commissary_adjustments table), that's new scope, not something to infer
// here.

const { addDays } = require('./auditEngine.js');

/**
 * Beginning stock = yesterday's commissary_ending_actual.
 * Falls back to the one-time commissary_opening_stock entry if no prior
 * day exists (first day this commissary meat has ever been tracked).
 * Returns null if neither exists.
 */
function getCommissaryBeginningStock(db, commissaryMeatId, businessDate) {
  const priorDate = addDays(businessDate, -1);
  const prev = db.prepare(
    `SELECT quantity FROM commissary_ending_actual WHERE commissary_meat_id = ? AND business_date = ?`
  ).get(commissaryMeatId, priorDate);
  if (prev) return prev.quantity;

  const opening = db.prepare(
    `SELECT quantity FROM commissary_opening_stock WHERE commissary_meat_id = ?`
  ).get(commissaryMeatId);
  if (opening) return opening.quantity;

  return null;
}

/**
 * Stock In = SUM of commissary_stock_receipts.quantity for this commissary
 * meat/date - raw meat arriving from an outside supplier. No deleted_at
 * filter: commissary_stock_receipts has no soft-delete column (rule 9
 * scopes that pattern to stock_receipts/commissary_yield_log only, see
 * schema.sql's step-20a note).
 */
function getCommissaryStockIn(db, commissaryMeatId, businessDate) {
  const row = db.prepare(
    `SELECT SUM(quantity) as qty FROM commissary_stock_receipts WHERE commissary_meat_id = ? AND business_date = ?`
  ).get(commissaryMeatId, businessDate);
  return row.qty || 0;
}

/**
 * Backed Up = SUM of commissary_yield_log.backed_weight_out for this
 * commissary meat/date - the existing yield engine's output, unchanged.
 * Excludes soft-deleted yield rows.
 */
function getCommissaryBackedUp(db, commissaryMeatId, businessDate) {
  const row = db.prepare(
    `SELECT SUM(backed_weight_out) as qty FROM commissary_yield_log WHERE commissary_meat_id = ? AND business_date = ? AND deleted_at IS NULL`
  ).get(commissaryMeatId, businessDate);
  return row.qty || 0;
}

/**
 * Usage = SUM of commissary_shipments.total_quantity across every
 * destination restaurant for this commissary meat/date. Not sales x
 * recipe, not prepped-portions - Commissary doesn't sell to end customers.
 */
function getCommissaryUsage(db, commissaryMeatId, businessDate) {
  const row = db.prepare(
    `SELECT SUM(total_quantity) as qty FROM commissary_shipments WHERE commissary_meat_id = ? AND business_date = ?`
  ).get(commissaryMeatId, businessDate);
  return row.qty || 0;
}

function getCommissaryEndingActual(db, commissaryMeatId, businessDate) {
  const row = db.prepare(
    `SELECT quantity FROM commissary_ending_actual WHERE commissary_meat_id = ? AND business_date = ?`
  ).get(commissaryMeatId, businessDate);
  return row ? row.quantity : null;
}

/**
 * Full audit computation for one commissary meat, one date. Same
 * null-when-missing-data behavior as computeMeatAudit.
 */
function computeCommissaryMeatAudit(db, commissaryMeatId, businessDate) {
  const beginning = getCommissaryBeginningStock(db, commissaryMeatId, businessDate);
  const stockIn = getCommissaryStockIn(db, commissaryMeatId, businessDate);
  const backedUp = getCommissaryBackedUp(db, commissaryMeatId, businessDate);
  const usage = getCommissaryUsage(db, commissaryMeatId, businessDate);
  const actual = getCommissaryEndingActual(db, commissaryMeatId, businessDate);

  if (beginning === null) {
    return { beginning: null, stockIn, backedUp, usage, actual, endingCalculated: null, expectedEnding: null, variance: null, unexplainedVariance: null, status: 'MISSING_BEGINNING_STOCK' };
  }

  const endingCalculated = beginning + stockIn + backedUp - usage;
  // No commissary adjustments table exists yet - see the module-level note
  // above. expectedEnding is always endingCalculated for now.
  const expectedEnding = endingCalculated;

  if (actual === null) {
    return { beginning, stockIn, backedUp, usage, actual: null, endingCalculated, expectedEnding, variance: null, unexplainedVariance: null, status: 'MISSING_ACTUAL_COUNT' };
  }

  const variance = endingCalculated - actual;
  const unexplainedVariance = expectedEnding - actual; // == variance today, see note above

  const EPSILON = 0.01; // float rounding tolerance, matches auditEngine.js
  let status;
  if (Math.abs(unexplainedVariance) <= EPSILON) status = 'OK';
  else if (unexplainedVariance > 0) status = 'SHORTAGE';
  else status = 'SURPLUS';

  return { beginning, stockIn, backedUp, usage, actual, endingCalculated, expectedEnding, variance, unexplainedVariance, status };
}

/**
 * Runs computeCommissaryMeatAudit for one date, either across every active
 * commissary meat (commissaryMeatId omitted/null) or for a single one
 * (commissaryMeatId given) - always returns an array, for a consistent
 * response shape either way. See the GET route in routes/commissary.js,
 * which mirrors this same optional-filter/list convention already used by
 * GET /api/commissary/yield-log in this project.
 */
function computeCommissaryDailyAudit(db, businessDate, commissaryMeatId = null) {
  const meats = commissaryMeatId
    ? db.prepare(`SELECT id, code, name, unit FROM commissary_meats WHERE id = ? AND active = 1`).all(commissaryMeatId)
    : db.prepare(`SELECT id, code, name, unit FROM commissary_meats WHERE active = 1 ORDER BY code`).all();

  return meats.map(meat => ({
    commissary_meat_id: meat.id,
    code: meat.code,
    name: meat.name,
    unit: meat.unit,
    ...computeCommissaryMeatAudit(db, meat.id, businessDate)
  }));
}

module.exports = {
  getCommissaryBeginningStock,
  getCommissaryStockIn,
  getCommissaryBackedUp,
  getCommissaryUsage,
  getCommissaryEndingActual,
  computeCommissaryMeatAudit,
  computeCommissaryDailyAudit
};
