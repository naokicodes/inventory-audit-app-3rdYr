// Step roles-page: the real roles router, auth router and currentUser over
// HTTP on an ephemeral port, against a throwaway DB file (DB_PATH set before
// the connection opens) - the same harness as sideItems.test.js.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const TEST_DB = path.join(os.tmpdir(), `roles-test-${process.pid}.db`);
process.env.DB_PATH = TEST_DB;
const db = require('../db/connection.js');
const auth = require('./auth.js');
const router = require('./roles.js');
const { ensureRoleDefaults, BUILT_IN_ROLES } = require('../db/permissions.js');

console.log('Roles Route Tests\n');

// The seeded roles (seed.js flags), then the default switches.
const roleId = {};
for (const [name, flags] of Object.entries({
  'super-admin': [1, 1, 1, 0], admin: [1, 1, 1, 0], management: [0, 0, 0, 1],
  'head-chef': [1, 1, 0, 0], checker: [1, 0, 0, 0], supervisor: [0, 0, 0, 0],
})) {
  roleId[name] = Number(db.prepare(
    'INSERT INTO roles (name, can_enter_counts, can_finalize, can_admin, read_only) VALUES (?, ?, ?, ?, ?)'
  ).run(name, ...flags).lastInsertRowid);
}
ensureRoleDefaults(db);
db.prepare("INSERT INTO restaurants (name, code) VALUES ('Restaurant A', 'RA'), ('Restaurant F', 'FC')").run();

const users = {};
for (const [key, roleName, sites] of [
  ['super', 'super-admin', []], ['admin', 'admin', []], ['checker', 'checker', ['RA']],
  ['chef', 'head-chef', ['RA', 'FC']], ['ben', 'checker', ['RA', 'FC']], ['management', 'management', []],
]) {
  users[key] = Number(db.prepare('INSERT INTO users (name, default_role_id) VALUES (?, ?)')
    .run(`U ${key}`, roleId[roleName]).lastInsertRowid);
  for (const code of sites) db.prepare('INSERT INTO user_sites (user_id, site_code) VALUES (?, ?)').run(users[key], code);
}

const app = express();
app.use(express.json());
app.use('/api', auth.currentUser);
app.use('/api', auth);
app.use('/api', router);

let base;
const call = async (method, url, as, body) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(as ? { Cookie: auth.cookieFor(users[as]) } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};
const logCount = () => db.prepare('SELECT COUNT(*) AS n FROM activity_log').get().n;
const switchesOf = id => db.prepare('SELECT capability FROM role_capabilities WHERE role_id = ? ORDER BY capability')
  .all(id).map(r => r.capability);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('GET /api/roles: anyone signed in reads it; only an admin may edit; logged out is 401', async () => {
  const asChecker = await call('GET', '/api/roles', 'checker');
  assert.strictEqual(asChecker.status, 200);
  assert.strictEqual(asChecker.body.can_edit, false);
  const supervisor = asChecker.body.roles.find(r => r.name === 'supervisor');
  assert.deepStrictEqual(supervisor.switches, ['sees_expected', 'roster_all', 'pick_tonight', 'manage_staff']);
  assert.strictEqual(supervisor.built_in, true);
  const chef = asChecker.body.people.find(p => p.id === users.chef);
  assert.strictEqual(chef.base_role, 'head-chef');
  assert.deepStrictEqual(chef.sites, ['FC', 'RA']);
  assert.deepStrictEqual(chef.assignments, []);
  assert.strictEqual((await call('GET', '/api/roles', 'admin')).body.can_edit, true);
  assert.strictEqual((await call('GET', '/api/roles', null)).status, 401);
  assert.strictEqual((await call('GET', `/api/users/${users.chef}/roles`, null)).status, 401);
});

