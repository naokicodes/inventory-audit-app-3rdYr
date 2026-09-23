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
// Step 24b-ii (data-model.md section 10b): commissary_adjustments gives
// Commissary its own adjustments layer, with two balance effects that are
// NOT the same:
//   - kind='ALLOCATION' is a REAL MOVEMENT: it debits commissary_meat_id
//     (the source) and credits destination_commissary_meat_id, landing in
//     endingCalculated exactly like a shipment/yield-debit does. Folded
//     into getCommissaryUsage (debit side) and getCommissaryBackedUp
//     (credit side) below, rather than a separate pair of functions,
//     because that's exactly the role those two already play for every
//     other real movement.
//   - kind='LOSS' is an EXPLANATION: it feeds expectedEnding and therefore
//     unexplainedVariance, mirroring getAdjustmentsTotal/computeMeatAudit
//     in auditEngine.js (expectedEnding = endingCalculated - adjustments).
//     A declared loss does not make the variance disappear - it moves it
//     from unexplained to explained, and both stay visible via `variance`
//     vs `unexplainedVariance`.
// Both kinds exclude soft-deleted rows (deleted_at IS NULL).

const { addDays } = require('./auditEngine.js');
const { isBlocked } = require('./monthOpening.js');

// Step 26a (session-status.md): commissary_opening_stock gets the
// identical date-scoped treatment as opening_stock - see the matching
// block of comments on getBeginningStock in auditEngine.js for the full
// reasoning. Same resolution order, same carry-forward/recount-difference
// mechanics, just against the commissary_* tables and driven by
// commissary_stock_receipts/commissary_yield_log/commissary_shipments/
// commissary_adjustments instead of stock_receipts/sales/prepped.
const MAX_CARRY_WALK = 3660; // ~10 years of days - safety valve, not a business rule

