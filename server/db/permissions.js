// Step role-assignments (ADR-034, ADR-038): the ONE place that answers "may
// this person do X here". Login does not change - the account says who you
// are; this module says what you may do where.
//
// A person's live roles at a site, on a business date, are their base role
// (users.default_role_id) plus every user_roles row for that site or for
// every site (site_code NULL) that has not ended. Admin and read-only are base
// roles only (roles-guard, ADR-099): an extra role with either grants nothing.
// A role grants:
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
     WHERE ur.user_id = ? AND r.active = 1 AND r.can_admin = 0 AND r.read_only = 0
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

// Admin, everywhere: the base role only (roles-guard, PERM-09). The person is
// active, their base role is active and has admin. An extra role never makes
// an admin. A read-only check reads the base role the same way (siteAccess's
// isBypass does), never through roleGrants, which says yes to everything for
// a role with admin.
function isAdmin(db, actor) {
  if (!actor) return false;
  return db.prepare(`
    SELECT 1 FROM users u JOIN roles r ON r.id = u.default_role_id
     WHERE u.id = ? AND u.active = 1 AND r.active = 1 AND r.can_admin = 1
  `).get(actor.id) !== undefined;
}
const FORBIDDEN = { status: 403, error: 'Only an admin can change roles.' };

function roleById(db, roleId) {
  return db.prepare('SELECT id, name, active, can_admin, read_only FROM roles WHERE id = ?').get(Number(roleId));
}

// --- Step roles-guard (ADR-099): no admin lockout ---

const ADMIN_ROLE = 'admin';
const BASE_ONLY = { status: 400, error: "Give this as the person's base role." };
const ADMIN_ROLE_LOCKED = 'The admin role keeps admin and stays on. Make a copy to change it.';
const OWN_ROLE_LOCKED = 'You are using this role. Ask another admin or the super-admin.';
const OWN_BASE_ROLE = { status: 400, error: 'Your own base role is changed by another admin or the super-admin.' };

const baseRoleIdOf = (db, user) => (user
  ? db.prepare('SELECT default_role_id FROM users WHERE id = ?').get(user.id)?.default_role_id ?? null
  : null);

/**
 * Why `viewer` may not switch `role` off or turn its admin off, or null if
 * they may: the built-in admin role (found by name, ADR-083), or the role the
 * viewer is using as their base role.
 */
function lockReason(db, role, viewer) {
  if (role.name === ADMIN_ROLE) return ADMIN_ROLE_LOCKED;
  if (role.id === baseRoleIdOf(db, viewer)) return OWN_ROLE_LOCKED;
  return null;
}

// "A, B, C, D, E and 2 more": at most five names.
function namesList(names) {
  const shown = names.slice(0, 5).join(', ');
  return names.length > 5 ? `${shown} and ${names.length - 5} more` : shown;
}

// The people who hold `roleId` as an extra role (any user_roles row).
function extraHolders(db, roleId) {
  return db.prepare(`
    SELECT DISTINCT u.name FROM user_roles ur JOIN users u ON u.id = ur.user_id
     WHERE ur.role_id = ? ORDER BY u.name
  `).all(roleId).map(r => r.name);
}

/**
 * Server start (roles-guard rule 7): the line listing extra roles that grant
 * nothing now because their role has admin or read-only, or null if none.
 */
