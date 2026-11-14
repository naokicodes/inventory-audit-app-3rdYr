// Tests for step role-assignments (server/db/permissions.js): live roles per
// site, switches, can(), assignments, the supervisor role and the once-per-
// database defaults. Runs against a throwaway database file in the OS temp
// dir (DB_PATH, set before the connection opens) - never the live
// inventory.db. Seed runs are subprocesses on their own scratch file, like
// usersRoles.test.js.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = path.join(os.tmpdir(), `permissions-test-${process.pid}.db`);
process.env.DB_PATH = DB_FILE;
const db = require('./connection.js');
const {
  CAPABILITIES, liveRoles, can, capabilitiesBySite, assignRole, removeAssignment,
  setRoleCapability, ensureRoleDefaults,
} = require('./permissions.js');
const { canUseSite } = require('./siteAccess.js');
const { isBlind, canOrderRecount } = require('../engines/blindCount.js');
const { businessDate } = require('../businessDay.js');
const auth = require('../routes/auth.js');

let passed = 0, failed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

console.log('Permissions Tests (step role-assignments)\n');

const DAY_MS = 24 * 60 * 60 * 1000;
const TODAY = businessDate(new Date());
const shift = days => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const YESTERDAY = shift(-1);
const TOMORROW = shift(1);

// Sites: RA, FC (restaurants), COM-A (commissary).
db.prepare(`INSERT INTO restaurants (name, code) VALUES ('Restaurant A', 'RA'), ('FC', 'FC')`).run();
db.prepare(`INSERT INTO commissaries (name, code) VALUES ('Commissary A', 'COM-A')`).run();

// The five seeded roles, as seed.js writes them, then the defaults.
const ROLE_FLAGS = {
  'super-admin': [1, 1, 1, 0],
  admin: [1, 1, 1, 0],
  management: [0, 0, 0, 1],
  'head-chef': [1, 1, 0, 0],
  checker: [1, 0, 0, 0],
};
const role = {};
for (const [name, flags] of Object.entries(ROLE_FLAGS)) {
  role[name] = Number(db.prepare(
    'INSERT INTO roles (name, can_enter_counts, can_finalize, can_admin, read_only) VALUES (?, ?, ?, ?, ?)'
  ).run(name, ...flags).lastInsertRowid);
}
ensureRoleDefaults(db);
role.supervisor = db.prepare(`SELECT id FROM roles WHERE name = 'supervisor'`).get().id;

// A user as req.user carries it (auth.js loadUser): id, name and base flags.
function makeUser(name, roleName, sites = [], active = 1) {
  const id = Number(db.prepare('INSERT INTO users (name, default_role_id, active) VALUES (?, ?, ?)')
    .run(name, role[roleName], active).lastInsertRowid);
  for (const code of sites) db.prepare('INSERT INTO user_sites (user_id, site_code) VALUES (?, ?)').run(id, code);
  const [e, f, a, r] = ROLE_FLAGS[roleName] || [0, 0, 0, 0];
  return { id, name, role: roleName, can_enter_counts: e, can_finalize: f, can_admin: a, read_only: r };
}
const superAdmin = makeUser('Root', 'super-admin');
const admin = makeUser('Ada', 'admin');
const mona = makeUser('Mona', 'management');
const hugo = makeUser('Hugo', 'head-chef', ['RA']);
const cara = makeUser('Cara', 'checker', ['RA', 'FC']);
const dee = makeUser('Dee', 'checker', ['RA', 'FC']);
const eli = makeUser('Eli', 'checker', ['RA']);
const finn = makeUser('Finn', 'checker', ['RA']);
const gus = makeUser('Gus', 'checker', []);
const sam = makeUser('Sam', 'supervisor', ['RA']);

const assignments = userId => db.prepare(
  'SELECT role_id, site_code, until_date, created_by_user_id FROM user_roles WHERE user_id = ? ORDER BY id'
).all(userId).map(r => ({ ...r }));
const logCount = () => db.prepare(`SELECT COUNT(*) AS n FROM activity_log WHERE entity_type IN ('user_roles', 'role_capabilities')`).get().n;
const rawAssign = (userId, roleId, siteCode, untilDate) => db.prepare(
  'INSERT INTO user_roles (user_id, role_id, site_code, until_date, created_by_user_id) VALUES (?, ?, ?, ?, ?)'
).run(userId, roleId, siteCode, untilDate, admin.id);

