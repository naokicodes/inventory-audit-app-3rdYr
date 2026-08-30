// Backend for the command panel's real commands (step 14 built the
// scaffold; this is step 15's first real one). See
// docs/session-status.md step 15 for the spec, and docs/scope.md's
// "Narrow exception added 2026-08-29 for step 15" note for why this is
// the one write path allowed to log to activity_log for `prepped`.

const express = require('express');
const db = require('../db/connection.js');
const { withTransaction, logActivity } = require('../db/activityLog.js');

const router = express.Router();

// GET /api/commands/oversold-check
// Step 18, revisited 2026-08-29 (item 6, session-status.md): BATCH_PREPPED
// sold quantity should never exceed available prepped portions. Originally
// read "available prepped portions" as SAME-DAY prepped only
// (sold(dish, date) > prepped(dish, date)), because the fuller running
// portion balance (portionBeginning + prepped - sold) that
// computeDishAudit computes depended on portion_ending_actual, which had
// no write path anywhere in the app at the time (step 11) - it was null
// for virtually every dish/date and a check built on it would have been
// dead code then. That write path exists now
// (POST /api/daily-audit/portions), so this route uses the fuller
// running-balance check wherever a beginning count is actually
// established for a dish/date, falling back to the original same-day
// check where it isn't (MISSING_BEGINNING_STOCK) - same graceful-
// degradation pattern used throughout this app, not an all-or-nothing
// switch. The fuller check matters in practice: a dish batch-prepped once
// and sold down over several days would falsely flag every zero-prep day
// under the same-day-only check, since that never accounts for carryover
// stock from a previous day's prepping.
//
// Read-only - never writes anything, matching "surface as a WARNING,
// not a hard block." Global, same reasoning as sync-batch-stock: the
// panel is reachable from every page with no shared date context.
router.get('/commands/oversold-check', (req, res) => {
  const { computeDishAudit } = require('../engines/auditEngine.js');

  const candidates = db.prepare(`
    SELECT DISTINCT s.restaurant_id, r.name AS restaurant_name, s.dish_id,
           d.dish_code, d.name AS dish_name, s.business_date
    FROM sales s
    JOIN dishes d ON d.id = s.dish_id
    JOIN restaurants r ON r.id = s.restaurant_id
    WHERE d.prep_type = 'BATCH_PREPPED'
    ORDER BY s.business_date, r.name, d.dish_code
  `).all();

  const EPSILON = 0.01;
  const flagged = [];

  for (const c of candidates) {
    const audit = computeDishAudit(db, c.restaurant_id, c.dish_id, c.business_date);

    if (audit.portionBeginning !== null) {
      // Fuller running-balance check, now that a beginning count exists
      // for this dish/date (POST /api/daily-audit/portions, added
      // 2026-08-29 - see session-status.md item 6). More correct than
      // the same-day check: a dish batch-prepped once and sold down
      // over several days would falsely flag every zero-prep day under
      // the same-day check, since it never accounts for carryover.
      if (audit.portionEndingCalculated < -EPSILON) {
        flagged.push({
          restaurant_id: c.restaurant_id, restaurant_name: c.restaurant_name,
          dish_id: c.dish_id, dish_code: c.dish_code, dish_name: c.dish_name,
          business_date: c.business_date,
          sold: audit.sold, prepped: audit.prepped,
          shortfall: -audit.portionEndingCalculated,
          method: 'running_balance'
        });
      }
    } else {
      // Fallback: no beginning count established for this dish/date yet
      // (MISSING_BEGINNING_STOCK) - the running balance can't be
      // computed, so fall back to the original same-day check. Same
      // graceful-degradation pattern used throughout this app (prefer
      // real/fuller data, degrade to something still useful when it
      // isn't available yet) rather than an all-or-nothing switch.
      if (audit.sold > audit.prepped + EPSILON) {
        flagged.push({
          restaurant_id: c.restaurant_id, restaurant_name: c.restaurant_name,
          dish_id: c.dish_id, dish_code: c.dish_code, dish_name: c.dish_name,
          business_date: c.business_date,
          sold: audit.sold, prepped: audit.prepped,
          shortfall: audit.sold - audit.prepped,
          method: 'same_day_fallback'
        });
      }
    }
  }

  res.json({ ok: true, oversold_count: flagged.length, rows: flagged });
});

// POST /api/commands/sync-batch-stock
// For every (restaurant_id, dish_id, business_date) combo that has at
// least one `sales` row for a BATCH_PREPPED dish, and has NO `prepped`
// row yet for that same combo ("no manual entry yet" per the roadmap
// text), insert one `prepped` row with portions_produced = SUM(sales
// .quantity) for that combo, and log it as a SYSTEM CREATE.
//
// Global by design, not scoped to a restaurant/date: this command is
// reachable from the floating panel on every page (step 14), which has
// no shared date/restaurant context to draw from. Running it is always
// safe to repeat - already-synced or already-manually-entered combos are
// skipped, never overwritten.
router.post('/commands/sync-batch-stock', (req, res) => {
  const candidates = db.prepare(`
    SELECT
      s.restaurant_id AS restaurant_id,
      s.dish_id AS dish_id,
      s.business_date AS business_date,
      SUM(s.quantity) AS total_sold
    FROM sales s
    JOIN dishes d ON d.id = s.dish_id
    WHERE d.prep_type = 'BATCH_PREPPED'
      AND NOT EXISTS (
        SELECT 1 FROM prepped p
        WHERE p.restaurant_id = s.restaurant_id
          AND p.dish_id = s.dish_id
          AND p.business_date = s.business_date
      )
    GROUP BY s.restaurant_id, s.dish_id, s.business_date
  `).all();

  const insertPrepped = db.prepare(`
    INSERT INTO prepped (restaurant_id, dish_id, business_date, portions_produced, created_by)
    VALUES (?, ?, ?, ?, ?)
  `);
  const getPreppedRow = db.prepare(`SELECT * FROM prepped WHERE id = ?`);

  const synced = [];
  try {
    withTransaction(db, () => {
      for (const c of candidates) {
        const result = insertPrepped.run(
          c.restaurant_id,
          c.dish_id,
          c.business_date,
          c.total_sold,
          'SYSTEM:sync-batch-stock'
        );
        const after = getPreppedRow.get(result.lastInsertRowid);
        logActivity(db, {
          actor: 'SYSTEM:sync-batch-stock',
          entityType: 'prepped',
          entityId: result.lastInsertRowid,
          action: 'CREATE',
          before: null,
          after,
          source: 'SYSTEM'
        });
        synced.push({
          restaurant_id: c.restaurant_id,
          dish_id: c.dish_id,
          business_date: c.business_date,
          portions_produced: c.total_sold
        });
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Sync failed, nothing was written', detail: err.message });
  }

  res.json({ ok: true, synced: synced.length, rows: synced });
});

module.exports = router;
