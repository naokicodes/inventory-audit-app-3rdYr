// Step busy-timeout: a connection opened through connection.js waits up to 5s
// for a lock (busy_timeout) and runs in WAL mode.
// Step db-start: the lookup indexes, the schema version, and what the server
// does at start (a missing DB_PATH file, a newer database, sheet definitions).
//
// Never touches the live inventory.db: connection.js is loaded in a child
// process with DB_PATH pointing at a scratch file in the OS temp dir, so its
// module-level open never happens in this process. The server is started as a
// child too, on PORT 0 (any free port) and a scratch DB_PATH, and stopped as
// soon as it is listening.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

const ROOT = path.join(__dirname, '..', '..');
const SERVER = path.join(ROOT, 'server', 'index.js');
const SEED = path.join(__dirname, 'seed.js');
const SCHEMA_VERSION = 1;

const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'connection-test-'));
const scratchDb = path.join(scratchDir, 'scratch.db');

const probe = `
  const db = require(${JSON.stringify(path.join(__dirname, 'connection.js'))});
  const timeout = db.prepare('PRAGMA busy_timeout').get();
  const journal = db.prepare('PRAGMA journal_mode').get();
  const version = db.prepare('PRAGMA user_version').get();
  const file = db.prepare("SELECT file FROM pragma_database_list WHERE name = 'main'").get().file;
  process.stdout.write(JSON.stringify({ timeout: Object.values(timeout)[0], journal: Object.values(journal)[0], version: Object.values(version)[0], file }));
  db.close();
`;
const run = spawnSync(process.execPath, ['-e', probe], {
  encoding: 'utf8',
  env: { ...process.env, DB_PATH: scratchDb },
});
const out = run.status === 0 ? JSON.parse(run.stdout) : null;

// The child env for the server and the seed: a scratch DB_PATH, any free port.
function childEnv(dbPath) {
  const env = { ...process.env, PORT: '0' };
  delete env.DB_PATH;
  if (dbPath !== undefined) env.DB_PATH = dbPath;
  return env;
}

function seedScratch(file) {
  const r = spawnSync(process.execPath, [SEED], { cwd: ROOT, env: childEnv(file), encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
}

// Starts server/index.js and resolves once it is listening (then stops it) or
// once it exits on its own. { started, code, stdout, stderr }.
function startServer({ dbPath, cwd = ROOT }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], { cwd, env: childEnv(dbPath) });
    let stdout = '', stderr = '', settled = false, listening = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, ...result });
    };
    const timer = setTimeout(() => {
      child.kill();
      if (!settled) { settled = true; reject(new Error(`server neither listened nor exited in 30s\n${stdout}\n${stderr}`)); }
    }, 30000);
    child.stdout.on('data', d => {
      stdout += d;
      if (!listening && stdout.includes('Inventory Audit App running at')) {
        listening = true;
        child.kill();
      }
    });
    child.stderr.on('data', d => { stderr += d; });
    // Resolves only once the process is gone, so the test can open its file.
    child.on('exit', code => finish(listening ? { started: true, code: null } : { started: false, code }));
  });
}

function readDb(file, fn) {
  const db = new DatabaseSync(file);
  try { return fn(db); } finally { db.close(); }
}

// EXPLAIN QUERY PLAN details for a query, against a schema-only database.
function planOf(db, sql) {
  return db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all().map(r => r.detail);
}

