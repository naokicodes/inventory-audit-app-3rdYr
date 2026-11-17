// Which database file this process uses, and whether a reset may touch it.
// Side-effect free on purpose: seed.js --reset checks the refusal BEFORE
// requiring connection.js (which opens and migrates the file), and the
// tests exercise the refusal without going near the live database.
//
// Step reseed-beta-db (2026-09-27, #12): DB_PATH selects the file, so Beta
// can run on its own beta.db. Unset = the live inventory.db, as before.
//
// Step db-start (ADR-105, Fable F10): a relative DB_PATH is resolved against
// the repo root, not the working directory, so the same .env line means the
// same file wherever the app is started from (a Startup shortcut, a
// scheduled task). PERM-18: one samePath for both seed guards, and reseed
// refuses beta.db too.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LIVE_DB_PATH = path.join(__dirname, 'inventory.db');
const BETA_DB_PATH = path.join(__dirname, 'beta.db');

function resolveDbPath(envDbPath = process.env.DB_PATH) {
  return envDbPath ? path.resolve(REPO_ROOT, envDbPath) : LIVE_DB_PATH;
}

// Windows ignores full stops and spaces at the end of a file name, so
// "inventory.db." and "inventory.db " open inventory.db itself.
function trimTrailingDotsAndSpaces(p) {
  return p.replace(/[. ]+$/, '');
}

// A ":" anywhere but right after a drive letter ("C:") names a Windows
// alternate data stream of some file - never a database a seed should touch.
function hasColonAfterDrive(p) {
  const rest = /^[A-Za-z]:/.test(p) ? p.slice(2) : p;
  return rest.includes(':');
}

// Do two resolved paths name the same file? Windows paths are case-insensitive
// ("INVENTORY.DB" is the live file too) and drop trailing full stops and
// spaces. A path with a ":" after its drive letter always counts as a match,
// so a guard refuses it rather than letting it through.
function samePath(a, b, platform = process.platform) {
  if (hasColonAfterDrive(a) || hasColonAfterDrive(b)) return true;
  const x = trimTrailingDotsAndSpaces(a);
  const y = trimTrailingDotsAndSpaces(b);
  return platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}

// Is this resolved path a beta.db, in any folder and any letter case?
function isBetaDb(resolved) {
  return path.basename(trimTrailingDotsAndSpaces(resolved)).toLowerCase() === 'beta.db';
}

// Returns a refusal message, or null if a reset may run. A reset needs
// DB_PATH set explicitly, resolving to neither the live file nor a beta.db.
function reseedRefusal(envDbPath = process.env.DB_PATH, platform = process.platform) {
  if (!envDbPath) {
    return 'reseed refused: DB_PATH is not set. Reseed only runs against a disposable database, e.g. DB_PATH=server/db/dev.db npm run reseed';
  }
  const resolved = resolveDbPath(envDbPath);
  if (hasColonAfterDrive(resolved)) {
    return `reseed refused: DB_PATH has a ":" after the drive letter (${resolved}). Point it at a disposable file such as server/db/dev.db.`;
  }
  if (samePath(resolved, LIVE_DB_PATH, platform)) {
    return `reseed refused: DB_PATH resolves to the live database (${LIVE_DB_PATH}). Point it at a disposable file such as server/db/dev.db.`;
  }
  if (isBetaDb(resolved)) {
    return "Reseed never runs on beta.db: Beta's data lives there.";
  }
  return null;
}

// dev + ino of a file, or null if it does not exist. bigint, because an NTFS
// file index does not fit a double.
function fileIdentity(file) {
  try {
    const s = fs.statSync(file, { bigint: true });
    return { dev: s.dev, ino: s.ino };
  } catch {
    return null;
  }
}

function sameFile(a, b, idA, idB) {
  if (idA.dev !== idB.dev) return false;
  // A file system with no file ids (ino 0) cannot tell files apart that way:
  // compare the real paths instead.
  if (idA.ino === 0n || idB.ino === 0n) {
    return samePath(fs.realpathSync.native(a), fs.realpathSync.native(b));
  }
  return idA.ino === idB.ino;
}

// The second guard, once the database is open: the file SQLite actually
// opened (PRAGMA database_list) is compared by identity with the live
// inventory.db and server/db/beta.db, whichever exist. Catches any spelling
// the path checks above miss. Returns a refusal message, or null.
function openedFileRefusal(db, label, protectedFiles = [LIVE_DB_PATH, BETA_DB_PATH]) {
  const row = db.prepare("SELECT file FROM pragma_database_list WHERE name = 'main'").get();
  const opened = row && row.file;
  const openedId = opened ? fileIdentity(opened) : null;
  if (!openedId) return null;
  for (const file of protectedFiles) {
    const id = fileIdentity(file);
    if (id && sameFile(opened, file, openedId, id)) {
      return `${label} refused: the database it opened (${opened}) is ${file}.`;
    }
  }
  return null;
}

module.exports = {
  REPO_ROOT,
  LIVE_DB_PATH,
  BETA_DB_PATH,
  resolveDbPath,
  samePath,
  hasColonAfterDrive,
  isBetaDb,
  reseedRefusal,
  openedFileRefusal,
};
