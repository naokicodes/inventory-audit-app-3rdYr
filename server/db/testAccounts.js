// Step test-accounts (ADR-039): fake "Test ..." accounts for phone
// click-throughs and dev databases. Created by `npm run seed:test`, which the
// previews run right after the reseed. The accounts NEVER reach the live
// inventory.db or beta.db - Beta must stay free of test users (ADR-039), so
// the refusal here is stricter than reseedRefusal, which allows beta.db.
//
// Side-effect free on purpose, like reseedRefusal in dbPath.js: the script
// checks the refusal BEFORE requiring connection.js (which opens and migrates
// the file), and the tests exercise the refusal without going near a database.

const path = require('path');
const { LIVE_DB_PATH, resolveDbPath } = require('./dbPath.js');
const { resolveSiteCode } = require('./siteAccess.js');

// The seed's sites are RA, FC (restaurants) and COM-A (commissary). Later
// steps add their own accounts (role-assignments: Test Supervisor RA).
const TEST_ACCOUNTS = [
  { name: 'Test Admin',        role: 'admin',      sites: [] },           // bypass
  { name: 'Test Management',   role: 'management', sites: [] },           // bypass
  { name: 'Test Head Chef RA', role: 'head-chef',  sites: ['RA'] },
  { name: 'Test Head Chef FC', role: 'head-chef',  sites: ['FC'] },
  { name: 'Test Counter RA',   role: 'checker',    sites: ['RA'] },
  { name: 'Test Counter FC',   role: 'checker',    sites: ['FC'] },
  { name: 'Test Commi',        role: 'checker',    sites: ['COM-A'] },
  { name: 'Test Floater',      role: 'checker',    sites: ['RA', 'FC'] },
  { name: 'Test No Sites',     role: 'checker',    sites: [] },
];

// Same case rule as dbPath.js samePath: Windows paths are case-insensitive.
function samePath(a, b, platform) {
  return platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

// Returns a refusal message, or null if the seed may run. Refuses an unset
// DB_PATH, the live inventory.db (resolved via dbPath.js), and any file named
// beta.db in any folder - test accounts must not reach Beta (ADR-039).
function testAccountsRefusal(envDbPath = process.env.DB_PATH, platform = process.platform) {
  if (!envDbPath) {
    return 'seed:test refused: DB_PATH is not set. Test accounts only go on a non-live database, e.g. DB_PATH=server/db/preview.db npm run seed:test';
  }
  const resolved = resolveDbPath(envDbPath);
  if (samePath(resolved, LIVE_DB_PATH, platform)) {
    return `seed:test refused: DB_PATH resolves to the live database (${LIVE_DB_PATH}). Test accounts never go on the live file.`;
  }
  if (path.basename(resolved).toLowerCase() === 'beta.db') {
    return 'seed:test refused: DB_PATH points at beta.db. Test accounts must not reach Beta (ADR-039); use a disposable file such as preview.db or dev.db.';
  }
  return null;
}

// Upsert the TEST_ACCOUNTS by name (default role, active 1) and add any
// missing site memberships. Idempotent: a second run adds nothing. A site
// code that does not resolve is warned about and skipped. Only ever touches
// users whose name starts with "Test " - super-admin and real people are
// never changed. Returns { users, memberships, skipped } counting only the
// rows this run created (and the site codes it skipped).
function ensureTestAccounts(db) {
  const roleIdByName = name => {
    const row = db.prepare('SELECT id FROM roles WHERE name = ?').get(name);
    if (!row) throw new Error(`ensureTestAccounts: role "${name}" is not seeded`);
    return row.id;
  };
  const findUser = db.prepare('SELECT id FROM users WHERE name = ?');
  const insertUser = db.prepare('INSERT INTO users (name, default_role_id, active) VALUES (?, ?, 1)');
  const updateUser = db.prepare('UPDATE users SET default_role_id = ?, active = 1 WHERE id = ?');
  const findMembership = db.prepare('SELECT 1 FROM user_sites WHERE user_id = ? AND site_code = ?');
  const insertMembership = db.prepare('INSERT INTO user_sites (user_id, site_code) VALUES (?, ?)');

  let users = 0, memberships = 0, skipped = 0;

  for (const account of TEST_ACCOUNTS) {
    // Defensive: the function only ever touches "Test " users, so even an
    // edited list cannot reach super-admin or a real person's row.
    if (!account.name.startsWith('Test ')) {
      console.warn(`ensureTestAccounts: "${account.name}" does not start with "Test " - skipped`);
      continue;
    }
    const roleId = roleIdByName(account.role);
    const existing = findUser.get(account.name);
    let userId;
    if (existing) {
      updateUser.run(roleId, existing.id);
      userId = existing.id;
    } else {
      userId = insertUser.run(account.name, roleId).lastInsertRowid;
      users++;
    }

    for (const code of account.sites) {
      if (resolveSiteCode(db, code) === null) {
        console.warn(`ensureTestAccounts: site code "${code}" for "${account.name}" does not resolve - skipped`);
        skipped++;
        continue;
      }
      if (!findMembership.get(userId, code)) {
        insertMembership.run(userId, code);
        memberships++;
      }
    }
  }

  return { users, memberships, skipped };
}

module.exports = { TEST_ACCOUNTS, testAccountsRefusal, ensureTestAccounts };
