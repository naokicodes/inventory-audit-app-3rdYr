// Step import-identity: the identity slice of import-settings.js.
//
// Reads Naoki's off-repo people workbook, exported as one CSV per tab (the
// file named after the tab, headers on the first row), and upserts the
// IDENTITY tabs only - Roles and Users (with each user's site_memberships) -
// into the tables users-roles and user-sites created. Catalog / par / sides,
// Stations and Staff are later slices; their files are listed as skipped.
//
// Every write is SELECT-then-INSERT/UPDATE by natural key (no sqlite-only
// ON CONFLICT), so a second run is a no-op and the script survives a MySQL
// move. Problems in the workbook are collected into a report and printed,
// never thrown.
//
// The CSV reader sits behind ONE adapter, loadTab(dir, name), so swapping in
// an .xlsx reader later (Q6 option A) touches only that function.
//
// scripts/import-settings.js is the CLI; this module holds the logic so the
// test runner (server/**/*.test.js) can reach it.

const fs = require('fs');
const path = require('path');
const { resolveSiteCode } = require('./siteAccess.js');

const SUPER_ADMIN_ROLE = 'super-admin';
const KNOWN_TABS = ['Roles', 'Users'];
const ROLE_FLAGS = ['can_enter_counts', 'can_finalize', 'can_admin', 'read_only'];
const ROLE_HEADERS = ['name', ...ROLE_FLAGS];
const USER_HEADERS = ['name', 'default_role', 'active', 'site_memberships'];

// --- CSV (option B: zero-dependency reader) ---

// Parses RFC 4180-style CSV: quoted fields may hold commas, newlines and ""
// escapes. Accepts CRLF or LF and strips a UTF-8 BOM (Excel writes one).
// Returns an array of rows, each an array of strings.
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  // Blank lines (a trailing newline, an empty line between rows) carry nothing.
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

// Writes one CSV field, quoting only when it has to.
function csvField(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvField).join(',')];
  for (const r of rows) lines.push(headers.map(h => csvField(r[h])).join(','));
  return lines.join('\r\n') + '\r\n';
}

// THE reader adapter. Returns the tab's rows as objects keyed by the trimmed,
// lower-cased header, every value trimmed - or null when <dir>/<name>.csv does
// not exist (an absent tab is not an error: Roles is optional).
function loadTab(dir, name) {
  const file = path.join(dir, `${name}.csv`);
  if (!fs.existsSync(file)) return null;
  const [headerRow, ...dataRows] = parseCsv(fs.readFileSync(file, 'utf8'));
  if (!headerRow) return [];
  const headers = headerRow.map(h => h.trim().toLowerCase());
  return dataRows.map(cells => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cells[i] ?? '').trim(); });
    return obj;
  });
}

// The CSV files in dir this slice does not read (Stations, Staff, ...).
function skippedTabs(dir) {
  return fs.readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith('.csv'))
    .map(f => f.slice(0, -4))
    .filter(name => !KNOWN_TABS.includes(name))
    .sort();
}

// --- import ---

function newReport() {
  return {
    rolesInserted: 0, rolesUpdated: 0,
    usersInserted: 0, usersUpdated: 0,
    membershipsAdded: 0,
    tabsRead: [], tabsSkipped: [],
    unknownRoles: [],       // "<user>: <role>"
    unresolvedSites: [],    // "<user>: <code>" (unknown, or in both site tables)
    duplicateNames: [],     // "<tab>: <name>"
    problems: [],           // anything else that made a row skip
  };
}

// 0 / 1 as text -> number; anything else -> null.
function parseBit(value) {
  return value === '0' ? 0 : value === '1' ? 1 : null;
}

