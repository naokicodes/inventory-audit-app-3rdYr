// API for the Admin History tab (step 7) - a read-only, reverse-
// chronological feed over activity_log. See
// docs/commissary-and-stock-receipts.md Part 3 and docs/data-model.md
// section 11.
//
// This is purely a read on data step 6 already produces: every write to
// stock_receipts or commissary_yield_log already logs a before/after
// snapshot to activity_log (server/db/activityLog.js). No new write path
// is introduced here.

const express = require('express');
const db = require('../db/connection.js');

const router = express.Router();

// GET /api/history/filters
// Distinct entity_type and actor values currently present in activity_log,
// so the frontend's filter dropdowns only ever offer options that actually
// have data behind them. Deliberately not hardcoded to "stock_receipts" /
// "commissary_yield_log" - rule 9's scope is those two tables today, but
// activity_log's entity_type column is generic (data-model.md section 11
// lists "ending_actual"/"recipe_bom" as future examples), so this route
// shouldn't need a code change if that scope ever grows.
router.get('/history/filters', (req, res) => {
  const entityTypes = db.prepare(
    `SELECT DISTINCT entity_type FROM activity_log ORDER BY entity_type`
  ).all().map(r => r.entity_type);

  const actors = db.prepare(
    `SELECT DISTINCT actor FROM activity_log WHERE actor IS NOT NULL AND actor != '' ORDER BY actor`
  ).all().map(r => r.actor);

  res.json({ entityTypes, actors });
});

// GET /api/history?entity_type=&actor=&date_from=&date_to=&limit=
// All filters optional. date_from/date_to are inclusive and compare
// against the date portion of `timestamp` (business timezone isn't
// tracked on activity_log rows - this is an admin trail, not a daily
// input - so a plain date() comparison on the stored UTC timestamp is
// good enough here). Reverse-chronological (newest first), matching the
// "Discord history" model described in commissary-and-stock-receipts.md.
router.get('/history', (req, res) => {
  const { entity_type, actor, date_from, date_to } = req.query;
  const limit = Math.min(Number(req.query.limit) || 200, 500);

  const clauses = [];
  const params = [];

  if (entity_type) { clauses.push('entity_type = ?'); params.push(entity_type); }
  if (actor) { clauses.push('actor = ?'); params.push(actor); }
  if (date_from) { clauses.push('date(timestamp) >= ?'); params.push(date_from); }
  if (date_to) { clauses.push('date(timestamp) <= ?'); params.push(date_to); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT id, timestamp, actor, entity_type, entity_id, action, before, after, source
    FROM activity_log
    ${where}
    ORDER BY timestamp DESC, id DESC
    LIMIT ?
  `).all(...params, limit);

  // before/after are stored as JSON text (see activityLog.js) - parse here
  // so the frontend gets real objects, not a string to parse itself.
  const parsed = rows.map(r => ({
    ...r,
    before: r.before ? JSON.parse(r.before) : null,
    after: r.after ? JSON.parse(r.after) : null
  }));

  res.json(parsed);
});

module.exports = router;
