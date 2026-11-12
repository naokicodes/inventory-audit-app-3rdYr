// Step import-identity: the people-workbook importer (Roles / Users /
// memberships), its export, and the seed's one-super-admin guard.
//
// Never touches the live inventory.db: the importer runs against in-memory
// DBs built from schema.sql, CSVs and the seed run live in a temp folder.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const { parseCsv, loadTab, importIdentity, formatReport, exportIdentity } = require('../../scripts/import-settings.js');

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

console.log('Import Settings Tests\n');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'import-settings-test-'));
let dirCount = 0;
// A fresh folder holding the given tabs, { TabName: csvText }.
function workbook(tabs) {
  const dir = path.join(tmpRoot, `wb${++dirCount}`);
  fs.mkdirSync(dir);
  for (const [name, text] of Object.entries(tabs)) fs.writeFileSync(path.join(dir, `${name}.csv`), text);
  return dir;
}

// Schema-only DB with the seed's five roles (seed flags), restaurants RA and
// FC, commissary COM-A, and the bootstrap super-admin.
function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  const insertRole = db.prepare(
    'INSERT INTO roles (name, can_enter_counts, can_finalize, can_admin, read_only) VALUES (?, ?, ?, ?, ?)'
  );
  for (const r of [
    ['super-admin', 1, 1, 1, 0], ['admin', 1, 1, 1, 0], ['management', 0, 0, 0, 1],
    ['head-chef', 1, 1, 0, 0], ['checker', 1, 0, 0, 0],
  ]) insertRole.run(...r);
  db.prepare("INSERT INTO restaurants (name, code) VALUES ('Restaurant A', 'RA'), ('Restaurant F', 'FC')").run();
  db.prepare("INSERT INTO commissaries (name, code) VALUES ('Commissary A', 'COM-A')").run();
  db.prepare(
    "INSERT INTO users (name, default_role_id, active) VALUES ('superadmin', (SELECT id FROM roles WHERE name = 'super-admin'), 1)"
  ).run();
  return db;
}

const role = (db, name) =>
  db.prepare('SELECT can_enter_counts, can_finalize, can_admin, read_only FROM roles WHERE name = ?').get(name);
const user = (db, name) => db.prepare(
  'SELECT u.id, u.active, r.name AS role FROM users u JOIN roles r ON r.id = u.default_role_id WHERE u.name = ?'
).get(name);
const sites = (db, userId) =>
  db.prepare('SELECT site_code FROM user_sites WHERE user_id = ? ORDER BY site_code').all(userId).map(r => r.site_code);
const superAdmins = db => db.prepare(
  "SELECT u.name FROM users u JOIN roles r ON r.id = u.default_role_id WHERE r.name = 'super-admin'"
).all().map(r => r.name);
const counts = db => ({
  roles: db.prepare('SELECT COUNT(*) AS n FROM roles').get().n,
  users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
  sites: db.prepare('SELECT COUNT(*) AS n FROM user_sites').get().n,
});

const ROLES_CSV = [
  'name,can_enter_counts,can_finalize,can_admin,read_only',
  'checker,1,1,0,0',          // changes a seeded role's flags
  'bills-only,0,0,0,1',       // a role the seed does not have
].join('\r\n') + '\r\n';

const USERS_CSV = [
  '﻿name,default_role,active,site_memberships', // Excel BOM
  'Owner Person,super-admin,1,',
  'Ana Cruz,checker,1,"RA, COM-A"',
  'Ben Reyes,head-chef,0,FC',
  'Cara Lim,bills-only,1,',
].join('\r\n') + '\r\n';

