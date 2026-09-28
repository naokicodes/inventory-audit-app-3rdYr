// Which database file this process uses, and whether a reset may touch it.
// Side-effect free on purpose: seed.js --reset checks the refusal BEFORE
// requiring connection.js (which opens and migrates the file), and the
// tests exercise the refusal without going near the live database.
//
// Step reseed-beta-db (2026-09-27, #12): DB_PATH selects the file, resolved
// against the working directory, so Beta can run on a disposable beta.db.
// Unset = the live inventory.db, exactly as before this step.

const path = require('path');

const LIVE_DB_PATH = path.join(__dirname, 'inventory.db');

function resolveDbPath(envDbPath = process.env.DB_PATH) {
  return envDbPath ? path.resolve(envDbPath) : LIVE_DB_PATH;
}

function samePath(a, b, platform = process.platform) {
  // Windows paths are case-insensitive: "INVENTORY.DB" is the live file too.
  return platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

// Returns a refusal message, or null if a reset may run. A reset needs
// DB_PATH set explicitly AND resolving to something other than the live file.
function reseedRefusal(envDbPath = process.env.DB_PATH, platform = process.platform) {
  if (!envDbPath) {
    return 'reseed refused: DB_PATH is not set. Reseed only runs against a non-live database, e.g. DB_PATH=server/db/beta.db npm run reseed';
  }
  if (samePath(path.resolve(envDbPath), LIVE_DB_PATH, platform)) {
    return `reseed refused: DB_PATH resolves to the live database (${LIVE_DB_PATH}). Point it at a disposable file such as server/db/beta.db.`;
  }
  return null;
}

module.exports = { LIVE_DB_PATH, resolveDbPath, reseedRefusal };
