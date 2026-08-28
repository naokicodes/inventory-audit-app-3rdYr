// Shared helpers for step 6 (activity log wiring). Two small utilities:
//
// - withTransaction(db, fn): hand-rolled BEGIN/COMMIT/ROLLBACK, since
//   node:sqlite's DatabaseSync has no .transaction() wrapper (checked -
//   only .exec()/.prepare() exist). fn runs synchronously; any throw
//   inside it rolls back and rethrows.
// - logActivity(db, {...}): inserts one activity_log row. Meant to be
//   called INSIDE a withTransaction callback, alongside the real write,
//   so a write to stock_receipts/commissary_yield_log and its log entry
//   either both land or neither does (rules-for-claude-code.md rule 9).
//
// Deliberately NOT wrapping db.prepare/run generally - only the specific
// write paths that need create+log or edit/delete+log atomicity use this.

function withTransaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Insert one activity_log row. `before`/`after` should be plain objects
 * (or null) - they're JSON.stringify'd here, not by the caller, so every
 * call site serializes the same way.
 */
function logActivity(db, { actor, entityType, entityId, action, before, after, source }) {
  if (!['CREATE', 'UPDATE', 'DELETE'].includes(action)) {
    throw new Error(`logActivity: invalid action "${action}"`);
  }
  if (!['SYSTEM', 'MANUAL'].includes(source)) {
    throw new Error(`logActivity: invalid source "${source}"`);
  }
  db.prepare(`
    INSERT INTO activity_log (actor, entity_type, entity_id, action, before, after, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    actor || null,
    entityType,
    entityId,
    action,
    before === null || before === undefined ? null : JSON.stringify(before),
    after === null || after === undefined ? null : JSON.stringify(after),
    source
  );
}

module.exports = { withTransaction, logActivity };