function extraRolesGrantingNothing(db) {
  const rows = db.prepare(`
    SELECT u.name AS person, r.name AS role, ur.site_code
      FROM user_roles ur JOIN users u ON u.id = ur.user_id JOIN roles r ON r.id = ur.role_id
     WHERE r.can_admin = 1 OR r.read_only = 1
     ORDER BY u.name, r.name, ur.site_code
  `).all();
  if (rows.length === 0) return null;
  const list = rows.map(r => `${r.person} - ${r.role} (${r.site_code === null ? 'every site' : r.site_code})`).join(', ');
  return `Extra roles that grant nothing now (admin and read-only are base roles only): ${list}. Remove them on the Roles page.`;
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

  const result = withTransaction(db, () => {
    // Read inside the transaction, so another admin's change is seen.
    const flags = roleById(db, role.id);
    if (flags.can_admin === 1 || flags.read_only === 1) return BASE_ONLY;
    const newId = Number(db.prepare(`
      INSERT INTO user_roles (user_id, role_id, site_code, until_date, created_by_user_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(uid, role.id, site, until, actor.id).lastInsertRowid);
    logActivity(db, {
      actor: actor.name, entityType: 'user_roles', entityId: newId, action: 'CREATE',
      before: null, after: { ...findAssignment(db, uid, role.id, site) }, source: 'MANUAL',
    });
    return { ok: true, id: newId };
  });
  return result;
}

/** Remove the assignment (userId, roleId, siteCode). Admin only. Returns { ok } or { status, error }. */
function removeAssignment(db, { userId, roleId, siteCode }, actor) {
  if (!isAdmin(db, actor)) return FORBIDDEN;
  const role = roleById(db, roleId);
  if (!role) return { status: 400, error: 'Unknown role.' };
  if (role.name === SUPER_ADMIN) return { status: 400, error: 'The super-admin role is never removed here.' };
  // An inactive role's assignment may still be removed (ADR-095): it granted nothing anyway.
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
  if (on !== true && on !== false) return { status: 400, error: 'on must be true or false.' };

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

// --- Step roles-page (ADR-034, ADR-073, ADR-083) ---

// ADR-083: code finds these by name, so they never get a new one. A built-in
// role added later joins this list in the step that seeds it.
const BUILT_IN_ROLES = ['super-admin', 'admin', 'management', 'head-chef', 'checker', 'supervisor'];

// The one name key (ADR-047): lowercase, trimmed, inner spaces collapsed.
const nameKey = name => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const NAME_TAKEN = { status: 409, error: 'A role with that name already exists' };

// roles-guard rule 6: a name's letters and digits alone. "Super.Admin",
// "super_admin" and "admin" with an unseen character all come to the same.
const lettersOf = name => String(name ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The built-in role whose letters and digits `name` matches, or null. */
function builtInLookAlike(name) {
  const letters = lettersOf(name);
  if (!letters) return null;
  return BUILT_IN_ROLES.find(builtIn => lettersOf(builtIn) === letters) || null;
}
const tooClose = builtIn => ({ status: 400, error: `That name is too close to the built-in role ${builtIn}.` });

// Another role (not `exceptId`) whose name has this key?
function nameTaken(db, name, exceptId) {
  const key = nameKey(name);
  return db.prepare('SELECT id, name FROM roles').all().some(r => r.id !== exceptId && nameKey(r.name) === key);
}

// A role as the Roles page shows it: flags, active, and its switches on.
function roleSnapshot(db, roleId) {
  const row = db.prepare(
    'SELECT id, name, can_enter_counts, can_finalize, can_admin, read_only, active FROM roles WHERE id = ?'
  ).get(Number(roleId));
  if (!row) return null;
  const on = db.prepare('SELECT capability FROM role_capabilities WHERE role_id = ? ORDER BY capability')
    .all(row.id).map(r => r.capability);
  return { ...row, switches: SWITCHES.filter(s => on.includes(s)) };
}

/**
 * Add a role named `name`, starting as a copy of role `copyFrom`'s four
 * flags and switches (none given -> everything off). Admin only. Returns
 * { ok, role } or { status, error }. The role, its switch rows and the
 * activity_log row are one transaction.
 */
function createRole(db, { name, copyFrom }, actor) {
  if (!isAdmin(db, actor)) return FORBIDDEN;
  const clean = typeof name === 'string' ? name.trim() : '';
  if (!clean) return { status: 400, error: 'A role needs a name.' };
  if (nameTaken(db, clean, null)) return NAME_TAKEN;
  const lookAlike = builtInLookAlike(clean);
  if (lookAlike) return tooClose(lookAlike);
  let source = null;
  if (copyFrom !== undefined && copyFrom !== null && copyFrom !== '') {
    source = roleSnapshot(db, copyFrom);
    if (!source) return { status: 400, error: 'Unknown role to copy.' };
  }
  const flags = source
    ? [source.can_enter_counts, source.can_finalize, source.can_admin, source.read_only]
    : [0, 0, 0, 0];

  const id = withTransaction(db, () => {
    const newId = Number(db.prepare(`
      INSERT INTO roles (name, can_enter_counts, can_finalize, can_admin, read_only, active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(clean, ...flags).lastInsertRowid);
    const insert = db.prepare('INSERT INTO role_capabilities (role_id, capability) VALUES (?, ?)');
    for (const capability of source ? source.switches : []) insert.run(newId, capability);
    logActivity(db, {
      actor: actor.name, entityType: 'roles', entityId: newId, action: 'CREATE',
      before: null, after: roleSnapshot(db, newId), source: 'MANUAL',
    });
    return newId;
  });
  return { ok: true, role: roleSnapshot(db, id) };
}

/**
 * Rename a role and/or switch it on or off (`name`, `active`; either may be
 * left out). Admin only; never super-admin; a built-in role keeps its name
 * (ADR-083). Sending the current values is a no-op. Returns
 * { ok, changed, role } or { status, error }.
 */
function updateRole(db, { roleId, name, active }, actor) {
  if (!isAdmin(db, actor)) return FORBIDDEN;
  const before = roleSnapshot(db, roleId);
  if (!before) return { status: 404, error: 'Unknown role.' };
  if (before.name === SUPER_ADMIN) return { status: 400, error: 'The super-admin role is never edited.' };

  let newName = before.name;
  if (name !== undefined) {
    const clean = typeof name === 'string' ? name.trim() : '';
    if (!clean) return { status: 400, error: 'A role needs a name.' };
    if (clean !== before.name) {
      if (BUILT_IN_ROLES.includes(before.name)) return { status: 400, error: 'A built-in role keeps its name' };
      if (nameTaken(db, clean, before.id)) return NAME_TAKEN;
      const lookAlike = builtInLookAlike(clean);
      if (lookAlike) return tooClose(lookAlike);
      newName = clean;
    }
  }
  let newActive = before.active;
  if (active !== undefined) {
    if (active !== true && active !== false) return { status: 400, error: 'active must be true or false.' };
    newActive = active ? 1 : 0;
  }
  if (newName === before.name && newActive === before.active) return { ok: true, changed: false, role: before };

  return withTransaction(db, () => {
    // roles-guard: the built-in admin role and your own base role stay on.
    // Read inside the transaction, so another admin's change is seen.
    if (newActive === 0 && before.active === 1) {
      const locked = lockReason(db, before, actor);
      if (locked) return { status: 400, error: locked };
    }
    db.prepare('UPDATE roles SET name = ?, active = ? WHERE id = ?').run(newName, newActive, before.id);
    logActivity(db, {
      actor: actor.name, entityType: 'roles', entityId: before.id, action: 'UPDATE',
      before, after: roleSnapshot(db, before.id), source: 'MANUAL',
    });
    return { ok: true, changed: true, role: roleSnapshot(db, before.id) };
  });
}

/**
 * Turn one of a role's toggles on or off: a legacy flag updates its roles
 * column, a switch goes through setRoleCapability. Admin only; never
 * super-admin. Toggling to the current state is a no-op. Returns
 * { ok, changed, role } or { status, error }.
 */
function setRoleToggle(db, { roleId, capability, on }, actor) {
  if (!isAdmin(db, actor)) return FORBIDDEN;
  if (!CAPABILITIES.includes(capability)) return { status: 400, error: 'Unknown switch.' };
  const before = roleSnapshot(db, roleId);
  if (!before) return { status: 404, error: 'Unknown role.' };

  if (SWITCHES.includes(capability)) {
    const result = setRoleCapability(db, { roleId: before.id, capability, on }, actor);
    return result.ok ? { ...result, role: roleSnapshot(db, before.id) } : result;
  }
  if (before.name === SUPER_ADMIN) return { status: 400, error: 'The super-admin role is never edited.' };
  if (on !== true && on !== false) return { status: 400, error: 'on must be true or false.' };
  const column = LEGACY[capability];
  const value = on ? 1 : 0;
  if (before[column] === value) return { ok: true, changed: false, role: before };

  return withTransaction(db, () => {
    // roles-guard checks, read inside the transaction so another admin's
    // change is seen. A refusal writes nothing.
    if (on && (capability === 'admin' || capability === 'read_only')) {
      const holders = extraHolders(db, before.id);
      if (holders.length > 0) {
        return { status: 400, error: `${namesList(holders)} hold this as an extra role. Remove it there first, or make it their base role.` };
      }
    }
    if (!on && capability === 'admin') {
      const locked = lockReason(db, before, actor);
      if (locked) return { status: 400, error: locked };
    }
    db.prepare(`UPDATE roles SET ${column} = ? WHERE id = ?`).run(value, before.id);
    logActivity(db, {
      actor: actor.name, entityType: 'roles', entityId: before.id, action: 'UPDATE',
      before, after: roleSnapshot(db, before.id), source: 'MANUAL',
    });
    return { ok: true, changed: true, role: roleSnapshot(db, before.id) };
  });
}

/**
 * Change a person's base role (users.default_role_id). Admin only; the
 * super-admin person and the super-admin role are never part of it; the role
 * must be active. Applies from the person's next request. Returns
 * { ok, changed } or { status, error }.
 */
function setBaseRole(db, { userId, roleId }, actor) {
  if (!isAdmin(db, actor)) return FORBIDDEN;
  const person = db.prepare(`
    SELECT u.id, u.name, u.default_role_id, r.name AS role
      FROM users u JOIN roles r ON r.id = u.default_role_id WHERE u.id = ?
  `).get(Number(userId));
  if (!person) return { status: 404, error: 'Unknown person.' };
  if (person.role === SUPER_ADMIN) return { status: 400, error: "The super-admin's role never changes." };
  if (actor && person.id === actor.id) return OWN_BASE_ROLE;
  const role = roleById(db, roleId);
  if (!role) return { status: 400, error: 'Unknown role.' };
  if (role.name === SUPER_ADMIN) return { status: 400, error: 'The super-admin role is never assigned.' };
  if (role.active !== 1) return { status: 400, error: 'That role is inactive.' };
  if (role.id === person.default_role_id) return { ok: true, changed: false };

  withTransaction(db, () => {
    db.prepare('UPDATE users SET default_role_id = ? WHERE id = ?').run(role.id, person.id);
    logActivity(db, {
      actor: actor.name, entityType: 'users', entityId: person.id, action: 'UPDATE',
      before: { default_role_id: person.default_role_id }, after: { default_role_id: role.id }, source: 'MANUAL',
    });
  });
  return { ok: true, changed: true };
}

/** A person's assignments, for the Roles page: role name and whether it is active. */
function assignmentsOf(db, userId) {
  return db.prepare(`
    SELECT ur.id, ur.role_id, r.name AS role, r.active AS role_active, ur.site_code, ur.until_date
      FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ? ORDER BY r.name, ur.site_code
  `).all(Number(userId)).map(row => ({ ...row }));
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
  BUILT_IN_ROLES,
  nameKey,
  isAdmin,
  roleSnapshot,
  createRole,
  updateRole,
  setRoleToggle,
  setBaseRole,
  assignmentsOf,
  lockReason,
  builtInLookAlike,
  extraRolesGrantingNothing,
};
