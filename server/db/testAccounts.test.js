// Step test-accounts: the seed:test refusal and ensureTestAccounts.
//
// Never touches the live inventory.db: the refusal cases are tested as a pure
// function, and ensureTestAccounts runs against an in-memory DB built from
// schema.sql.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { LIVE_DB_PATH } = require('./dbPath.js');
const { TEST_ACCOUNTS, testAccountsRefusal, ensureTestAccounts } = require('./testAccounts.js');

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

console.log('Test Accounts Tests\n');

// --- refusal (pure - never touches a file) ---

test('testAccountsRefusal: refuses when DB_PATH is unset or empty', () => {
  assert.match(testAccountsRefusal(undefined), /DB_PATH is not set/);
  assert.match(testAccountsRefusal(''), /DB_PATH is not set/);
});

test('testAccountsRefusal: refuses the live inventory.db by any path shape', () => {
  assert.match(testAccountsRefusal(LIVE_DB_PATH), /live database/);
  assert.match(testAccountsRefusal(path.relative(process.cwd(), LIVE_DB_PATH)), /live database/);
  const roundabout = path.join(path.dirname(LIVE_DB_PATH), '..', 'db', 'inventory.db');
  assert.match(testAccountsRefusal(roundabout), /live database/);
});

test('testAccountsRefusal: on Windows, a differently-cased live path is still refused', () => {
  assert.match(testAccountsRefusal(LIVE_DB_PATH.toUpperCase(), 'win32'), /live database/);
});

test('testAccountsRefusal: refuses beta.db in any folder and any letter case', () => {
  assert.match(testAccountsRefusal('server/db/beta.db'), /beta\.db/i);
  assert.match(testAccountsRefusal('/some/other/dir/beta.db'), /beta\.db/i);
  assert.match(testAccountsRefusal('server/db/BETA.DB'), /beta\.db/i);
});

test('testAccountsRefusal: allows a disposable file such as preview.db or dev.db', () => {
  assert.strictEqual(testAccountsRefusal('server/db/preview.db'), null);
  assert.strictEqual(testAccountsRefusal('server/db/dev.db'), null);
});

// --- ensureTestAccounts (in-memory DB from schema.sql) ---

// Build a schema-only DB seeded with the roles, restaurants and commissary
// the real seed makes. `restaurants` lets the caller leave FC out, to drive
// the unknown-site-code path. Also seeds a super-admin and a real person, to
// prove ensureTestAccounts never touches a non-"Test " user.
function freshDb(restaurantCodes = ['RA', 'FC']) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  const roleId = {};
  for (const name of ['super-admin', 'admin', 'management', 'head-chef', 'checker', 'supervisor']) {
    roleId[name] = db.prepare('INSERT INTO roles (name) VALUES (?)').run(name).lastInsertRowid;
  }
  for (const code of restaurantCodes) {
    db.prepare('INSERT INTO restaurants (name, code) VALUES (?, ?)').run(`Restaurant ${code}`, code);
  }
  db.prepare("INSERT INTO commissaries (name, code) VALUES ('Commissary A', 'COM-A')").run();
  // Untouchables: a bootstrap super-admin and a real checker with no sites.
  db.prepare('INSERT INTO users (name, default_role_id, active) VALUES (?, ?, 1)').run('superadmin', roleId['super-admin']);
  db.prepare('INSERT INTO users (name, default_role_id, active) VALUES (?, ?, 1)').run('ana', roleId['checker']);
  return { db, roleId };
}

const userRow = (db, name) => db.prepare('SELECT id, default_role_id, active FROM users WHERE name = ?').get(name);
const siteCodes = (db, userId) =>
  db.prepare('SELECT site_code FROM user_sites WHERE user_id = ? ORDER BY site_code').all(userId).map(r => r.site_code);

test('creates every account with its role and sites', () => {
  const { db, roleId } = freshDb();
  const result = ensureTestAccounts(db);
  assert.strictEqual(result.users, TEST_ACCOUNTS.length, 'all accounts created');
  assert.strictEqual(result.skipped, 0, 'every site resolves');

  for (const account of TEST_ACCOUNTS) {
    const row = userRow(db, account.name);
    assert.ok(row, `${account.name} exists`);
    assert.strictEqual(row.default_role_id, roleId[account.role], `${account.name} role`);
    assert.strictEqual(row.active, 1, `${account.name} active`);
    assert.deepStrictEqual(siteCodes(db, row.id), [...account.sites].sort(), `${account.name} sites`);
  }
  // 8 memberships: RA, FC, RA, FC, COM-A, (RA+FC), RA (Test Supervisor RA).
  assert.strictEqual(result.memberships, 8);
});

test('a second run adds nothing (idempotent)', () => {
  const { db } = freshDb();
  ensureTestAccounts(db);
  const before = db.prepare('SELECT (SELECT COUNT(*) FROM users) AS u, (SELECT COUNT(*) FROM user_sites) AS m').get();
  const again = ensureTestAccounts(db);
  assert.deepStrictEqual(again, { users: 0, memberships: 0, skipped: 0 });
  const after = db.prepare('SELECT (SELECT COUNT(*) FROM users) AS u, (SELECT COUNT(*) FROM user_sites) AS m').get();
  assert.deepStrictEqual(after, before);
});

test('an unknown site code is skipped with a warning, the rest still created', () => {
  const { db } = freshDb(['RA']); // FC missing -> every FC reference is unknown
  const warnings = [];
  const realWarn = console.warn;
  console.warn = msg => warnings.push(String(msg));
  let result;
  try {
    result = ensureTestAccounts(db);
  } finally {
    console.warn = realWarn;
  }
  // FC is referenced by Head Chef FC, Counter FC and Floater -> 3 skips.
  assert.strictEqual(result.skipped, 3);
  assert.ok(warnings.some(w => /FC/.test(w) && /skipped/.test(w)), 'warned about FC');
  // The FC-only accounts exist but hold no membership; RA ones still land.
  assert.deepStrictEqual(siteCodes(db, userRow(db, 'Test Head Chef FC').id), []);
  assert.deepStrictEqual(siteCodes(db, userRow(db, 'Test Floater').id), ['RA']);
  assert.deepStrictEqual(siteCodes(db, userRow(db, 'Test Counter RA').id), ['RA']);
});

test('a user whose name does not start with "Test " is never changed', () => {
  const { db, roleId } = freshDb();
  const before = userRow(db, 'ana');
  ensureTestAccounts(db);
  const after = userRow(db, 'ana');
  assert.deepStrictEqual(after, before);
  assert.strictEqual(after.default_role_id, roleId['checker']);
  assert.deepStrictEqual(siteCodes(db, after.id), []);
});

test('the super-admin user is untouched', () => {
  const { db, roleId } = freshDb();
  const before = userRow(db, 'superadmin');
  ensureTestAccounts(db);
  const after = userRow(db, 'superadmin');
  assert.deepStrictEqual(after, before);
  assert.strictEqual(after.default_role_id, roleId['super-admin']);
});

test('a deactivated Test user is reactivated on the next run (upsert)', () => {
  const { db } = freshDb();
  ensureTestAccounts(db);
  const id = userRow(db, 'Test Admin').id;
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id);
  ensureTestAccounts(db);
  assert.strictEqual(userRow(db, 'Test Admin').active, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
