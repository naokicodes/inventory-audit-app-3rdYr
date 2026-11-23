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
const { currentUser, cookieUserId, cookieFor, maxAgeSeconds } = router;
const DAY = 24 * 60 * 60 * 1000;
const { businessDate } = require('../businessDay.js');

let passed = 0, failed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

console.log('Auth Route Tests (stub-login, sign-the-cookie)\n');

const roleId = (name, flags) => Number(db.prepare(
  'INSERT INTO roles (name, can_enter_counts, can_finalize, can_admin, read_only) VALUES (?, ?, ?, ?, ?)'
).run(name, ...flags).lastInsertRowid);
const userId = (name, role, active = 1) => Number(db.prepare(
  'INSERT INTO users (name, default_role_id, active) VALUES (?, ?, ?)'
).run(name, role, active).lastInsertRowid);

const checker = roleId('checker', [1, 0, 0, 0]);
const admin = roleId('admin', [1, 1, 1, 0]);
// A role switched off: active = 0. Every flag is 1, so the test proves the
// deactivation zeroes them rather than the flags being 0 to begin with.
const retired = Number(db.prepare(
  'INSERT INTO roles (name, can_enter_counts, can_finalize, can_admin, read_only, active) VALUES (?, 1, 1, 1, 1, 0)'
).run('retired').lastInsertRowid);
const ana = userId('Ana', checker);
const ben = userId('Ben', admin);
const gone = userId('Gone', checker, 0);
const cass = userId('Cass', retired);
const superAdmin = roleId('super-admin', [1, 1, 1, 0]);
const dee = userId('Dee', superAdmin);

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

const SECRET_ENV = { COOKIE_SECRET: 'test-secret', ADMIN_PASSWORD: 'open sesame' };
const quiet = () => {};
router.configure(SECRET_ENV, quiet);

// An instant in Manila (UTC+8), from a Manila wall-clock time.
const manila = text => Date.parse(`${text}+08:00`);
const as = id => cookieFor(id);
const setCookie = res => res.headers.get('set-cookie');
const valueOf = header => /^user_id=([^;]*)/.exec(header)[1];
const login = body => call('POST', '/api/auth/login', { body });
const me = async cookie => (await (await call('GET', '/api/auth/me', { cookie })).json()).user;
const parts = cookie => cookie.slice('user_id='.length).split('.');

test('cookieUserId: picks a signed user_id out of a header, ignores junk', () => {
  assert.strictEqual(cookieUserId(`a=1; ${cookieFor(7)}; b=2`), 7);
  assert.strictEqual(cookieUserId(undefined), null);
  assert.strictEqual(cookieUserId('user_id='), null);
  assert.strictEqual(cookieUserId(`x${cookieFor(7)}`), null);
});

test('cookieUserId: an old unsigned cookie reads as logged out', () => {
  assert.strictEqual(cookieUserId('user_id=7'), null);
  assert.strictEqual(cookieUserId('user_id=7x'), null);
});

test('cookieUserId: a changed id or signature reads as logged out', () => {
  const [id, date, sig] = parts(cookieFor(7));
  assert.strictEqual(cookieUserId(`user_id=8.${date}.${sig}`), null);
  const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
  assert.strictEqual(cookieUserId(`user_id=${id}.${date}.${flipped}`), null);
});

test('cookieUserId: a signature of the wrong length does not throw', () => {
  const [id, date, sig] = parts(cookieFor(7));
  assert.strictEqual(cookieUserId(`user_id=${id}.${date}.${sig.slice(1)}`), null);
  assert.strictEqual(cookieUserId(`user_id=${id}.${date}.${sig}AAAA`), null);
  assert.strictEqual(cookieUserId(`user_id=${id}.${date}.x`), null);
});

test('cookieUserId: the first well-formed signed cookie wins', () => {
  assert.strictEqual(cookieUserId(`user_id=1; ${cookieFor(7)}; ${cookieFor(8)}`), 7);
});

test('cookieUserId: a cookie from the previous business date reads as logged out', () => {
  const now = manila('2026-11-23T10:00:00');
  assert.strictEqual(cookieUserId(cookieFor(7, now), now), 7);
  // 07:59 is still the 22nd's business day; 08:00 starts the 23rd's.
  assert.strictEqual(cookieUserId(cookieFor(7, manila('2026-11-23T07:59:00')), now), null);
  assert.strictEqual(cookieUserId(cookieFor(7, manila('2026-11-23T01:00:00')), manila('2026-11-23T07:59:59')), 7);
});

test('cookieUserId: a changed business date with the old signature is refused', () => {
  const now = manila('2026-11-23T10:00:00');
  const [id, , sig] = parts(cookieFor(7, now - DAY));
  assert.strictEqual(cookieUserId(`user_id=${id}.2026-11-23.${sig}`, now), null);
});

test('maxAgeSeconds: the seconds left until the next 8 AM Manila', () => {
  assert.strictEqual(maxAgeSeconds(manila('2026-11-23T21:00:00')), 11 * 60 * 60);
  assert.strictEqual(maxAgeSeconds(manila('2026-11-23T07:59:00')), 60);
  assert.strictEqual(maxAgeSeconds(manila('2026-11-23T08:00:00')), 24 * 60 * 60);
});

test('GET /auth/users lists active users only, by name, with needs_password', async () => {
  const body = await (await call('GET', '/api/auth/users')).json();
  assert.deepStrictEqual(body, [
    { id: ana, name: 'Ana', needs_password: false },
    { id: ben, name: 'Ben', needs_password: true },
    { id: cass, name: 'Cass', needs_password: false },
    { id: dee, name: 'Dee', needs_password: true },
  ]);
});

