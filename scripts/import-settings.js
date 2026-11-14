// Step import-identity: import the people workbook (identity tabs) into the
// database selected by DB_PATH (unset = the live inventory.db, as everywhere).
//
//   npm run import:settings -- <folder of tab CSVs>           import Roles.csv / Users.csv
//   npm run import:settings -- --export <empty folder>        write them from the database
//
// Standalone and off the runtime path; not wired into the reseed yet. The
// logic below is exported for server/db/importSettings.test.js; the CLI at the
// bottom runs only when this file is executed directly.
//
// Reads Naoki's off-repo people workbook, exported as one CSV per tab (the
// file named after the tab, headers on the first row), and upserts the
// IDENTITY tabs only - Roles and Users (with each user's site_memberships) -
// into the tables users-roles and user-sites created. Catalog / par / sides,
// Stations and Staff are later slices; their files are listed as skipped.
//
// Every write is SELECT-then-INSERT/UPDATE by natural key (no sqlite-only
// ON CONFLICT), so a second run is a no-op and the script survives a MySQL
// move. A name on two rows is skipped entirely, names match case- and
// space-insensitively, and site_memberships is each user's full list
// (decisions 2026-11-12, ADR-047). Problems in the workbook are collected
// into a report and printed, never thrown.
//
// The CSV reader sits behind ONE adapter, loadTab(dir, name), so swapping in
// an .xlsx reader later (Q6 option A) touches only that function.
//

const fs = require('fs');
const path = require('path');
const { resolveSiteCode } = require('../server/db/siteAccess.js');

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
    membershipsAdded: 0, membershipsRemoved: 0,
    tabsRead: [], tabsSkipped: [],
    unknownRoles: [],       // "<user>: <role>"
    unresolvedSites: [],    // "<user>: <code>" (unknown, or in both site tables)
    duplicateNames: [],     // "<tab>: <name> (rows a, b)" - every such row skipped
    spellingUpdated: [],    // "<old> -> <new>"
    removalsSkipped: [],    // "<user>: ..." - an unresolved code blocked removals
    problems: [],           // anything else that made a row skip
  };
}