try {
  // --- the reader ---

  test('parseCsv: quoted commas, "" escapes, CRLF, BOM and blank lines', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\nlast,\n');
    assert.deepStrictEqual(rows, [['a', 'b'], ['x, y', 'say "hi"'], ['last', '']]);
  });

  test('loadTab: rows keyed by trimmed lower-case headers; a missing tab is null', () => {
    const dir = workbook({ Users: ' Name ,Default_Role\r\n  Ana , checker \r\n' });
    assert.deepStrictEqual(loadTab(dir, 'Users'), [{ name: 'Ana', default_role: 'checker' }]);
    assert.strictEqual(loadTab(dir, 'Roles'), null);
  });

  // --- roles ---

  test('upserts role flags: updates a seeded role, inserts a new one, deletes none', () => {
    const db = freshDb();
    const report = importIdentity(db, workbook({ Roles: ROLES_CSV }));
    assert.deepStrictEqual({ ...role(db, 'checker') }, { can_enter_counts: 1, can_finalize: 1, can_admin: 0, read_only: 0 });
    assert.deepStrictEqual({ ...role(db, 'bills-only') }, { can_enter_counts: 0, can_finalize: 0, can_admin: 0, read_only: 1 });
    assert.ok(role(db, 'management'), 'a role absent from the sheet is kept');
    assert.strictEqual(report.rolesInserted, 1);
    assert.strictEqual(report.rolesUpdated, 1);
  });

  test("never changes super-admin's flags; a bad flag skips only that row", () => {
    const db = freshDb();
    const report = importIdentity(db, workbook({ Roles: [
      'name,can_enter_counts,can_finalize,can_admin,read_only',
      'super-admin,0,0,0,1',
      'admin,1,1,yes,0',
    ].join('\n') }));
    assert.deepStrictEqual({ ...role(db, 'super-admin') }, { can_enter_counts: 1, can_finalize: 1, can_admin: 1, read_only: 0 });
    assert.strictEqual(role(db, 'admin').can_admin, 1, 'admin unchanged');
    assert.strictEqual(report.problems.length, 2, report.problems.join('; '));
  });

  // --- users + memberships ---

  test("resolves each user's default_role and active; adds resolving memberships", () => {
    const db = freshDb();
    const report = importIdentity(db, workbook({ Roles: ROLES_CSV, Users: USERS_CSV }));
    const ana = user(db, 'Ana Cruz');
    assert.strictEqual(ana.role, 'checker');
    assert.strictEqual(ana.active, 1);
    assert.deepStrictEqual(sites(db, ana.id), ['COM-A', 'RA']);
    const ben = user(db, 'Ben Reyes');
    assert.strictEqual(ben.role, 'head-chef');
    assert.strictEqual(ben.active, 0);
    assert.deepStrictEqual(sites(db, ben.id), ['FC']);
    assert.strictEqual(user(db, 'Cara Lim').role, 'bills-only', 'a role added by the same workbook resolves');
    assert.strictEqual(report.usersInserted, 3);
    assert.strictEqual(report.membershipsAdded, 3);
  });

  test('the super-admin row renames the ONE bootstrap super-admin, never adds a second', () => {
    const db = freshDb();
    const before = counts(db).users;
    importIdentity(db, workbook({ Roles: ROLES_CSV, Users: USERS_CSV }));
    assert.deepStrictEqual(superAdmins(db), ['Owner Person']);
    assert.strictEqual(user(db, 'superadmin'), undefined, 'bootstrap name is gone');
    assert.strictEqual(counts(db).users, before + 3, 'only the three non-super-admin users were added');
  });

  test('a second super-admin row, or demoting the super-admin by name, is refused', () => {
    const db = freshDb();
    const report = importIdentity(db, workbook({ Users: [
      'name,default_role,active,site_memberships',
      'Owner Person,super-admin,1,',
      'Other Owner,super-admin,1,',
      'Owner Person,checker,1,',      // duplicate name too
      'superadmin,checker,1,',        // nobody holds this name any more: plain insert
    ].join('\n') }));
    assert.deepStrictEqual(superAdmins(db), ['Owner Person']);
    assert.strictEqual(user(db, 'Other Owner'), undefined);
    assert.ok(report.duplicateNames.includes('Users: Owner Person'));

    // Re-import naming the (renamed) super-admin with another role.
    const report2 = importIdentity(db, workbook({ Users: 'name,default_role,active,site_memberships\nOwner Person,admin,1,\n' }));
    assert.deepStrictEqual(superAdmins(db), ['Owner Person'], 'still the super-admin');
    assert.ok(report2.problems.some(p => /is the super-admin/.test(p)), report2.problems.join('; '));
  });

  test('warns on an unresolved site code and an unknown role, without throwing', () => {
    const db = freshDb();
    db.prepare("INSERT INTO commissaries (name, code) VALUES ('Clash', 'FC')").run(); // FC in both tables
    const report = importIdentity(db, workbook({ Users: [
      'name,default_role,active,site_memberships',
      'Dan Uy,checker,1,"RA, SILT, FC"',
      'Eve Go,cashier,1,RA',
    ].join('\n') }));
    assert.deepStrictEqual(sites(db, user(db, 'Dan Uy').id), ['RA'], 'only the resolving code was added');
    assert.deepStrictEqual(report.unresolvedSites, ['Dan Uy: SILT', 'Dan Uy: FC']);
    assert.deepStrictEqual(report.unknownRoles, ['Eve Go: cashier']);
    assert.strictEqual(user(db, 'Eve Go'), undefined);
    const text = formatReport(report);
    assert.match(text, /unresolved site codes/);
    assert.match(text, /Dan Uy: SILT/);
    assert.match(text, /unknown role names/);
  });

  test('a second run is a no-op (idempotent)', () => {
    const db = freshDb();
    const dir = workbook({ Roles: ROLES_CSV, Users: USERS_CSV });
    importIdentity(db, dir);
    const after1 = counts(db);
    const report = importIdentity(db, dir);
    assert.deepStrictEqual(counts(db), after1);
    for (const k of ['rolesInserted', 'rolesUpdated', 'usersInserted', 'usersUpdated', 'membershipsAdded']) {
      assert.strictEqual(report[k], 0, `${k} on the second run`);
    }
  });

  test('lists the tabs it skipped (Stations, Staff) and reads only Roles / Users', () => {
    const db = freshDb();
    const report = importIdentity(db, workbook({ Users: USERS_CSV, Stations: 'x\n1\n', Staff: 'y\n2\n' }));
    assert.deepStrictEqual(report.tabsRead, ['Users']);
    assert.deepStrictEqual(report.tabsSkipped, ['Staff', 'Stations']);
  });

  // --- export ---

  test('export -> import round-trips into an identical database, without Test accounts', () => {
    const db = freshDb();
    importIdentity(db, workbook({ Roles: ROLES_CSV, Users: USERS_CSV }));
    db.prepare("INSERT INTO users (name, default_role_id) VALUES ('Test Counter RA', (SELECT id FROM roles WHERE name = 'checker'))").run();
    const out = path.join(tmpRoot, 'export1');
    const result = exportIdentity(db, out);
    assert.strictEqual(result.users, 4, 'Test account left out');
    assert.ok(!fs.readFileSync(path.join(out, 'Users.csv'), 'utf8').includes('Test '));

    const again = importIdentity(db, out);
    for (const k of ['rolesInserted', 'rolesUpdated', 'usersInserted', 'usersUpdated', 'membershipsAdded']) {
      assert.strictEqual(again[k], 0, `${k} re-importing the export`);
    }
    assert.strictEqual(again.problems.length, 1, 'only the fixed super-admin role row is reported');
    assert.strictEqual(loadTab(out, 'Users').find(r => r.name === 'Ana Cruz').site_memberships, 'COM-A, RA');
  });

  test('export refuses to overwrite an existing Roles.csv / Users.csv', () => {
    const db = freshDb();
    const dir = workbook({ Users: 'keep me\n' });
    assert.match(exportIdentity(db, dir).refused, /already exist/);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'Users.csv'), 'utf8'), 'keep me\n');
  });

  // --- seed guard (real seed.js on a scratch file) ---

  test('seed: after the bootstrap user is renamed, a re-run still leaves exactly one super-admin', () => {
    const scratchDb = path.join(tmpRoot, 'seed.db');
    const runSeed = () => spawnSync(process.execPath, [path.join(__dirname, 'seed.js')], {
      cwd: path.join(__dirname, '..', '..'), env: { ...process.env, DB_PATH: scratchDb }, encoding: 'utf8',
    });
    const first = runSeed();
    assert.strictEqual(first.status, 0, first.stderr);
    let db = new DatabaseSync(scratchDb);
    assert.deepStrictEqual(superAdmins(db), ['superadmin']);
    db.prepare("UPDATE users SET name = 'Owner Person' WHERE name = 'superadmin'").run();
    db.close();

    const second = runSeed();
    assert.strictEqual(second.status, 0, second.stderr);
    assert.match(second.stdout, /Users: 0 inserted/);
    db = new DatabaseSync(scratchDb);
    assert.deepStrictEqual(superAdmins(db), ['Owner Person']);
    db.close();
  });
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