function importRoles(db, rows, report) {
  const findRole = db.prepare(`SELECT id, ${ROLE_FLAGS.join(', ')} FROM roles WHERE name = ?`);
  const insertRole = db.prepare(
    `INSERT INTO roles (name, ${ROLE_FLAGS.join(', ')}, active) VALUES (?, ?, ?, ?, ?, 1)`
  );
  const updateRole = db.prepare(
    `UPDATE roles SET ${ROLE_FLAGS.map(f => `${f} = ?`).join(', ')} WHERE id = ?`
  );
  const seen = new Set();

  rows.forEach((row, i) => {
    const name = row.name;
    const where = `Roles row ${i + 2}`;
    if (!name) { report.problems.push(`${where}: no name - skipped`); return; }
    if (seen.has(name)) { report.duplicateNames.push(`Roles: ${name}`); return; }
    seen.add(name);

    // Super-admin is seeded and never lockable: the workbook cannot change it.
    if (name === SUPER_ADMIN_ROLE) {
      report.problems.push(`${where}: "${SUPER_ADMIN_ROLE}" flags are fixed (it can never be locked out) - row ignored`);
      return;
    }

    const flags = ROLE_FLAGS.map(f => parseBit(row[f]));
    const bad = ROLE_FLAGS.filter((f, k) => flags[k] === null);
    if (bad.length > 0) {
      report.problems.push(`${where} "${name}": ${bad.join(', ')} must be 0 or 1 - skipped`);
      return;
    }

    const existing = findRole.get(name);
    if (!existing) {
      insertRole.run(name, ...flags);
      report.rolesInserted++;
    } else if (ROLE_FLAGS.some((f, k) => existing[f] !== flags[k])) {
      updateRole.run(...flags, existing.id);
      report.rolesUpdated++;
    }
    // Roles absent from the sheet are never deleted.
  });
}

function addMemberships(db, userName, userId, cell, report) {
  const findMembership = db.prepare('SELECT 1 FROM user_sites WHERE user_id = ? AND site_code = ?');
  const insertMembership = db.prepare('INSERT INTO user_sites (user_id, site_code) VALUES (?, ?)');
  const codes = [...new Set((cell || '').split(',').map(c => c.trim()).filter(Boolean))];
  for (const code of codes) {
    let site;
    try {
      site = resolveSiteCode(db, code);
    } catch (err) {
      site = null; // the code is in both restaurants and commissaries
    }
    if (site === null) {
      report.unresolvedSites.push(`${userName}: ${code}`);
      continue;
    }
    if (!findMembership.get(userId, code)) {
      insertMembership.run(userId, code);
      report.membershipsAdded++;
    }
  }
}

function importUsers(db, rows, report) {
  const roleByName = db.prepare('SELECT id FROM roles WHERE name = ?');
  const findUser = db.prepare('SELECT id, name, default_role_id, active FROM users WHERE name = ?');
  const insertUser = db.prepare('INSERT INTO users (name, default_role_id, active) VALUES (?, ?, ?)');
  const updateUser = db.prepare('UPDATE users SET default_role_id = ?, active = ? WHERE id = ?');
  const renameUser = db.prepare('UPDATE users SET name = ? WHERE id = ?');

  const superRole = roleByName.get(SUPER_ADMIN_ROLE);
  const superRoleId = superRole ? superRole.id : null;
  const superUsers = superRoleId === null ? []
    : db.prepare('SELECT id, name FROM users WHERE default_role_id = ? ORDER BY id').all(superRoleId);
  const superUser = superUsers.length === 1 ? superUsers[0] : null;

  const seen = new Set();
  let superRowSeen = false;

  rows.forEach((row, i) => {
    const name = row.name;
    const where = `Users row ${i + 2}`;
    if (!name) { report.problems.push(`${where}: no name - skipped`); return; }
    if (seen.has(name)) { report.duplicateNames.push(`Users: ${name}`); return; }
    seen.add(name);

    const role = roleByName.get(row.default_role);
    if (!role) { report.unknownRoles.push(`${name}: ${row.default_role || '(blank)'}`); return; }

    const active = parseBit(row.active);
    if (active === null) {
      report.problems.push(`${where} "${name}": active must be 0 or 1 - skipped`);
      return;
    }

    let userId;
    if (role.id === superRoleId) {
      // #22: the workbook's super-admin row renames the ONE seeded
      // super-admin; it never inserts a second one.
      if (superRowSeen) {
        report.problems.push(`${where} "${name}": a second super-admin row - only one super-admin exists, skipped`);
        return;
      }
      superRowSeen = true;
      if (!superUser) {
        report.problems.push(`${where} "${name}": expected exactly one super-admin user in the database, found ${superUsers.length} - skipped (run the seed first)`);
        return;
      }
      if (active === 0) {
        report.problems.push(`${where} "${name}": the super-admin is never deactivated - active ignored`);
      }
      if (superUser.name !== name) {
        const clash = findUser.get(name);
        if (clash) {
          report.problems.push(`${where} "${name}": that name already belongs to another user - super-admin not renamed`);
          return;
        }
        renameUser.run(name, superUser.id);
        superUser.name = name;
        report.usersUpdated++;
      }
      userId = superUser.id;
    } else {
      const existing = findUser.get(name);
      if (existing && existing.default_role_id === superRoleId) {
        // Changing the super-admin's role here would leave none.
        report.problems.push(`${where} "${name}": is the super-admin - its role cannot change to ${row.default_role}, skipped`);
        return;
      }
      if (!existing) {
        userId = insertUser.run(name, role.id, active).lastInsertRowid;
        report.usersInserted++;
      } else {
        userId = existing.id;
        if (existing.default_role_id !== role.id || existing.active !== active) {
          updateUser.run(role.id, active, existing.id);
          report.usersUpdated++;
        }
      }
    }

    addMemberships(db, name, userId, row.site_memberships, report);
  });
}