let copyId;
test('admin creates "supervisor (no roster)" by copy, turns roster_all off; the toggle is logged', async () => {
  const created = await call('POST', '/api/roles', 'admin', { name: 'supervisor (no roster)', copy_from: roleId.supervisor });
  assert.strictEqual(created.status, 200, JSON.stringify(created.body));
  copyId = created.body.role.id;
  assert.deepStrictEqual(switchesOf(copyId), switchesOf(roleId.supervisor), 'a copy of the switches');
  assert.ok(switchesOf(copyId).includes('roster_all'));
  assert.deepStrictEqual(db.prepare("SELECT action FROM activity_log WHERE entity_type = 'roles' AND entity_id = ?").all(copyId).map(r => r.action), ['CREATE']);

  const before = logCount();
  const off = await call('PUT', `/api/roles/${copyId}/capabilities`, 'admin', { capability: 'roster_all', on: false });
  assert.strictEqual(off.status, 200, JSON.stringify(off.body));
  assert.strictEqual(off.body.changed, true);
  assert.ok(!off.body.role.switches.includes('roster_all'));
  assert.ok(!switchesOf(copyId).includes('roster_all'));
  assert.strictEqual(logCount(), before + 1, 'one activity_log row');
  const log = db.prepare('SELECT actor, entity_type, action, source FROM activity_log ORDER BY id DESC LIMIT 1').get();
  assert.deepStrictEqual({ ...log }, { actor: 'U admin', entity_type: 'role_capabilities', action: 'DELETE', source: 'MANUAL' });

  // Two devices: the same toggle again is a no-op that returns the current state.
  const again = await call('PUT', `/api/roles/${copyId}/capabilities`, 'admin', { capability: 'roster_all', on: false });
  assert.strictEqual(again.status, 200);
  assert.strictEqual(again.body.changed, false);
  assert.deepStrictEqual(again.body.role, off.body.role);
  assert.strictEqual(logCount(), before + 1, 'no log row for a no-op');
});

test('a legacy flag toggle updates the roles column, with a log row', async () => {
  const before = logCount();
  const res = await call('PUT', `/api/roles/${copyId}/capabilities`, 'admin', { capability: 'finalize', on: true });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.role.can_finalize, 1);
  assert.strictEqual(db.prepare('SELECT can_finalize FROM roles WHERE id = ?').get(copyId).can_finalize, 1);
  assert.strictEqual(logCount(), before + 1);
  const log = db.prepare('SELECT entity_type, action, before, after FROM activity_log ORDER BY id DESC LIMIT 1').get();
  assert.strictEqual(log.entity_type, 'roles');
  assert.strictEqual(JSON.parse(log.before).can_finalize, 0);
  assert.strictEqual(JSON.parse(log.after).can_finalize, 1);
  assert.strictEqual((await call('PUT', `/api/roles/${copyId}/capabilities`, 'admin', { capability: 'finalize', on: true })).body.changed, false);
  assert.strictEqual((await call('PUT', `/api/roles/${copyId}/capabilities`, 'admin', { capability: 'finalize', on: false })).body.role.can_finalize, 0);
  assert.strictEqual((await call('PUT', `/api/roles/${copyId}/capabilities`, 'admin', { capability: 'fly', on: true })).status, 400);
});