test('login sets a signed user_id cookie that lasts until the next 8 AM', async () => {
  // Real clock: a run that crosses the 8 AM turn tries once more, since the
  // cookie, Max-Age and the check after it would straddle two business days.
  for (let attempt = 1; ; attempt++) {
    const before = Date.now();
    const res = await login({ user_id: ana });
    assert.strictEqual(res.status, 200);
    const header = setCookie(res);
    const signedIn = header && cookieUserId(`user_id=${valueOf(header)}`);
    const viaMe = header && await me(`user_id=${valueOf(header)}`);
    if (businessDate(before) !== businessDate(Date.now()) && attempt === 1) continue;
    assert.match(header, /^user_id=\d+\.\d{4}-\d{2}-\d{2}\.[A-Za-z0-9_-]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+$/);
    const maxAge = Number(/Max-Age=(\d+)/.exec(header)[1]);
    assert.ok(Math.abs(maxAge - maxAgeSeconds(before)) <= 2, `Max-Age ${maxAge}`);
    assert.strictEqual(signedIn, ana);
    assert.strictEqual(viaMe.id, ana);
    break;
  }
});

test('login takes user_id as a whole number or a string of digits', async () => {
  assert.strictEqual((await login({ user_id: String(ana) })).status, 200);
  // A JSON 1.0 parses to the number 1, a whole number; "1.0" is the string form.
  for (const user_id of [true, [ana], '1.0', `${ana}.0`, '0x2', ana + 0.5, '', null]) {
    const res = await login({ user_id });
    assert.strictEqual(res.status, 400, JSON.stringify(user_id));
    assert.deepStrictEqual(await res.json(), { error: 'Pick an active user.' });
    assert.strictEqual(setCookie(res), null);
  }
});

test('login refuses an inactive, unknown or missing user, sets no cookie', async () => {
  for (const body of [{ user_id: gone }, { user_id: 9999 }, {}, { user_id: 'abc' }]) {
    const res = await login(body);
    assert.strictEqual(res.status, 400, JSON.stringify(body));
    assert.strictEqual(setCookie(res), null);
  }
});

test('admin login: no password or a wrong one -> 401 after a pause; the right one logs in', async () => {
  for (const body of [{ user_id: ben }, { user_id: ben, password: 'nope' }, { user_id: ben, password: 1 }]) {
    const started = Date.now();
    const res = await login(body);
    assert.strictEqual(res.status, 401, JSON.stringify(body));
    assert.deepStrictEqual(await res.json(), { error: 'Wrong admin password.' });
    assert.strictEqual(setCookie(res), null);
    assert.ok(Date.now() - started >= 950, 'pauses about a second');
  }
  for (const id of [ben, dee]) {
    const res = await login({ user_id: id, password: 'open sesame' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(cookieUserId(`user_id=${valueOf(setCookie(res))}`), id);
  }
});

test('a checker logs in with no password; a switched-off admin role asks none', async () => {
  assert.strictEqual((await login({ user_id: ana })).status, 200);
  assert.strictEqual((await login({ user_id: ana, password: 'anything' })).status, 200);
  assert.strictEqual((await login({ user_id: cass })).status, 200);
});

test('ADMIN_PASSWORD unset: an admin login passes and the warning prints once', async () => {
  const warnings = [];
  router.configure({ COOKIE_SECRET: 'test-secret' }, msg => warnings.push(msg));
  try {
    assert.strictEqual((await login({ user_id: ben })).status, 200);
    assert.strictEqual((await login({ user_id: dee })).status, 200);
    assert.deepStrictEqual(warnings, ['ADMIN_PASSWORD is not set: anyone can log in as an admin. Add it to .env.']);
  } finally {
    router.configure(SECRET_ENV, quiet);
  }
});

test('COOKIE_SECRET unset: the server still starts, signs with a random secret, warns once', async () => {
  const warnings = [];
  const oldCookie = cookieFor(ana);
  router.configure({ ADMIN_PASSWORD: 'open sesame' }, msg => warnings.push(msg));
  try {
    assert.deepStrictEqual(warnings, ['COOKIE_SECRET is not set: everyone is logged out after each restart. Add it to .env.']);
    const res = await login({ user_id: ana });
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await me(`user_id=${valueOf(setCookie(res))}`)).id, ana);
    // A cookie signed with the earlier secret is logged out, as after a restart.
    assert.strictEqual(await me(oldCookie), null);
  } finally {
    router.configure(SECRET_ENV, quiet);
  }
});

test('currentUser attaches the role capability flags', async () => {
  assert.deepStrictEqual(await me(as(ana)), { id: ana, name: 'Ana', role: 'checker', can_enter_counts: 1, can_finalize: 0, can_admin: 0, read_only: 0 });
  const b = await me(as(ben));
  assert.strictEqual(b.role, 'admin');
  assert.strictEqual(b.can_admin, 1);
});

test('currentUser: a deactivated role identifies the user but grants nothing', async () => {
  // Q3 (2026-10-22): a role with active = 0 grants NOTHING. The user is still
  // identified (id and name), but every capability flag reads 0.
  assert.deepStrictEqual(await me(as(cass)), {
    id: cass, name: 'Cass', role: 'retired',
    can_enter_counts: 0, can_finalize: 0, can_admin: 0, read_only: 0,
  });
});

test('currentUser: no cookie, an inactive user, or a typed unsigned cookie -> null', async () => {
  assert.strictEqual(await me(), null);
  assert.strictEqual(await me(as(gone)), null);
  assert.strictEqual(await me('user_id=1'), null);
  assert.strictEqual(await me(`user_id=${ben}`), null);
});

test('logout clears the cookie', async () => {
  const res = await call('POST', '/api/auth/logout', { cookie: as(ana) });
  assert.strictEqual(res.status, 200);
  assert.match(setCookie(res), /^user_id=; .*Max-Age=0/);
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
