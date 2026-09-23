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

// Step 26a (session-status.md): opening_stock is now date-scoped - a row
// means "an authoritative declared balance on this date", not a lifetime
// seed. getBeginningStock resolves, in order: (1) a declared opening for
// THIS date, (2) yesterday's ending_actual, (3) yesterday's
// ending_calculated, carried - repeating backward day by day until it
// finds a real count or a declared opening, (4) neither exists anywhere ->
// null. Not bounded by the calendar month in this step (that bound is
// Step 26a-ii, held); a never-recounted meat can carry indefinitely.
//
// A safety valve, not a business rule: MAX_CARRY_WALK caps the backward
// walk so a genuinely never-seeded meat fails fast with null (status
// MISSING_BEGINNING_STOCK) instead of looping toward the epoch.
const MAX_CARRY_WALK = 3660; // ~10 years of days

/**
 * Finds the nearest anchor on or before `date` - 1: a date with either an
 * ending_actual (a physical count - that day's own newStock/usage are
 * already reflected in it) or a declared opening_stock row (a
 * beginning-of-day value - that day's own newStock/usage still need to be
 * added). Two indexed lookups (most recent row of each kind), not a
 * day-by-day scan - the walk this replaces made a "genuinely new meat"
 * cost MAX_CARRY_WALK queries to conclude nothing exists. Returns null if
 * neither table has any row at all on or before that date.
 */