// The one key every name lookup uses (decision 2026-11-12, ADR-047):
// lowercase, trimmed, runs of spaces collapsed to one. "Kim", " kim" and
// "KIM" are the same name.
function nameKey(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// 0 / 1 as text -> number; anything else -> null.
function parseBit(value) {
  return value === '0' ? 0 : value === '1' ? 1 : null;
}

// Counts the names first (Reading B, ADR-047): a name on more than one row is
// not imported at all - every row with it is skipped and reported once.
// Returns the set of duplicated keys.
function findDuplicates(rows, tab, report) {
  const linesByKey = new Map();
  rows.forEach((row, i) => {
    const key = nameKey(row.name);
    if (!key) return;
    if (!linesByKey.has(key)) linesByKey.set(key, []);
    linesByKey.get(key).push(i + 2);
  });
  const duplicated = new Set();
  for (const [key, lines] of linesByKey) {
    if (lines.length < 2) continue;
    duplicated.add(key);
    report.duplicateNames.push(`${tab}: ${rows[lines[0] - 2].name} (rows ${lines.join(', ')})`);
  }
  return duplicated;
}

// Every row of table whose name has this key (0, 1, or - if the database
// already holds two spellings - more).
function byKey(stmt, key) {
  return stmt.all().filter(r => nameKey(r.name) === key);
}

function importRoles(db, rows, report) {
  const allRoles = db.prepare(`SELECT id, name, ${ROLE_FLAGS.join(', ')} FROM roles`);
  const insertRole = db.prepare(
    `INSERT INTO roles (name, ${ROLE_FLAGS.join(', ')}, active) VALUES (?, ?, ?, ?, ?, 1)`
  );
  const updateRole = db.prepare(
    `UPDATE roles SET ${ROLE_FLAGS.map(f => `${f} = ?`).join(', ')} WHERE id = ?`
  );
  const duplicated = findDuplicates(rows, 'Roles', report);

  rows.forEach((row, i) => {
    const name = row.name;
    const key = nameKey(name);
    const where = `Roles row ${i + 2}`;
    if (!key) { report.problems.push(`${where}: no name - skipped`); return; }
    if (duplicated.has(key)) return;

    // Super-admin is seeded and never lockable: the workbook cannot change it.
    if (key === SUPER_ADMIN_ROLE) {
      report.problems.push(`${where}: "${SUPER_ADMIN_ROLE}" flags are fixed (it can never be locked out) - row ignored`);
      return;
    }

    const flags = ROLE_FLAGS.map(f => parseBit(row[f]));
    const bad = ROLE_FLAGS.filter((f, k) => flags[k] === null);
    if (bad.length > 0) {
      report.problems.push(`${where} "${name}": ${bad.join(', ')} must be 0 or 1 - skipped`);
      return;
    }

    const matches = byKey(allRoles, key);
    if (matches.length > 1) {
      report.problems.push(`${where} "${name}": matches ${matches.length} existing roles (${matches.map(r => r.name).join(', ')}) - skipped`);
      return;
    }
    const existing = matches[0];
    if (!existing) {
      insertRole.run(name, ...flags);
      report.rolesInserted++;
    } else if (ROLE_FLAGS.some((f, k) => existing[f] !== flags[k])) {
      // A role is never renamed: code looks roles up by name.
      updateRole.run(...flags, existing.id);
      report.rolesUpdated++;
    }
    // Roles absent from the sheet are never deleted.
  });
}

// site_memberships is the user's complete list (ADR-047): insert the codes
// that resolve and are missing, delete the user's other memberships. If any
// code does not resolve, insert the resolved ones and delete nothing. A blank
// cell means no sites.
function syncMemberships(db, userName, userId, cell, report) {
  const currentSites = db.prepare('SELECT site_code FROM user_sites WHERE user_id = ?');
  const insertMembership = db.prepare('INSERT INTO user_sites (user_id, site_code) VALUES (?, ?)');
  const deleteMembership = db.prepare('DELETE FROM user_sites WHERE user_id = ? AND site_code = ?');
  const codes = [...new Set((cell || '').split(',').map(c => c.trim()).filter(Boolean))];
  const current = new Set(currentSites.all(userId).map(r => r.site_code));

  const unresolved = [];
  for (const code of codes) {
    let site;
    try {
      site = resolveSiteCode(db, code);
    } catch (err) {
      site = null; // the code is in both restaurants and commissaries
    }
    if (site === null) {
      report.unresolvedSites.push(`${userName}: ${code}`);
      unresolved.push(code);
      continue;
    }
    if (!current.has(code)) {
      insertMembership.run(userId, code);
      report.membershipsAdded++;
    }
  }

  const listed = new Set(codes);
  const unlisted = [...current].filter(c => !listed.has(c)).sort();
  if (unresolved.length > 0) {
    const kept = unlisted.length > 0 ? ` (kept ${unlisted.join(', ')})` : '';
    report.removalsSkipped.push(`${userName}: ${unresolved.join(', ')} did not resolve - nothing removed${kept}`);
    return;
  }
  for (const code of unlisted) {
    deleteMembership.run(userId, code);
    report.membershipsRemoved++;
  }
}

function importUsers(db, rows, report) {
  const roleByName = db.prepare('SELECT id FROM roles WHERE name = ?');
  const allRoles = db.prepare('SELECT id, name FROM roles');
  const allUsers = db.prepare('SELECT id, name, default_role_id, active FROM users');
  const insertUser = db.prepare('INSERT INTO users (name, default_role_id, active) VALUES (?, ?, ?)');
  const updateUser = db.prepare('UPDATE users SET default_role_id = ?, active = ? WHERE id = ?');
  const renameUser = db.prepare('UPDATE users SET name = ? WHERE id = ?');

  const superRole = roleByName.get(SUPER_ADMIN_ROLE);
  const superRoleId = superRole ? superRole.id : null;
  const superUsers = superRoleId === null ? []
    : db.prepare('SELECT id, name FROM users WHERE default_role_id = ? ORDER BY id').all(superRoleId);
  const superUser = superUsers.length === 1 ? superUsers[0] : null;

  const duplicated = findDuplicates(rows, 'Users', report);
  let superRowSeen = false;

  rows.forEach((row, i) => {
    const name = row.name;
    const key = nameKey(name);
    const where = `Users row ${i + 2}`;
    if (!key) { report.problems.push(`${where}: no name - skipped`); return; }
    if (duplicated.has(key)) return;

    const roles = byKey(allRoles, nameKey(row.default_role));
    if (roles.length === 0) { report.unknownRoles.push(`${name}: ${row.default_role || '(blank)'}`); return; }
    if (roles.length > 1) {
      report.problems.push(`${where} "${name}": role "${row.default_role}" matches ${roles.length} roles (${roles.map(r => r.name).join(', ')}) - skipped`);
      return;
    }
    const role = roles[0];

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
        const clash = byKey(allUsers, key).filter(u => u.id !== superUser.id);
        if (clash.length > 0) {
          report.problems.push(`${where} "${name}": that name already belongs to another user - super-admin not renamed`);
          return;
        }
        renameUser.run(name, superUser.id);
        if (nameKey(superUser.name) === key) report.spellingUpdated.push(`${superUser.name} -> ${name}`);
        else report.usersUpdated++;
        superUser.name = name;
      }
      userId = superUser.id;
    } else {
      const matches = byKey(allUsers, key);
      if (matches.length > 1) {
        report.problems.push(`${where} "${name}": matches ${matches.length} existing users (${matches.map(u => u.name).join(', ')}) - skipped`);
        return;
      }
      const existing = matches[0];
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
        if (existing.name !== name) {
          // Found by the key, spelled differently: the sheet's spelling wins
          // (login keys on user_id, not the name).
          renameUser.run(name, existing.id);
          report.spellingUpdated.push(`${existing.name} -> ${name}`);
        }
        if (existing.default_role_id !== role.id || existing.active !== active) {
          updateUser.run(role.id, active, existing.id);
          report.usersUpdated++;
        }
      }
    }

    syncMemberships(db, name, userId, row.site_memberships, report);
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
    `Site memberships: ${report.membershipsAdded} added, ${report.membershipsRemoved} removed`,
  ];
  const section = (title, items) => {
    if (items.length === 0) return;
    lines.push('', `${title} (${items.length}):`, ...items.map(s => `  - ${s}`));
  };
  section('Spelling updated (matched an existing user)', report.spellingUpdated);
  section('WARNING unknown role names - user skipped', report.unknownRoles);
  section('WARNING unresolved site codes - membership skipped', report.unresolvedSites);
  section('WARNING memberships removals skipped (unresolved code)', report.removalsSkipped);
  section('WARNING duplicate names - all rows skipped, fix the sheet', report.duplicateNames);
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