test('base role only: the five existing roles behave exactly as before (flags, blind, recount)', () => {
  const byRole = { 'super-admin': superAdmin, admin, management: mona, 'head-chef': hugo, checker: eli };
  for (const [name, user] of Object.entries(byRole)) {
    const [e, f, a, r] = ROLE_FLAGS[name];
    assert.strictEqual(can(db, user, 'enter_counts', 'RA'), e === 1 || a === 1, `${name} enter_counts`);
    assert.strictEqual(can(db, user, 'finalize', 'RA'), f === 1 || a === 1, `${name} finalize`);
    assert.strictEqual(can(db, user, 'admin', 'RA'), a === 1, `${name} admin`);
    assert.strictEqual(can(db, user, 'read_only', 'RA'), r === 1 || a === 1, `${name} read_only`);
  }
  assert.strictEqual(isBlind(eli, 'RA'), true, 'checker blind');
  for (const u of [superAdmin, admin, mona, hugo]) assert.strictEqual(isBlind(u, 'RA'), false, `${u.role} sees`);
  assert.strictEqual(isBlind(null, 'RA'), true, 'no user blind');
  for (const u of [superAdmin, admin, hugo]) assert.strictEqual(canOrderRecount(u, 'RA'), true, `${u.role} orders`);
  for (const u of [mona, eli, null]) assert.strictEqual(canOrderRecount(u, 'RA'), false, 'never orders');
});

test('the supervisor role: never counts, sees expected, rosters all, picks tonight, manages staff - and never orders a recount', () => {
  assert.strictEqual(can(db, sam, 'enter_counts', 'RA'), false);
  assert.strictEqual(can(db, sam, 'finalize', 'RA'), false);
  for (const cap of ['sees_expected', 'roster_all', 'pick_tonight', 'manage_staff']) assert.strictEqual(can(db, sam, cap, 'RA'), true, cap);
  assert.strictEqual(can(db, sam, 'roster_kitchen', 'RA'), false);
  assert.strictEqual(isBlind(sam, 'RA'), false);
  assert.strictEqual(canOrderRecount(sam, 'RA'), false);
});

test('head-chef assigned at FC sees expected (and orders) at FC and is blind at RA', () => {
  const result = assignRole(db, { userId: cara.id, roleId: role['head-chef'], siteCode: 'FC', untilDate: null }, admin);
  assert.strictEqual(result.ok, true, JSON.stringify(result));
  assert.strictEqual(isBlind(cara, 'FC'), false);
  assert.strictEqual(canOrderRecount(cara, 'FC'), true);
  assert.strictEqual(isBlind(cara, 'RA'), true);
  assert.strictEqual(canOrderRecount(cara, 'RA'), false);
  assert.deepStrictEqual(assignments(cara.id), [{ role_id: role['head-chef'], site_code: 'FC', until_date: null, created_by_user_id: admin.id }]);
});

test('a NULL-site assignment applies at every site the person can use, and no further', () => {
  assert.strictEqual(assignRole(db, { userId: dee.id, roleId: role.supervisor, siteCode: null }, admin).ok, true);
  assert.strictEqual(can(db, dee, 'sees_expected', 'RA'), true);
  assert.strictEqual(can(db, dee, 'sees_expected', 'FC'), true);
  assert.strictEqual(can(db, dee, 'sees_expected', null), true, 'everywhere question');
  assert.strictEqual(can(db, dee, 'sees_expected', 'COM-A'), false, 'not a site Dee can use');
  assert.strictEqual(canUseSite(db, dee, 'COM-A'), false);
});

