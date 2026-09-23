// API for the Daily Audit Grid - the single spreadsheet-style screen that
// replaces separate New Stock / Ending Actual / Adjustments screens.
// See docs/daily-workflow.md - this is the consolidated version of that flow.

const express = require('express');
const db = require('../db/connection.js');
const { computeMeatAudit, computeMixedDailyAudit } = require('../engines/auditEngine.js');
const { withTransaction, logActivity } = require('../db/activityLog.js');

const router = express.Router();

router.get('/restaurants', (req, res) => {
  const restaurants = db.prepare(`SELECT id, name, code FROM restaurants WHERE active = 1 ORDER BY name`).all();
  res.json(restaurants);
});

// Shared by both GET routes below: looks up the existing ending_actual
// remarks for one meat/date, so a meat row can show what's already been
// typed for it (not just the calculated columns). Kept as a helper so
// the two routes can't drift out of sync.
//
// Step 22 (session-status.md): used to also look up in_house/wastage/
// other adjustment amounts for the three input boxes Landing had - those
// are gone now. Landing shows one read-only `adjustments` cell instead,
// already computed by computeMeatAudit (SUM(quantity) FROM adjustments -
// see auditEngine.js) and returned as part of the audit object below, no
// separate lookup needed. Entering an adjustment now happens on the
// dedicated Allocations page (server/routes/allocations.js) instead of
// here.
function getMeatInputDecoration(restaurantId, date) {
  const getRemarks = db.prepare(
    `SELECT notes FROM ending_actual WHERE restaurant_id = ? AND meat_id = ? AND business_date = ?`
  );

  return (meatId) => {
    const remarksRow = getRemarks.get(restaurantId, meatId, date);
    return {
      remarks: remarksRow ? remarksRow.notes : ''
    };
  };
}

// GET /api/daily-audit?restaurant_id=1&date=2026-08-25
// One row per active meat, with every column the grid needs - calculated
// values from the audit engine, plus existing input values if already
// entered for this date.
router.get('/daily-audit', (req, res) => {
  const restaurantId = Number(req.query.restaurant_id);
  const date = req.query.date;
  if (!restaurantId || !date) {
    return res.status(400).json({ error: 'restaurant_id and date are required' });
  }

  const meats = db.prepare(
    `SELECT id, meat_code, name, unit FROM meats WHERE restaurant_id = ? AND active = 1 ORDER BY meat_code`
  ).all(restaurantId);

  const decorate = getMeatInputDecoration(restaurantId, date);

  const rows = meats.map(meat => {
    const audit = computeMeatAudit(db, restaurantId, meat.id, date);
    const inputs = decorate(meat.id);

    return {
      meat_id: meat.id,
      meat_code: meat.meat_code,
      name: meat.name,
      unit: meat.unit,
      beginning: audit.beginning,
      // new_stock is now read-only here - calculated by the audit engine
      // as SUM(stock_receipts), entered on the Stock Receipts page, not
      // this screen. See docs/commissary-and-stock-receipts.md Part 2.
      new_stock: audit.newStock,
      usage: audit.usage,
      // Step 22: adjustments is now a single read-only sum (entered on
      // the Allocations page), not three separate editable boxes.
      adjustments: audit.adjustments,
      ending_calculated: audit.endingCalculated,
      ending_actual: audit.actual,
      variance: audit.variance,
      unexplained_variance: audit.unexplainedVariance,
      status: audit.status,
      // Step 26a: how stale/derived the figures above are, and what a
      // same-date recount changed - see session-status.md "What the
      // auditor sees".
      days_covered: audit.daysCovered,
      beginning_carried: audit.beginningCarried,
      recount_difference: audit.recountDifference,
      window_adjustments: audit.windowAdjustments,
      remarks: inputs.remarks
    };
  });

  res.json(rows);
});

// GET /api/daily-audit/mixed?restaurant_id=1&date=2026-08-25
// Step 11 (session-status.md): backs the Landing mixed grid - meats and
// BATCH_PREPPED dishes together in one array, each row tagged `type`
// ('MEAT' or 'DISH'). MEAT rows are decorated with the remarks lookup
// GET /api/daily-audit uses, via the shared helper above - the Landing
// UI keeps editing meat rows in place (opening_stock/ending_actual/
// remarks), so it needs to see what's already been typed, same as
// before. `adjustments` doesn't need separate decoration - it's already
// part of the raw computeMixedDailyAudit/computeMeatAudit spread below
// (step 22, session-status.md), a single read-only sum fed by the
// Allocations page instead of Landing's old three input boxes.
// DISH rows carry only what computeDishAudit already returns (prepped,
// sold, portion beginning/ending/actual, status) - read-only for this
// step, per session-status.md; there's no write path for prepped/
// portion_ending_actual yet, so nothing to decorate there.
// GET /api/daily-audit above is untouched and still works standalone.
router.get('/daily-audit/mixed', (req, res) => {
  const restaurantId = Number(req.query.restaurant_id);
  const date = req.query.date;
  if (!restaurantId || !date) {
    return res.status(400).json({ error: 'restaurant_id and date are required' });
  }

  const decorate = getMeatInputDecoration(restaurantId, date);
  const rows = computeMixedDailyAudit(db, restaurantId, date).map(row => {
    if (row.type !== 'MEAT') return row;
    return { ...row, ...decorate(row.item_id) };
  });

  res.json(rows);
});