function findCommissaryPriorAnchor(db, commissaryMeatId, date) {
  const priorDate = addDays(date, -1);

  const lastActual = db.prepare(
    `SELECT business_date, quantity FROM commissary_ending_actual WHERE commissary_meat_id = ? AND business_date <= ? ORDER BY business_date DESC LIMIT 1`
  ).get(commissaryMeatId, priorDate);
  const lastOpening = db.prepare(
    `SELECT business_date, quantity FROM commissary_opening_stock WHERE commissary_meat_id = ? AND business_date <= ? ORDER BY business_date DESC LIMIT 1`
  ).get(commissaryMeatId, priorDate);

  if (!lastActual && !lastOpening) return null;

  const anchor = (lastActual && (!lastOpening || lastActual.business_date >= lastOpening.business_date))
    ? { type: 'actual', date: lastActual.business_date, value: lastActual.quantity }
    : { type: 'opening', date: lastOpening.business_date, value: lastOpening.quantity };

  const uncountedDates = [];
  let cursor = addDays(anchor.date, 1);
  for (let i = 0; i < MAX_CARRY_WALK && cursor <= priorDate; i++) {
    uncountedDates.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return { ...anchor, uncountedDates };
}

/** Commissary equivalent of resolvePriorChain in auditEngine.js. */
function resolveCommissaryPriorChain(db, commissaryMeatId, date) {
  const anchor = findCommissaryPriorAnchor(db, commissaryMeatId, date);
  if (!anchor) return null;

  const flowDates = anchor.type === 'opening' ? [anchor.date, ...anchor.uncountedDates] : anchor.uncountedDates;
  let value = anchor.value;
  for (const d of flowDates) {
    value += getCommissaryStockIn(db, commissaryMeatId, d) + getCommissaryBackedUp(db, commissaryMeatId, d)
      - getCommissaryUsage(db, commissaryMeatId, d);
  }

  return {
    value,
    daysCovered: anchor.uncountedDates.length + 1,
    carried: !(anchor.type === 'actual' && anchor.uncountedDates.length === 0)
  };
}

/**
 * Beginning stock for one commissary meat/date - see getBeginningStock in
 * auditEngine.js for the full order/reasoning (identical here). Returns
 * { value, carried, daysCovered, recountDifference }.
 */
function getCommissaryBeginningStock(db, commissaryMeatId, businessDate) {
  const declared = db.prepare(
    `SELECT quantity, opening_source FROM commissary_opening_stock WHERE commissary_meat_id = ? AND business_date = ?`
  ).get(commissaryMeatId, businessDate);

  if (declared) {
    const priorChain = resolveCommissaryPriorChain(db, commissaryMeatId, businessDate);
    return {
      value: declared.quantity,
      carried: false,
      daysCovered: priorChain ? priorChain.daysCovered : 1,
      recountDifference: priorChain ? (priorChain.value - declared.quantity) : null,
      openingSource: declared.opening_source // step 26a-ii
    };
  }

  const chain = resolveCommissaryPriorChain(db, commissaryMeatId, businessDate);
  if (!chain) {
    return { value: null, carried: false, daysCovered: null, recountDifference: null, openingSource: null };
  }

  return { value: chain.value, carried: chain.carried, daysCovered: chain.daysCovered, recountDifference: null, openingSource: null };
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
  const allocatedIn = db.prepare(
    `SELECT SUM(quantity) as qty FROM commissary_adjustments WHERE kind = 'ALLOCATION' AND destination_commissary_meat_id = ? AND business_date = ? AND deleted_at IS NULL`
  ).get(commissaryMeatId, businessDate);
  return (row.qty || 0) + (allocatedIn.qty || 0);
}

/**
 * Sum of declared LOSS adjustments for this commissary meat/date - the
 * commissary equivalent of getAdjustmentsTotal in auditEngine.js. Excludes
 * soft-deleted rows and ALLOCATION rows (those are a real movement, folded
 * into getCommissaryUsage/getCommissaryBackedUp above, not an explanation).
 */
function getCommissaryAdjustmentsTotal(db, commissaryMeatId, businessDate) {
  const row = db.prepare(
    `SELECT SUM(quantity) as qty FROM commissary_adjustments WHERE kind = 'LOSS' AND commissary_meat_id = ? AND business_date = ? AND deleted_at IS NULL`
  ).get(commissaryMeatId, businessDate);
  return row.qty || 0;
}

/**
 * Step 26a - commissary equivalent of getAdjustmentsTotalForWindow in
 * auditEngine.js. Sums LOSS adjustments over the last `daysCovered` days
 * ending on `businessDate`, inclusive - same window as daysCovered itself.
 */
function getCommissaryAdjustmentsTotalForWindow(db, commissaryMeatId, businessDate, daysCovered) {
  if (daysCovered <= 1) return getCommissaryAdjustmentsTotal(db, commissaryMeatId, businessDate);
  const windowStart = addDays(businessDate, -(daysCovered - 1));
  const row = db.prepare(
    `SELECT SUM(quantity) as qty FROM commissary_adjustments WHERE kind = 'LOSS' AND commissary_meat_id = ? AND business_date >= ? AND business_date <= ? AND deleted_at IS NULL`
  ).get(commissaryMeatId, windowStart, businessDate);
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
  const allocatedOut = db.prepare(
    `SELECT SUM(quantity) as qty FROM commissary_adjustments WHERE kind = 'ALLOCATION' AND commissary_meat_id = ? AND business_date = ? AND deleted_at IS NULL`
  ).get(commissaryMeatId, businessDate);
  return (shipped.qty || 0) + (processed.qty || 0) + (allocatedOut.qty || 0);
}

function getCommissaryEndingActual(db, commissaryMeatId, businessDate) {
  const row = db.prepare(
    `SELECT quantity FROM commissary_ending_actual WHERE commissary_meat_id = ? AND business_date = ?`
  ).get(commissaryMeatId, businessDate);
  return row ? row.quantity : null;
}

/**
 * Full audit computation for one commissary meat, one date. Same
 * null-when-missing-data behavior as computeMeatAudit. Step 26a adds
 * daysCovered/beginningCarried/recountDifference - see the matching
 * comment on computeMeatAudit in auditEngine.js.
 */
function computeCommissaryMeatAudit(db, commissaryMeatId, businessDate) {
  const stockIn = getCommissaryStockIn(db, commissaryMeatId, businessDate);
  const backedUp = getCommissaryBackedUp(db, commissaryMeatId, businessDate);
  const usage = getCommissaryUsage(db, commissaryMeatId, businessDate);
  const adjustments = getCommissaryAdjustmentsTotal(db, commissaryMeatId, businessDate);
  const actual = getCommissaryEndingActual(db, commissaryMeatId, businessDate);

  // Step 26a-ii - see the matching block in computeMeatAudit (auditEngine.js).
  if (isBlocked(db, 'commissary', null, commissaryMeatId, businessDate)) {
    return {
      beginning: null, stockIn, backedUp, usage, adjustments, actual,
      endingCalculated: null, expectedEnding: null, variance: null, unexplainedVariance: null,
      status: 'MISSING_PERIOD_OPENING',
      daysCovered: null, beginningCarried: false, recountDifference: null, windowAdjustments: null,
      openingSource: null
    };
  }

  const beginningInfo = getCommissaryBeginningStock(db, commissaryMeatId, businessDate);
  const { value: beginning, carried: beginningCarried, daysCovered, recountDifference, openingSource } = beginningInfo;

  if (beginning === null) {
    return {
      beginning: null, stockIn, backedUp, usage, adjustments, actual,
      endingCalculated: null, expectedEnding: null, variance: null, unexplainedVariance: null,
      status: 'MISSING_BEGINNING_STOCK',
      daysCovered, beginningCarried, recountDifference, windowAdjustments: null, openingSource
    };
  }

  const endingCalculated = beginning + stockIn + backedUp - usage;
  const windowAdjustments = getCommissaryAdjustmentsTotalForWindow(db, commissaryMeatId, businessDate, daysCovered);
  const expectedEnding = endingCalculated - windowAdjustments + (recountDifference || 0);

  if (actual === null) {
    return {
      beginning, stockIn, backedUp, usage, adjustments, actual: null,
      endingCalculated, expectedEnding, variance: null, unexplainedVariance: null,
      status: 'MISSING_ACTUAL_COUNT',
      daysCovered, beginningCarried, recountDifference, windowAdjustments, openingSource
    };
  }

  const variance = endingCalculated - actual;               // raw, before adjustments - unchanged by the covered window
  const unexplainedVariance = expectedEnding - actual;       // after known adjustments over the covered window, plus any recount difference

  const EPSILON = 0.01; // float rounding tolerance, matches auditEngine.js
  let status;
  if (Math.abs(unexplainedVariance) <= EPSILON) status = 'OK';
  else if (unexplainedVariance > 0) status = 'SHORTAGE';
  else status = 'SURPLUS';

  return {
    beginning, stockIn, backedUp, usage, adjustments, actual,
    endingCalculated, expectedEnding, variance, unexplainedVariance, status,
    daysCovered, beginningCarried, recountDifference, windowAdjustments, openingSource
  };
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
  getCommissaryAdjustmentsTotal,
  getCommissaryEndingActual,
  computeCommissaryMeatAudit,
  computeCommissaryDailyAudit
};
