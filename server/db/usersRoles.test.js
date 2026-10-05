// Step users-roles: roles + users tables, the 5-role seed, and the bootstrap
// super-admin user.
//
// Every seed run is a subprocess pointed at a scratch file in the OS temp
// directory - never the live inventory.db.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

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

console.log('Users / Roles Tests\n');

const ROOT = path.join(__dirname, '..', '..');
const SEED = path.join(__dirname, 'seed.js');
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'users-roles-test-'));
const scratchDb = path.join(scratchDir, 'scratch.db');

function runSeed() {
  const env = { ...process.env, DB_PATH: scratchDb };
  return spawnSync(process.execPath, [SEED], { cwd: ROOT, env, encoding: 'utf8' });
}

function withDb(fn) {
  const db = new DatabaseSync(scratchDb);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    return fn(db);
  } finally {
    db.close();
  }
}

const EXPECTED_ROLES = [
  { name: 'super-admin', can_enter_counts: 1, can_finalize: 1, can_admin: 1, read_only: 0, active: 1 },
  { name: 'admin',       can_enter_counts: 1, can_finalize: 1, can_admin: 1, read_only: 0, active: 1 },
  { name: 'management',  can_enter_counts: 0, can_finalize: 0, can_admin: 0, read_only: 1, active: 1 },
  { name: 'head-chef',   can_enter_counts: 1, can_finalize: 1, can_admin: 0, read_only: 0, active: 1 },
  { name: 'checker',     can_enter_counts: 1, can_finalize: 0, can_admin: 0, read_only: 0, active: 1 },
];

function readRoles(db) {
  return db.prepare(
    'SELECT name, can_enter_counts, can_finalize, can_admin, read_only, active FROM roles ORDER BY id'
  ).all().map(r => ({ ...r }));
}

function readUsers(db) {
  return db.prepare(
    `SELECT u.name, u.active, u.created_at, r.name AS role
       FROM users u JOIN roles r ON r.id = u.default_role_id ORDER BY u.id`
  ).all();
}

try {
  const first = runSeed();

  test('seed runs cleanly on a fresh scratch DB', () => {
    assert.strictEqual(first.status, 0, first.stderr);
    assert.match(first.stdout, /Roles: 5 inserted \(of 5\)/);
    assert.match(first.stdout, /Users: 1 inserted/);
  });

  test('schema creates the roles and users tables', () => {
    withDb(db => {
      const names = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('roles', 'users') ORDER BY name"
      ).all().map(r => r.name);
      assert.deepStrictEqual(names, ['roles', 'users']);
    });
  });

  test('seeds exactly the five roles with the spec default flags', () => {
    withDb(db => assert.deepStrictEqual(readRoles(db), EXPECTED_ROLES));
  });

  test('seeds one active bootstrap "superadmin" user on the super-admin role', () => {
    withDb(db => {
      const users = readUsers(db);
      assert.strictEqual(users.length, 1);
      assert.strictEqual(users[0].name, 'superadmin');
      assert.strictEqual(users[0].role, 'super-admin');
      assert.strictEqual(users[0].active, 1);
      assert.ok(users[0].created_at, 'created_at defaulted');
    });
  });

  test('re-running the seed is idempotent: still 5 roles and 1 user', () => {
    const again = runSeed();
    assert.strictEqual(again.status, 0, again.stderr);
    assert.match(again.stdout, /Roles: 0 inserted \(of 5\)/);
    assert.match(again.stdout, /Users: 0 inserted/);
    withDb(db => {
      assert.deepStrictEqual(readRoles(db), EXPECTED_ROLES);
      assert.strictEqual(readUsers(db).length, 1);
    });
  });

  test('a re-run does not overwrite a role flag changed after seeding', () => {
    withDb(db => db.prepare("UPDATE roles SET can_finalize = 0 WHERE name = 'head-chef'").run());
    const again = runSeed();
    assert.strictEqual(again.status, 0, again.stderr);
    withDb(db => {
      const row = db.prepare("SELECT can_finalize FROM roles WHERE name = 'head-chef'").get();
      assert.strictEqual(row.can_finalize, 0);
      db.prepare("UPDATE roles SET can_finalize = 1 WHERE name = 'head-chef'").run();
    });
  });

  test('users.default_role_id is a foreign key to roles', () => {
    withDb(db => {
      const fks = db.prepare("PRAGMA foreign_key_list('users')").all();
      assert.ok(
        fks.some(fk => fk.from === 'default_role_id' && fk.table === 'roles' && fk.to === 'id'),
        'FK users.default_role_id -> roles.id declared'
      );
      assert.throws(
        () => db.prepare('INSERT INTO users (name, default_role_id) VALUES (?, ?)').run('fk-probe', 99999),
        /FOREIGN KEY constraint failed/
      );
    });
  });

  test('role and user names are UNIQUE', () => {
    withDb(db => {
      assert.throws(() => db.prepare("INSERT INTO roles (name) VALUES ('checker')").run(), /UNIQUE/);
      const roleId = db.prepare("SELECT id FROM roles WHERE name = 'checker'").get().id;
      assert.throws(
        () => db.prepare('INSERT INTO users (name, default_role_id) VALUES (?, ?)').run('superadmin', roleId),
        /UNIQUE/
      );
    });
  });
} finally {
  fs.rmSync(scratchDir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