// --- CLI ---

function main(argv) {
  const exportMode = argv[0] === '--export';
  const dirArg = exportMode ? argv[1] : argv[0];
  if (!dirArg) {
    console.error('Usage: node scripts/import-settings.js <folder of tab CSVs>');
    console.error('       node scripts/import-settings.js --export <empty folder>');
    process.exit(1);
  }
  const dir = path.resolve(dirArg);

  // Checked BEFORE connection.js is required, so a bad path never opens (or
  // migrates) the database.
  if (!exportMode && !(fs.existsSync(dir) && fs.statSync(dir).isDirectory())) {
    console.error(`import-settings: ${dir} is not a folder. Export each workbook tab as <TabName>.csv into one folder.`);
    process.exit(1);
  }

  const db = require('../server/db/connection.js');

  if (exportMode) {
    const result = exportIdentity(db, dir);
    if (result.refused) {
      console.error(result.refused);
      process.exit(1);
    }
    console.log(`Exported ${result.roles} role(s) and ${result.users} user(s):`);
    for (const f of result.files) console.log(`  ${f}`);
  } else {
    console.log(`Importing identity tabs from ${dir}\n`);
    console.log(formatReport(importIdentity(db, dir)));
  }
}

if (require.main === module) main(process.argv.slice(2));
