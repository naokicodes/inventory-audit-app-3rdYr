// One-file backups of the Beta database, and putting one back (Step backup-restore, ADR-105,
// Fable F4). Called by scripts/backup-db.js and scripts/restore-db.js, which the restaurant PC's
// launcher runs; everything is here so CI tests it.
//
// runBackup opens the database file directly - never through connection.js, which writes
// (migrations, schema.sql, user_version). VACUUM INTO is a read: phones keep saving while it runs,
// and it copies every committed save, including those still in the -wal file.

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_DAYS = 14;
// beta_2026-11-23_1500.db, or with a label: beta_2026-11-23_1500_before-restore.db
const NAME_RE = /^beta_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(?:_[A-Za-z0-9.-]+)?\.db$/;
const ENV_COPY_NAME = 'env-backup.txt';

function pad(n) {
  return String(n).padStart(2, '0');
}

function stamp(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

// A label keeps letters, digits, dots and dashes only, so a git describe like
// "beta-3.1-4-gabc123" passes through and nothing can leave the backups folder.
function cleanLabel(label) {
  return label ? String(label).replace(/[^A-Za-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '') : '';
}

function backupName(date, label) {
  const l = cleanLabel(label);
  return `beta_${stamp(date)}${l ? `_${l}` : ''}.db`;
}

function isBackupName(name) {
  return NAME_RE.test(name);
}

// The backup's date and time from its name, as local time.
function nameDate(name) {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}

// Calendar days from the name's date to today's (0 = today), by local date.
function ageDays(name, today) {
  const m = NAME_RE.exec(name);
  const then = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((now - then) / DAY_MS);
}

// The keep rule, on names only: every backup of the last 14 days (today and the 13 before it),
// and the earliest backup of each calendar month. Returns the backup names to keep; names that
// are not backups are not in the answer and are never deleted.
function keptNames(names, today = new Date()) {
  const backups = names.filter(isBackupName).sort();
  const firstOfMonth = new Map();
  for (const name of backups) {
    const month = name.slice('beta_'.length, 'beta_YYYY-MM'.length);
    if (!firstOfMonth.has(month)) firstOfMonth.set(month, name);
  }
  const monthly = new Set(firstOfMonth.values());
  return backups.filter((name) => ageDays(name, today) < KEEP_DAYS || monthly.has(name));
}

// Deletes the backups in dir the keep rule drops. Other files are never touched.
function applyKeepRule(dir, today) {
  const names = fs.readdirSync(dir);
  const keep = new Set(keptNames(names, today));
  for (const name of names) {
    if (isBackupName(name) && !keep.has(name)) fs.rmSync(path.join(dir, name), { force: true });
  }
}

// A power cut mid-backup leaves only a .part; the next run deletes it.
function removeStaleParts(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith('.db.part') && isBackupName(name.slice(0, -'.part'.length))) {
      fs.rmSync(path.join(dir, name), { force: true });
    }
  }
}

// Plain words for the failure line; the disk being full is named.
function reason(err) {
  const msg = (err && err.message) || String(err);
  if ((err && err.code === 'ENOSPC') || /disk is full|SQLITE_FULL|ENOSPC/i.test(msg)) return 'the disk is full';
  return msg;
}

// Throws unless the file opens read-only and PRAGMA integrity_check says ok.
function checkIntegrity(file) {
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const rows = db.prepare('PRAGMA integrity_check').all();
    if (rows.length !== 1 || rows[0].integrity_check !== 'ok') {
      throw new Error(`${path.basename(file)} is damaged (integrity check: ${rows.map((r) => r.integrity_check).join('; ')})`);
    }
  } catch (err) {
    if (/is damaged/.test(err.message)) throw err;
    throw new Error(`${path.basename(file)} does not open as a database (${err.message})`);
  } finally {
    if (db) db.close();
  }
}

// Copies src to dest through dest.part, so dest never names a half-written file.
function copyThroughPart(src, dest) {
  const part = `${dest}.part`;
  try {
    fs.copyFileSync(src, part);
    fs.renameSync(part, dest);
  } catch (err) {
    fs.rmSync(part, { force: true });
    throw err;
  }
}

// rename, or copy and delete when the two folders are on different disks.
function moveFile(from, to) {
  try {
    fs.renameSync(from, to);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    fs.copyFileSync(from, to);
    fs.rmSync(from);
  }
}

