const { DatabaseSync } = require('node:sqlite');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { withTransaction, logActivity } = require('./activityLog.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

console.log('Activity Log / Transaction Helper Tests\n');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(schema);

db.prepare('INSERT INTO commissary_meats (code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?)')
  .run('M05', 'JOWL', 'kg', 0.20);
const jowlId = db.prepare('SELECT id FROM commissary_meats WHERE code = ?').get('M05').id;

test('withTransaction: a successful CREATE writes both the row and its activity_log entry', () => {
  const id = withTransaction(db, () => {
    const result = db.prepare(
      `INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out) VALUES (?, ?, ?, ?)`
    ).run(jowlId, '2026-07-02', 20.5, 16.0);
    logActivity(db, {
      actor: 'tester',
      entityType: 'commissary_yield_log',
      entityId: result.lastInsertRowid,
      action: 'CREATE',
      before: null,
      after: { commissary_meat_id: jowlId, business_date: '2026-07-02', raw_weight_in: 20.5, backed_weight_out: 16.0 },
      source: 'MANUAL'
    });
    return result.lastInsertRowid;
  });

  const row = db.prepare('SELECT * FROM commissary_yield_log WHERE id = ?').get(id);
  assert.ok(row, 'the yield log row should exist');

  const logRow = db.prepare('SELECT * FROM activity_log WHERE entity_type = ? AND entity_id = ?').get('commissary_yield_log', id);
  assert.ok(logRow, 'an activity_log row should exist for this create');
  assert.strictEqual(logRow.action, 'CREATE');
  assert.strictEqual(logRow.before, null);
  assert.strictEqual(JSON.parse(logRow.after).backed_weight_out, 16.0);
});

test('withTransaction: an error partway through rolls back BOTH the target write and the log entry', () => {
  const beforeCount = db.prepare('SELECT COUNT(*) AS n FROM commissary_yield_log').get().n;
  const beforeLogCount = db.prepare('SELECT COUNT(*) AS n FROM activity_log').get().n;

  assert.throws(() => {
    withTransaction(db, () => {
      const result = db.prepare(
        `INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out) VALUES (?, ?, ?, ?)`
      ).run(jowlId, '2026-07-03', 10, 8);
      logActivity(db, {
        actor: 'tester',
        entityType: 'commissary_yield_log',
        entityId: result.lastInsertRowid,
        action: 'CREATE',
        before: null,
        after: { raw_weight_in: 10 },
        source: 'MANUAL'
      });
      // Force a failure after both writes have happened, inside the same transaction.
      throw new Error('simulated failure after both writes');
    });
  }, /simulated failure/);

  const afterCount = db.prepare('SELECT COUNT(*) AS n FROM commissary_yield_log').get().n;
  const afterLogCount = db.prepare('SELECT COUNT(*) AS n FROM activity_log').get().n;
  assert.strictEqual(afterCount, beforeCount, 'the yield log row must be rolled back');
  assert.strictEqual(afterLogCount, beforeLogCount, 'the activity_log row must be rolled back too');
});

test('logActivity: UPDATE stores both before and after snapshots', () => {
  const id = withTransaction(db, () => {
    const result = db.prepare(
      `INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out) VALUES (?, ?, ?, ?)`
    ).run(jowlId, '2026-07-04', 20, 16);
    logActivity(db, { actor: 'tester', entityType: 'commissary_yield_log', entityId: result.lastInsertRowid, action: 'CREATE', before: null, after: { backed_weight_out: 16 }, source: 'MANUAL' });
    return result.lastInsertRowid;
  });

  withTransaction(db, () => {
    const before = db.prepare('SELECT * FROM commissary_yield_log WHERE id = ?').get(id);
    db.prepare('UPDATE commissary_yield_log SET backed_weight_out = ? WHERE id = ?').run(15.5, id);
    const after = db.prepare('SELECT * FROM commissary_yield_log WHERE id = ?').get(id);
    logActivity(db, { actor: 'tester', entityType: 'commissary_yield_log', entityId: id, action: 'UPDATE', before, after, source: 'MANUAL' });
  });

  const logRow = db.prepare('SELECT * FROM activity_log WHERE entity_type = ? AND entity_id = ? AND action = ?').get('commissary_yield_log', id, 'UPDATE');
  assert.strictEqual(JSON.parse(logRow.before).backed_weight_out, 16);
  assert.strictEqual(JSON.parse(logRow.after).backed_weight_out, 15.5);
});

test('logActivity: DELETE (soft) stores before, and after is null', () => {
  const id = withTransaction(db, () => {
    const result = db.prepare(
      `INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out) VALUES (?, ?, ?, ?)`
    ).run(jowlId, '2026-07-05', 10, 9);
    logActivity(db, { actor: 'tester', entityType: 'commissary_yield_log', entityId: result.lastInsertRowid, action: 'CREATE', before: null, after: { backed_weight_out: 9 }, source: 'MANUAL' });
    return result.lastInsertRowid;
  });

  withTransaction(db, () => {
    const before = db.prepare('SELECT * FROM commissary_yield_log WHERE id = ?').get(id);
    db.prepare('UPDATE commissary_yield_log SET deleted_at = ? WHERE id = ?').run('2026-07-06T00:00:00Z', id);
    logActivity(db, { actor: 'tester', entityType: 'commissary_yield_log', entityId: id, action: 'DELETE', before, after: null, source: 'MANUAL' });
  });

  const row = db.prepare('SELECT * FROM commissary_yield_log WHERE id = ?').get(id);
  assert.ok(row.deleted_at, 'the row itself must still exist (soft delete, no hard DELETE)');

  const logRow = db.prepare('SELECT * FROM activity_log WHERE entity_type = ? AND entity_id = ? AND action = ?').get('commissary_yield_log', id, 'DELETE');
  assert.ok(JSON.parse(logRow.before).backed_weight_out === 9);
  assert.strictEqual(logRow.after, null);
});

test('logActivity: rejects an invalid action rather than silently accepting garbage', () => {
  assert.throws(() => {
    logActivity(db, { entityType: 'x', entityId: 1, action: 'REPLACE', before: null, after: null, source: 'MANUAL' });
  }, /invalid action/);
});

test('logActivity: rejects an invalid source', () => {
  assert.throws(() => {
    logActivity(db, { entityType: 'x', entityId: 1, action: 'CREATE', before: null, after: null, source: 'ROBOT' });
  }, /invalid source/);
});

console.log(`\n${passed} passed, ${failed} failed`);
db.close();
process.exit(failed > 0 ? 1 : 0);
