// Step reseed-beta-db: DB_PATH selection, the live-file refusal, and the
// clean reset itself.
// Step db-start: DB_PATH resolves against the repo root, reseed refuses
// beta.db and trailing full stops / spaces, and the identity check on the
// file SQLite actually opened.
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
const { LIVE_DB_PATH, resolveDbPath, reseedRefusal, openedFileRefusal } = require('./dbPath.js');

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
const scratchDb = path.join(scratchDir, 'dev.db');

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

test('resolveDbPath: a relative DB_PATH resolves against the repo root, the same file from any folder', () => {
  const expected = path.join(ROOT, 'server', 'db', 'beta.db');
  const startedIn = process.cwd();
  try {
    process.chdir(ROOT);
    assert.strictEqual(resolveDbPath('server/db/beta.db'), expected);
    process.chdir(scratchDir);
    assert.strictEqual(resolveDbPath('server/db/beta.db'), expected);
  } finally {
    process.chdir(startedIn);
  }
});

test('resolveDbPath: an absolute DB_PATH is used as given', () => {
  assert.strictEqual(resolveDbPath(scratchDb), scratchDb);
});

test('connection.js opens the same file for a relative DB_PATH from the repo root and from another folder', () => {
  const probe = `
    const db = require(${JSON.stringify(path.join(__dirname, 'connection.js'))});
    process.stdout.write(db.prepare("SELECT file FROM pragma_database_list WHERE name = 'main'").get().file);
    db.close();
  `;
  const relative = path.relative(ROOT, path.join(scratchDir, 'relative.db'));
  const opened = cwd => {
    const r = spawnSync(process.execPath, ['-e', probe], { cwd, env: { ...process.env, DB_PATH: relative }, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    return fs.realpathSync(r.stdout);
  };
  const fromRoot = opened(ROOT);
  assert.strictEqual(opened(os.tmpdir()), fromRoot);
  assert.strictEqual(fromRoot, fs.realpathSync(path.join(scratchDir, 'relative.db')));
});

// --- refusal (pure - never touches a file) ---

test('reseedRefusal: refuses when DB_PATH is unset or empty', () => {
  assert.match(reseedRefusal(undefined), /DB_PATH is not set/);
  assert.match(reseedRefusal(''), /DB_PATH is not set/);
});

test('reseedRefusal: its examples name dev.db, never beta.db', () => {
  assert.match(reseedRefusal(undefined), /server\/db\/dev\.db/);
  assert.match(reseedRefusal(LIVE_DB_PATH), /server\/db\/dev\.db/);
  assert.doesNotMatch(reseedRefusal(undefined), /beta\.db/);
});

test('reseedRefusal: refuses the live file by absolute path', () => {
  assert.match(reseedRefusal(LIVE_DB_PATH), /live database/);
});

test('reseedRefusal: refuses the live file by a path relative to the repo root', () => {
  assert.match(reseedRefusal(path.relative(ROOT, LIVE_DB_PATH)), /live database/);
  assert.match(reseedRefusal('server/db/inventory.db'), /live database/);
});

test('reseedRefusal: refuses inventory.db with a trailing full stop or space', () => {
  for (const spelling of ['server/db/inventory.db.', 'server/db/inventory.db ', 'server/db/inventory.db. .']) {
    assert.match(reseedRefusal(spelling), /live database/, JSON.stringify(spelling));
  }
});

test('reseedRefusal: on Windows, inventory.db in another case with a trailing full stop is refused', () => {
  assert.match(reseedRefusal(LIVE_DB_PATH.toUpperCase() + '.', 'win32'), /live database/);
});

test('reseedRefusal: refuses beta.db in any folder, any case, with a trailing full stop or space', () => {
  const message = "Reseed never runs on beta.db: Beta's data lives there.";
  for (const spelling of [
    'server/db/beta.db', path.join(scratchDir, 'beta.db'), 'server/db/BETA.DB', 'Beta.Db',
    'server/db/beta.db.', 'server/db/beta.db ', path.join(scratchDir, 'BETA.db. '),
  ]) {
    assert.strictEqual(reseedRefusal(spelling), message, JSON.stringify(spelling));
  }
});

test('reseedRefusal: refuses a ":" after the drive letter (a Windows file stream)', () => {
  assert.match(reseedRefusal('server/db/dev.db:stream'), /":" after the drive letter/);
  assert.match(reseedRefusal(LIVE_DB_PATH + ':$DATA'), /":" after the drive letter/);
});

test('reseedRefusal: refuses the live file by a non-normalized path', () => {
  const roundabout = path.join(path.dirname(LIVE_DB_PATH), '..', 'db', 'inventory.db');
  assert.match(reseedRefusal(roundabout), /live database/);
});

test('reseedRefusal: on Windows, a differently-cased live path is still refused', () => {
  assert.match(reseedRefusal(LIVE_DB_PATH.toUpperCase(), 'win32'), /live database/);
});

test('reseedRefusal: allows dev.db, beside the live file or anywhere else', () => {
  assert.strictEqual(reseedRefusal(scratchDb), null);
  assert.strictEqual(reseedRefusal('server/db/dev.db'), null);
  assert.strictEqual(reseedRefusal(path.join(path.dirname(LIVE_DB_PATH), 'dev.db')), null);
});

// --- the identity check (scratch files only) ---

test('openedFileRefusal: refuses a scratch file opened under another spelling of its own name', () => {
  const guarded = path.join(scratchDir, 'guarded.db');
  new DatabaseSync(guarded).close();
  // Windows: another case, and a trailing full stop SQLite drops on open.
  // Elsewhere: a hard link - a genuinely different path to the same file
  // (path.join would collapse a "sub/.." spelling back to the same string).
  let spellings;
  if (process.platform === 'win32') {
    spellings = [guarded.toUpperCase(), guarded + '.', guarded.toUpperCase() + ' '];
  } else {
    const alias = path.join(scratchDir, 'guarded-alias.db');
    fs.rmSync(alias, { force: true });
    fs.linkSync(guarded, alias);
    assert.notStrictEqual(alias, guarded);
    spellings = [alias];
  }
  for (const spelling of spellings) {
    const db = new DatabaseSync(spelling);
    try {
      assert.match(openedFileRefusal(db, 'reseed', [guarded]) || '', /^reseed refused: the database it opened/, JSON.stringify(spelling));
    } finally {
      db.close();
    }
  }
});

test('openedFileRefusal: allows a different file, and ignores a protected file that does not exist', () => {
  const other = path.join(scratchDir, 'other.db');
  const db = new DatabaseSync(other);
  try {
    assert.strictEqual(openedFileRefusal(db, 'reseed', [path.join(scratchDir, 'guarded.db')]), null);
    assert.strictEqual(openedFileRefusal(db, 'reseed', [path.join(scratchDir, 'never-created.db')]), null);
  } finally {
    db.close();
  }
});

test('openedFileRefusal: refuses when a protected file cannot be checked (not the same as missing)', () => {
  const other = path.join(scratchDir, 'other.db');
  const db = new DatabaseSync(other);
  try {
    // A NUL byte makes stat throw an error that is not ENOENT.
    assert.match(openedFileRefusal(db, 'reseed', ['bad\0path.db']) || '', /^reseed refused: could not check/);
  } finally {
    db.close();
  }
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
