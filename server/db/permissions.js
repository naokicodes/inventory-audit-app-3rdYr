// Step role-assignments (ADR-034, ADR-038): the ONE place that answers "may
// this person do X here". Login does not change - the account says who you
// are; this module says what you may do where.
//
// A person's live roles at a site, on a business date, are their base role
// (users.default_role_id) plus every user_roles row for that site or for
// every site (site_code NULL) that has not ended. A role grants:
//   - the four legacy capabilities, read from the roles columns;
//   - the switches it has rows for in role_capabilities;
//   - everything, if it has admin.
// An inactive role or user grants nothing (stub-login Q3).
//
// Every helper takes the db handle first, like logActivity in activityLog.js.

const { withTransaction, logActivity } = require('./activityLog.js');
const { resolveSiteCode, canUseSite } = require('./siteAccess.js');
const { businessDate } = require('../businessDay.js');

// Legacy capability -> its roles column.
const LEGACY = {
  enter_counts: 'can_enter_counts',
  finalize: 'can_finalize',
  admin: 'can_admin',
  read_only: 'read_only',
};
// Switches: rows in role_capabilities.
const SWITCHES = ['sees_expected', 'roster_kitchen', 'roster_all', 'pick_tonight', 'manage_staff'];
const CAPABILITIES = [...Object.keys(LEGACY), ...SWITCHES];

const SUPER_ADMIN = 'super-admin';

// Named sets of default switch rows. Each is applied once per database
// (defaults_applied), so an admin's later removal is never undone. A later
// step adds its own set by name (staff-meal-log: 'staff-meal-switches').
// checker, admin and super-admin get none (admin implies all).
const DEFAULT_SETS = {
  'role-switches': {
    supervisor: ['sees_expected', 'roster_all', 'pick_tonight', 'manage_staff'],
    'head-chef': ['sees_expected', 'roster_kitchen', 'pick_tonight'],
    management: ['sees_expected'],
  },
};

function checkCapability(capability) {
  if (!CAPABILITIES.includes(capability)) {
    throw new Error(`permissions: unknown capability "${capability}"`);
  }
}

const today = () => businessDate(new Date());

// A real YYYY-MM-DD calendar date?
function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const ROLE_COLUMNS = 'r.id, r.name, r.can_enter_counts, r.can_finalize, r.can_admin, r.read_only';

/**
 * The roles live for `user` at `siteCode` on business date `date` (default:
 * today's). siteCode null = the roles that hold everywhere: the base role and
 * the every-site assignments. A site the person cannot use has no live roles.
 */
function liveRoles(db, user, siteCode, date) {
  if (!user) return [];
  const on = date || today();
  const person = db.prepare('SELECT active FROM users WHERE id = ?').get(user.id);
  if (!person || person.active !== 1) return [];
  const site = siteCode === undefined ? null : siteCode;
  if (site !== null && !canUseSite(db, user, site, on)) return [];

  const base = db.prepare(`
    SELECT ${ROLE_COLUMNS} FROM users u JOIN roles r ON r.id = u.default_role_id
     WHERE u.id = ? AND r.active = 1
  `).all(user.id);
  const assigned = db.prepare(`
    SELECT ${ROLE_COLUMNS} FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ? AND r.active = 1
       AND (ur.until_date IS NULL OR ur.until_date >= ?)
       AND (ur.site_code IS NULL OR ur.site_code = ?)
     ORDER BY ur.id
  `).all(user.id, on, site);
  return [...base, ...assigned];
}

function roleGrants(db, role, capability) {
  if (role.can_admin === 1) return true;
  if (LEGACY[capability]) return role[LEGACY[capability]] === 1;
  return db.prepare('SELECT 1 FROM role_capabilities WHERE role_id = ? AND capability = ?')
    .get(role.id, capability) !== undefined;
}

