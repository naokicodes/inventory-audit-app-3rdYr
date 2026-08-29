// Backend for the command panel's real commands (step 14 built the
// scaffold; this is step 15's first real one). See
// docs/session-status.md step 15 for the spec, and docs/scope.md's
// "Narrow exception added 2026-08-29 for step 15" note for why this is
// the one write path allowed to log to activity_log for `prepped`.

const express = require('express');
const db = require('../db/connection.js');
const { withTransaction, logActivity } = require('../db/activityLog.js');

const router = express.Router();

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