test('until_date: yesterday grants nothing, today grants (inclusive business date)', () => {
  rawAssign(eli.id, role['head-chef'], 'RA', YESTERDAY);
  assert.strictEqual(isBlind(eli, 'RA'), true, 'ended yesterday');
  assert.strictEqual(can(db, eli, 'sees_expected', 'RA', YESTERDAY), true, 'still live on its last day');
  db.prepare('UPDATE user_roles SET until_date = ? WHERE user_id = ?').run(TODAY, eli.id);
  assert.strictEqual(isBlind(eli, 'RA'), false, 'ends today: still live');
  assert.strictEqual(can(db, eli, 'sees_expected', 'RA', TOMORROW), false, 'gone the next business day');
  assert.strictEqual(liveRoles(db, eli, 'RA', TOMORROW).length, 1, 'only the base role');
});

test('admin implies every capability', () => {
  for (const cap of CAPABILITIES) {
    assert.strictEqual(can(db, admin, cap, 'RA'), true, cap);
    assert.strictEqual(can(db, superAdmin, cap, 'FC'), true, cap);
  }
});

test('an inactive role grants nothing; its assignment stays listed. An inactive user grants nothing', () => {
  const tempRole = Number(db.prepare(`INSERT INTO roles (name, can_enter_counts, can_finalize) VALUES ('relief-chef', 1, 1)`).run().lastInsertRowid);
  db.prepare(`INSERT INTO role_capabilities (role_id, capability) VALUES (?, 'sees_expected')`).run(tempRole);
  assert.strictEqual(assignRole(db, { userId: finn.id, roleId: tempRole, siteCode: 'FC' }, admin).ok, true);
  assert.strictEqual(can(db, finn, 'sees_expected', 'FC'), true);
  assert.strictEqual(canUseSite(db, finn, 'FC'), true);
  db.prepare('UPDATE roles SET active = 0 WHERE id = ?').run(tempRole);
  assert.strictEqual(can(db, finn, 'sees_expected', 'FC'), false);
  assert.strictEqual(canUseSite(db, finn, 'FC'), false, 'an inactive role opens no site');
  assert.strictEqual(assignments(finn.id).length, 1, 'assignment stays listed');
  // Inactive base role: grants nothing either (stub-login Q3).
  db.prepare('UPDATE roles SET active = 0 WHERE id = ?').run(role['head-chef']);
  assert.strictEqual(can(db, hugo, 'finalize', 'RA'), false);
  db.prepare('UPDATE roles SET active = 1 WHERE id = ?').run(role['head-chef']);
  // Inactive user.
  const gone = makeUser('Gone', 'head-chef', ['RA'], 0);
  assert.strictEqual(can(db, gone, 'sees_expected', 'RA'), false);
  assert.deepStrictEqual(liveRoles(db, gone, 'RA'), []);
});

test('an unknown capability throws', () => {
  assert.throws(() => can(db, admin, 'fly', 'RA'), /unknown capability "fly"/);
  assert.throws(() => can(db, null, 'fly', 'RA'), /unknown capability/);
  assert.throws(() => setRoleCapability(db, { roleId: role.checker, capability: 'fly', on: true }, admin), /unknown capability/);
});

test('assigning the same role twice says "already assigned" and changes nothing (site and NULL site)', () => {
  const logs = logCount();
  const site = assignRole(db, { userId: cara.id, roleId: role['head-chef'], siteCode: 'FC' }, admin);
  assert.deepStrictEqual(site, { status: 409, error: 'Already assigned.' });
  const everywhere = assignRole(db, { userId: dee.id, roleId: role.supervisor, siteCode: null }, admin);
  assert.deepStrictEqual(everywhere, { status: 409, error: 'Already assigned.' });
  assert.strictEqual(assignments(cara.id).length, 1);
  assert.strictEqual(assignments(dee.id).length, 1);
  assert.strictEqual(logCount(), logs);
});