/** True if any live role of `user` at `siteCode` grants `capability`. No user -> false. */
function can(db, user, capability, siteCode, date) {
  checkCapability(capability);
  if (!user) return false;
  return liveRoles(db, user, siteCode, date).some(role => roleGrants(db, role, capability));
}

/** { siteCode: [capabilities] } for every site the user can use (for /api/auth/me). */
function capabilitiesBySite(db, user, date) {
  if (!user) return {};
  const on = date || today();
  const codes = db.prepare('SELECT code FROM restaurants UNION SELECT code FROM commissaries ORDER BY code')
    .all().map(r => r.code).filter(code => code !== null);
  const result = {};
  for (const code of codes) {
    if (!canUseSite(db, user, code, on)) continue;
    const roles = liveRoles(db, user, code, on);
    result[code] = CAPABILITIES.filter(cap => roles.some(role => roleGrants(db, role, cap)));
  }
  return result;
}

// Admin, everywhere (not just at one site).
const isAdmin = (db, actor) => can(db, actor, 'admin', null);
const FORBIDDEN = { status: 403, error: 'Only an admin can change roles.' };

function roleById(db, roleId) {
  return db.prepare('SELECT id, name, active FROM roles WHERE id = ?').get(Number(roleId));
}

const normSite = siteCode => (siteCode === undefined || siteCode === null ? null : siteCode);

function findAssignment(db, userId, roleId, siteCode) {
  return db.prepare(`
    SELECT id, user_id, role_id, site_code, until_date, created_by_user_id, created_at
      FROM user_roles WHERE user_id = ? AND role_id = ? AND site_code IS ?
  `).get(userId, roleId, siteCode);
}

/**
 * Give `userId` the role `roleId` at `siteCode` (null = every site they can
 * use) until `untilDate` (null = no end). Admin only. Returns { ok, id } or
 * { status, error }. The row and its activity_log row are one transaction.
 */