test('admin assigns the copy at all sites: /api/auth/me has no roster_all; then removes it', async () => {
  const assigned = await call('POST', `/api/users/${users.ben}/roles`, 'admin', { role_id: copyId, site_code: null });
  assert.strictEqual(assigned.status, 200, JSON.stringify(assigned.body));
  const me = (await call('GET', '/api/auth/me', 'ben')).body.capabilities_by_site;
  assert.deepStrictEqual(Object.keys(me).sort(), ['FC', 'RA']);
  for (const code of ['FC', 'RA']) {
    assert.ok(!me[code].includes('roster_all'), `no roster_all at ${code}`);
    assert.ok(me[code].includes('pick_tonight'), `pick_tonight at ${code}`);
  }
  const listed = await call('GET', `/api/users/${users.ben}/roles`, 'checker');
  assert.strictEqual(listed.status, 200);
  assert.strictEqual(listed.body.user.base_role, 'checker');
  assert.deepStrictEqual(listed.body.assignments.map(a => [a.role, a.site_code, a.until_date]), [['supervisor (no roster)', null, null]]);

  // With a site and an end date, then remove both.
  assert.strictEqual((await call('POST', `/api/users/${users.chef}/roles`, 'admin', { role_id: roleId.supervisor, site_code: 'FC', until_date: '2999-11-05' })).status, 200);
  const chef = (await call('GET', '/api/roles', 'admin')).body.people.find(p => p.id === users.chef);
  assert.deepStrictEqual(chef.assignments.map(a => [a.role, a.site_code, a.until_date]), [['supervisor', 'FC', '2999-11-05']]);
  assert.strictEqual((await call('DELETE', `/api/users/${users.chef}/roles`, 'admin', { role_id: roleId.supervisor, site_code: 'FC' })).status, 200);
  assert.strictEqual((await call('DELETE', `/api/users/${users.ben}/roles`, 'admin', { role_id: copyId, site_code: null })).status, 200);
  assert.deepStrictEqual((await call('GET', `/api/users/${users.ben}/roles`, 'admin')).body.assignments, []);
  assert.strictEqual((await call('DELETE', `/api/users/${users.ben}/roles`, 'admin', { role_id: copyId, site_code: null })).status, 404);
});

test('non-admins get 403 on each write (logged out 401), and nothing is written', async () => {
  const writes = [
    ['POST', '/api/roles', { name: 'sneaky', copy_from: roleId.admin }],
    ['PUT', `/api/roles/${copyId}`, { name: 'renamed' }],
    ['PUT', `/api/roles/${copyId}`, { active: false }],
    ['PUT', `/api/roles/${copyId}/capabilities`, { capability: 'roster_all', on: true }],
    ['PUT', `/api/roles/${roleId.checker}/capabilities`, { capability: 'admin', on: true }],
    ['PUT', `/api/users/${users.checker}/base-role`, { role_id: roleId.admin }],
    ['POST', `/api/users/${users.checker}/roles`, { role_id: roleId.admin, site_code: null }],
    ['DELETE', `/api/users/${users.checker}/roles`, { role_id: roleId.admin, site_code: null }],
  ];
  const logs = logCount();
  const roles = JSON.stringify(db.prepare('SELECT * FROM roles').all());
  for (const as of ['checker', 'chef', 'management']) {
    for (const [m, url, body] of writes) {
      const res = await call(m, url, as, body);
      assert.strictEqual(res.status, 403, `${as} ${m} ${url}`);
      assert.deepStrictEqual(res.body, { error: 'Only an admin can change roles.' });
    }
  }
  for (const [m, url, body] of writes) assert.strictEqual((await call(m, url, null, body)).status, 401, `logged out ${m} ${url}`);
  assert.strictEqual(logCount(), logs);
  assert.strictEqual(JSON.stringify(db.prepare('SELECT * FROM roles').all()), roles);
  assert.strictEqual(db.prepare('SELECT default_role_id FROM users WHERE id = ?').get(users.checker).default_role_id, roleId.checker);
});

test('super-admin is untouchable', async () => {
  const sa = roleId['super-admin'];
  const logs = logCount();
  for (const [m, url, body] of [
    ['PUT', `/api/roles/${sa}`, { active: false }],
    ['PUT', `/api/roles/${sa}`, { name: 'boss' }],
    ['PUT', `/api/roles/${sa}/capabilities`, { capability: 'admin', on: false }],
    ['PUT', `/api/roles/${sa}/capabilities`, { capability: 'roster_all', on: true }],
    ['PUT', `/api/users/${users.super}/base-role`, { role_id: roleId.checker }],
    ['PUT', `/api/users/${users.checker}/base-role`, { role_id: sa }],
    ['POST', `/api/users/${users.checker}/roles`, { role_id: sa, site_code: null }],
  ]) {
    const res = await call(m, url, 'super', body);
    assert.strictEqual(res.status, 400, `${m} ${url} ${JSON.stringify(res.body)}`);
  }
  assert.strictEqual(logCount(), logs);
  const row = db.prepare('SELECT name, can_admin, active FROM roles WHERE id = ?').get(sa);
  assert.deepStrictEqual({ ...row }, { name: 'super-admin', can_admin: 1, active: 1 });
});

