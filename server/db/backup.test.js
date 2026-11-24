// Step backup-restore (ADR-105, Fable F4): one-file backups and putting one back. Temp files
// only - never server/db/inventory.db or beta.db.
const { DatabaseSync } = require('node:sqlite');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  backupName, isBackupName, keptNames, runBackup, restoreBackup, moveAside, listBackups, newestBackup, ageText, ENV_COPY_NAME,
} = require('./backup.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

console.log('Backup / Restore Tests\n');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
let n = 0;
function freshDir(name) {
  const d = path.join(ROOT, `${name}-${++n}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// A WAL database like the app's, with rows 1 and 2 committed. Returns the open connection:
// with autocheckpoint off and the connection open, the rows stay in the -wal file.
function makeDb(dir) {
  const dbFile = path.join(dir, 'beta.db');
  const db = new DatabaseSync(dbFile);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA wal_autocheckpoint = 0');
  db.exec('CREATE TABLE counts (id INTEGER PRIMARY KEY, qty INTEGER)');
  db.exec('INSERT INTO counts (qty) VALUES (10), (20)');
  return { dbFile, db };
}

function rowsOf(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db.prepare('SELECT qty FROM counts ORDER BY id').all().map((r) => r.qty);
  } finally {
    db.close();
  }
}

const NOW = new Date(2026, 10, 23, 15, 0); // 23 Nov 2026, 3:00 PM local

test('backupName: beta_<YYYY-MM-DD_HHmm>.db, with an optional label', () => {
  assert.strictEqual(backupName(new Date(2026, 0, 5, 3, 7)), 'beta_2026-01-05_0307.db');
  assert.strictEqual(backupName(NOW, 'before-restore'), 'beta_2026-11-23_1500_before-restore.db');
  assert.strictEqual(backupName(NOW, 'before-update-from-beta-3.1-4-gabc123'),
    'beta_2026-11-23_1500_before-update-from-beta-3.1-4-gabc123.db');
  assert.strictEqual(backupName(NOW, '..\\x/y'), 'beta_2026-11-23_1500_..-x-y.db');
  assert.ok(isBackupName(backupName(NOW, 'before-restore')));
  assert.ok(!isBackupName('beta_2026-11-23_1500.db.part'));
});

test('a backup taken while another connection holds an uncommitted write has the committed rows only and does not wait', () => {
  const dir = freshDir('busy');
  const { dbFile, db } = makeDb(dir);
  const writer = new DatabaseSync(dbFile);
  writer.exec('BEGIN IMMEDIATE');
  writer.exec('INSERT INTO counts (qty) VALUES (99)');
  const t0 = Date.now();
  const r = runBackup({ dbFile, dir: path.join(dir, 'backups'), now: NOW });
  const ms = Date.now() - t0;
  writer.exec('ROLLBACK');
  writer.close();
  db.close();
  assert.ok(ms < 2000, `took ${ms} ms`);
  assert.deepStrictEqual(rowsOf(r.file), [10, 20]);
});

test('rows still in the -wal (not checkpointed) are in the backup; integrity ok and no .part left', () => {
  const dir = freshDir('wal');
  const { dbFile, db } = makeDb(dir);
  db.exec('INSERT INTO counts (qty) VALUES (30)');
  assert.ok(fs.statSync(`${dbFile}-wal`).size > 0, 'the rows should still be in the -wal');
  const backups = path.join(dir, 'backups');
  const r = runBackup({ dbFile, dir: backups, now: NOW });
  db.close();
  assert.strictEqual(r.name, 'beta_2026-11-23_1500.db');
  assert.deepStrictEqual(rowsOf(r.file), [10, 20, 30]);
  const check = new DatabaseSync(r.file, { readOnly: true });
  assert.strictEqual(check.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  check.close();
  assert.deepStrictEqual(fs.readdirSync(backups).filter((f) => f.endsWith('.part')), []);
  assert.deepStrictEqual(fs.readdirSync(backups).filter((f) => /-wal$|-shm$/.test(f)), [], 'one file per backup');
  assert.strictEqual(r.copied, null);
});

test('a missing database file is refused and makes no file', () => {
  const dir = freshDir('missing');
  const backups = path.join(dir, 'backups');
  assert.throws(() => runBackup({ dbFile: path.join(dir, 'beta.db'), dir: backups, now: NOW }), (err) => err.code === 'NO_DATABASE');
  assert.ok(!fs.existsSync(backups));
  assert.ok(!fs.existsSync(path.join(dir, 'beta.db')), 'opening must not create the database');
});

test('a failed backup leaves no file under a backup name and names the reason', () => {
  const dir = freshDir('fail');
  const dbFile = path.join(dir, 'beta.db');
  fs.writeFileSync(dbFile, 'this is not a database, just text '.repeat(200));
  const backups = path.join(dir, 'backups');
  assert.throws(() => runBackup({ dbFile, dir: backups, now: NOW }), (err) => err.code === 'BACKUP_FAILED' && err.message.length > 0);
  assert.deepStrictEqual(fs.readdirSync(backups), []);
});

test('a .part left by a power cut is deleted by the next run; other files stay', () => {
  const dir = freshDir('part');
  const { dbFile, db } = makeDb(dir);
  const backups = path.join(dir, 'backups');
  fs.mkdirSync(backups);
  const stale = path.join(backups, 'beta_2026-11-22_0300.db.part');
  fs.writeFileSync(stale, 'half');
  const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  fs.utimesSync(stale, anHourAgo, anHourAgo);
  fs.writeFileSync(path.join(backups, 'last-backup.log'), 'log');
  runBackup({ dbFile, dir: backups, now: NOW });
  db.close();
  assert.deepStrictEqual(fs.readdirSync(backups).sort(), ['beta_2026-11-23_1500.db', 'last-backup.log']);
});

test('two backups at once never share a name or a .part: a fresh .part is another run\'s and is left alone', () => {
  const dir = freshDir('together');
  const { dbFile, db } = makeDb(dir);
  const backups = path.join(dir, 'backups');
  fs.mkdirSync(backups);
  const running = path.join(backups, 'beta_2026-11-23_1500.db.part');
  fs.writeFileSync(running, ''); // the 3 PM task, claimed a moment ago
  const r = runBackup({ dbFile, dir: backups, now: NOW });
  db.close();
  assert.strictEqual(r.name, 'beta_2026-11-23_1500_2.db');
  assert.ok(fs.existsSync(running), 'the other run\'s .part is not deleted');
  assert.deepStrictEqual(rowsOf(r.file), [10, 20]);
  assert.deepStrictEqual(r.notes, []);
});

test('keptNames on 70 days of names keeps the last 14 days plus the first of each older month, and ignores other names', () => {
  const names = [];
  for (let d = 0; d < 70; d++) {
    const day = new Date(2026, 10, 23 - d);
    names.push(backupName(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 3, 0)));
    names.push(backupName(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 15, 0)));
  }
  names.push('last-backup.log', ENV_COPY_NAME, 'beta_today.db', 'replaced_2026-11-01_1200', 'beta_2026-11-01_0100.db.part');
  const kept = keptNames(names, NOW);
  const recent = names.filter((x) => isBackupName(x) && x >= 'beta_2026-11-10');
  assert.strictEqual(recent.length, 28);
  const expected = [...recent, 'beta_2026-09-15_0300.db', 'beta_2026-10-01_0300.db', 'beta_2026-11-01_0300.db'].sort();
  assert.deepStrictEqual([...kept].sort(), expected);
  assert.ok(!kept.includes('beta_2026-11-09_1500.db'), '14 days old is dropped');
  assert.ok(!kept.includes('last-backup.log'));
});

test('the keep rule deletes dropped backups and never other files', () => {
  const dir = freshDir('keep');
  const { dbFile, db } = makeDb(dir);
  const backups = path.join(dir, 'backups');
  fs.mkdirSync(backups);
  for (const f of ['beta_2026-10-01_0300.db', 'beta_2026-10-02_0300.db', 'beta_2026-11-20_0300.db', 'notes.txt']) {
    fs.writeFileSync(path.join(backups, f), 'x');
  }
  runBackup({ dbFile, dir: backups, now: NOW });
  db.close();
  assert.deepStrictEqual(fs.readdirSync(backups).sort(),
    ['beta_2026-10-01_0300.db', 'beta_2026-11-20_0300.db', 'beta_2026-11-23_1500.db', 'notes.txt']);
});

test('the copy folder gets the file and its own keep rule', () => {
  const dir = freshDir('copy');
  const { dbFile, db } = makeDb(dir);
  const copyDir = path.join(dir, 'copy');
  fs.mkdirSync(copyDir);
  fs.writeFileSync(path.join(copyDir, 'beta_2026-10-02_0300.db'), 'old');
  fs.writeFileSync(path.join(copyDir, 'beta_2026-10-01_0300.db'), 'first of the month');
  const half = path.join(copyDir, 'beta_2026-11-23_0300.db.part');
  fs.writeFileSync(half, 'half');
  fs.utimesSync(half, new Date(Date.now() - 3600000), new Date(Date.now() - 3600000));
  fs.writeFileSync(path.join(copyDir, 'desktop.ini'), 'drive');
  const r = runBackup({ dbFile, dir: path.join(dir, 'backups'), copyDir, now: NOW });
  db.close();
  assert.strictEqual(r.copied, true);
  assert.deepStrictEqual(fs.readdirSync(copyDir).sort(), ['beta_2026-10-01_0300.db', 'beta_2026-11-23_1500.db', 'desktop.ini']);
  assert.deepStrictEqual(rowsOf(path.join(copyDir, r.name)), [10, 20]);
});

test('a copy folder that cannot be written gives copied: false and keeps the local backup', () => {
  const dir = freshDir('nocopy');
  const { dbFile, db } = makeDb(dir);
  const missing = runBackup({ dbFile, dir: path.join(dir, 'backups'), copyDir: path.join(dir, 'E-drive-unplugged'), now: NOW });
  const aFile = path.join(dir, 'a-file');
  fs.writeFileSync(aFile, 'x');
  const notAFolder = runBackup({ dbFile, dir: path.join(dir, 'backups2'), copyDir: aFile, now: NOW });
  db.close();
  for (const r of [missing, notAFolder]) {
    assert.strictEqual(r.copied, false);
    assert.ok(r.copyError.length > 0);
    assert.deepStrictEqual(rowsOf(r.file), [10, 20]);
  }
  assert.ok(!fs.existsSync(path.join(dir, 'E-drive-unplugged')), 'a missing copy folder is not created');
});

test('.env is copied next to the backups (the newest only) and never to the copy folder', () => {
  const dir = freshDir('env');
  const { dbFile, db } = makeDb(dir);
  const envFile = path.join(dir, '.env');
  const backups = path.join(dir, 'backups');
  const copyDir = path.join(dir, 'copy');
  fs.mkdirSync(copyDir);
  fs.writeFileSync(envFile, 'ADMIN_PASSWORD=old\n');
  runBackup({ dbFile, dir: backups, copyDir, envFile, now: NOW });
  fs.writeFileSync(envFile, 'ADMIN_PASSWORD=new\n');
  runBackup({ dbFile, dir: backups, copyDir, envFile, now: new Date(2026, 10, 23, 15, 5) });
  db.close();
  assert.strictEqual(fs.readFileSync(path.join(backups, ENV_COPY_NAME), 'utf8'), 'ADMIN_PASSWORD=new\n');
  assert.deepStrictEqual(fs.readdirSync(copyDir).filter((f) => !isBackupName(f)), []);
});

test('a second backup in the same minute gets its own name, never over the first', () => {
  const dir = freshDir('same');
  const { dbFile, db } = makeDb(dir);
  const backups = path.join(dir, 'backups');
  const a = runBackup({ dbFile, dir: backups, label: 'before-restore', now: NOW });
  const b = runBackup({ dbFile, dir: backups, label: 'before-restore', now: NOW });
  const c = runBackup({ dbFile, dir: backups, now: NOW });
  const d = runBackup({ dbFile, dir: backups, now: NOW });
  db.close();
  assert.deepStrictEqual([a.name, b.name, c.name, d.name], [
    'beta_2026-11-23_1500_before-restore.db', 'beta_2026-11-23_1500_before-restore-2.db',
    'beta_2026-11-23_1500.db', 'beta_2026-11-23_1500_2.db',
  ]);
});

test('restore moves the three files aside, makes the before-restore backup, and the restored file reads the backup\'s rows', () => {
  const dir = freshDir('restore');
  const { dbFile, db } = makeDb(dir);
  const backups = path.join(dir, 'backups');
  const old = runBackup({ dbFile, dir: backups, now: new Date(2026, 10, 22, 3, 0) });
  db.exec('INSERT INTO counts (qty) VALUES (30)'); // a test count, after the backup
  db.close();
  const before = rowsOf(dbFile);
  assert.deepStrictEqual(before, [10, 20, 30]);
  // The app's three files, as a stopped app can leave them: beta.db, -wal and -shm.
  fs.writeFileSync(`${dbFile}-wal`, '');
  fs.writeFileSync(`${dbFile}-shm`, '');

  const r = restoreBackup({ from: old.file, dbFile, backupsDir: backups, now: NOW });
  assert.strictEqual(r.restored, 'beta_2026-11-22_0300.db');
  assert.strictEqual(r.beforeRestore, 'beta_2026-11-23_1500_before-restore.db');
  assert.deepStrictEqual(rowsOf(dbFile), [10, 20], 'the test count is gone');
  assert.deepStrictEqual(rowsOf(path.join(backups, r.beforeRestore)), before, 'the before-restore backup has the count');
  assert.strictEqual(r.replacedDir, path.join(backups, 'replaced_2026-11-23_1500'));
  // The before-restore backup's connection tidies the -wal and -shm into beta.db on close, so
  // beta.db is what is left to move here; moveAside's own test below moves all three.
  assert.ok(fs.readdirSync(r.replacedDir).includes('beta.db'));
  assert.deepStrictEqual(rowsOf(path.join(r.replacedDir, 'beta.db')), before, 'the replaced data is kept, never deleted');
  assert.ok(!fs.existsSync(`${dbFile}-wal`) && !fs.existsSync(`${dbFile}-shm`));

  // Undo at once: the before-restore backup comes back, and nothing is overwritten.
  const undo = restoreBackup({ from: path.join(backups, r.beforeRestore), dbFile, backupsDir: backups, now: NOW });
  assert.deepStrictEqual(rowsOf(dbFile), before);
  assert.strictEqual(undo.beforeRestore, 'beta_2026-11-23_1500_before-restore-2.db');
  assert.strictEqual(undo.replacedDir, path.join(backups, 'replaced_2026-11-23_1500-2'));
});

test('moveAside moves beta.db, beta.db-wal and beta.db-shm into the replaced folder and deletes none', () => {
  const dir = freshDir('aside');
  const dbFile = path.join(dir, 'beta.db');
  fs.writeFileSync(dbFile, 'db');
  fs.writeFileSync(`${dbFile}-wal`, 'wal');
  fs.writeFileSync(`${dbFile}-shm`, 'shm');
  const replaced = path.join(dir, 'backups', 'replaced_2026-11-23_1500');
  const moved = moveAside(dbFile, replaced);
  assert.strictEqual(moved.length, 3);
  assert.deepStrictEqual(fs.readdirSync(replaced).sort(), ['beta.db', 'beta.db-shm', 'beta.db-wal']);
  assert.strictEqual(fs.readFileSync(path.join(replaced, 'beta.db-wal'), 'utf8'), 'wal');
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['backups']);
});

test('a damaged chosen file is refused before anything moves', () => {
  const dir = freshDir('damaged');
  const { dbFile, db } = makeDb(dir);
  const backups = path.join(dir, 'backups');
  const good = runBackup({ dbFile, dir: backups, now: new Date(2026, 10, 22, 3, 0) });
  db.close();
  const damaged = path.join(backups, 'beta_2026-11-21_0300.db');
  const bytes = fs.readFileSync(good.file);
  bytes.fill(0xff, 100, bytes.length);
  fs.writeFileSync(damaged, bytes);
  const text = path.join(backups, 'beta_2026-11-20_0300.db');
  fs.writeFileSync(text, 'not a database at all '.repeat(100));
  const listing = fs.readdirSync(backups).sort();
  for (const from of [damaged, text]) {
    assert.throws(() => restoreBackup({ from, dbFile, backupsDir: backups, now: NOW }),
      (err) => err.code === 'REFUSED' && /Nothing was changed/.test(err.message));
  }
  assert.deepStrictEqual(rowsOf(dbFile), [10, 20]);
  assert.deepStrictEqual(fs.readdirSync(backups).sort(), listing, 'no before-restore backup, no replaced folder');
});

test('a restore that fails after the current files were moved aside puts them back', () => {
  const dir = freshDir('putback');
  const { dbFile, db } = makeDb(dir);
  const backups = path.join(dir, 'backups');
  const old = runBackup({ dbFile, dir: backups, now: new Date(2026, 10, 22, 3, 0) });
  db.exec('INSERT INTO counts (qty) VALUES (30)');
  db.close();
  fs.mkdirSync(`${dbFile}.part`); // the copy-in step cannot write its .part
  assert.throws(() => restoreBackup({ from: old.file, dbFile, backupsDir: backups, now: NOW }),
    (err) => /the restore failed/.test(err.message));
  assert.deepStrictEqual(rowsOf(dbFile), [10, 20, 30], 'the current data is back where it was');
  assert.deepStrictEqual(fs.readdirSync(path.join(backups, 'replaced_2026-11-23_1500')), []);
});

test('restore on a PC with no database yet copies the backup in', () => {
  const dir = freshDir('newpc');
  const { dbFile, db } = makeDb(dir);
  const copyDir = path.join(dir, 'copy');
  fs.mkdirSync(copyDir);
  const r = runBackup({ dbFile, dir: path.join(dir, 'old-pc-backups'), copyDir, now: NOW });
  db.close();
  const newDb = path.join(dir, 'newpc', 'beta.db');
  fs.mkdirSync(path.dirname(newDb));
  const out = restoreBackup({ from: path.join(copyDir, r.name), dbFile: newDb, backupsDir: path.join(dir, 'newpc-backups'), now: NOW });
  assert.strictEqual(out.beforeRestore, null);
  assert.strictEqual(out.replacedDir, null);
  assert.deepStrictEqual(rowsOf(newDb), [10, 20]);
});

test('listBackups: local newest first, then copy-folder backups that are not local; newestBackup and its age', () => {
  const dir = freshDir('list');
  const local = path.join(dir, 'backups');
  const copy = path.join(dir, 'copy');
  fs.mkdirSync(local);
  fs.mkdirSync(copy);
  for (const f of ['beta_2026-11-22_0300.db', 'beta_2026-11-23_0300.db', 'env-backup.txt']) fs.writeFileSync(path.join(local, f), 'x');
  for (const f of ['beta_2026-11-23_0300.db', 'beta_2026-11-01_0300.db', 'beta_2026-11-10_1500.db']) fs.writeFileSync(path.join(copy, f), 'x');
  const list = listBackups({ backupsDir: local, copyDir: copy });
  assert.deepStrictEqual(list.map((b) => `${b.where} ${b.name}`), [
    'local beta_2026-11-23_0300.db', 'local beta_2026-11-22_0300.db',
    'copy beta_2026-11-10_1500.db', 'copy beta_2026-11-01_0300.db',
  ]);
  assert.deepStrictEqual(listBackups({ backupsDir: path.join(dir, 'none'), copyDir: null }), []);
  const aFile = path.join(dir, 'not-a-folder');
  fs.writeFileSync(aFile, 'x');
  assert.deepStrictEqual(listBackups({ backupsDir: local, copyDir: aFile }).map((b) => b.where), ['local', 'local'],
    'a copy setting that names a file offers the local backups only');
  assert.strictEqual(newestBackup(aFile, NOW), null);
  const newest = newestBackup(local, NOW);
  assert.strictEqual(newest.name, 'beta_2026-11-23_0300.db');
  assert.strictEqual(ageText(newest.ageMs), '12 hours old');
  assert.strictEqual(ageText(30 * 1000), 'just now');
  assert.strictEqual(ageText(3 * 24 * 3600 * 1000), '3 days old');
  assert.strictEqual(newestBackup(path.join(dir, 'none'), NOW), null);
});

fs.rmSync(ROOT, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
