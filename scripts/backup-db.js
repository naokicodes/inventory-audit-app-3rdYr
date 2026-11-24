#!/usr/bin/env node
// One backup of the app's database (Step backup-restore, ADR-105). The restaurant PC's launcher
// runs it at every start, before an update, and at 3 PM and 3 AM.
//
//   node scripts/backup-db.js <backups dir> [label]
//   node scripts/backup-db.js <backups dir> --status   the newest backup here and in the copy folder
//
// Exit 0: backed up (or no database yet). 1: the backup failed. 2: backed up, but the copy to
// BACKUP_COPY_DIR failed.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');
// As server/index.js does: .env from the repo root, wherever this is started from.
if (fs.existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

const { resolveDbPath } = require('../server/db/dbPath.js');
const { runBackup, newestBackup, ageText, sizeText } = require('../server/db/backup.js');

// "C:\Users\x\InventoryApp\backups" -> "InventoryApp\backups"
function shortDir(dir) {
  const abs = path.resolve(dir);
  return path.join(path.basename(path.dirname(abs)), path.basename(abs));
}

function status(dir, copyDir) {
  const local = newestBackup(dir);
  console.log(local
    ? `  Newest backup: ${local.name} (${ageText(local.ageMs)})`
    : '  Newest backup: none yet');
  if (!copyDir) {
    console.log('  Copy folder: none set');
    return;
  }
  const copy = fs.existsSync(copyDir) ? newestBackup(copyDir) : null;
  console.log(copy
    ? `  Copy folder's newest: ${copy.name} (${ageText(copy.ageMs)})`
    : `  Copy folder's newest: none - ${copyDir} ${fs.existsSync(copyDir) ? 'has no backups' : 'is not there'}`);
}

function main() {
  const [dir, label] = process.argv.slice(2);
  if (!dir) {
    console.error('Usage: node scripts/backup-db.js <backups dir> [label]');
    return 1;
  }
  // Resolved against the repo root, as DB_PATH is, so a relative value means the same folder
  // whichever folder a scheduled task starts in.
  const copyDir = process.env.BACKUP_COPY_DIR ? path.resolve(REPO_ROOT, process.env.BACKUP_COPY_DIR) : null;
  if (label === '--status') {
    status(dir, copyDir);
    return 0;
  }

  let result;
  try {
    result = runBackup({
      dbFile: resolveDbPath(process.env.DB_PATH),
      dir,
      label,
      copyDir,
      envFile: ENV_PATH,
    });
  } catch (err) {
    if (err.code === 'NO_DATABASE') {
      console.log('  No database yet - nothing to back up.');
      return 0;
    }
    console.log(`  [X] The backup failed: ${err.message}. Your data is unchanged.`);
    return 1;
  }

  const made = `Backed up to ${path.join(shortDir(dir), result.name)} (${sizeText(result.bytes)})`;
  if (result.copied === true) console.log(`  ${made}; copied to ${copyDir}`);
  else if (result.copied === false) console.log(`  ${made}; not copied: ${result.copyError}`);
  else console.log(`  ${made}`);
  for (const note of result.notes) console.log(`  [!] ${note}`);
  return result.copied === false ? 2 : 0;
}

process.exitCode = main();