test('a base role change applies on the next request, with a log row', async () => {
  assert.strictEqual((await call('GET', '/api/roles', 'checker')).body.can_edit, false);
  const res = await call('PUT', `/api/users/${users.checker}/base-role`, 'admin', { role_id: roleId.admin });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.changed, true);
  const log = db.prepare('SELECT entity_type, entity_id, action FROM activity_log ORDER BY id DESC LIMIT 1').get();
  assert.deepStrictEqual({ ...log }, { entity_type: 'users', entity_id: users.checker, action: 'UPDATE' });
  assert.strictEqual((await call('GET', '/api/roles', 'checker')).body.can_edit, true);
  assert.strictEqual((await call('GET', '/api/auth/me', 'checker')).body.user.role, 'admin');
  assert.strictEqual((await call('PUT', `/api/users/${users.checker}/base-role`, 'admin', { role_id: roleId.admin })).body.changed, false);
  assert.strictEqual((await call('PUT', `/api/users/${users.checker}/base-role`, 'admin', { role_id: roleId.checker })).status, 200);
  assert.strictEqual((await call('GET', '/api/roles', 'checker')).body.can_edit, false);
});

test('a name another role holds by the key is refused on create and on rename (ADR-073)', async () => {
  assert.deepStrictEqual(await call('POST', '/api/roles', 'admin', { name: 'Admin', copy_from: roleId.checker }),
    { status: 409, body: { error: 'A role with that name already exists' } });
  // roles-guard: "head chef" is now too close to head-chef, so the key is shown with another name.
  assert.strictEqual((await call('POST', '/api/roles', 'admin', { name: 'line cook' })).status, 200);
  assert.strictEqual((await call('POST', '/api/roles', 'admin', { name: 'Line  Cook' })).status, 409);
  for (const name of ['Admin', 'Line  Cook', ' SUPERVISOR ']) {
    const res = await call('PUT', `/api/roles/${copyId}`, 'admin', { name });
    assert.strictEqual(res.status, 409, name);
    assert.deepStrictEqual(res.body, { error: 'A role with that name already exists' });
  }
  assert.strictEqual(db.prepare('SELECT name FROM roles WHERE id = ?').get(copyId).name, 'supervisor (no roster)');
  assert.strictEqual((await call('POST', '/api/roles', 'admin', { name: '   ' })).status, 400);
});

test('built-in roles keep their names (ADR-083); a role made on the page renames', async () => {
  assert.deepStrictEqual(BUILT_IN_ROLES, ['super-admin', 'admin', 'management', 'head-chef', 'checker', 'supervisor']);
  const refused = await call('PUT', `/api/roles/${roleId['head-chef']}`, 'admin', { name: 'kitchen lead' });
  assert.deepStrictEqual(refused, { status: 400, body: { error: 'A built-in role keeps its name' } });
  assert.strictEqual((await call('PUT', `/api/roles/${roleId['head-chef']}`, 'admin', { name: 'Head-Chef' })).status, 400);
  assert.strictEqual(db.prepare('SELECT name FROM roles WHERE id = ?').get(roleId['head-chef']).name, 'head-chef');
  // Its own name, sent back with a change of active, is fine.
  assert.strictEqual((await call('PUT', `/api/roles/${roleId['head-chef']}`, 'admin', { name: 'head-chef', active: true })).body.changed, false);

  const renamed = await call('PUT', `/api/roles/${copyId}`, 'admin', { name: 'supervisor (no roster, FC)' });
  assert.strictEqual(renamed.status, 200, JSON.stringify(renamed.body));
  assert.strictEqual(renamed.body.role.name, 'supervisor (no roster, FC)');
  assert.strictEqual(db.prepare("SELECT action FROM activity_log WHERE entity_type = 'roles' AND entity_id = ? ORDER BY id DESC LIMIT 1").get(copyId).action, 'UPDATE');
});