test('checker, head-chef, management and no user get 403 on every write', () => {
  const before = db.prepare('SELECT COUNT(*) AS n FROM user_roles').get().n;
  for (const actor of [eli, hugo, mona, null]) {
    assert.strictEqual(assignRole(db, { userId: gus.id, roleId: role['head-chef'], siteCode: 'RA' }, actor).status, 403);
    assert.strictEqual(removeAssignment(db, { userId: cara.id, roleId: role['head-chef'], siteCode: 'FC' }, actor).status, 403);
    assert.strictEqual(setRoleCapability(db, { roleId: role.checker, capability: 'sees_expected', on: true }, actor).status, 403);
  }
  // A head chef appointed at one site is still not an admin.
  assert.strictEqual(assignRole(db, { userId: gus.id, roleId: role.checker, siteCode: 'FC' }, cara).status, 403);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM user_roles').get().n, before);
});

test('the super-admin role is never assigned, removed or edited', () => {
  assert.strictEqual(assignRole(db, { userId: gus.id, roleId: role['super-admin'], siteCode: null }, superAdmin).status, 400);
  assert.strictEqual(removeAssignment(db, { userId: gus.id, roleId: role['super-admin'], siteCode: null }, superAdmin).status, 400);
  assert.strictEqual(setRoleCapability(db, { roleId: role['super-admin'], capability: 'sees_expected', on: false }, superAdmin).status, 400);
  assert.deepStrictEqual(assignments(gus.id), []);
});

test('assignRole validation: active role, resolving site, real end date not in the past, known person', () => {
  const tries = [
    [{ userId: gus.id, roleId: 9999, siteCode: 'RA' }, 'Unknown role.'],
    [{ userId: gus.id, roleId: role['head-chef'], siteCode: 'NOPE' }, 'Unknown site.'],
    [{ userId: gus.id, roleId: role['head-chef'], siteCode: 'RA', untilDate: '2026-02-30' }, 'The end date must be YYYY-MM-DD.'],
    [{ userId: gus.id, roleId: role['head-chef'], siteCode: 'RA', untilDate: YESTERDAY }, 'The end date is in the past.'],
    [{ userId: 9999, roleId: role['head-chef'], siteCode: 'RA' }, 'Unknown person.'],
  ];
  for (const [input, error] of tries) assert.deepStrictEqual(assignRole(db, input, admin), { status: 400, error });
  const relief = db.prepare(`SELECT id FROM roles WHERE name = 'relief-chef'`).get().id;
  assert.deepStrictEqual(assignRole(db, { userId: gus.id, roleId: relief, siteCode: 'RA' }, admin), { status: 400, error: 'That role is inactive.' });
  assert.deepStrictEqual(assignments(gus.id), []);
  // A commissary code resolves, and today is a valid end date.
  assert.strictEqual(assignRole(db, { userId: gus.id, roleId: role['head-chef'], siteCode: 'COM-A', untilDate: TODAY }, admin).ok, true);
});

test('canUseSite is true at an assignment\'s site while it is live', () => {
  // Gus has no memberships; the COM-A assignment (until today) opens COM-A only.
  assert.strictEqual(canUseSite(db, gus, 'COM-A'), true);
  assert.strictEqual(canUseSite(db, gus, 'COM-A', TOMORROW), false);
  assert.strictEqual(canUseSite(db, gus, 'RA'), false);
  assert.strictEqual(isBlind(gus, 'COM-A'), false);
});

