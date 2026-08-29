// Tests for step 15's "Sync batch stock" command, mirroring
// commands.js's exact route logic (not a live Express server) against a
// real in-memory node:sqlite DB - same approach as stockReceipts.test.js.
// The full flow was ALSO smoke-tested against a real running server this
// session (seeded DB, live POST, checked activity_log + prepped rows) -
// see the changelog entry for step 15; not re-run here since it needs a
// live process, but the logic under test is identical.

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

console.log('Commands Route Tests (step 15: Sync batch stock)\n');

function freshDb() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(schema);
  db.prepare(`INSERT INTO restaurants (id, name, code) VALUES (1, 'Restaurant A', 'A')`).run();
  db.prepare(`INSERT INTO dishes (id, restaurant_id, dish_code, name, prep_type) VALUES (1, 1, 'D01', 'Batch Dish', 'BATCH_PREPPED')`).run();
  db.prepare(`INSERT INTO dishes (id, restaurant_id, dish_code, name, prep_type) VALUES (2, 1, 'D02', 'Direct Dish', 'DIRECT')`).run();
  return db;
}

// Mirrors POST /api/commands/sync-batch-stock
function runSync(db) {
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
  withTransaction(db, () => {
    for (const c of candidates) {
      const result = insertPrepped.run(c.restaurant_id, c.dish_id, c.business_date, c.total_sold, 'SYSTEM:sync-batch-stock');
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
      synced.push({ restaurant_id: c.restaurant_id, dish_id: c.dish_id, business_date: c.business_date, portions_produced: c.total_sold });
    }
  });
  return synced;
}

test('a BATCH_PREPPED dish with sales and no prepped row gets synced', () => {
  const db = freshDb();
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity) VALUES (1, 1, '2026-08-29', 12)`).run();
  const synced = runSync(db);
  assert.strictEqual(synced.length, 1);
  assert.strictEqual(synced[0].portions_produced, 12);
  const row = db.prepare(`SELECT * FROM prepped WHERE restaurant_id = 1 AND dish_id = 1 AND business_date = '2026-08-29'`).get();
  assert.strictEqual(row.portions_produced, 12);
  assert.strictEqual(row.created_by, 'SYSTEM:sync-batch-stock');
});

test('multiple sales rows for the same dish/date are summed, not duplicated', () => {
  const db = freshDb();
  // Two rows for the same day only happens for LOYVERSE in the real
  // schema (step 16 added a partial unique index forbidding this for
  // MANUAL rows) - using LOYVERSE here to match, not because
  // sync-batch-stock cares which source it reads from.
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity, source) VALUES (1, 1, '2026-08-29', 5, 'LOYVERSE')`).run();
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity, source) VALUES (1, 1, '2026-08-29', 7, 'LOYVERSE')`).run();
  const synced = runSync(db);
  assert.strictEqual(synced.length, 1);
  assert.strictEqual(synced[0].portions_produced, 12);
});

test('a DIRECT dish with sales is never synced into prepped', () => {
  const db = freshDb();
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity) VALUES (1, 2, '2026-08-29', 9)`).run();
  const synced = runSync(db);
  assert.strictEqual(synced.length, 0);
  const row = db.prepare(`SELECT * FROM prepped WHERE dish_id = 2`).get();
  assert.strictEqual(row, undefined);
});

test('a combo that already has a manual prepped entry is left alone, not overwritten', () => {
  const db = freshDb();
  db.prepare(`INSERT INTO prepped (restaurant_id, dish_id, business_date, portions_produced, created_by) VALUES (1, 1, '2026-08-29', 20, 'manual-entry')`).run();
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity) VALUES (1, 1, '2026-08-29', 12)`).run();
  const synced = runSync(db);
  assert.strictEqual(synced.length, 0);
  const row = db.prepare(`SELECT * FROM prepped WHERE dish_id = 1`).get();
  assert.strictEqual(row.portions_produced, 20);
  assert.strictEqual(row.created_by, 'manual-entry');
});

test('running sync twice in a row is idempotent - second run finds nothing new', () => {
  const db = freshDb();
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity) VALUES (1, 1, '2026-08-29', 12)`).run();
  const first = runSync(db);
  const second = runSync(db);
  assert.strictEqual(first.length, 1);
  assert.strictEqual(second.length, 0);
});