function assignRole(db, { userId, roleId, siteCode, untilDate }, actor) {
  if (!isAdmin(db, actor)) return FORBIDDEN;
  const uid = Number(userId);
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(uid)) return { status: 400, error: 'Unknown person.' };
  const role = roleById(db, roleId);
  if (!role) return { status: 400, error: 'Unknown role.' };
  if (role.name === SUPER_ADMIN) return { status: 400, error: 'The super-admin role is never assigned.' };
  if (role.active !== 1) return { status: 400, error: 'That role is inactive.' };
  const site = normSite(siteCode);
  if (site !== null && resolveSiteCode(db, site) === null) return { status: 400, error: 'Unknown site.' };
  const until = untilDate === undefined || untilDate === null ? null : untilDate;
  if (until !== null && !isDate(until)) return { status: 400, error: 'The end date must be YYYY-MM-DD.' };
  if (until !== null && until < today()) return { status: 400, error: 'The end date is in the past.' };
  if (findAssignment(db, uid, role.id, site)) return { status: 409, error: 'Already assigned.' };

  const id = withTransaction(db, () => {
    const newId = Number(db.prepare(`
      INSERT INTO user_roles (user_id, role_id, site_code, until_date, created_by_user_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(uid, role.id, site, until, actor.id).lastInsertRowid);
    logActivity(db, {
      actor: actor.name, entityType: 'user_roles', entityId: newId, action: 'CREATE',
      before: null, after: { ...findAssignment(db, uid, role.id, site) }, source: 'MANUAL',
    });
    return newId;
  });
  return { ok: true, id };
}

/** Remove the assignment (userId, roleId, siteCode). Admin only. Returns { ok } or { status, error }. */
function removeAssignment(db, { userId, roleId, siteCode }, actor) {
  if (!isAdmin(db, actor)) return FORBIDDEN;
  const role = roleById(db, roleId);
  if (!role) return { status: 400, error: 'Unknown role.' };
  if (role.name === SUPER_ADMIN) return { status: 400, error: 'The super-admin role is never removed here.' };
  const site = normSite(siteCode);
  if (site !== null && resolveSiteCode(db, site) === null) return { status: 400, error: 'Unknown site.' };
  const row = findAssignment(db, Number(userId), role.id, site);
  if (!row) return { status: 404, error: 'No such assignment.' };

  withTransaction(db, () => {
    db.prepare('DELETE FROM user_roles WHERE id = ?').run(row.id);
    logActivity(db, {
      actor: actor.name, entityType: 'user_roles', entityId: row.id, action: 'DELETE',
      before: { ...row }, after: null, source: 'MANUAL',
    });
  });
  return { ok: true };
}

/**
 * Turn a switch on or off for a role. Admin only; never on super-admin (it
 * has admin, so it has everything). An unknown capability throws; a legacy
 * capability is a roles column, not a switch. Returns { ok, changed } or
 * { status, error }.
 */
function setRoleCapability(db, { roleId, capability, on }, actor) {
  checkCapability(capability);
  if (!isAdmin(db, actor)) return FORBIDDEN;
  const role = roleById(db, roleId);
  if (!role) return { status: 400, error: 'Unknown role.' };
  if (role.name === SUPER_ADMIN) return { status: 400, error: 'The super-admin role is never edited.' };
  if (!SWITCHES.includes(capability)) return { status: 400, error: `"${capability}" is not a switch.` };

  const changed = withTransaction(db, () => {
    const result = on
      ? db.prepare('INSERT OR IGNORE INTO role_capabilities (role_id, capability) VALUES (?, ?)').run(role.id, capability)
      : db.prepare('DELETE FROM role_capabilities WHERE role_id = ? AND capability = ?').run(role.id, capability);
    if (result.changes === 0) return false;
    const snapshot = { role_id: role.id, capability };
    logActivity(db, {
      actor: actor.name, entityType: 'role_capabilities', entityId: role.id,
      action: on ? 'CREATE' : 'DELETE',
      before: on ? null : snapshot, after: on ? snapshot : null, source: 'MANUAL',
    });
    return true;
  });
  return { ok: true, changed };
}

/**
 * Server start and seed.js: add the supervisor role if missing (ADR-010:
 * never counts), then apply each named default set that is not yet recorded
 * in defaults_applied. A set waits (unrecorded) until every role it names
 * exists, so a server started on an empty file before the seed still gets
 * the switches once the seed runs. Returns { applied: [set names] }.
 */
function ensureRoleDefaults(db) {
  db.prepare(`
    INSERT OR IGNORE INTO roles (name, can_enter_counts, can_finalize, can_admin, read_only, active)
    VALUES ('supervisor', 0, 0, 0, 0, 1)
  `).run();

  const applied = [];
  for (const [name, set] of Object.entries(DEFAULT_SETS)) {
    if (db.prepare('SELECT 1 FROM defaults_applied WHERE name = ?').get(name)) continue;
    const roleIds = {};
    for (const roleName of Object.keys(set)) {
      const row = db.prepare('SELECT id FROM roles WHERE name = ?').get(roleName);
      if (row) roleIds[roleName] = row.id;
    }
    if (Object.keys(roleIds).length !== Object.keys(set).length) continue;
    withTransaction(db, () => {
      const insert = db.prepare('INSERT OR IGNORE INTO role_capabilities (role_id, capability) VALUES (?, ?)');
      for (const [roleName, switches] of Object.entries(set)) {
        for (const capability of switches) {
          checkCapability(capability);
          insert.run(roleIds[roleName], capability);
        }
      }
      db.prepare("INSERT INTO defaults_applied (name, applied_at) VALUES (?, datetime('now'))").run(name);
    });
    applied.push(name);
  }
  return { applied };
}

module.exports = {
  CAPABILITIES,
  SWITCHES,
  DEFAULT_SETS,
  liveRoles,
  can,
  capabilitiesBySite,
  assignRole,
  removeAssignment,
  setRoleCapability,
  ensureRoleDefaults,
};