test('an assignment and its activity_log row are written together; removal logs too', () => {
  const logs = logCount();
  const result = assignRole(db, { userId: eli.id, roleId: role.supervisor, siteCode: 'RA', untilDate: TOMORROW }, admin);
  assert.strictEqual(result.ok, true);
  const created = db.prepare(`SELECT actor, entity_id, action, source, after FROM activity_log WHERE entity_type = 'user_roles' ORDER BY id DESC LIMIT 1`).get();
  assert.strictEqual(created.actor, 'Ada');
  assert.strictEqual(created.entity_id, result.id);
  assert.strictEqual(created.action, 'CREATE');
  assert.strictEqual(created.source, 'MANUAL');
  assert.strictEqual(JSON.parse(created.after).until_date, TOMORROW);

  assert.deepStrictEqual(removeAssignment(db, { userId: eli.id, roleId: role.supervisor, siteCode: 'RA' }, admin), { ok: true });
  assert.strictEqual(db.prepare('SELECT 1 FROM user_roles WHERE id = ?').get(result.id), undefined);
  const removed = db.prepare(`SELECT action, before FROM activity_log WHERE entity_type = 'user_roles' ORDER BY id DESC LIMIT 1`).get();
  assert.strictEqual(removed.action, 'DELETE');
  assert.strictEqual(JSON.parse(removed.before).id, result.id);
  assert.strictEqual(logCount(), logs + 2);
  assert.deepStrictEqual(removeAssignment(db, { userId: eli.id, roleId: role.supervisor, siteCode: 'RA' }, admin), { status: 404, error: 'No such assignment.' });

  // A failed log write rolls the assignment back (one transaction).
  db.exec(`CREATE TRIGGER fail_log BEFORE INSERT ON activity_log BEGIN SELECT RAISE(ABORT, 'log down'); END`);
  try {
    assert.throws(() => assignRole(db, { userId: eli.id, roleId: role.supervisor, siteCode: 'FC' }, admin), /log down/);
  } finally {
    db.exec('DROP TRIGGER fail_log');
  }
  assert.strictEqual(db.prepare(`SELECT 1 FROM user_roles WHERE user_id = ? AND site_code = 'FC'`).get(eli.id), undefined);
});

test('setRoleCapability turns a switch on and off with a log row; a legacy flag is not a switch', () => {
  const logs = logCount();
  assert.strictEqual(can(db, finn, 'pick_tonight', 'RA'), false);
  assert.deepStrictEqual(setRoleCapability(db, { roleId: role.checker, capability: 'pick_tonight', on: true }, admin), { ok: true, changed: true });
  assert.strictEqual(can(db, finn, 'pick_tonight', 'RA'), true);
  assert.deepStrictEqual(setRoleCapability(db, { roleId: role.checker, capability: 'pick_tonight', on: true }, admin), { ok: true, changed: false });
  assert.deepStrictEqual(setRoleCapability(db, { roleId: role.checker, capability: 'pick_tonight', on: false }, admin), { ok: true, changed: true });
  assert.strictEqual(can(db, finn, 'pick_tonight', 'RA'), false);
  assert.strictEqual(logCount(), logs + 2);
  assert.strictEqual(setRoleCapability(db, { roleId: role.checker, capability: 'finalize', on: true }, admin).status, 400);
});

test('GET /api/auth/me returns capabilities_by_site for the sites the user can use', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', auth.currentUser);
  app.use('/api', auth);
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const me = async id => (await fetch(`${base}/api/auth/me`, { headers: id ? { Cookie: `user_id=${id}` } : {} })).json();
    const cara_ = await me(cara.id);
    assert.strictEqual(cara_.user.id, cara.id);
    assert.deepStrictEqual(Object.keys(cara_.capabilities_by_site).sort(), ['FC', 'RA']);
    assert.deepStrictEqual(cara_.capabilities_by_site.RA, ['enter_counts']);
    assert.ok(cara_.capabilities_by_site.FC.includes('sees_expected'), 'head-chef at FC');
    assert.ok(cara_.capabilities_by_site.FC.includes('finalize'));
    const ada_ = await me(admin.id);
    assert.deepStrictEqual(Object.keys(ada_.capabilities_by_site).sort(), ['COM-A', 'FC', 'RA']);
    assert.deepStrictEqual(ada_.capabilities_by_site.RA, CAPABILITIES);
    assert.deepStrictEqual(await me(null), { user: null, capabilities_by_site: {} });
    assert.deepStrictEqual(capabilitiesBySite(db, null), {});
  } finally {
    server.close();
  }
});

// --- ensureRoleDefaults on a database from before this step (beta.db) ---

