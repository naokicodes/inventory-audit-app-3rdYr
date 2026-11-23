// Stub login (Step stub-login, multi-user slice 4a): pick your name -> a
// `user_id` cookie -> every /api request gets req.user.
//
// Step sign-the-cookie (ADR-098, ADR-113): the cookie value is
// `<user_id>.<business_date>.<signature>`, an HMAC-SHA256 of
// `<user_id>.<business_date>` keyed with COOKIE_SECRET (base64url, node:crypto,
// no dependency). A cookie with no signature, a wrong one, or a business date
// that is not today's (ADR-036, the 8 AM turn) reads as logged out. Users whose
// base role grants admin also give the one shared ADMIN_PASSWORD.
//
// GET  /api/auth/users  - active users, for the login page, with
//                         needs_password (true when the base role grants admin)
// POST /api/auth/login  - { user_id, password } -> sets the signed cookie
// POST /api/auth/logout - clears the cookie
// GET  /api/auth/me     - { user, capabilities_by_site } (req.user, or null;
//                         what the user may do at each site - step
//                         role-assignments. Pages may show or hide buttons
//                         with it; the server always re-checks.)

const crypto = require('crypto');
const express = require('express');
const db = require('../db/connection.js');
const { capabilitiesBySite } = require('../db/permissions.js');
const { businessDate, BUSINESS_DAY_START_HOUR } = require('../businessDay.js');

const router = express.Router();
const COOKIE = 'user_id';
const DAY_MS = 24 * 60 * 60 * 1000;
const WRONG_PASSWORD_PAUSE_MS = 1000;

// Secrets from .env (loaded by server/index.js before this module). Missing
// ones warn once, here, at start. configure() is exported so tests can start
// over with another env.
let cookieSecret;
let adminPasswordDigest;
function configure(env = process.env, warn = console.warn) {
  cookieSecret = env.COOKIE_SECRET;
  if (!cookieSecret) {
    cookieSecret = crypto.randomBytes(32).toString('hex');
    warn('COOKIE_SECRET is not set: everyone is logged out after each restart. Add it to .env.');
  }
  adminPasswordDigest = env.ADMIN_PASSWORD ? sha256(env.ADMIN_PASSWORD) : null;
  if (!adminPasswordDigest) {
    warn('ADMIN_PASSWORD is not set: anyone can log in as an admin. Add it to .env.');
  }
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest();
}

function sign(userId, date) {
  return crypto.createHmac('sha256', cookieSecret).update(`${userId}.${date}`).digest('base64url');
}

// Equal-length buffers only: timingSafeEqual throws on a length mismatch.
function safeEqual(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// The cookie value for a user, signed for the business date of `now`.
function signedValue(userId, now = Date.now()) {
  const date = businessDate(now);
  return `${userId}.${date}.${sign(userId, date)}`;
}

// `user_id=<signed value>`, ready for a Cookie header (tests use it too).
function cookieFor(userId, now = Date.now()) {
  return `${COOKIE}=${signedValue(userId, now)}`;
}

// Seconds from `now` to the next 8 AM Manila business-day turn. Manila keeps
// UTC+8 all year (no daylight saving), so the turn is fixed at 08:00+08:00.
function maxAgeSeconds(now = Date.now()) {
  const date = businessDate(now);
  const hour = String(BUSINESS_DAY_START_HOUR).padStart(2, '0');
  const nextTurn = Date.parse(`${date}T${hour}:00:00+08:00`) + DAY_MS;
  return Math.ceil((nextTurn - now) / 1000);
}

const SIGNED = /^(\d+)\.(\d{4}-\d{2}-\d{2})\.([A-Za-z0-9_-]+)$/;

// The user id from a raw Cookie header, or null. Hand-parsed: no cookie dep.
// The first user_id cookie that is well formed, signed with our secret and
// dated today's business date wins; anything else is skipped.
function cookieUserId(header, now = Date.now()) {
  const today = businessDate(now);
  for (const part of (header || '').split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq < 0 || trimmed.slice(0, eq) !== COOKIE) continue;
    const m = SIGNED.exec(trimmed.slice(eq + 1));
    if (!m) continue;
    const [, id, date, signature] = m;
    if (date !== today) continue;
    if (!safeEqual(Buffer.from(signature), Buffer.from(sign(id, date)))) continue;
    return Number(id);
  }
  return null;
}

// An active user with its role's capability flags, or null. A deactivated
// role (active = 0) still identifies the user - id and name, so authorship
// works - but grants nothing: every capability flag reads 0 (Q3, 2026-10-22).
function loadUser(id) {
  const row = db.prepare(`
    SELECT u.id, u.name, r.name AS role, r.active AS role_active,
           r.can_enter_counts, r.can_finalize, r.can_admin, r.read_only
      FROM users u JOIN roles r ON r.id = u.default_role_id
     WHERE u.id = ? AND u.active = 1
  `).get(id);
  if (!row) return null;
  const live = row.role_active === 1;
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    can_enter_counts: live ? row.can_enter_counts : 0,
    can_finalize: live ? row.can_finalize : 0,
    can_admin: live ? row.can_admin : 0,
    read_only: live ? row.read_only : 0,
  };
}

// A whole-number user id (a number, or a string of digits), or null.
// `true`, `[1]`, `"1.0"` and `"0x2"` are not whole numbers here.
function wholeNumberId(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

// Middleware: attaches req.user. No cookie, a bad signature, another day's
// cookie, or a stale/inactive id -> null.
function currentUser(req, res, next) {
  const id = cookieUserId(req.headers.cookie);
  req.user = id === null ? null : loadUser(id);
  next();
}

router.get('/auth/users', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.name, (r.active = 1 AND r.can_admin = 1) AS needs_password
      FROM users u LEFT JOIN roles r ON r.id = u.default_role_id
     WHERE u.active = 1
     ORDER BY u.name
  `).all();
  res.json(rows.map(r => ({ id: r.id, name: r.name, needs_password: r.needs_password === 1 })));
});

router.post('/auth/login', async (req, res) => {
  const body = req.body || {};
  const id = wholeNumberId(body.user_id);
  const user = id === null ? null : loadUser(id);
  if (!user) return res.status(400).json({ error: 'Pick an active user.' });
  if (user.can_admin === 1 && adminPasswordDigest) {
    const given = typeof body.password === 'string' ? sha256(body.password) : null;
    if (!given || !safeEqual(given, adminPasswordDigest)) {
      await new Promise(resolve => setTimeout(resolve, WRONG_PASSWORD_PAUSE_MS));
      return res.status(401).json({ error: 'Wrong admin password.' });
    }
  }
  const now = Date.now();
  res.setHeader('Set-Cookie',
    `${COOKIE}=${signedValue(user.id, now)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds(now)}`);
  res.json({ ok: true, user });
});

router.post('/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
});

router.get('/auth/me', (req, res) => {
  res.json({ user: req.user, capabilities_by_site: capabilitiesBySite(db, req.user) });
});

configure();

module.exports = router;
module.exports.currentUser = currentUser;
module.exports.cookieUserId = cookieUserId;
module.exports.cookieFor = cookieFor;
module.exports.maxAgeSeconds = maxAgeSeconds;
module.exports.configure = configure;
