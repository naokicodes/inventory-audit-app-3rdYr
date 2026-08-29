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
// Step 18: BATCH_PREPPED sold quantity should never exceed available
// prepped portions. Reads "available prepped portions" as SAME-DAY
// prepped only (sold(dish, date) > prepped(dish, date)), not the fuller
// running portion balance (portionBeginning + prepped - sold) that
// computeDishAudit computes - see the interpretation note in
// docs/session-status.md's step 18 entry for why: portionBeginning
// depends on portion_ending_actual, which has no write path anywhere in
// the app yet (step 11), so it's null for virtually every dish/date
// right now and a check built on it would be dead code today. This
// version is meaningful immediately and can be widened later once a
// portion-count entry UI exists.
//
// Read-only - never writes anything, matching "surface as a WARNING,
// not a hard block." Global, same reasoning as sync-batch-stock: the
// panel is reachable from every page with no shared date context.
router.get('/commands/oversold-check', (req, res) => {
  const rows = db.prepare(`
    SELECT
      s.restaurant_id AS restaurant_id,
      r.name AS restaurant_name,
      s.dish_id AS dish_id,
      d.dish_code AS dish_code,
      d.name AS dish_name,
      s.business_date AS business_date,
      SUM(s.quantity) AS sold,
      COALESCE((
        SELECT SUM(p.portions_produced) FROM prepped p
        WHERE p.restaurant_id = s.restaurant_id AND p.dish_id = s.dish_id AND p.business_date = s.business_date
      ), 0) AS prepped
    FROM sales s
    JOIN dishes d ON d.id = s.dish_id
    JOIN restaurants r ON r.id = s.restaurant_id
    WHERE d.prep_type = 'BATCH_PREPPED'
    GROUP BY s.restaurant_id, s.dish_id, s.business_date
    HAVING sold > prepped + 0.01
    ORDER BY s.business_date, r.name, d.dish_code
  `).all();

  const withShortfall = rows.map(r => ({ ...r, shortfall: r.sold - r.prepped }));
  res.json({ ok: true, oversold_count: withShortfall.length, rows: withShortfall });
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