async function main() {
  console.log('Connection Tests\n');

  await test('connection.js opened the scratch DB_PATH, not the live database', () => {
    assert.ok(out, `child failed: ${run.stderr}`);
    assert.strictEqual(fs.realpathSync(out.file), fs.realpathSync(scratchDb));
  });

  await test('connection.js opens with busy_timeout = 5000', () => {
    assert.ok(out, `child failed: ${run.stderr}`);
    assert.strictEqual(out.timeout, 5000);
  });

  await test('connection.js opens in WAL journal mode', () => {
    assert.ok(out, `child failed: ${run.stderr}`);
    assert.strictEqual(out.journal, 'wal');
  });

  await test('connection.js leaves the database at user_version 1 (SCHEMA_VERSION)', () => {
    assert.ok(out, `child failed: ${run.stderr}`);
    assert.strictEqual(out.version, SCHEMA_VERSION);
  });

  // --- indexes (F1): the engines' lookups use them, no SCAN ---

  const schemaDb = new DatabaseSync(':memory:');
  schemaDb.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  const lookups = [
    ['landing sales', 'idx_sales_lookup',
      'SELECT SUM(quantity) FROM sales WHERE restaurant_id = 1 AND dish_id = 1 AND business_date = \'2026-11-01\''],
    ['landing receipts', 'idx_stock_receipts_lookup',
      'SELECT SUM(quantity) FROM stock_receipts WHERE restaurant_id = 1 AND meat_id = 1 AND business_date = \'2026-11-01\' AND deleted_at IS NULL'],
    ['landing adjustments', 'idx_adjustments_lookup',
      'SELECT SUM(quantity) FROM adjustments WHERE restaurant_id = 1 AND meat_id = 1 AND business_date = \'2026-11-01\''],
    ['landing adjustments over a window', 'idx_adjustments_lookup',
      'SELECT SUM(quantity) FROM adjustments WHERE restaurant_id = 1 AND meat_id = 1 AND business_date >= \'2026-11-01\' AND business_date <= \'2026-11-07\''],
    ['count_entries for one item', 'idx_count_entries_lookup',
      'SELECT 1 FROM count_entries WHERE restaurant_id = 1 AND business_date = \'2026-11-01\' AND kind = \'MEAT\' AND item_id = 1'],
    ['count_entries for one day', 'idx_count_entries_lookup',
      'SELECT id FROM count_entries WHERE restaurant_id = 1 AND business_date = \'2026-11-01\''],
    ['recount orders for one day', 'idx_recount_orders_lookup',
      'SELECT id FROM recount_orders WHERE restaurant_id = 1 AND business_date = \'2026-11-01\''],
    ['commissary shipments', 'idx_commissary_shipments_lookup',
      'SELECT SUM(total_quantity) FROM commissary_shipments WHERE commissary_meat_id = 1 AND business_date = \'2026-11-01\''],
    ['commissary yield log (processed)', 'idx_commissary_yield_log_lookup',
      'SELECT SUM(COALESCE(input_quantity, raw_weight_in)) FROM commissary_yield_log WHERE commissary_meat_id = 1 AND business_date = \'2026-11-01\' AND deleted_at IS NULL'],
    ['commissary adjustments (loss)', 'idx_commissary_adjustments_lookup',
      'SELECT SUM(quantity) FROM commissary_adjustments WHERE kind = \'LOSS\' AND commissary_meat_id = 1 AND business_date = \'2026-11-01\' AND deleted_at IS NULL'],
  ];
  for (const [what, index, sql] of lookups) {
    await test(`EXPLAIN QUERY PLAN: ${what} uses ${index}, no SCAN`, () => {
      const plan = planOf(schemaDb, sql);
      assert.ok(plan.some(d => d.includes(index)), plan.join(' | '));
      assert.ok(!plan.some(d => /^SCAN/.test(d)), plan.join(' | '));
    });
  }
  schemaDb.close();

  await test('schema.sql re-run adds nothing: every index is IF NOT EXISTS', () => {
    const db = new DatabaseSync(':memory:');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    db.exec(schema);
    const count = () => db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index'").get().n;
    const before = count();
    db.exec(schema);
    assert.strictEqual(count(), before);
    db.close();
  });

  // --- the server at start ---

  await test('a missing DB_PATH file stops the server with its message and creates nothing (started from a temp folder)', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'connection-test-cwd-'));
    const missing = path.join(scratchDir, 'missing.db');
    const r = await startServer({ dbPath: missing, cwd });
    assert.strictEqual(r.started, false, r.stdout);
    assert.strictEqual(r.code, 1);
    assert.ok(r.stderr.includes(`The database file ${missing} is missing. Nothing was started. On a new install, run the setup again; otherwise check DB_PATH in .env.`), r.stderr);
    assert.ok(!fs.existsSync(missing), 'the missing file was created');
    assert.deepStrictEqual(fs.readdirSync(cwd), [], 'something was created in the working folder');
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  await test('a missing relative DB_PATH stops the server and creates nothing at the repo root', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'connection-test-cwd-'));
    const relative = 'server/db/connection-test-missing.db';
    const resolved = path.join(ROOT, 'server', 'db', 'connection-test-missing.db');
    const r = await startServer({ dbPath: relative, cwd });
    assert.strictEqual(r.code, 1);
    assert.ok(r.stderr.includes(`The database file ${resolved} is missing.`), r.stderr);
    assert.ok(!fs.existsSync(resolved), 'created at the repo root');
    assert.deepStrictEqual(fs.readdirSync(cwd), [], 'created in the working folder');
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  const serverDb = path.join(scratchDir, 'server.db');
  seedScratch(serverDb);

  await test('a restaurant created after seeding gets its Landing at the next start; an inactive one does not', async () => {
    readDb(serverDb, db => {
      db.prepare("INSERT INTO restaurants (name, code, active) VALUES ('Added Later', 'ZZ', 1)").run();
      db.prepare("INSERT INTO restaurants (name, code, active) VALUES ('Closed Site', 'ZY', 0)").run();
    });
    const sheets = code => readDb(serverDb, db =>
      db.prepare('SELECT category, engine_type FROM sheet_definitions WHERE site_code = ?').all(code)
        .map(r => ({ ...r })));
    assert.deepStrictEqual(sheets('ZZ'), [], 'no sheet before the start');

    const r = await startServer({ dbPath: serverDb });
    assert.ok(r.started, r.stderr);
    assert.deepStrictEqual(sheets('ZZ'), [{ category: 'Landing', engine_type: 'MEAT' }]);
    assert.deepStrictEqual(sheets('ZY'), []);
  });

  await test('the server starts on a database from before this step (user_version 0) and leaves it at 1', async () => {
    readDb(serverDb, db => db.exec('PRAGMA user_version = 0'));
    const r = await startServer({ dbPath: serverDb });
    assert.ok(r.started, r.stderr);
    assert.strictEqual(readDb(serverDb, db => db.prepare('PRAGMA user_version').get().user_version), SCHEMA_VERSION);
  });

  await test('a database at user_version 2 stops the server with the message, before any write', async () => {
    readDb(serverDb, db => {
      db.exec('PRAGMA user_version = 2');
      db.exec('DROP INDEX idx_sales_lookup');   // schema.sql would put it back
    });
    const r = await startServer({ dbPath: serverDb });
    assert.strictEqual(r.started, false, r.stdout);
    assert.strictEqual(r.code, 1);
    assert.ok(r.stderr.includes('This database was opened by a newer version of the app. Update the app (restaurant-pc.bat update) instead of going back.'), r.stderr);
    readDb(serverDb, db => {
      assert.strictEqual(db.prepare('PRAGMA user_version').get().user_version, 2);
      assert.strictEqual(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'idx_sales_lookup'").get(), undefined, 'schema.sql ran');
    });
  });

  fs.rmSync(scratchDir, { recursive: true, force: true });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