function findPriorAnchor(db, restaurantId, meatId, date) {
  const priorDate = addDays(date, -1);

  const lastActual = db.prepare(
    `SELECT business_date, quantity FROM ending_actual WHERE restaurant_id = ? AND meat_id = ? AND business_date <= ? ORDER BY business_date DESC LIMIT 1`
  ).get(restaurantId, meatId, priorDate);
  const lastOpening = db.prepare(
    `SELECT business_date, quantity FROM opening_stock WHERE restaurant_id = ? AND meat_id = ? AND business_date <= ? ORDER BY business_date DESC LIMIT 1`
  ).get(restaurantId, meatId, priorDate);

  if (!lastActual && !lastOpening) return null;

  // Whichever is more recent wins; on the same date, an actual wins (step
  // 2 is checked before ever falling through to that day's opening).
  const anchor = (lastActual && (!lastOpening || lastActual.business_date >= lastOpening.business_date))
    ? { type: 'actual', date: lastActual.business_date, value: lastActual.quantity }
    : { type: 'opening', date: lastOpening.business_date, value: lastOpening.quantity };

  // The uncounted dates strictly between the anchor and `date` - bounded
  // by the real gap, not MAX_CARRY_WALK (that stays only as a defensive
  // cap against a pathological far-future date).
  const uncountedDates = [];
  let cursor = addDays(anchor.date, 1);
  for (let i = 0; i < MAX_CARRY_WALK && cursor <= priorDate; i++) {
    uncountedDates.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return { ...anchor, uncountedDates };
}

/**
 * What beginning(date) would resolve to via steps 2-4 alone, ignoring any
 * declared opening ON `date` itself - i.e. "yesterday's ending_actual,
 * else yesterday's carried ending_calculated". Used both for the ordinary
 * carried-forward case and, by getBeginningStock, as `priorEnding` for the
 * recount-difference calculation on a declared-opening day. Returns null
 * if no anchor exists at all (a genuinely new meat/restaurant).
 */
function resolvePriorChain(db, restaurantId, meatId, date) {
  const anchor = findPriorAnchor(db, restaurantId, meatId, date);
  if (!anchor) return null;

  // An actual already reflects its own day's flows; an opening is a
  // beginning-of-day value, so its own day's flows still apply.
  const flowDates = anchor.type === 'opening' ? [anchor.date, ...anchor.uncountedDates] : anchor.uncountedDates;
  let value = anchor.value;
  for (const d of flowDates) {
    value += getNewStock(db, restaurantId, meatId, d) - getUsage(db, restaurantId, meatId, d);
  }

  return {
    value,
    daysCovered: anchor.uncountedDates.length + 1,
    // "Normal" per session-status.md means step 2 applied cleanly - the
    // anchor was found immediately, as an actual, right on date - 1.
    carried: !(anchor.type === 'actual' && anchor.uncountedDates.length === 0)
  };
}

/**
 * Returns { value, carried, daysCovered, recountDifference } for one
 * meat/date - see session-status.md "Step 26a". `value` is null only when
 * no declared opening and no prior count exist anywhere (status
 * MISSING_BEGINNING_STOCK downstream). `recountDifference` is non-null
 * only on a date with its own declared opening AND a prior chain to
 * compare it against (option A, 2026-09-23): positive means the recount
 * found less than the chain expected.
 */
function getBeginningStock(db, restaurantId, meatId, businessDate) {
  const declared = db.prepare(
    `SELECT quantity FROM opening_stock WHERE restaurant_id = ? AND meat_id = ? AND business_date = ?`
  ).get(restaurantId, meatId, businessDate);

  if (declared) {
    const priorChain = resolvePriorChain(db, restaurantId, meatId, businessDate);
    return {
      value: declared.quantity,
      carried: false,
      daysCovered: priorChain ? priorChain.daysCovered : 1,
      recountDifference: priorChain ? (priorChain.value - declared.quantity) : null
    };
  }

  const chain = resolvePriorChain(db, restaurantId, meatId, businessDate);
  if (!chain) {
    return { value: null, carried: false, daysCovered: null, recountDifference: null };
  }

  return { value: chain.value, carried: chain.carried, daysCovered: chain.daysCovered, recountDifference: null };
}

/**
 * New stock = SUM of all non-deleted stock_receipts rows for this
 * meat/restaurant/date, regardless of source (DIRECT or COMMISSARY).
 * Deliveries are irregular and can repeat within a day, so this is a
 * SUM over the log, not a single-row lookup - see data-model.md section
 * 5/6 and docs/commissary-and-stock-receipts.md.
 */
function getNewStock(db, restaurantId, meatId, businessDate) {
  const row = db.prepare(
    `SELECT SUM(quantity) as qty FROM stock_receipts WHERE restaurant_id = ? AND meat_id = ? AND business_date = ? AND deleted_at IS NULL`
  ).get(restaurantId, meatId, businessDate);
  return row.qty || 0;
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

/**
 * Step 26a (session-status.md, "Adjustments across the covered window"):
 * sum of adjustments across the SAME window daysCovered represents - the
 * last `daysCovered` days ending on `businessDate`, inclusive. An
 * adjustment dated on a day that was carried (uncounted) would otherwise
 * explain nothing, since that day itself shows no variance and the count
 * day only reads its own date. daysCovered === 1 reduces to the plain
 * single-day sum, unchanged from before this step.
 */
function getAdjustmentsTotalForWindow(db, restaurantId, meatId, businessDate, daysCovered) {
  if (daysCovered <= 1) return getAdjustmentsTotal(db, restaurantId, meatId, businessDate);
  const windowStart = addDays(businessDate, -(daysCovered - 1));
  const row = db.prepare(
    `SELECT SUM(quantity) as qty FROM adjustments WHERE restaurant_id = ? AND meat_id = ? AND business_date >= ? AND business_date <= ?`
  ).get(restaurantId, meatId, windowStart, businessDate);
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
 *
 * Step 26a (session-status.md) adds daysCovered/beginningCarried/
 * recountDifference. `status` stays a single severity value (OK/SHORTAGE/
 * SURPLUS/MISSING_*) - carry is a field, not a status. `adjustments`
 * stays the plain single-day sum (unchanged - real movements already flow
 * through endingCalculated day by day); `unexplainedVariance` is the one
 * figure that reflects the covered window and any recount difference.
 */
function computeMeatAudit(db, restaurantId, meatId, businessDate) {
  const beginningInfo = getBeginningStock(db, restaurantId, meatId, businessDate);
  const { value: beginning, carried: beginningCarried, daysCovered, recountDifference } = beginningInfo;
  const newStock = getNewStock(db, restaurantId, meatId, businessDate);
  const usage = getUsage(db, restaurantId, meatId, businessDate);
  const adjustments = getAdjustmentsTotal(db, restaurantId, meatId, businessDate);
  const actual = getEndingActual(db, restaurantId, meatId, businessDate);

  if (beginning === null) {
    return {
      beginning: null, newStock, usage, adjustments, actual,
      endingCalculated: null, variance: null, expectedEnding: null, unexplainedVariance: null,
      status: 'MISSING_BEGINNING_STOCK',
      daysCovered, beginningCarried, recountDifference, windowAdjustments: null
    };
  }

  const endingCalculated = beginning + newStock - usage;
  const windowAdjustments = getAdjustmentsTotalForWindow(db, restaurantId, meatId, businessDate, daysCovered);
  const expectedEnding = endingCalculated - windowAdjustments + (recountDifference || 0);

  if (actual === null) {
    return {
      beginning, newStock, usage, adjustments, actual: null,
      endingCalculated, expectedEnding, variance: null, unexplainedVariance: null,
      status: 'MISSING_ACTUAL_COUNT',
      daysCovered, beginningCarried, recountDifference, windowAdjustments
    };
  }

  const variance = endingCalculated - actual;               // raw, before adjustments - unchanged by the covered window
  const unexplainedVariance = expectedEnding - actual;       // after known adjustments over the covered window, plus any recount difference

  const EPSILON = 0.01; // float rounding tolerance
  let status;
  if (Math.abs(unexplainedVariance) <= EPSILON) status = 'OK';
  else if (unexplainedVariance > 0) status = 'SHORTAGE';
  else status = 'SURPLUS';

  return {
    beginning, newStock, usage, adjustments, actual,
    endingCalculated, expectedEnding, variance, unexplainedVariance, status,
    daysCovered, beginningCarried, recountDifference, windowAdjustments
  };
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

// --- Step 10: BATCH_PREPPED dish (portion) audit ---
// Portion formulas from docs/data-model.md section 6. Deliberately NOT a
// re-run of computeMeatAudit with renamed fields - dish/portion tracking
// has no adjustments or opening_stock-style fallback in the data model,
// so the shape here follows the doc's actual (simpler) formula rather
// than inventing parity with the meat side.

/**
 * Portion beginning = yesterday's portion_ending_actual count.
 * No fallback to an opening-stock-style table for dishes - data-model.md
 * section 6 doesn't define one (unlike beginning_stock for meats). A
 * dish with no portion tracking in use yet (see daily-workflow.md step 5
 * - it's optional) will have this null indefinitely, same underlying
 * shape as the meat side's known "opening stock" gap (session-status.md
 * step 12) but not itself that bug - just the doc's formula, applied.
 */
function getPortionBeginning(db, restaurantId, dishId, businessDate) {
  const priorDate = addDays(businessDate, -1);
  const prev = db.prepare(
    `SELECT portions_counted FROM portion_ending_actual WHERE restaurant_id = ? AND dish_id = ? AND business_date = ?`
  ).get(restaurantId, dishId, priorDate);
  return prev ? prev.portions_counted : null;
}

/** Portions actually cooked today for this dish (from the Prepped screen). */
function getPrepped(db, restaurantId, dishId, businessDate) {
  const row = db.prepare(
    `SELECT SUM(portions_produced) as qty FROM prepped WHERE restaurant_id = ? AND dish_id = ? AND business_date = ?`
  ).get(restaurantId, dishId, businessDate);
  return row.qty || 0;
}

/** Portions sold today for this dish (from the Loyverse-synced sales table). */
function getSoldPortions(db, restaurantId, dishId, businessDate) {
  const row = db.prepare(
    `SELECT SUM(quantity) as qty FROM sales WHERE restaurant_id = ? AND dish_id = ? AND business_date = ?`
  ).get(restaurantId, dishId, businessDate);
  return row.qty || 0;
}

function getPortionEndingActual(db, restaurantId, dishId, businessDate) {
  const row = db.prepare(
    `SELECT portions_counted FROM portion_ending_actual WHERE restaurant_id = ? AND dish_id = ? AND business_date = ?`
  ).get(restaurantId, dishId, businessDate);
  return row ? row.portions_counted : null;
}

/**
 * Full portion audit for one BATCH_PREPPED dish, one date. Mirrors
 * computeMeatAudit's null-when-missing-data behavior, but follows
 * data-model.md section 6's portion formulas exactly - no adjustments
 * layer (the doc doesn't define one for portions).
 */
function computeDishAudit(db, restaurantId, dishId, businessDate) {
  const portionBeginning = getPortionBeginning(db, restaurantId, dishId, businessDate);
  const prepped = getPrepped(db, restaurantId, dishId, businessDate);
  const sold = getSoldPortions(db, restaurantId, dishId, businessDate);
  const portionActual = getPortionEndingActual(db, restaurantId, dishId, businessDate);

  if (portionBeginning === null) {
    return { portionBeginning: null, prepped, sold, portionEndingCalculated: null, portionActual, portionVariance: null, status: 'MISSING_BEGINNING_STOCK' };
  }

  const portionEndingCalculated = portionBeginning + prepped - sold;

  if (portionActual === null) {
    return { portionBeginning, prepped, sold, portionEndingCalculated, portionActual: null, portionVariance: null, status: 'MISSING_ACTUAL_COUNT' };
  }

  const portionVariance = portionEndingCalculated - portionActual; // sign convention unchanged: positive = shortage

  const EPSILON = 0.01;
  let status;
  if (Math.abs(portionVariance) <= EPSILON) status = 'OK';
  else if (portionVariance > 0) status = 'SHORTAGE';
  else status = 'SURPLUS';

  return { portionBeginning, prepped, sold, portionEndingCalculated, portionActual, portionVariance, status };
}

/**
 * Landing mixed grid: meats + BATCH_PREPPED dishes as one array, each row
 * tagged with `type` ('MEAT' or 'DISH'), per session-status.md step 10.
 * DIRECT dishes are excluded - they're never a Landing row themselves,
 * only a usage driver for meats via recipe_bom (see data-model.md
 * section 3/6). Nothing calls this yet; it's additive, alongside the
 * existing computeDailyAudit/GET /api/daily-audit, not a replacement.
 */
function computeMixedDailyAudit(db, restaurantId, businessDate) {
  const meatRows = computeDailyAudit(db, restaurantId, businessDate).map(row => ({
    type: 'MEAT',
    item_id: row.meat_id,
    code: row.meat_code,
    name: row.name,
    unit: row.unit,
    ...row
  }));

  const dishes = db.prepare(
    `SELECT id, dish_code, name FROM dishes WHERE restaurant_id = ? AND active = 1 AND prep_type = 'BATCH_PREPPED' ORDER BY dish_code`
  ).all(restaurantId);

  const dishRows = dishes.map(dish => ({
    type: 'DISH',
    item_id: dish.id,
    code: dish.dish_code,
    name: dish.name,
    unit: 'portions',
    dish_id: dish.id,
    dish_code: dish.dish_code,
    ...computeDishAudit(db, restaurantId, dish.id, businessDate)
  }));

  return [...meatRows, ...dishRows];
}

module.exports = {
  addDays,
  getBeginningStock,
  getNewStock,
  getUsage,
  getAdjustmentsTotal,
  getEndingActual,
  computeMeatAudit,
  computeDailyAudit,
  getPortionBeginning,
  getPrepped,
  getSoldPortions,
  getPortionEndingActual,
  computeDishAudit,
  computeMixedDailyAudit
};
