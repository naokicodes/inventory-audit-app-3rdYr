// Tests for the stub login (Step stub-login). Runs the real router and
// currentUser middleware over HTTP on an ephemeral port, against a
// throwaway database file in the OS temp dir (DB_PATH, set before the
// connection opens) - never the live inventory.db.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const DB_FILE = path.join(os.tmpdir(), `auth-test-${process.pid}.db`);
process.env.DB_PATH = DB_FILE;
const db = require('../db/connection.js');
const router = require('./auth.js');
const { currentUser, cookieUserId } = router;

let passed = 0, failed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

console.log('Auth Route Tests (stub-login)\n');

const roleId = (name, flags) => Number(db.prepare(
  'INSERT INTO roles (name, can_enter_counts, can_finalize, can_admin, read_only) VALUES (?, ?, ?, ?, ?)'
).run(name, ...flags).lastInsertRowid);
const userId = (name, role, active = 1) => Number(db.prepare(
  'INSERT INTO users (name, default_role_id, active) VALUES (?, ?, ?)'
).run(name, role, active).lastInsertRowid);

const checker = roleId('checker', [1, 0, 0, 0]);
const admin = roleId('admin', [1, 1, 1, 0]);
const ana = userId('Ana', checker);
const ben = userId('Ben', admin);
const gone = userId('Gone', checker, 0);

const app = express();
app.use(express.json());
app.use('/api', currentUser);
app.use('/api', router);

let base;
const call = (method, url, { body, cookie } = {}) => fetch(base + url, {
  method,
  headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});

test('cookieUserId: picks user_id out of a header, ignores junk', () => {
  assert.strictEqual(cookieUserId('a=1; user_id=7; b=2'), 7);
  assert.strictEqual(cookieUserId(undefined), null);
  assert.strictEqual(cookieUserId('user_id='), null);
  assert.strictEqual(cookieUserId('user_id=7x'), null);
  assert.strictEqual(cookieUserId('xuser_id=7'), null);
});

test('GET /auth/users lists active users only, by name', async () => {
  const body = await (await call('GET', '/api/auth/users')).json();
  assert.deepStrictEqual(body, [{ id: ana, name: 'Ana' }, { id: ben, name: 'Ben' }]);
});

test('login sets the user_id cookie', async () => {
  const res = await call('POST', '/api/auth/login', { body: { user_id: ana } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('set-cookie'), `user_id=${ana}; Path=/; HttpOnly; SameSite=Lax`);
});

test('login refuses an inactive, unknown or missing user, sets no cookie', async () => {
  for (const body of [{ user_id: gone }, { user_id: 9999 }, {}, { user_id: 'abc' }]) {
    const res = await call('POST', '/api/auth/login', { body });
    assert.strictEqual(res.status, 400, JSON.stringify(body));
    assert.strictEqual(res.headers.get('set-cookie'), null);
  }
});

test('currentUser attaches the role capability flags', async () => {
  const a = (await (await call('GET', '/api/auth/me', { cookie: `user_id=${ana}` })).json()).user;
  assert.deepStrictEqual(a, { id: ana, name: 'Ana', role: 'checker', can_enter_counts: 1, can_finalize: 0, can_admin: 0, read_only: 0 });
  const b = (await (await call('GET', '/api/auth/me', { cookie: `user_id=${ben}` })).json()).user;
  assert.strictEqual(b.role, 'admin');
  assert.strictEqual(b.can_admin, 1);
});

test('currentUser: no cookie, or an inactive user -> null', async () => {
  assert.strictEqual((await (await call('GET', '/api/auth/me')).json()).user, null);
  assert.strictEqual((await (await call('GET', '/api/auth/me', { cookie: `user_id=${gone}` })).json()).user, null);
});

test('logout clears the cookie', async () => {
  const res = await call('POST', '/api/auth/logout', { cookie: `user_id=${ana}` });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('set-cookie'), /^user_id=; .*Max-Age=0/);
});

const server = app.listen(0, async () => {
  base = `http://localhost:${server.address().port}`;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  PASS: ${name}`);
      passed++;
    } catch (err) {
      console.log(`  FAIL: ${name}`);
      console.log(`    ${err.message}`);
      failed++;
    }
  }
  server.close();
  db.close();
  for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) fs.rmSync(f, { force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
});
