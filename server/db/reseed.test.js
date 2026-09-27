// Step reseed-beta-db: DB_PATH selection, the live-file refusal, and the
// clean reset itself.
//
// Never runs a reset that could reach the live inventory.db: the refusal
// cases are tested as a pure function (dbPath.js), and every subprocess run
// is pointed at a scratch file in the OS temp directory.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const { LIVE_DB_PATH, resolveDbPath, reseedRefusal } = require('./dbPath.js');

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

console.log('Reseed / DB_PATH Tests\n');

const ROOT = path.join(__dirname, '..', '..');
const SEED = path.join(__dirname, 'seed.js');
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reseed-test-'));
const scratchDb = path.join(scratchDir, 'beta.db');

function runSeed(args, dbPath) {
  const env = { ...process.env };
  delete env.DB_PATH;
  if (dbPath !== undefined) env.DB_PATH = dbPath;
  return spawnSync(process.execPath, [SEED, ...args], { cwd: ROOT, env, encoding: 'utf8' });
}

// Row counts for every app table - the fingerprint of a seeded database.
function tableCounts(file) {
  const db = new DatabaseSync(file);
  try {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all().map(r => r.name);
    const counts = {};
    for (const t of tables) counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
    return counts;
  } finally {
    db.close();
  }
}

// --- DB_PATH selection (pure) ---

test('resolveDbPath: unset DB_PATH means the live inventory.db, as before', () => {
  assert.strictEqual(resolveDbPath(undefined), LIVE_DB_PATH);
  assert.strictEqual(resolveDbPath(''), LIVE_DB_PATH);
});

test('resolveDbPath: a set DB_PATH is resolved against the working directory', () => {
  assert.strictEqual(resolveDbPath('server/db/beta.db'), path.resolve('server/db/beta.db'));
});

// --- refusal (pure - never touches a file) ---

test('reseedRefusal: refuses when DB_PATH is unset or empty', () => {
  assert.match(reseedRefusal(undefined), /DB_PATH is not set/);
  assert.match(reseedRefusal(''), /DB_PATH is not set/);
});

test('reseedRefusal: refuses the live file by absolute path', () => {
  assert.match(reseedRefusal(LIVE_DB_PATH), /live database/);
});

test('reseedRefusal: refuses the live file by a relative path', () => {
  assert.match(reseedRefusal(path.relative(process.cwd(), LIVE_DB_PATH)), /live database/);
});

test('reseedRefusal: refuses the live file by a non-normalized path', () => {
  const roundabout = path.join(path.dirname(LIVE_DB_PATH), '..', 'db', 'inventory.db');
  assert.match(reseedRefusal(roundabout), /live database/);
});

test('reseedRefusal: on Windows, a differently-cased live path is still refused', () => {
  assert.match(reseedRefusal(LIVE_DB_PATH.toUpperCase(), 'win32'), /live database/);
});

test('reseedRefusal: allows a non-live file, including beta.db beside the live one', () => {
  assert.strictEqual(reseedRefusal(scratchDb), null);
  assert.strictEqual(reseedRefusal(path.join(path.dirname(LIVE_DB_PATH), 'beta.db')), null);
});

// --- the script itself (scratch file only) ---

// Deliberately NO subprocess run of `--reset` with DB_PATH unset or live:
// if the refusal ever regressed, that test would itself wipe the live
// database (rule 24). The refusal is covered by the pure tests above.

let freshCounts;
test('reseed on a new scratch DB seeds it and ends FK-consistent', () => {
  const r = runSeed(['--reset'], scratchDb);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /Reseed: cleared \d+ tables/);
  assert.match(r.stdout, /Reseed: done, foreign keys consistent/);
  freshCounts = tableCounts(scratchDb);
  assert.ok(freshCounts.restaurants > 0, 'restaurants seeded');
  assert.ok(freshCounts.meats > 0, 'meats seeded');
  assert.ok(freshCounts.commissary_meats > 0, 'commissary meats seeded');
});

test('reseed clears residue rows (FK-linked ones too) back to the fresh-seed state', () => {
  const db = new DatabaseSync(scratchDb);
  db.exec('PRAGMA foreign_keys = ON');
  const meatId = db.prepare('SELECT id FROM commissary_meats ORDER BY id LIMIT 1').get().id;
  db.prepare(
    'INSERT INTO commissary_yield_log (commissary_meat_id, business_date, raw_weight_in, backed_weight_out) VALUES (?, ?, ?, ?)'
  ).run(meatId, '2026-09-01', 10, 8);
  db.prepare("INSERT INTO restaurants (name, code) VALUES ('Residue Restaurant', 'ZZ')").run();
  db.close();
  const dirty = tableCounts(scratchDb);
  assert.strictEqual(dirty.commissary_yield_log, freshCounts.commissary_yield_log + 1);

  const r = runSeed(['--reset'], scratchDb);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(tableCounts(scratchDb), freshCounts);
});

test('reseed restarts ids (sqlite_sequence cleared) so a reset DB matches a fresh one', () => {
  const db = new DatabaseSync(scratchDb);
  const minId = db.prepare('SELECT MIN(id) AS id FROM restaurants').get().id;
  db.close();
  assert.strictEqual(minId, 1);
});

test('reseed is repeatable: a second reset gives identical counts', () => {
  const r = runSeed(['--reset'], scratchDb);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(tableCounts(scratchDb), freshCounts);
});

test('plain seed.js (no --reset) stays additive: re-running it adds nothing', () => {
  const r = runSeed([], scratchDb);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /Reseed:/);
  assert.deepStrictEqual(tableCounts(scratchDb), freshCounts);
});

fs.rmSync(scratchDir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
