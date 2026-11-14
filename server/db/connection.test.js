// Step busy-timeout: a connection opened through connection.js waits up to 5s
// for a lock (busy_timeout) and runs in WAL mode.
//
// Never touches the live inventory.db: connection.js is loaded in a child
// process with DB_PATH pointing at a scratch file in the OS temp dir, so its
// module-level open never happens in this process.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

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

console.log('Connection Tests\n');

const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'connection-test-'));
const scratchDb = path.join(scratchDir, 'scratch.db');

const probe = `
  const db = require(${JSON.stringify(path.join(__dirname, 'connection.js'))});
  const timeout = db.prepare('PRAGMA busy_timeout').get();
  const journal = db.prepare('PRAGMA journal_mode').get();
  const file = db.prepare("SELECT file FROM pragma_database_list WHERE name = 'main'").get().file;
  process.stdout.write(JSON.stringify({ timeout: Object.values(timeout)[0], journal: Object.values(journal)[0], file }));
  db.close();
`;
const run = spawnSync(process.execPath, ['-e', probe], {
  encoding: 'utf8',
  env: { ...process.env, DB_PATH: scratchDb },
});
const out = run.status === 0 ? JSON.parse(run.stdout) : null;

test('connection.js opened the scratch DB_PATH, not the live database', () => {
  assert.ok(out, `child failed: ${run.stderr}`);
  assert.strictEqual(fs.realpathSync(out.file), fs.realpathSync(scratchDb));
});

test('connection.js opens with busy_timeout = 5000', () => {
  assert.ok(out, `child failed: ${run.stderr}`);
  assert.strictEqual(out.timeout, 5000);
});

test('connection.js opens in WAL journal mode', () => {
  assert.ok(out, `child failed: ${run.stderr}`);
  assert.strictEqual(out.journal, 'wal');
});

fs.rmSync(scratchDir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