// One backup of dbFile into dir. Returns { name, file, bytes, copied, copyError }: copied is true,
// false (the local backup stands, the copy failed) or null (no copyDir). Throws when there is no
// database file (err.code 'NO_DATABASE', and nothing is made) or the backup itself failed (no
// file is left under a backup's name).
function runBackup({ dbFile, dir, label, copyDir, envFile, now = new Date(), keepRule = true }) {
  if (!fs.existsSync(dbFile)) {
    const err = new Error('No database yet - nothing to back up.');
    err.code = 'NO_DATABASE';
    throw err;
  }
  fs.mkdirSync(dir, { recursive: true });
  removeStaleParts(dir);

  // Never over an existing backup: a second one in the same minute (say, undoing a restore at
  // once) would replace the very file being restored.
  let name = backupName(now, label);
  for (let i = 2; fs.existsSync(path.join(dir, name)); i++) {
    name = backupName(now, cleanLabel(label) ? `${cleanLabel(label)}-${i}` : String(i));
  }
  const file = path.join(dir, name);
  const part = `${file}.part`;
  try {
    const src = new DatabaseSync(dbFile);
    try {
      src.exec('PRAGMA busy_timeout = 5000');
      src.prepare('VACUUM INTO ?').run(part);
    } finally {
      src.close();
    }
    checkIntegrity(part);
    fs.renameSync(part, file);
  } catch (err) {
    fs.rmSync(part, { force: true });
    const failed = new Error(reason(err));
    failed.code = 'BACKUP_FAILED';
    throw failed;
  }
  if (keepRule) applyKeepRule(dir, now);

  // .env holds the tokens, the admin password and the cookie secret: next to the backups on
  // this PC only, never in the copy folder.
  if (envFile && fs.existsSync(envFile)) fs.copyFileSync(envFile, path.join(dir, ENV_COPY_NAME));

  const result = { name, file, bytes: fs.statSync(file).size, copied: null, copyError: null };
  if (copyDir) {
    try {
      if (!fs.existsSync(copyDir) || !fs.statSync(copyDir).isDirectory()) {
        throw new Error(`the copy folder ${copyDir} is not there`);
      }
      removeStaleParts(copyDir);
      copyThroughPart(file, path.join(copyDir, name));
      if (keepRule) applyKeepRule(copyDir, now);
      result.copied = true;
    } catch (err) {
      result.copied = false;
      result.copyError = reason(err);
    }
  }
  return result;
}

function backupsIn(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(isBackupName)
    .map((name) => {
      const file = path.join(dir, name);
      const st = fs.statSync(file);
      return { name, file, bytes: st.size, date: nameDate(name), mtimeMs: st.mtimeMs };
    })
    // Newest first by the name's minute; within one minute, by when the file was written.
    .sort((a, b) => (b.date - a.date) || (b.mtimeMs - a.mtimeMs));
}

// What restore offers: the local backups newest first, then any in the copy folder that are not
// local (so a new PC can restore from the copy), each newest first.
function listBackups({ backupsDir, copyDir }) {
  const local = backupsIn(backupsDir).map((b) => ({ ...b, where: 'local' }));
  const have = new Set(local.map((b) => b.name));
  const copies = backupsIn(copyDir).filter((b) => !have.has(b.name)).map((b) => ({ ...b, where: 'copy' }));
  return [...local, ...copies];
}

// The newest backup in dir and how old it is, or null.
function newestBackup(dir, now = new Date()) {
  const [newest] = backupsIn(dir);
  if (!newest) return null;
  return { ...newest, ageMs: now - newest.date };
}

function ageText(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return minutes <= 1 ? 'just now' : `${minutes} minutes old`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return hours === 1 ? '1 hour old' : `${hours} hours old`;
  return `${Math.round(hours / 24)} days old`;
}

function sizeText(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function freeFolderName(base) {
  if (!fs.existsSync(base)) return base;
  for (let i = 2; ; i++) if (!fs.existsSync(`${base}-${i}`)) return `${base}-${i}`;
}

// Puts the backup `from` back as dbFile. Refuses a file that fails the integrity check before
// anything moves. Then: a backup of the current data labelled before-restore; the current
// database and its -wal and -shm moved into backupsDir\replaced_<stamp>\ (never deleted); the
// chosen backup copied in. Returns { restored, beforeRestore, replacedDir }.
function restoreBackup({ from, dbFile, backupsDir, now = new Date() }) {
  let beforeRestore = null;
  try {
    if (!fs.existsSync(from)) throw new Error(`${path.basename(from)} is not there`);
    checkIntegrity(from);
    if (fs.existsSync(dbFile)) {
      // No keep rule here: it could delete the very backup being restored.
      try {
        beforeRestore = runBackup({ dbFile, dir: backupsDir, label: 'before-restore', now, keepRule: false }).name;
      } catch (err) {
        throw new Error(`the backup of the current data failed first (${err.message})`);
      }
    }
  } catch (err) {
    const refused = new Error(`${err.message}. Nothing was changed.`);
    refused.code = 'REFUSED';
    throw refused;
  }

  const replacedDir = freeFolderName(path.join(backupsDir, `replaced_${stamp(now)}`));
  const moved = [];
  try {
    moveAside(dbFile, replacedDir, moved);
    copyThroughPart(from, dbFile);
  } catch (err) {
    // Put back whatever was moved, so the app finds its data where it was.
    for (const [f, to] of moved.reverse()) {
      try { moveFile(to, f); } catch { /* left in replacedDir; the message names it */ }
    }
    throw new Error(`the restore failed: ${reason(err)}. Your current data is in its place or in ${replacedDir}.`);
  }
  return { restored: path.basename(from), beforeRestore, replacedDir: moved.length ? replacedDir : null };
}

// Moves dbFile and its -wal and -shm, whichever exist, into replacedDir (never deletes them).
// Records each [from, to] in `moved`. The before-restore backup's own connection usually tidies
// the -wal and -shm away when it closes (their saves are in beta.db by then), so often only
// beta.db is left to move.
function moveAside(dbFile, replacedDir, moved = []) {
  for (const suffix of ['', '-wal', '-shm']) {
    const f = `${dbFile}${suffix}`;
    if (!fs.existsSync(f)) continue;
    fs.mkdirSync(replacedDir, { recursive: true });
    const to = path.join(replacedDir, path.basename(f));
    moveFile(f, to);
    moved.push([f, to]);
  }
  return moved;
}

module.exports = {
  backupName,
  isBackupName,
  keptNames,
  runBackup,
  restoreBackup,
  moveAside,
  listBackups,
  newestBackup,
  ageText,
  sizeText,
  ENV_COPY_NAME,
};
