// Step site-filter: query-layer site scoping (multi-user slice 5).
//
// ONE router, mounted in index.js after currentUser and before the route
// files, so no route has to remember a per-query WHERE. Each scoped route
// below finds its site, then canUseSite (siteAccess.js) decides.
// Decisions 2026-11-02 (issue #54; ADR-040, ADR-041):
// - Logged out (req.user null) passes: scoping is for logged-in users.
// - Only groups (a) and (b) are scoped here. Two-site routes and cross-site
//   lists go to site-filter-ii (3zs); Settings to settings-guard (3zu).
// - A well-formed id that finds no row passes through, so the route answers
//   404 exactly as it does today.
// Decisions 2026-11-11 (issue #60; ADR-043):
// - Q1: a commissary_meat_id on the three commissary GETs is checked too.
// - Q2: POST /commissary/daily-audit checks every rows[].commissary_meat_id;
//   one refused row refuses the whole save before anything is written.
// - Q4: /stock-receipts/meats is a catalog read, not guarded here.
// Decisions 2026-11-14 (issue #68; ADR-074):
// - Every id the guard reads that is present and not empty must be one whole
//   number above 0, or 400 before the route runs, logged in or not.
// - A stock receipt with no restaurant is its commissary's (siteAccess.js);
//   with no commissary either, only admins may edit or delete it.

const express = require('express');
const db = require('../db/connection.js');
const { canUseSite, siteOfRow } = require('../db/siteAccess.js');

// The field a route reads: GET (and HEAD, which Express routes as GET) read
// the query string, writes the body.
const readsQuery = req => req.method === 'GET' || req.method === 'HEAD';
const field = name => req => (readsQuery(req) ? req.query : req.body || {})[name];
const rowId = req => req.params.id;

// ADR-074: absent (undefined, null, '') -> { absent }; a JSON integer or a
// string of digits only, above 0 -> { id }; anything else, including a
// query field given twice (an array) -> { bad }.
function parseId(raw) {
  if (raw === undefined || raw === null || raw === '') return { absent: true };
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return { id: raw };
  if (typeof raw === 'string' && /^\d+$/.test(raw) && Number(raw) > 0) return { id: Number(raw) };
  return { bad: true };
}

const isAdmin = user => Boolean(user) && user.can_admin === 1;

// A guard for ids of one `kind`, read by `idsOf`; `label` names the field in
// the 400 message.
function requireSites(kind, label, idsOf) {
  return (req, res, next) => {
    const ids = [];
    for (const raw of idsOf(req)) {
      const parsed = parseId(raw);
      if (parsed.bad) return res.status(400).json({ error: `${label} must be one whole number` });
      if (!parsed.absent) ids.push(parsed.id);
    }
    // Logged out passes - except a siteless stock receipt, admins only (ADR-074).
    if (!req.user && kind !== 'stock_receipt') return next();
    for (const id of ids) {
      const site = siteOfRow(db, kind, id);
      if (!site) continue; // no such row: the route answers 404
      if (site.code === null) {
        if (kind === 'stock_receipt' && !isAdmin(req.user)) {
          return res.status(403).json({ error: 'Only an admin can change a receipt with no site' });
        }
        continue;
      }
      if (req.user && !canUseSite(db, req.user, site.code, null)) {
        return res.status(403).json({ error: `No access to site ${site.code}` });
      }
    }
    next();
  };
}
const requireSite = (kind, name, idOf) => requireSites(kind, name, req => [idOf(req)]);
const named = (kind, name) => requireSite(kind, name, field(name));

const restaurant = named('restaurant', 'restaurant_id');
const commissary = named('commissary', 'commissary_id');
const commissaryMeat = named('commissary_meat', 'commissary_meat_id');
const commissaryRowMeats = requireSites('commissary_meat', 'rows[].commissary_meat_id', req => {
  const rows = (req.body || {}).rows;
  return Array.isArray(rows) ? rows.map(r => (r || {}).commissary_meat_id) : [];
});
const byRow = kind => requireSite(kind, 'id', rowId);

const router = express.Router();

// (a) The site is named in the request.
router.get(['/daily-audit', '/daily-audit/mixed', '/daily-audit/month-opening',
  '/daily-audit/count-history'], restaurant);
router.post(['/daily-audit', '/daily-audit/month-opening', '/daily-audit/month-opening/copy-all',
  '/daily-audit/portions', '/daily-audit/recount-orders'], restaurant);
router.patch('/daily-audit/opening-stock', restaurant);
router.get('/stock-receipts', restaurant);
router.post('/stock-receipts', restaurant);
router.get('/sales', restaurant);
router.patch('/sales', restaurant);
router.get(['/commissary/month-opening', '/commissary/meats'], commissary);
router.get(['/commissary/daily-audit', '/commissary/yield-log', '/commissary/adjustments'],
  commissary, commissaryMeat);
router.post('/commissary/daily-audit', commissary, commissaryRowMeats);
router.post(['/commissary/month-opening', '/commissary/month-opening/copy-all'], commissary);

// (b) The site is found through a row.
router.patch('/stock-receipts/:id', byRow('stock_receipt'));
router.delete('/stock-receipts/:id', byRow('stock_receipt'));
router.post(['/commissary/yield-log', '/commissary/adjustments'], commissaryMeat);
router.patch('/commissary/opening-stock', commissaryMeat);
router.patch('/commissary/yield-log/:id', byRow('yield_log'));
router.delete('/commissary/yield-log/:id', byRow('yield_log'));
router.patch('/commissary/adjustments/:id', byRow('adjustment'));
router.delete('/commissary/adjustments/:id', byRow('adjustment'));
router.post('/daily-audit/recount-orders/:id/cancel', byRow('recount_order'));

module.exports = router;
