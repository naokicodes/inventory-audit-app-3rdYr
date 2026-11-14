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
const { parseCsv, loadTab, importSettings, formatReport, exportSettings } = require('../../scripts/import-settings.js');

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
    const report = importSettings(db, workbook({ Roles: ROLES_CSV }));
    assert.deepStrictEqual({ ...role(db, 'checker') }, { can_enter_counts: 1, can_finalize: 1, can_admin: 0, read_only: 0 });
    assert.deepStrictEqual({ ...role(db, 'bills-only') }, { can_enter_counts: 0, can_finalize: 0, can_admin: 0, read_only: 1 });
    assert.ok(role(db, 'management'), 'a role absent from the sheet is kept');
    assert.strictEqual(report.rolesInserted, 1);
    assert.strictEqual(report.rolesUpdated, 1);
  });

  test("never changes super-admin's flags; a bad flag skips only that row", () => {
    const db = freshDb();
    const report = importSettings(db, workbook({ Roles: [
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
    const report = importSettings(db, workbook({ Roles: ROLES_CSV, Users: USERS_CSV }));
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
    importSettings(db, workbook({ Roles: ROLES_CSV, Users: USERS_CSV }));
    assert.deepStrictEqual(superAdmins(db), ['Owner Person']);
    assert.strictEqual(user(db, 'superadmin'), undefined, 'bootstrap name is gone');
    assert.strictEqual(counts(db).users, before + 3, 'only the three non-super-admin users were added');
  });

  test('a second super-admin row, or demoting the super-admin by name, is refused', () => {
    const db = freshDb();
    const report = importSettings(db, workbook({ Users: [
      'name,default_role,active,site_memberships',
      'Owner Person,super-admin,1,',
      'Other Owner,super-admin,1,',
      'superadmin,checker,1,',        // nobody holds this name any more: plain insert
    ].join('\n') }));
    assert.deepStrictEqual(superAdmins(db), ['Owner Person']);
    assert.strictEqual(user(db, 'Other Owner'), undefined);
    assert.ok(report.problems.some(p => /a second super-admin row/.test(p)), report.problems.join('; '));
    assert.strictEqual(user(db, 'superadmin').role, 'checker');

    // Re-import naming the (renamed) super-admin with another role.
    const report2 = importSettings(db, workbook({ Users: 'name,default_role,active,site_memberships\nOwner Person,admin,1,\n' }));
    assert.deepStrictEqual(superAdmins(db), ['Owner Person'], 'still the super-admin');
    assert.ok(report2.problems.some(p => /is the super-admin/.test(p)), report2.problems.join('; '));
  });

  test('warns on an unresolved site code and an unknown role, without throwing', () => {
    const db = freshDb();
    db.prepare("INSERT INTO commissaries (name, code) VALUES ('Clash', 'FC')").run(); // FC in both tables
    const report = importSettings(db, workbook({ Users: [
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
    importSettings(db, dir);
    const after1 = counts(db);
    const report = importSettings(db, dir);
    assert.deepStrictEqual(counts(db), after1);
    for (const k of ['rolesInserted', 'rolesUpdated', 'usersInserted', 'usersUpdated', 'membershipsAdded', 'membershipsRemoved']) {
      assert.strictEqual(report[k], 0, `${k} on the second run`);
    }
    assert.deepStrictEqual(report.spellingUpdated, []);
  });

  // --- decisions 2026-11-12 (issue #66, ADR-047) ---

  test('a duplicated name changes nothing, in Roles.csv and in Users.csv', () => {
    const db = freshDb();
    importSettings(db, workbook({ Users: 'name,default_role,active,site_memberships\nKim,checker,1,RA\n' }));
    const kim = user(db, 'Kim');
    const before = counts(db);
    const report = importSettings(db, workbook({
      Roles: [
        'name,can_enter_counts,can_finalize,can_admin,read_only',
        'checker,1,1,1,0',
        'Checker ,0,0,0,1',            // same key as "checker"
        'twice,1,0,0,0',
        'TWICE,1,0,0,0',               // a new role named twice is not added
      ].join('\n'),
      Users: [
        'name,default_role,active,site_memberships',
        'Kim,admin,0,FC',
        'kim,head-chef,1,',            // same key as "Kim"
        'New Person,checker,1,RA',
        'new  person,checker,1,RA',    // spaces collapse: same key, not added
      ].join('\n'),
    }));
    assert.deepStrictEqual({ ...role(db, 'checker') }, { can_enter_counts: 1, can_finalize: 0, can_admin: 0, read_only: 0 });
    assert.strictEqual(role(db, 'twice'), undefined);
    const after = user(db, 'Kim');
    assert.deepStrictEqual({ ...after }, { ...kim }, 'Kim keeps role, active and name');
    assert.deepStrictEqual(sites(db, kim.id), ['RA'], 'Kim keeps the memberships');
    assert.deepStrictEqual(counts(db), before, 'nothing added or removed');
    assert.deepStrictEqual(report.duplicateNames, [
      'Roles: checker (rows 2, 3)', 'Roles: twice (rows 4, 5)',
      'Users: Kim (rows 2, 3)', 'Users: New Person (rows 4, 5)',
    ]);
    assert.match(formatReport(report), /duplicate names - all rows skipped, fix the sheet/);
  });

  test('"kim" in the sheet updates an existing "Kim": one user, the sheet\'s spelling', () => {
    const db = freshDb();
    importSettings(db, workbook({ Users: 'name,default_role,active,site_memberships\nKim,checker,1,RA\n' }));
    const id = user(db, 'Kim').id;
    const before = counts(db).users;
    const report = importSettings(db, workbook({
      Users: 'name,default_role,active,site_memberships\n  kim ,HEAD-CHEF,1,RA\n',
    }));
    assert.strictEqual(counts(db).users, before, 'no second user');
    assert.strictEqual(user(db, 'Kim'), undefined);
    assert.strictEqual(user(db, 'kim').id, id, 'same user_id, renamed');
    assert.strictEqual(user(db, 'kim').role, 'head-chef', 'default_role matched by the key');
    assert.deepStrictEqual(report.spellingUpdated, ['Kim -> kim']);
    assert.match(formatReport(report), /Spelling updated/);
    // And the next run with the same spelling changes nothing.
    const again = importSettings(db, workbook({ Users: 'name,default_role,active,site_memberships\nkim,head-chef,1,RA\n' }));
    assert.deepStrictEqual(again.spellingUpdated, []);
    assert.strictEqual(again.usersUpdated, 0);
  });

  test('a row matching two existing users by the key is skipped and reported', () => {
    const db = freshDb();
    const checker = db.prepare("SELECT id FROM roles WHERE name = 'checker'").get().id;
    db.prepare("INSERT INTO users (name, default_role_id) VALUES ('Lee', ?), ('LEE', ?)").run(checker, checker);
    const report = importSettings(db, workbook({ Users: 'name,default_role,active,site_memberships\nlee,admin,1,RA\n' }));
    assert.strictEqual(user(db, 'Lee').role, 'checker');
    assert.strictEqual(user(db, 'LEE').role, 'checker');
    assert.strictEqual(counts(db).sites, 0);
    assert.ok(report.problems.some(p => /matches 2 existing users/.test(p)), report.problems.join('; '));
  });

  test('a role name matching two existing roles by the key is skipped and reported (ADR-073)', () => {
    const db = freshDb();
    db.prepare("INSERT INTO roles (name, can_enter_counts, can_finalize, can_admin, read_only) VALUES ('Admin', 0, 0, 0, 1)").run();
    const flagsOf = n => db.prepare('SELECT can_enter_counts, can_finalize, can_admin, read_only FROM roles WHERE name = ?').get(n);
    const before = { admin: { ...flagsOf('admin') }, Admin: { ...flagsOf('Admin') } };
    const rolesBefore = db.prepare('SELECT COUNT(*) AS n FROM roles').get().n;
    const report = importSettings(db, workbook({
      Roles: 'name,can_enter_counts,can_finalize,can_admin,read_only\n ADMIN ,1,0,0,0\n',
      Users: 'name,default_role,active,site_memberships\nNoor,admin,1,RA\n',
    }));
    // Roles row: neither role changes, none added.
    assert.deepStrictEqual({ ...flagsOf('admin') }, before.admin);
    assert.deepStrictEqual({ ...flagsOf('Admin') }, before.Admin);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM roles').get().n, rolesBefore);
    assert.strictEqual(report.rolesInserted + report.rolesUpdated, 0);
    assert.ok(report.problems.some(p => /Roles row .*matches 2 existing roles/.test(p)), report.problems.join('; '));
    // Users row whose default_role matches both: the user is not added.
    assert.strictEqual(user(db, 'Noor'), undefined);
    assert.strictEqual(counts(db).sites, 0);
    assert.ok(report.problems.some(p => /role "admin" matches 2 roles/.test(p)), report.problems.join('; '));
  });

  test('the super-admin rename and its clash check use the key', () => {
    const db = freshDb();
    const checker = db.prepare("SELECT id FROM roles WHERE name = 'checker'").get().id;
    db.prepare("INSERT INTO users (name, default_role_id) VALUES ('Mia Tan', ?)").run(checker);
    const report = importSettings(db, workbook({ Users: 'name,default_role,active,site_memberships\nmia  tan,super-admin,1,\n' }));
    assert.deepStrictEqual(superAdmins(db), ['superadmin'], 'clash by key: not renamed');
    assert.ok(report.problems.some(p => /already belongs to another user/.test(p)), report.problems.join('; '));

    const report2 = importSettings(db, workbook({ Users: 'name,default_role,active,site_memberships\nSuperAdmin,Super-Admin,1,\n' }));
    assert.deepStrictEqual(superAdmins(db), ['SuperAdmin']);
    assert.deepStrictEqual(report2.spellingUpdated, ['superadmin -> SuperAdmin']);
  });

  test('site_memberships is the full list: a removed code deletes the membership', () => {
    const db = freshDb();
    importSettings(db, workbook({ Users: 'name,default_role,active,site_memberships\nAna,checker,1,"RA, FC, COM-A"\nBo,checker,1,RA\n' }));
    const report = importSettings(db, workbook({ Users: 'name,default_role,active,site_memberships\nAna,checker,1,RA\n' }));
    assert.deepStrictEqual(sites(db, user(db, 'Ana').id), ['RA']);
    assert.deepStrictEqual(sites(db, user(db, 'Bo').id), ['RA'], 'a user absent from the sheet is untouched');
    assert.strictEqual(report.membershipsRemoved, 2);
    assert.match(formatReport(report), /2 removed/);
  });

  test('an unresolved code blocks removals for that user', () => {
    const db = freshDb();
    importSettings(db, workbook({ Users: 'name,default_role,active,site_memberships\nAna,checker,1,"RA, FC"\n' }));
    const report = importSettings(db, workbook({ Users: 'name,default_role,active,site_memberships\nAna,checker,1,"COM-A, SILT"\n' }));
    assert.deepStrictEqual(sites(db, user(db, 'Ana').id), ['COM-A', 'FC', 'RA'], 'resolved code added, nothing removed');
    assert.strictEqual(report.membershipsRemoved, 0);
    assert.deepStrictEqual(report.removalsSkipped, ['Ana: SILT did not resolve - nothing removed (kept FC, RA)']);
    assert.match(formatReport(report), /removals skipped \(unresolved code\)/);
  });

  test('a blank site_memberships cell removes them all', () => {
    const db = freshDb();
    importSettings(db, workbook({ Users: 'name,default_role,active,site_memberships\nAna,checker,1,"RA, FC"\n' }));
    const report = importSettings(db, workbook({ Users: 'name,default_role,active,site_memberships\nAna,checker,1,\n' }));
    assert.deepStrictEqual(sites(db, user(db, 'Ana').id), []);
    assert.strictEqual(report.membershipsRemoved, 2);
  });

  test('report row numbers are spreadsheet rows, even after a blank line', () => {
    const db = freshDb();
    const report = importSettings(db, workbook({ Users: [
      'name,default_role,active,site_memberships', '', 'Ana,checker,yes,', 'Bo,checker,1,', ',,,', 'bo,checker,1,',
    ].join('\n') }));
    assert.ok(report.problems.some(p => p.startsWith('Users row 3 "Ana"')), report.problems.join('; '));
    assert.deepStrictEqual(report.duplicateNames, ['Users: Bo (rows 4, 6)']);
  });

  test('a database error while resolving a site code rolls the import back', () => {
    const db = freshDb();
    db.exec('DROP TABLE commissaries');
    assert.throws(() => importSettings(db, workbook({ Users: 'name,default_role,active,site_memberships\nAna,checker,1,RA\n' })), /no such table: commissaries/);
    assert.strictEqual(user(db, 'Ana'), undefined, 'the user insert was rolled back');
  });

  test('a skipped row changes no memberships', () => {
    const db = freshDb();
    importSettings(db, workbook({ Users: 'name,default_role,active,site_memberships\nAna,checker,1,"RA, FC"\n' }));
    importSettings(db, workbook({ Users: 'name,default_role,active,site_memberships\nAna,checker,maybe,\n' }));
    assert.deepStrictEqual(sites(db, user(db, 'Ana').id), ['FC', 'RA']);
  });

  test('lists the tabs it skipped (Stations, Staff) and reads only Roles / Users', () => {
    const db = freshDb();
    const report = importSettings(db, workbook({ Users: USERS_CSV, Stations: 'x\n1\n', Staff: 'y\n2\n' }));
    assert.deepStrictEqual(report.tabsRead, ['Users']);
    assert.deepStrictEqual(report.tabsSkipped, ['Staff', 'Stations']);
  });

  // --- export ---

  test('export -> import round-trips into an identical database, without Test accounts', () => {
    const db = freshDb();
    importSettings(db, workbook({ Roles: ROLES_CSV, Users: USERS_CSV }));
    db.prepare("INSERT INTO users (name, default_role_id) VALUES ('Test Counter RA', (SELECT id FROM roles WHERE name = 'checker'))").run();
    const out = path.join(tmpRoot, 'export1');
    const result = exportSettings(db, out);
    assert.strictEqual(result.users, 4, 'Test account left out');
    assert.ok(!fs.readFileSync(path.join(out, 'Users.csv'), 'utf8').includes('Test '));

    const again = importSettings(db, out);
    for (const k of ['rolesInserted', 'rolesUpdated', 'usersInserted', 'usersUpdated', 'membershipsAdded']) {
      assert.strictEqual(again[k], 0, `${k} re-importing the export`);
    }
    assert.strictEqual(again.problems.length, 1, 'only the fixed super-admin role row is reported');
    assert.strictEqual(loadTab(out, 'Users').find(r => r.name === 'Ana Cruz').site_memberships, 'COM-A, RA');
  });

  test('export refuses to overwrite an existing Roles.csv / Users.csv', () => {
    const db = freshDb();
    const dir = workbook({ Users: 'keep me\n' });
    assert.match(exportSettings(db, dir).refused, /already exist/);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'Users.csv'), 'utf8'), 'keep me\n');
  });

  // --- Sheets / SideItems (step side-items) ---

  const SHEETS_CSV = 'site,sheet,active\nRA,Bar Sides,1\nFC,Bar Sides,1\n';
  const ITEMS_CSV = [
    'site,sheet,item,main_unit,conversions,how_bought,cost',
    'RA,Bar Sides,Test Rice,kg,sack=25; Tray = 2,supplier,50',
    'RA,Bar Sides,Test Onion,kg,,buyer,',
    'FC,Bar Sides,Test Rice,kg,sack=25,supplier,50',
    'FC,Bar Sides,Test Load,peso,,,',
  ].join('\n') + '\n';
  const linksOn = (db, site) => db.prepare(`
    SELECT i.name FROM side_item_sheets l
      JOIN sheet_definitions d ON d.id = l.sheet_id JOIN side_items i ON i.id = l.side_item_id
     WHERE d.site_code = ? AND l.active = 1 ORDER BY l.sort_order`).all(site).map(r => r.name);
  const sideChanges = r => ['sheetsAdded', 'sheetsSwitched', 'itemsAdded', 'itemsUpdated', 'linksAdded', 'linksSwitchedOff']
    .filter(k => r[k] !== 0).map(k => `${k}=${r[k]}`);

  test('sides: an import adds sheets and items, and a second run changes nothing', () => {
    const db = freshDb();
    const dir = workbook({ Sheets: SHEETS_CSV, SideItems: ITEMS_CSV });
    const report = importSettings(db, dir);
    assert.deepStrictEqual(report.tabsRead, ['Sheets', 'SideItems']);
    assert.strictEqual(report.sheetsAdded, 2);
    assert.strictEqual(report.itemsAdded, 3, 'Test Rice is one item on two sheets');
    assert.strictEqual(report.linksAdded, 4);
    assert.deepStrictEqual(linksOn(db, 'RA'), ['Test Rice', 'Test Onion']);
    const rice = db.prepare("SELECT * FROM side_items WHERE name = 'Test Rice'").get();
    assert.strictEqual(rice.how_bought, 'SUPPLIER');
    assert.strictEqual(rice.cost_per_unit, 50);
    assert.deepStrictEqual(db.prepare('SELECT unit, per_main FROM side_item_units WHERE side_item_id = ? ORDER BY unit').all(rice.id)
      .map(u => `${u.unit}=${u.per_main}`), ['sack=25', 'tray=2']);
    assert.strictEqual(db.prepare("SELECT cost_per_unit FROM side_items WHERE name = 'Test Load'").get().cost_per_unit, 1);
    assert.strictEqual(db.prepare("SELECT engine_type FROM sheet_definitions WHERE category = 'Bar Sides' LIMIT 1").get().engine_type, 'SIDE');

    const logs = db.prepare('SELECT COUNT(*) AS n FROM activity_log').get().n;
    const again = importSettings(db, dir);
    assert.deepStrictEqual(sideChanges(again), []);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM activity_log').get().n, logs, 'no log rows on a no-op run');
  });

  test('sides: an item dropped from a sheet is switched off there only', () => {
    const db = freshDb();
    importSettings(db, workbook({ Sheets: SHEETS_CSV, SideItems: ITEMS_CSV }));
    const report = importSettings(db, workbook({ SideItems: [
      'site,sheet,item,main_unit,conversions,how_bought,cost',
      'RA,Bar Sides,Test Onion,kg,,buyer,',
    ].join('\n') }));
    assert.strictEqual(report.linksSwitchedOff, 1);
    assert.deepStrictEqual(linksOn(db, 'RA'), ['Test Onion']);
    assert.deepStrictEqual(linksOn(db, 'FC'), ['Test Rice', 'Test Load'], 'the other sheet is untouched');
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM side_item_sheets').get().n, 4, 'switched off, never deleted');
  });

  test('sides: a duplicated row is held, a unit clash is skipped, both reported', () => {
    const db = freshDb();
    importSettings(db, workbook({ Sheets: SHEETS_CSV, SideItems: ITEMS_CSV }));
    const report = importSettings(db, workbook({ SideItems: [
      'site,sheet,item,main_unit,conversions,how_bought,cost',
      'RA,Bar Sides,Test Rice,kg,,supplier,60',
      'RA,bar sides,test rice ,kg,,supplier,70',
      'RA,Bar Sides,Test Onion,pc,,buyer,',
      'RA,Bar Sides,Test Egg,pc,,,',
    ].join('\n') }));
    assert.strictEqual(report.sideDuplicates.length, 1);
    assert.match(report.sideDuplicates[0], /rows 2, 3/);
    assert.strictEqual(report.unitClashes.length, 1);
    assert.match(report.unitClashes[0], /Test Onion: main unit is kg/);
    assert.strictEqual(db.prepare("SELECT cost_per_unit FROM side_items WHERE name = 'Test Rice'").get().cost_per_unit, 50, 'held rows change nothing');
    assert.deepStrictEqual(linksOn(db, 'RA').sort(), ['Test Egg', 'Test Onion', 'Test Rice'], 'skipped rows keep their links');
    assert.match(formatReport(report), /different main unit/);
  });

  test('sides: a blank cost keeps the stored cost; "Onion" and "onion " are one item', () => {
    const db = freshDb();
    importSettings(db, workbook({ Sheets: SHEETS_CSV, SideItems: ITEMS_CSV }));
    db.prepare("UPDATE side_items SET cost_per_unit = 12 WHERE name = 'Test Onion'").run();
    const report = importSettings(db, workbook({ SideItems: [
      'site,sheet,item,main_unit,conversions,how_bought,cost',
      'RA,Bar Sides,test  onion ,KG,,buyer,',
      'RA,Bar Sides,Test Rice,kg,sack=25; tray=2,supplier,50',
    ].join('\n') }));
    assert.strictEqual(report.itemsAdded, 0);
    assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM side_items WHERE name LIKE '%onion%'").get().n, 1);
    assert.strictEqual(db.prepare("SELECT cost_per_unit FROM side_items WHERE name = 'Test Onion'").get().cost_per_unit, 12);
  });

  test('sides: unknown site, missing sheet and a MEAT sheet name are reported and skipped', () => {
    const db = freshDb();
    db.prepare("INSERT INTO sheet_definitions (site_code, category, engine_type) VALUES ('RA', 'Landing', 'MEAT')").run();
    const report = importSettings(db, workbook({
      Sheets: 'site,sheet,active\nZZ,Bar,1\nRA,landing,1\n',
      SideItems: 'site,sheet,item,main_unit,conversions,how_bought,cost\nRA,Nowhere,Test X,kg,,,\nRA,Landing,Test Y,kg,,,\nRA,Landing,Test Z,kg,,friend,\n',
    }));
    assert.strictEqual(report.sheetsAdded, 0);
    assert.strictEqual(report.itemsAdded, 0);
    assert.strictEqual(report.sideUnresolved.length, 5);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM side_items').get().n, 0);
  });

  test('sides: export then import changes nothing', () => {
    const db = freshDb();
    importSettings(db, workbook({ Sheets: SHEETS_CSV + 'RA,Old Sides,0\n', SideItems: ITEMS_CSV }));
    const out = path.join(tmpRoot, 'export-sides');
    const result = exportSettings(db, out);
    assert.strictEqual(result.sheets, 3);
    assert.strictEqual(result.sideItems, 4);
    assert.match(fs.readFileSync(path.join(out, 'SideItems.csv'), 'utf8'), /Test Rice,kg,sack=25; tray=2,supplier,50/);
    const logs = db.prepare('SELECT COUNT(*) AS n FROM activity_log').get().n;
    const again = importSettings(db, out);
    assert.deepStrictEqual(sideChanges(again), []);
    assert.deepStrictEqual([again.sideDuplicates, again.unitClashes, again.sideUnresolved], [[], [], []]);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM activity_log').get().n, logs);
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
    try {
      assert.deepStrictEqual(superAdmins(db), ['superadmin']);
      db.prepare("UPDATE users SET name = 'Owner Person' WHERE name = 'superadmin'").run();
    } finally {
      db.close();
    }

    const second = runSeed();
    assert.strictEqual(second.status, 0, second.stderr);
    assert.match(second.stdout, /Users: 0 inserted/);
    db = new DatabaseSync(scratchDb);
    try {
      assert.deepStrictEqual(superAdmins(db), ['Owner Person']);
    } finally {
      db.close();
    }
  });
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