test('an inactive role is listed greyed and cannot be assigned or made a base role', async () => {
  const off = await call('PUT', `/api/roles/${copyId}`, 'admin', { active: false });
  assert.strictEqual(off.status, 200);
  assert.strictEqual(off.body.role.active, 0);
  assert.strictEqual((await call('PUT', `/api/roles/${copyId}`, 'admin', { active: false })).body.changed, false, 'no-op');
  const listed = (await call('GET', '/api/roles', 'checker')).body.roles.find(r => r.id === copyId);
  assert.strictEqual(listed.active, 0);
  assert.deepStrictEqual(await call('POST', `/api/users/${users.ben}/roles`, 'admin', { role_id: copyId, site_code: null }),
    { status: 400, body: { error: 'That role is inactive.' } });
  assert.strictEqual((await call('PUT', `/api/users/${users.ben}/base-role`, 'admin', { role_id: copyId })).status, 400);
  assert.strictEqual((await call('PUT', `/api/roles/${copyId}`, 'admin', { active: 'no' })).status, 400);
  assert.strictEqual((await call('PUT', `/api/roles/${copyId}`, 'admin', { active: true })).body.role.active, 1);
});

test('an assignment of a role switched off after it was given is removed, logged; /api/auth/me unchanged (ADR-095)', async () => {
  assert.strictEqual((await call('POST', `/api/users/${users.ben}/roles`, 'admin', { role_id: copyId, site_code: 'RA' })).status, 200);
  assert.strictEqual((await call('PUT', `/api/roles/${copyId}`, 'admin', { active: false })).status, 200);
  const meBefore = (await call('GET', '/api/auth/me', 'ben')).body;
  const logs = logCount();
  const removed = await call('DELETE', `/api/users/${users.ben}/roles`, 'admin', { role_id: copyId, site_code: 'RA' });
  assert.strictEqual(removed.status, 200, JSON.stringify(removed.body));
  assert.strictEqual(logCount(), logs + 1);
  const log = db.prepare('SELECT actor, entity_type, action FROM activity_log ORDER BY id DESC LIMIT 1').get();
  assert.deepStrictEqual({ ...log }, { actor: 'U admin', entity_type: 'user_roles', action: 'DELETE' });
  assert.deepStrictEqual((await call('GET', `/api/users/${users.ben}/roles`, 'admin')).body.assignments, []);
  assert.deepStrictEqual((await call('GET', '/api/auth/me', 'ben')).body, meBefore);
  assert.strictEqual((await call('PUT', `/api/roles/${copyId}`, 'admin', { active: true })).status, 200);
});

test('a site_code that is not a code or null is a 400, not a crash', async () => {
  for (const site_code of [true, ['RA'], 5, { code: 'RA' }]) {
    for (const m of ['POST', 'DELETE']) {
      const res = await call(m, `/api/users/${users.ben}/roles`, 'admin', { role_id: roleId.supervisor, site_code });
      assert.deepStrictEqual(res, { status: 400, body: { error: 'site_code must be a site code or null.' } }, `${m} ${JSON.stringify(site_code)}`);
    }
  }
  assert.deepStrictEqual((await call('GET', `/api/users/${users.ben}/roles`, 'admin')).body.assignments, []);
});

// --- Step roles-guard (ADR-099) ---