// Imports the identity tabs found in dir, in one transaction. Returns the
// report; never throws for workbook content (a database error still throws,
// after rolling back).
function importIdentity(db, dir) {
  const report = newReport();
  report.tabsSkipped = skippedTabs(dir);
  const roles = loadTab(dir, 'Roles');
  const users = loadTab(dir, 'Users');

  db.exec('BEGIN');
  try {
    // Roles first, so a user row can name a role the same workbook adds.
    if (roles) { importRoles(db, roles, report); report.tabsRead.push('Roles'); }
    if (users) { importUsers(db, users, report); report.tabsRead.push('Users'); }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return report;
}

function formatReport(report) {
  const lines = [
    `Tabs read: ${report.tabsRead.join(', ') || '(none - no Roles.csv or Users.csv found)'}`,
    `Tabs skipped (not part of this slice): ${report.tabsSkipped.join(', ') || '(none)'}`,
    `Roles: ${report.rolesInserted} inserted, ${report.rolesUpdated} updated`,
    `Users: ${report.usersInserted} inserted, ${report.usersUpdated} updated`,
    `Site memberships: ${report.membershipsAdded} added`,
  ];
  const section = (title, items) => {
    if (items.length === 0) return;
    lines.push('', `${title} (${items.length}):`, ...items.map(s => `  - ${s}`));
  };
  section('WARNING unknown role names - user skipped', report.unknownRoles);
  section('WARNING unresolved site codes - membership skipped', report.unresolvedSites);
  section('WARNING duplicate names - later row skipped', report.duplicateNames);
  section('WARNING other rows skipped or adjusted', report.problems);
  return lines.join('\n');
}

// --- export (round trip: export -> edit -> import) ---

// Writes Roles.csv and Users.csv in the template shape into dir. Refuses to
// overwrite an existing file, so an export never clobbers an edited
// workbook. Fake "Test ..." accounts (ADR-039) are not workbook people and are
// left out. Returns { roles, users, files } or { refused }.
function exportIdentity(db, dir) {
  const files = KNOWN_TABS.map(t => path.join(dir, `${t}.csv`));
  const existing = files.filter(f => fs.existsSync(f));
  if (existing.length > 0) {
    return { refused: `export refused: ${existing.join(', ')} already exist(s). Export into an empty folder.` };
  }
  const roles = db.prepare(`SELECT name, ${ROLE_FLAGS.join(', ')} FROM roles ORDER BY id`).all();
  const users = db.prepare(
    `SELECT u.id, u.name, r.name AS default_role, u.active
       FROM users u JOIN roles r ON r.id = u.default_role_id
      WHERE u.name NOT LIKE 'Test %'
      ORDER BY u.id`
  ).all();
  const sitesOf = db.prepare('SELECT site_code FROM user_sites WHERE user_id = ? ORDER BY site_code');
  const userRows = users.map(u => ({
    ...u,
    site_memberships: sitesOf.all(u.id).map(r => r.site_code).join(', '),
  }));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(files[0], toCsv(ROLE_HEADERS, roles));
  fs.writeFileSync(files[1], toCsv(USER_HEADERS, userRows));
  return { roles: roles.length, users: userRows.length, files };
}

module.exports = {
  parseCsv, loadTab, skippedTabs,
  importIdentity, formatReport, exportIdentity,
  ROLE_HEADERS, USER_HEADERS,
};
