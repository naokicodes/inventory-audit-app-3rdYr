// Commissary yield engine - the calculation core for commissary_yield_log.
// Matches the formulas in docs/data-model.md section 10 and
// docs/commissary-and-stock-receipts.md Part 1 exactly. Every function
// here is a pure read/calculation - none of them write data. Same shape
// as auditEngine.js: small pure math helpers, plus db-touching wrappers
// that pull real rows and join in the meat's allowed leeway.
//
// excess_loss formula was NOT given exactly in data-model.md ("to be
// pinned down from real xlsx rows") - it's pinned here by reproducing the
// Excess Loss column for all 46 real Yield_Log rows in
// Commi_Audit_Master.xlsx (7 Review, 38 Pass, 1 zero-weight edge case),
// see commissaryYieldEngine.test.js.

const EPSILON = 1e-9; // float rounding tolerance for the Pass/Review boundary

/**
 * Actual loss % for one raw-in/backed-out event.
 * Returns null when rawWeightIn is 0/falsy - there's nothing to compute a
 * percentage of (matches the xlsx's own "False Receival, No Receipt" row,
 * which leaves Actual Loss % and Status blank rather than showing 0%).
 */
function computeActualLossPct(rawWeightIn, backedWeightOut) {
  if (!rawWeightIn) return null;
  return (rawWeightIn - backedWeightOut) / rawWeightIn;
}

/**
 * Pass/Review status. 'Review' only when actual loss % exceeds the
 * meat's allowed leeway % - equal to the leeway is still a Pass (see
 * JOWL 2026-07-03 in the real sheet: actual 20% loss against a 20%
 * allowance is Pass, not Review).
 * Returns null when actualLossPct is null (nothing to judge).
 */
function computeYieldStatus(actualLossPct, allowedLeewayPct) {
  if (actualLossPct === null) return null;
  return actualLossPct > allowedLeewayPct + EPSILON ? 'Review' : 'Pass';
}

/**
 * Excess loss, in the meat's own unit (kg or unit) - how much MORE was
 * lost than the allowed leeway accounts for. Zero (never negative) when
 * actual loss is within the allowance.
 *   excess_loss = max(0, (raw_weight_in - backed_weight_out)
 *                        - raw_weight_in * allowed_leeway_pct)
 * Equivalently raw_weight_in * (actual_loss_pct - allowed_leeway_pct),
 * since actual_loss_pct * raw_weight_in = raw_weight_in - backed_weight_out.
 * Returns 0 for a zero-weight event (nothing lost, matches the xlsx).
 */
function computeExcessLoss(rawWeightIn, backedWeightOut, allowedLeewayPct) {
  if (!rawWeightIn) return 0;
  const rawLoss = rawWeightIn - backedWeightOut;
  const allowedLoss = rawWeightIn * allowedLeewayPct;
  return Math.max(0, rawLoss - allowedLoss);
}

/**
 * Pure combination of all three metrics for one event. No db access -
 * this is the "same shape" pure-function core the docs ask for.
 */
function computeYieldMetrics(rawWeightIn, backedWeightOut, allowedLeewayPct) {
  const actualLossPct = computeActualLossPct(rawWeightIn, backedWeightOut);
  const status = computeYieldStatus(actualLossPct, allowedLeewayPct);
  const excessLoss = computeExcessLoss(rawWeightIn, backedWeightOut, allowedLeewayPct);
  return { actualLossPct, status, excessLoss };
}

/** Fetches one commissary meat's allowed leeway %, needed to judge a yield row. */
function getAllowedLeewayPct(db, commissaryMeatId) {
  const row = db.prepare(
    `SELECT allowed_leeway_pct FROM commissary_meats WHERE id = ?`
  ).get(commissaryMeatId);
  return row ? row.allowed_leeway_pct : null;
}

/**
 * Full computed audit for one commissary_yield_log row: fetches the row
 * plus its meat's allowed leeway, and returns raw fields + computed
 * metrics together. Returns null if the row doesn't exist or is
 * soft-deleted.
 */
function computeYieldRow(db, yieldLogId) {
  const row = db.prepare(
    `SELECT id, commissary_meat_id, business_date, raw_weight_in, backed_weight_out, notes
     FROM commissary_yield_log WHERE id = ? AND deleted_at IS NULL`
  ).get(yieldLogId);
  if (!row) return null;

  const allowedLeewayPct = getAllowedLeewayPct(db, row.commissary_meat_id);
  const metrics = computeYieldMetrics(row.raw_weight_in, row.backed_weight_out, allowedLeewayPct);

  return { ...row, allowedLeewayPct, ...metrics };
}

/** Runs computeYieldRow for every non-deleted yield log entry on one date. */
function computeYieldLogForDate(db, businessDate) {
  const rows = db.prepare(
    `SELECT id FROM commissary_yield_log WHERE business_date = ? AND deleted_at IS NULL ORDER BY id`
  ).all(businessDate);

  return rows.map(r => computeYieldRow(db, r.id));
}

module.exports = {
  computeActualLossPct,
  computeYieldStatus,
  computeExcessLoss,
  computeYieldMetrics,
  getAllowedLeewayPct,
  computeYieldRow,
  computeYieldLogForDate
};
