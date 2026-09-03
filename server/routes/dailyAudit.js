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
// opening_stock (step 12, session-status.md): a one-time value, only
// meaningful the first time a meat has no computable beginning stock
// (see auditEngine.js's getBeginningStock - no prior ending_actual and
// no existing opening_stock row). `INSERT OR IGNORE` relies on
// opening_stock's own UNIQUE(restaurant_id, meat_id) constraint
// (schema.sql) to make the write-once guarantee a DB-level fact, not
// just a frontend convention - a stale client that already has a
// beginning value and resubmits it anyway is silently a no-op here,
// never a second write or an error. Deliberately not run through
// activity_log per rule 9 - that logging is scoped to stock_receipts
// and commissary_yield_log only, not silently extended to every input
// table.
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
// convention as POST /api/daily-audit, and the same real SQLite upsert
// pattern (ON CONFLICT ... DO UPDATE) against prepped/
// portion_ending_actual's own UNIQUE(restaurant_id, dish_id,
// business_date) constraints - not a separate exists-check, the schema
// itself guarantees one row per dish/date.
//
// A manual write here always wins over whatever's already in `prepped`
// for that dish/date - including a SYSTEM row from step 15's "Sync
// batch stock" command (created_by = 'SYSTEM:sync-batch-stock'). That's
// intentional, not an oversight: sync-batch-stock only ever fills gaps
// where no entry exists yet (its own query explicitly excludes dishes
// that already have a prepped row - see commands.js), so a manual entry
// arriving after a sync-generated one is the auditor correcting an
// inferred default with the real physical number, which should always
// take precedence.
//
// Step 25d-ii (session-status.md): `created_by` on `prepped` is
// provenance ("this number was inferred by sync-batch-stock"), not
// identity, so a manual correction clears the SYSTEM stamp rather than
// overwriting it with a name - the two meanings must not collide. The
// correction itself was previously unlogged, unlike the SYSTEM write it
// may be overriding; it now gets its own activity_log entry (CREATE if
// no row existed yet, UPDATE if one did), same before/after + transaction
// pattern as commands.js's sync-batch-stock write.
//
// Neither table has a notes/remarks column (unlike ending_actual) -
// not inventing one here, matches the schema exactly as it exists.
router.post('/daily-audit/portions', (req, res) => {
  const { restaurant_id, business_date, rows } = req.body;
  if (!restaurant_id || !business_date || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'restaurant_id, business_date, and rows[] are required' });
  }

  const getPreppedRow = db.prepare(`
    SELECT * FROM prepped WHERE restaurant_id = ? AND dish_id = ? AND business_date = ?
  `);

  const upsertPrepped = db.prepare(`
    INSERT INTO prepped (restaurant_id, dish_id, business_date, portions_produced)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(restaurant_id, dish_id, business_date) DO UPDATE SET
      portions_produced = excluded.portions_produced,
      created_by = NULL
  `);

  const upsertPortionActual = db.prepare(`
    INSERT INTO portion_ending_actual (restaurant_id, dish_id, business_date, portions_counted)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(restaurant_id, dish_id, business_date) DO UPDATE SET portions_counted = excluded.portions_counted
  `);

  let saved = 0;
  for (const row of rows) {
    if (row.prepped !== null && row.prepped !== undefined && row.prepped !== '') {
      withTransaction(db, () => {
        const before = getPreppedRow.get(restaurant_id, row.dish_id, business_date) || null;
        upsertPrepped.run(restaurant_id, row.dish_id, business_date, Number(row.prepped));
        const after = getPreppedRow.get(restaurant_id, row.dish_id, business_date);
        logActivity(db, {
          actor: null,
          entityType: 'prepped',
          entityId: after.id,
          action: before ? 'UPDATE' : 'CREATE',
          before,
          after,
          source: 'MANUAL'
        });
      });
    }
    if (row.portion_actual !== null && row.portion_actual !== undefined && row.portion_actual !== '') {
      upsertPortionActual.run(restaurant_id, row.dish_id, business_date, Number(row.portion_actual));
    }
    saved++;
  }

  res.json({ ok: true, saved });
});

module.exports = router;