// POST /api/daily-audit
// Body: { restaurant_id, business_date, rows: [{ meat_id, ending_actual, remarks, opening_stock }] }
// Routes each field to its correct table. Only writes fields that were
// actually provided (not null/empty) - leaves everything else untouched.
// Note: new_stock is no longer accepted here - it's entered on the Stock
// Receipts page now (see docs/commissary-and-stock-receipts.md Part 2).
// Step 22 (session-status.md): in_house/wastage/other are no longer
// accepted here either - adjustments are now entered on the dedicated
// Allocations page (server/routes/allocations.js) instead of Landing's
// old three hardcoded per-type boxes.
//
// opening_stock (step 26a, session-status.md): a declared balance for
// (restaurant, meat, business_date) - write-once PER DATE, not per meat
// for its whole lifetime (that was the pre-26a bug, finding 3/4). The
// frontend only ever offers this input when beginning is null for the
// loaded date (see auditEngine.js's getBeginningStock), so a normal save
// only ever attempts one date at a time; `INSERT OR IGNORE` against
// opening_stock's UNIQUE(restaurant_id, meat_id, business_date) makes
// that a DB-level fact too - a stale client resubmitting the same date's
// value is silently a no-op, never a second write or an error. Declaring
// a NEW date's opening (a recount, a new month) writes a fresh row - see
// PATCH /daily-audit/opening-stock below for CORRECTING an already-
// declared value on the same date. Deliberately not run through
// activity_log per rule 9 - that logging is scoped to stock_receipts and
// commissary_yield_log only, not silently extended to every input table.
router.post('/daily-audit', (req, res) => {
  const { restaurant_id, business_date, rows } = req.body;
  if (!restaurant_id || !business_date || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'restaurant_id, business_date, and rows[] are required' });
  }

  const insertOpeningStock = db.prepare(`
    INSERT OR IGNORE INTO opening_stock (restaurant_id, meat_id, business_date, quantity)
    VALUES (?, ?, ?, ?)
  `);

  const upsertEndingActual = db.prepare(`
    INSERT INTO ending_actual (restaurant_id, meat_id, business_date, quantity, notes)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(restaurant_id, meat_id, business_date) DO UPDATE SET quantity = excluded.quantity, notes = excluded.notes
  `);

  let saved = 0;
  for (const row of rows) {
    if (row.opening_stock !== null && row.opening_stock !== undefined && row.opening_stock !== '') {
      insertOpeningStock.run(restaurant_id, row.meat_id, business_date, Number(row.opening_stock));
    }
    if (row.ending_actual !== null && row.ending_actual !== undefined && row.ending_actual !== '') {
      upsertEndingActual.run(restaurant_id, row.meat_id, business_date, Number(row.ending_actual), row.remarks || null);
    }
    saved++;
  }

  res.json({ ok: true, saved });
});

