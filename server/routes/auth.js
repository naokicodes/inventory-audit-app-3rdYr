// Stub login (Step stub-login, multi-user slice 4a): identity WITHOUT
// passwords. Pick your name -> a plain `user_id` cookie -> every /api
// request gets req.user. No enforcement here; routes stay open until
// slice 5. Deliberately insecure (unsigned cookie, no dependency) - it is
// identity for Beta, not security, and hardens when real auth lands.
//
// GET  /api/auth/users  - active users, for the login page
// POST /api/auth/login  - { user_id } -> sets the cookie
// POST /api/auth/logout - clears the cookie
// GET  /api/auth/me     - { user } (req.user, or null)

const express = require('express');
const db = require('../db/connection.js');

const router = express.Router();
const COOKIE = 'user_id';

// The user_id from a raw Cookie header, or null. Hand-parsed: no cookie dep.
function cookieUserId(header) {
  for (const part of (header || '').split(';')) {
    const [name, value] = part.trim().split('=');
    if (name === COOKIE && /^\d+$/.test(value || '')) return Number(value);
  }
  return null;
}

// An active user with its role's capability flags, or null.
function loadUser(id) {
  return db.prepare(`
    SELECT u.id, u.name, r.name AS role,
           r.can_enter_counts, r.can_finalize, r.can_admin, r.read_only
      FROM users u JOIN roles r ON r.id = u.default_role_id
     WHERE u.id = ? AND u.active = 1
  `).get(id) || null;
}

// Middleware: attaches req.user. No cookie, or a stale/inactive id -> null.
function currentUser(req, res, next) {
  const id = cookieUserId(req.headers.cookie);
  req.user = id === null ? null : loadUser(id);
  next();
}

router.get('/auth/users', (req, res) => {
  res.json(db.prepare(`SELECT id, name FROM users WHERE active = 1 ORDER BY name`).all());
});

router.post('/auth/login', (req, res) => {
  const id = Number(req.body && req.body.user_id);
  const user = Number.isInteger(id) ? loadUser(id) : null;
  if (!user) return res.status(400).json({ error: 'Pick an active user.' });
  res.setHeader('Set-Cookie', `${COOKIE}=${user.id}; Path=/; HttpOnly; SameSite=Lax`);
  res.json({ ok: true, user });
});

router.post('/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
});

router.get('/auth/me', (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
module.exports.currentUser = currentUser;
module.exports.cookieUserId = cookieUserId;