test('a synced row logs a matching activity_log CREATE/SYSTEM entry', () => {
  const db = freshDb();
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity) VALUES (1, 1, '2026-08-29', 12)`).run();
  runSync(db);
  const logRow = db.prepare(`SELECT * FROM activity_log WHERE entity_type = 'prepped'`).get();
  assert.ok(logRow, 'expected an activity_log row for the prepped write');
  assert.strictEqual(logRow.action, 'CREATE');
  assert.strictEqual(logRow.source, 'SYSTEM');
  const after = JSON.parse(logRow.after);
  assert.strictEqual(after.portions_produced, 12);
});

test('different restaurants with the same dish_id/date are kept separate', () => {
  const db = freshDb();
  db.prepare(`INSERT INTO restaurants (id, name, code) VALUES (2, 'Restaurant B', 'B')`).run();
  db.prepare(`INSERT INTO dishes (id, restaurant_id, dish_code, name, prep_type) VALUES (3, 2, 'D01', 'Batch Dish B', 'BATCH_PREPPED')`).run();
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity) VALUES (1, 1, '2026-08-29', 12)`).run();
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity) VALUES (2, 3, '2026-08-29', 8)`).run();
  const synced = runSync(db);
  assert.strictEqual(synced.length, 2);
});

// --- Mirrors GET /api/commands/oversold-check ---
function runOversoldCheck(db) {
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
  return rows.map(r => ({ ...r, shortfall: r.sold - r.prepped }));
}

test('a BATCH_PREPPED dish sold more than prepped is flagged', () => {
  const db = freshDb();
  db.prepare(`INSERT INTO prepped (restaurant_id, dish_id, business_date, portions_produced) VALUES (1, 1, '2026-08-29', 10)`).run();
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity, source) VALUES (1, 1, '2026-08-29', 15, 'MANUAL')`).run();
  const flagged = runOversoldCheck(db);
  assert.strictEqual(flagged.length, 1);
  assert.strictEqual(flagged[0].shortfall, 5);
});

test('sold exactly matching prepped is NOT flagged', () => {
  const db = freshDb();
  db.prepare(`INSERT INTO prepped (restaurant_id, dish_id, business_date, portions_produced) VALUES (1, 1, '2026-08-29', 10)`).run();
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity, source) VALUES (1, 1, '2026-08-29', 10, 'MANUAL')`).run();
  assert.strictEqual(runOversoldCheck(db).length, 0);
});

test('sold less than prepped is NOT flagged', () => {
  const db = freshDb();
  db.prepare(`INSERT INTO prepped (restaurant_id, dish_id, business_date, portions_produced) VALUES (1, 1, '2026-08-29', 10)`).run();
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity, source) VALUES (1, 1, '2026-08-29', 3, 'MANUAL')`).run();
  assert.strictEqual(runOversoldCheck(db).length, 0);
});

test('sales with no prepped row at all counts as 0 prepped - fully oversold', () => {
  const db = freshDb();
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity, source) VALUES (1, 1, '2026-08-29', 4, 'MANUAL')`).run();
  const flagged = runOversoldCheck(db);
  assert.strictEqual(flagged.length, 1);
  assert.strictEqual(flagged[0].prepped, 0);
  assert.strictEqual(flagged[0].shortfall, 4);
});

test('a DIRECT dish sold more than its own (irrelevant) prepped total is never flagged', () => {
  const db = freshDb();
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity, source) VALUES (1, 2, '2026-08-29', 999, 'MANUAL')`).run();
  assert.strictEqual(runOversoldCheck(db).length, 0);
});

test('oversold-check never writes anything - it is read-only', () => {
  const db = freshDb();
  db.prepare(`INSERT INTO sales (restaurant_id, dish_id, business_date, quantity, source) VALUES (1, 1, '2026-08-29', 15, 'MANUAL')`).run();
  runOversoldCheck(db);
  const preppedRows = db.prepare(`SELECT * FROM prepped`).all();
  const logRows = db.prepare(`SELECT * FROM activity_log`).all();
  assert.strictEqual(preppedRows.length, 0);
  assert.strictEqual(logRows.length, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