test('roles-guard: GET /api/roles gives can_switch_off / can_turn_admin_off for the viewer', async () => {
  const flags = (body, name) => {
    const r = body.roles.find(x => x.name === name);
    return [r.can_switch_off, r.can_turn_admin_off];
  };
  const asAdmin = (await call('GET', '/api/roles', 'admin')).body;
  assert.deepStrictEqual(flags(asAdmin, 'admin'), [false, false], 'the built-in admin role');
  assert.deepStrictEqual(flags(asAdmin, 'checker'), [true, true]);
  assert.deepStrictEqual(flags(asAdmin, 'line cook'), [true, true]);
  const asChef = (await call('GET', '/api/roles', 'chef')).body;
  assert.deepStrictEqual(flags(asChef, 'head-chef'), [false, false], "the viewer's own base role");
  assert.deepStrictEqual(flags(asChef, 'checker'), [true, true]);
  assert.deepStrictEqual(flags(asChef, 'admin'), [false, false]);
});

test('roles-guard: each refusal is a 400 with its message and writes nothing', async () => {
  const logs = logCount();
  const roles = JSON.stringify(db.prepare('SELECT * FROM roles').all());
  const refusals = [
    ['PUT', `/api/roles/${roleId.admin}`, { active: false }, 'The admin role keeps admin and stays on. Make a copy to change it.'],
    ['PUT', `/api/roles/${roleId.admin}/capabilities`, { capability: 'admin', on: false }, 'The admin role keeps admin and stays on. Make a copy to change it.'],
    ['PUT', `/api/users/${users.admin}/base-role`, { role_id: roleId.checker }, 'Your own base role is changed by another admin or the super-admin.'],
    ['POST', `/api/users/${users.ben}/roles`, { role_id: roleId.admin, site_code: null }, "Give this as the person's base role."],
    ['POST', `/api/users/${users.ben}/roles`, { role_id: roleId.management, site_code: 'RA' }, "Give this as the person's base role."],
    ['POST', '/api/roles', { name: 'super admin', copy_from: roleId.checker }, 'That name is too close to the built-in role super-admin.'],
    ['PUT', `/api/roles/${copyId}`, { name: 'Head.Chef' }, 'That name is too close to the built-in role head-chef.'],
  ];
  for (const [m, url, body, error] of refusals) {
    assert.deepStrictEqual(await call(m, url, 'admin', body), { status: 400, body: { error } }, `${m} ${url} ${JSON.stringify(body)}`);
  }
  // Held as an extra role: admin cannot be turned on; the person is named.
  assert.strictEqual((await call('POST', `/api/users/${users.ben}/roles`, 'admin', { role_id: roleId.supervisor, site_code: 'RA' })).status, 200);
  const held = await call('PUT', `/api/roles/${roleId.supervisor}/capabilities`, 'admin', { capability: 'read_only', on: true });
  assert.deepStrictEqual(held, { status: 400, body: { error: 'U ben hold this as an extra role. Remove it there first, or make it their base role.' } });
  const afterAssign = logCount();
  assert.strictEqual(afterAssign, logs + 1, 'only the assignment wrote a log row');
  assert.strictEqual(JSON.stringify(db.prepare('SELECT * FROM roles').all()), roles);
  assert.strictEqual((await call('DELETE', `/api/users/${users.ben}/roles`, 'admin', { role_id: roleId.supervisor, site_code: 'RA' })).status, 200);
  // "Admin 2" and "Admins" are fine.
  assert.strictEqual((await call('POST', '/api/roles', 'admin', { name: 'Admin 2', copy_from: roleId.admin })).status, 200);
  assert.strictEqual((await call('POST', '/api/roles', 'admin', { name: 'Admins' })).status, 200);
});

const server = app.listen(0, async () => {
  base = `http://127.0.0.1:${server.address().port}`;
  let passed = 0, failed = 0;
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
  server.close();
  db.close();
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) fs.rmSync(f, { force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
});
