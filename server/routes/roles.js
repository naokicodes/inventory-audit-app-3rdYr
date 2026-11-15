// Step roles-page (ADR-034): the Roles page's routes. Anyone signed in may
// read; every write goes through permissions.js, which answers 403 for a
// non-admin. Logged out -> 401.
//
// GET    /api/roles                    - { can_edit, roles, people }
// POST   /api/roles                    - { name, copy_from }
// PUT    /api/roles/:id                - { name?, active? }
// PUT    /api/roles/:id/capabilities   - { capability, on }
// PUT    /api/users/:id/base-role      - { role_id }
// GET    /api/users/:id/roles          - { user, assignments }
// POST   /api/users/:id/roles          - { role_id, site_code (null = all their sites), until_date? }
// DELETE /api/users/:id/roles          - { role_id, site_code }

const express = require('express');
const db = require('../db/connection.js');
const permissions = require('../db/permissions.js');
const { usableSiteCodes } = require('../db/siteAccess.js');

const router = express.Router();

function signedIn(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Log in first' });
  next();
}

// A permissions.js result -> the response: { status, error } or the result.
function send(res, result) {
  if (result.status) return res.status(result.status).json({ error: result.error });
  res.json(result);
}

const body = req => req.body || {};

// A person for the People list: base role, the sites "all their sites" means
// for them (ADR-091), and their assignments.
function personView(person) {
  return {
    id: person.id,
    name: person.name,
    base_role_id: person.default_role_id,
    base_role: person.role,
    sites: usableSiteCodes(db, { id: person.id, can_admin: person.can_admin, read_only: person.read_only }, null),
    assignments: permissions.assignmentsOf(db, person.id),
  };
}

const PEOPLE_SQL = `
  SELECT u.id, u.name, u.default_role_id, r.name AS role,
         CASE WHEN r.active = 1 THEN r.can_admin ELSE 0 END AS can_admin,
         CASE WHEN r.active = 1 THEN r.read_only ELSE 0 END AS read_only
    FROM users u JOIN roles r ON r.id = u.default_role_id
   WHERE u.active = 1`;

router.use(['/roles', '/users/:id/roles', '/users/:id/base-role'], signedIn);

router.get('/roles', (req, res) => {
  const roles = db.prepare('SELECT id FROM roles ORDER BY id').all().map(r => {
    const role = permissions.roleSnapshot(db, r.id);
    return { ...role, built_in: permissions.BUILT_IN_ROLES.includes(role.name) };
  });
  const people = db.prepare(`${PEOPLE_SQL} ORDER BY u.name`).all().map(personView);
  res.json({ can_edit: permissions.isAdmin(db, req.user), roles, people });
});

router.post('/roles', (req, res) => {
  const { name, copy_from } = body(req);
  send(res, permissions.createRole(db, { name, copyFrom: copy_from }, req.user));
});

router.put('/roles/:id', (req, res) => {
  const { name, active } = body(req);
  send(res, permissions.updateRole(db, { roleId: req.params.id, name, active }, req.user));
});

router.put('/roles/:id/capabilities', (req, res) => {
  const { capability, on } = body(req);
  send(res, permissions.setRoleToggle(db, { roleId: req.params.id, capability, on }, req.user));
});

router.put('/users/:id/base-role', (req, res) => {
  send(res, permissions.setBaseRole(db, { userId: req.params.id, roleId: body(req).role_id }, req.user));
});

router.get('/users/:id/roles', (req, res) => {
  const person = db.prepare(`${PEOPLE_SQL} AND u.id = ?`).get(Number(req.params.id));
  if (!person) return res.status(404).json({ error: 'Unknown person.' });
  const view = personView(person);
  res.json({ user: { id: view.id, name: view.name, base_role_id: view.base_role_id, base_role: view.base_role }, assignments: view.assignments });
});

router.post('/users/:id/roles', (req, res) => {
  const { role_id, site_code, until_date } = body(req);
  send(res, permissions.assignRole(db, { userId: req.params.id, roleId: role_id, siteCode: site_code, untilDate: until_date }, req.user));
});

router.delete('/users/:id/roles', (req, res) => {
  const { role_id, site_code } = body(req);
  send(res, permissions.removeAssignment(db, { userId: req.params.id, roleId: role_id, siteCode: site_code }, req.user));
});

module.exports = router;
