#!/usr/bin/env node
// Puts a backup back (Step backup-restore, ADR-105). The restaurant PC's launcher runs it for
// `restaurant-pc.bat restore`, only while the app is closed.
//
//   node scripts/restore-db.js <backups dir>
//
// Lists the backups newest first (the local ones, then any in BACKUP_COPY_DIR that are not local),
// asks for a number (Enter cancels) and restores that one. Exit 0: restored or cancelled. 1: refused
// or failed.

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const REPO_ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');
// As server/index.js does: .env from the repo root, wherever this is started from.
if (fs.existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

const { resolveDbPath } = require('../server/db/dbPath.js');
const { listBackups, restoreBackup, sizeText } = require('../server/db/backup.js');

function pad(n) {
  return String(n).padStart(2, '0');
}

function when(date) {
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()];
  return `${date.getDate()} ${month} ${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
      rl.close();
    });
    // Input closed with no answer (Ctrl+C, or nothing typed): cancel.
    rl.on('close', () => resolve(''));
  });
}

async function main() {
  const [dir] = process.argv.slice(2);
  if (!dir) {
    console.error('Usage: node scripts/restore-db.js <backups dir>');
    return 1;
  }
  const copyDir = process.env.BACKUP_COPY_DIR || null;
  const backups = listBackups({ backupsDir: dir, copyDir });
  if (backups.length === 0) {
    console.log(`  There are no backups in ${dir}${copyDir ? ` or ${copyDir}` : ''}. Nothing was changed.`);
    return 1;
  }

  console.log('');
  console.log('  Backups, newest first:');
  backups.forEach((b, i) => {
    const where = b.where === 'copy' ? '   (copy folder)' : '';
    console.log(`  ${String(i + 1).padStart(3)}. ${when(b.date)}   ${sizeText(b.bytes).padStart(8)}   ${b.name}${where}`);
  });
  console.log('');
  const answer = await ask('  Which one to restore (a number), or Enter to cancel: ');
  if (answer === '') {
    console.log('  Cancelled. Nothing was changed.');
    return 0;
  }
  const n = Number(answer);
  if (!Number.isInteger(n) || n < 1 || n > backups.length) {
    console.log(`  [X] "${answer}" is not one of the numbers. Nothing was changed.`);
    return 1;
  }

  const chosen = backups[n - 1];
  try {
    restoreBackup({ from: chosen.file, dbFile: resolveDbPath(process.env.DB_PATH), backupsDir: dir });
  } catch (err) {
    console.log(`  [X] Not restored: ${err.message}`);
    return 1;
  }
  console.log(`  Restored ${chosen.name}. To undo, run restore again and pick the before-restore backup.`);
  return 0;
}

main().then((code) => { process.exitCode = code; });