function preStepDb() {
  const mem = new DatabaseSync(':memory:');
  mem.exec('PRAGMA foreign_keys = ON');
  mem.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  for (const [name, flags] of Object.entries(ROLE_FLAGS)) {
    mem.prepare('INSERT INTO roles (name, can_enter_counts, can_finalize, can_admin, read_only) VALUES (?, ?, ?, ?, ?)').run(name, ...flags);
  }
  return mem;
}
const switchRows = d => d.prepare(
  'SELECT r.name, c.capability FROM role_capabilities c JOIN roles r ON r.id = c.role_id ORDER BY r.name, c.capability'
).all().map(r => `${r.name}:${r.capability}`);
const EXPECTED_SWITCHES = [
  'head-chef:pick_tonight', 'head-chef:roster_kitchen', 'head-chef:sees_expected',
  'management:sees_expected',
  'supervisor:manage_staff', 'supervisor:pick_tonight', 'supervisor:roster_all', 'supervisor:sees_expected',
];

test('a database seeded before this step gets the supervisor role and the default switches on its first start; a second start changes nothing', () => {
  const mem = preStepDb();
  assert.deepStrictEqual(ensureRoleDefaults(mem), { applied: ['role-switches'] });
  const sup = mem.prepare(`SELECT can_enter_counts, can_finalize, can_admin, read_only, active FROM roles WHERE name = 'supervisor'`).get();
  assert.deepStrictEqual({ ...sup }, { can_enter_counts: 0, can_finalize: 0, can_admin: 0, read_only: 0, active: 1 });
  assert.deepStrictEqual(switchRows(mem), EXPECTED_SWITCHES);
  const roles = mem.prepare('SELECT COUNT(*) AS n FROM roles').get().n;
  assert.deepStrictEqual(ensureRoleDefaults(mem), { applied: [] });
  assert.deepStrictEqual(switchRows(mem), EXPECTED_SWITCHES);
  assert.strictEqual(mem.prepare('SELECT COUNT(*) AS n FROM roles').get().n, roles);
});

test('a switch an admin removed stays removed after a restart', () => {
  const mem = preStepDb();
  ensureRoleDefaults(mem);
  mem.prepare(`DELETE FROM role_capabilities WHERE capability = 'sees_expected' AND role_id = (SELECT id FROM roles WHERE name = 'management')`).run();
  assert.deepStrictEqual(ensureRoleDefaults(mem), { applied: [] });
  assert.ok(!switchRows(mem).includes('management:sees_expected'));
});

test('on an empty file (server started before the seed) the switches wait for the roles instead of being marked applied', () => {
  const mem = new DatabaseSync(':memory:');
  mem.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  assert.deepStrictEqual(ensureRoleDefaults(mem), { applied: [] });
  assert.strictEqual(mem.prepare('SELECT COUNT(*) AS n FROM defaults_applied').get().n, 0);
});

// --- seed.js (subprocess on a scratch file) ---

test('the seed is idempotent and never re-adds a removed switch', () => {
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'permissions-seed-test-'));
  const scratchDb = path.join(scratchDir, 'scratch.db');
  const runSeed = () => spawnSync(process.execPath, [path.join(__dirname, 'seed.js')], {
    cwd: path.join(__dirname, '..', '..'), env: { ...process.env, DB_PATH: scratchDb }, encoding: 'utf8',
  });
  try {
    const first = runSeed();
    assert.strictEqual(first.status, 0, first.stderr);
    assert.match(first.stdout, /Role defaults: applied \["role-switches"\]/);
    let seeded = new DatabaseSync(scratchDb);
    assert.deepStrictEqual(switchRows(seeded), EXPECTED_SWITCHES);
    seeded.prepare(`DELETE FROM role_capabilities WHERE capability = 'roster_kitchen'`).run();
    seeded.close();

    const again = runSeed();
    assert.strictEqual(again.status, 0, again.stderr);
    assert.match(again.stdout, /Role defaults: applied \[\]/);
    seeded = new DatabaseSync(scratchDb);
    assert.deepStrictEqual(switchRows(seeded), EXPECTED_SWITCHES.filter(s => s !== 'head-chef:roster_kitchen'));
    assert.strictEqual(seeded.prepare(`SELECT COUNT(*) AS n FROM roles WHERE name = 'supervisor'`).get().n, 1);
    seeded.close();
  } finally {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }
});

(async () => {
  for (const { name, fn } of tests) {
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
  db.close();
  for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) fs.rmSync(f, { force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
