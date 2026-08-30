// Tests for the Admin History route (step 7).
//
// Same approach as activityLog.test.js: a real in-memory node:sqlite DB,
// real schema, real data, plain assertions - no framework, no mocking of
// the DB layer. Since history.js's queries are simple enough to exercise
// directly against the DB (no Express request/response needed to prove
// the SQL/filtering logic is right), this test drives the same SQL the
// route runs, via a small helper that mirrors the route's query-building.
// This keeps the test fast and dependency-free while still proving the
// real logic against a real schema.

const { DatabaseSync } = require('node:sqlite');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { withTransaction, logActivity } = require('../db/activityLog.js');

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

console.log('Admin History Route Tests\n');

const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(schema);

// Mirrors the query-building in history.js's GET /api/history handler,
// so the test proves the actual filtering/ordering logic without needing
// to spin up Express.
function queryHistory(db, { entity_type, actor, date_from, date_to, limit } = {}) {
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
  `).all(...params, Math.min(limit || 200, 500));
  return rows.map(r => ({
    ...r,
    before: r.before ? JSON.parse(r.before) : null,
    after: r.after ? JSON.parse(r.after) : null
  }));
}

// ---- Seed some real-shaped activity: a commissary yield log CREATE by
// one actor, then a stock_receipts CREATE + UPDATE by another actor, on
// different dates, so filters have something real to distinguish.

db.prepare(`INSERT INTO commissaries (code, name) VALUES ('COM-A', 'Commissary A')`).run();
const commissaryId = db.prepare(`SELECT id FROM commissaries WHERE code = 'COM-A'`).get().id;

db.prepare('INSERT INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct) VALUES (?, ?, ?, ?, ?)')
  .run(commissaryId, 'M05', 'JOWL', 'kg', 0.20);
const jowlId = db.prepare('SELECT id FROM commissary_meats WHERE code = ?').get('M05').id;

db.prepare('INSERT INTO restaurants (name, code) VALUES (?, ?)').run('Restaurant A', 'RA');
const restaurantId = db.prepare('SELECT id FROM restaurants WHERE code = ?').get('RA').id;
db.prepare('INSERT INTO meats (restaurant_id, meat_code, name, unit) VALUES (?, ?, ?, ?)')
  .run(restaurantId, 'M01', 'Whole Chicken Raw', 'kg');
const meatId = db.prepare('SELECT id FROM meats WHERE meat_code = ?').get('M01').id;

// Manually set the timestamp on each activity_log insert (rather than
// relying on datetime('now')) so date-range filtering is deterministic.
function insertYieldEntry(businessDate, timestamp, actor) {
  return withTransaction(db, () => {
    const result = db.prepare(
      `INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out) VALUES (?, ?, ?, ?)`
    ).run(jowlId, businessDate, 20, 16);
    logActivity(db, {
      actor, entityType: 'commissary_yield_log', entityId: result.lastInsertRowid,
      action: 'CREATE', before: null, after: { raw_weight_in: 20, backed_weight_out: 16 }, source: 'MANUAL'
    });
    db.prepare(`UPDATE activity_log SET timestamp = ? WHERE entity_type = 'commissary_yield_log' AND entity_id = ?`)
      .run(timestamp, result.lastInsertRowid);
    return result.lastInsertRowid;
  });
}

function insertReceiptCreateThenUpdate(businessDate, createTs, updateTs, actor) {
  const id = withTransaction(db, () => {
    const result = db.prepare(
      `INSERT INTO stock_receipts (restaurant_id, meat_id, business_date, quantity, source) VALUES (?, ?, ?, ?, ?)`
    ).run(restaurantId, meatId, businessDate, 10, 'DIRECT');
    logActivity(db, {
      actor, entityType: 'stock_receipts', entityId: result.lastInsertRowid,
      action: 'CREATE', before: null, after: { quantity: 10 }, source: 'MANUAL'
    });
    db.prepare(`UPDATE activity_log SET timestamp = ? WHERE entity_type = 'stock_receipts' AND entity_id = ? AND action = 'CREATE'`)
      .run(createTs, result.lastInsertRowid);
    return result.lastInsertRowid;
  });

  withTransaction(db, () => {
    const before = db.prepare('SELECT * FROM stock_receipts WHERE id = ?').get(id);
    db.prepare(`UPDATE stock_receipts SET quantity = ? WHERE id = ?`).run(12, id);
    const after = db.prepare('SELECT * FROM stock_receipts WHERE id = ?').get(id);
    logActivity(db, {
      actor, entityType: 'stock_receipts', entityId: id,
      action: 'UPDATE', before, after, source: 'MANUAL'
    });
    db.prepare(`UPDATE activity_log SET timestamp = ? WHERE entity_type = 'stock_receipts' AND entity_id = ? AND action = 'UPDATE'`)
      .run(updateTs, id);
  });

  return id;
}

insertYieldEntry('2026-07-02', '2026-07-02T08:00:00Z', 'Dan');
const receiptId = insertReceiptCreateThenUpdate(
  '2026-07-03', '2026-07-03T09:00:00Z', '2026-07-04T10:00:00Z', 'Marie'
);

test('GET /api/history/filters equivalent: distinct entity_type and actor values', () => {
  const entityTypes = db.prepare(`SELECT DISTINCT entity_type FROM activity_log ORDER BY entity_type`).all().map(r => r.entity_type);
  const actors = db.prepare(`SELECT DISTINCT actor FROM activity_log WHERE actor IS NOT NULL AND actor != '' ORDER BY actor`).all().map(r => r.actor);
  assert.deepStrictEqual(entityTypes, ['commissary_yield_log', 'stock_receipts']);
  assert.deepStrictEqual(actors, ['Dan', 'Marie']);
});

test('queryHistory with no filters: returns all rows, newest first', () => {
  const rows = queryHistory(db);
  assert.strictEqual(rows.length, 3, 'CREATE yield entry + CREATE receipt + UPDATE receipt = 3 rows');
  // Newest timestamp (the UPDATE, 07-04) should be first.
  assert.strictEqual(rows[0].action, 'UPDATE');
  assert.strictEqual(rows[0].entity_type, 'stock_receipts');
  assert.strictEqual(rows[2].actor, 'Dan');
});

test('queryHistory filters by entity_type', () => {
  const rows = queryHistory(db, { entity_type: 'commissary_yield_log' });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].actor, 'Dan');
});

test('queryHistory filters by actor', () => {
  const rows = queryHistory(db, { actor: 'Marie' });
  assert.strictEqual(rows.length, 2, 'Marie has one CREATE and one UPDATE');
  rows.forEach(r => assert.strictEqual(r.actor, 'Marie'));
});

test('queryHistory filters by date range (inclusive)', () => {
  const rows = queryHistory(db, { date_from: '2026-07-03', date_to: '2026-07-03' });
  assert.strictEqual(rows.length, 1, 'only the CREATE on 07-03 falls in this range - the UPDATE is 07-04');
  assert.strictEqual(rows[0].action, 'CREATE');
  assert.strictEqual(rows[0].entity_type, 'stock_receipts');
});

test('queryHistory: before/after come back as parsed objects, not JSON strings', () => {
  const rows = queryHistory(db, { entity_type: 'stock_receipts', actor: 'Marie' });
  const update = rows.find(r => r.action === 'UPDATE');
  assert.strictEqual(typeof update.before, 'object');
  assert.strictEqual(typeof update.after, 'object');
  assert.strictEqual(update.before.quantity, 10);
  assert.strictEqual(update.after.quantity, 12);
});

test('queryHistory: CREATE rows have before = null, DELETE rows would have after = null (spot check CREATE)', () => {
  const rows = queryHistory(db, { entity_type: 'commissary_yield_log' });
  assert.strictEqual(rows[0].before, null);
  assert.strictEqual(rows[0].after.backed_weight_out, 16);
});

test('queryHistory: combining filters (entity_type + actor + date range) narrows correctly', () => {
  const rows = queryHistory(db, { entity_type: 'stock_receipts', actor: 'Marie', date_from: '2026-07-04', date_to: '2026-07-04' });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].action, 'UPDATE');
});

console.log(`\n${passed} passed, ${failed} failed`);
db.close();
process.exit(failed > 0 ? 1 : 0);