// POST /api/daily-audit/portions
// Body: { restaurant_id, business_date, rows: [{ dish_id, prepped, portion_actual }] }
//
// The write path for BATCH_PREPPED dish rows that's been missing since
// step 11 (session-status.md) - dish rows on Landing have been
// display-only until now. Same "only write fields actually provided"
// convention as POST /api/daily-audit. portion_ending_actual keeps the
// original ON CONFLICT ... DO UPDATE upsert - unconditional, every post
// overwrites it, no history to protect.
//
// prepped is different (session-status.md "25d-ii", third half): the
// page posts every dish row on every save, touched or not, so the route
// reads the existing row first and only writes when portions_produced
// actually differs. A manual write still always wins over whatever's
// already in `prepped` for that dish/date - including a SYSTEM row from
// step 15's "Sync batch stock" command (created_by =
// 'SYSTEM:sync-batch-stock') - but only when the value actually changed;
// a repost of the same number must not clear that stamp or log a no-op
// "correction". `created_by` on `prepped` is provenance (NULL = human),
// not identity, so a real change always clears it to NULL and logs the
// correction to activity_log - unlike ending_actual/portion_ending_actual
// where the same column name means the auditor's identity instead.
//
// Neither table has a notes/remarks column (unlike ending_actual) -
// not inventing one here, matches the schema exactly as it exists.
router.post('/daily-audit/portions', (req, res) => {
  const { restaurant_id, business_date, rows } = req.body;
  if (!restaurant_id || !business_date || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'restaurant_id, business_date, and rows[] are required' });
  }

  const getPrepped = db.prepare(`
    SELECT * FROM prepped WHERE restaurant_id = ? AND dish_id = ? AND business_date = ?
  `);
  const insertPrepped = db.prepare(`
    INSERT INTO prepped (restaurant_id, dish_id, business_date, portions_produced, created_by)
    VALUES (?, ?, ?, ?, NULL)
  `);
  const updatePrepped = db.prepare(`
    UPDATE prepped SET portions_produced = ?, created_by = NULL
    WHERE restaurant_id = ? AND dish_id = ? AND business_date = ?
  `);

  const upsertPortionActual = db.prepare(`
    INSERT INTO portion_ending_actual (restaurant_id, dish_id, business_date, portions_counted)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(restaurant_id, dish_id, business_date) DO UPDATE SET portions_counted = excluded.portions_counted
  `);

  let saved = 0;
  for (const row of rows) {
    let wrote = false;

    if (row.prepped !== null && row.prepped !== undefined && row.prepped !== '') {
      const value = Number(row.prepped);
      const existing = getPrepped.get(restaurant_id, row.dish_id, business_date);
      // A repost of the same value (every dish row is posted on every save,
      // touched or not - session-status.md "25d-ii", third half) must not
      // clear an inferred SYSTEM stamp or log a no-op correction. Only a
      // genuine change to portions_produced counts as a manual correction.
      if (!existing || existing.portions_produced !== value) {
        withTransaction(db, () => {
          if (existing) {
            updatePrepped.run(value, restaurant_id, row.dish_id, business_date);
          } else {
            insertPrepped.run(restaurant_id, row.dish_id, business_date, value);
          }
          const after = getPrepped.get(restaurant_id, row.dish_id, business_date);
          logActivity(db, {
            actor: null,
            entityType: 'prepped',
            entityId: after.id,
            action: existing ? 'UPDATE' : 'CREATE',
            before: existing || null,
            after,
            source: 'MANUAL'
          });
        });
        wrote = true;
      }
    }

    if (row.portion_actual !== null && row.portion_actual !== undefined && row.portion_actual !== '') {
      upsertPortionActual.run(restaurant_id, row.dish_id, business_date, Number(row.portion_actual));
      wrote = true;
    }

    if (wrote) saved++;
  }

  res.json({ ok: true, saved });
});

// PATCH /api/daily-audit/opening-stock
// Body: { restaurant_id, meat_id, business_date, quantity }
// Step 26a (session-status.md): corrects an ALREADY-declared opening for
// this exact date - finding 4 ("write-once and cannot be corrected").
// Follows PATCH /sales' edit-and-clear model: quantity null/undefined/''
// clears (deletes) the declared opening for this date; otherwise it
// overwrites the existing value. Both require a row to already exist for
// this exact (restaurant, meat, date) - this route corrects a declared
// opening, it does not create a new one (that's POST /daily-audit, which
// the frontend only offers when beginning is null for the loaded date -
// see session-status.md "Also required").
router.patch('/daily-audit/opening-stock', (req, res) => {
  const { restaurant_id, meat_id, business_date, quantity } = req.body || {};

  if (!restaurant_id || !meat_id || !business_date) {
    return res.status(400).json({ error: 'restaurant_id, meat_id, and business_date are required' });
  }

  const existing = db.prepare(
    `SELECT id FROM opening_stock WHERE restaurant_id = ? AND meat_id = ? AND business_date = ?`
  ).get(restaurant_id, meat_id, business_date);
  if (!existing) {
    return res.status(404).json({ error: 'No declared opening exists for this restaurant/meat/date to correct' });
  }

  const isClearing = quantity === null || quantity === undefined || quantity === '';
  if (!isClearing && (typeof quantity !== 'number' && isNaN(Number(quantity)))) {
    return res.status(400).json({ error: 'quantity must be a number, or null/omitted to clear the declared opening' });
  }

  if (isClearing) {
    db.prepare(`DELETE FROM opening_stock WHERE id = ?`).run(existing.id);
    return res.json({ ok: true, cleared: true });
  }

  db.prepare(`UPDATE opening_stock SET quantity = ? WHERE id = ?`).run(Number(quantity), existing.id);
  res.json({ ok: true, cleared: false, quantity: Number(quantity) });
});

module.exports = router;
