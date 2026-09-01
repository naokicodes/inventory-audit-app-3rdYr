// Commissary's own audit engine - step 20b (session-status.md).
// Mirrors computeMeatAudit's beginning/inflow/usage/ending/variance shape
// (server/engines/auditEngine.js), but Commissary has two real differences
// from every existing usage source in this app:
//   1. Two separate inflows, not one "new stock": Stock In (raw meat
//      arriving from an outside supplier, commissary_stock_receipts) and
//      Backed Up (commissary_yield_log.backed_weight_out, credited to
//      output_commissary_meat_id when set, else to commissary_meat_id).
//   2. Usage is the SUM of commissary_shipments.total_quantity across every
//      destination restaurant for that commissary meat/date, PLUS the
//      commissary_yield_log.raw_weight_in debited from this meat as input.
//      Commissary doesn't sell to end customers; its "usage" is everything
//      shipped out to restaurants and everything consumed by processing it
//      into a yield output. Step 24a (data-model.md section 10b) made this
//      a debit/credit ledger: every yield row debits raw_weight_in from its
//      input and credits backed_weight_out to its output.
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
 * commissary meat/date, credited to output_commissary_meat_id when a row
 * sets it (a cross-row/cross-stage event), else to commissary_meat_id
 * (NULL = output is the same meat as the input). Excludes soft-deleted
 * yield rows. Step 24a (data-model.md section 10b): the credit half of the
 * debit/credit ledger.
 */
function getCommissaryBackedUp(db, commissaryMeatId, businessDate) {
  const row = db.prepare(
    `SELECT SUM(backed_weight_out) as qty FROM commissary_yield_log WHERE COALESCE(output_commissary_meat_id, commissary_meat_id) = ? AND business_date = ? AND deleted_at IS NULL`
  ).get(commissaryMeatId, businessDate);
  return row.qty || 0;
}

/**
 * Usage = SUM of commissary_shipments.total_quantity across every
 * destination restaurant for this commissary meat/date (Commissary doesn't
 * sell to end customers, so shipments out are its usage), PLUS SUM of
 * COALESCE(input_quantity, raw_weight_in) for every non-soft-deleted yield
 * row where this meat is the input (commissary_meat_id). Step 24a
 * (data-model.md section 10b): the debit half of the debit/credit ledger -
 * processing a meat into an output consumes the input's balance, whether
 * the output is itself (NULL output_commissary_meat_id) or a different
 * meat entirely. Step 24b-i: input_quantity lets a unit-tracked input debit
 * its own count instead of the weighed raw_weight_in kg.
 */
function getCommissaryUsage(db, commissaryMeatId, businessDate) {
  const shipped = db.prepare(
    `SELECT SUM(total_quantity) as qty FROM commissary_shipments WHERE commissary_meat_id = ? AND business_date = ?`
  ).get(commissaryMeatId, businessDate);
  const processed = db.prepare(
    `SELECT SUM(COALESCE(input_quantity, raw_weight_in)) as qty FROM commissary_yield_log WHERE commissary_meat_id = ? AND business_date = ? AND deleted_at IS NULL`
  ).get(commissaryMeatId, businessDate);
  return (shipped.qty || 0) + (processed.qty || 0);
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
 *
 * Step 23b-v (2026-08-31): commissaryId is a second, independent optional
 * filter, restricting the meats iterated to one commissary's own catalog.
 * Omitted, behavior is unchanged. Combines sensibly with commissaryMeatId:
 * both narrow the same WHERE, so a commissaryMeatId that doesn't belong to
 * the given commissaryId correctly returns nothing rather than silently
 * ignoring the mismatch.
 */
function computeCommissaryDailyAudit(db, businessDate, commissaryMeatId = null, commissaryId = null) {
  const clauses = ['active = 1'];
  const params = [];
  if (commissaryMeatId) { clauses.push('id = ?'); params.push(commissaryMeatId); }
  if (commissaryId) { clauses.push('commissary_id = ?'); params.push(commissaryId); }

  const meats = db.prepare(
    `SELECT id, code, name, unit FROM commissary_meats WHERE ${clauses.join(' AND ')} ORDER BY code`
  ).all(...params);

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
