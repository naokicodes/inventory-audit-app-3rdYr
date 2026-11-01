// Step site-filter: query-layer site scoping (multi-user slice 5).
//
// ONE router, mounted in index.js after currentUser and before the route
// files, so no route has to remember a per-query WHERE. Each scoped route
// below finds its site, then canUseSite (siteAccess.js) decides.
// Decisions 2026-11-02 (issue #54; ADR-040, ADR-041):
// - Logged out (req.user null) passes: scoping is for logged-in users.
// - Only groups (a) and (b) are scoped here. Two-site routes and cross-site
//   lists go to site-filter-ii (3zs); Settings to settings-guard (3zu).
// - An id that finds no site (missing row, bad input) passes through, so
//   the route answers 400/404 exactly as it does today.

const express = require('express');
const db = require('../db/connection.js');
const { canUseSite, siteCodeFor } = require('../db/siteAccess.js');

// The field a route reads: GET routes read the query string, writes the body.
const field = name => req => (req.method === 'GET' ? req.query : req.body || {})[name];
const rowId = req => req.params.id;

function requireSite(kind, idOf) {
  return (req, res, next) => {
    if (!req.user) return next();
    const id = Number(idOf(req));
    const code = Number.isInteger(id) && id > 0 ? siteCodeFor(db, kind, id) : null;
    if (code === null || canUseSite(db, req.user, code, null)) return next();
    res.status(403).json({ error: `No access to site ${code}` });
  };
}

const restaurant = requireSite('restaurant', field('restaurant_id'));
const commissary = requireSite('commissary', field('commissary_id'));
const commissaryMeat = requireSite('commissary_meat', field('commissary_meat_id'));

const router = express.Router();

// (a) The site is named in the request.
router.get(['/daily-audit', '/daily-audit/mixed', '/daily-audit/month-opening',
  '/daily-audit/count-history'], restaurant);
router.post(['/daily-audit', '/daily-audit/month-opening', '/daily-audit/month-opening/copy-all',
  '/daily-audit/portions', '/daily-audit/recount-orders'], restaurant);
router.patch('/daily-audit/opening-stock', restaurant);
router.get(['/stock-receipts', '/stock-receipts/meats'], restaurant);
router.post('/stock-receipts', restaurant);
router.get('/sales', restaurant);
router.patch('/sales', restaurant);
router.get(['/commissary/daily-audit', '/commissary/month-opening', '/commissary/meats',
  '/commissary/yield-log', '/commissary/adjustments'], commissary);
router.post(['/commissary/daily-audit', '/commissary/month-opening',
  '/commissary/month-opening/copy-all'], commissary);

// (b) The site is found through a row.
router.patch('/stock-receipts/:id', requireSite('stock_receipt', rowId));
router.delete('/stock-receipts/:id', requireSite('stock_receipt', rowId));
router.post(['/commissary/yield-log', '/commissary/adjustments'], commissaryMeat);
router.patch('/commissary/opening-stock', commissaryMeat);
router.patch('/commissary/yield-log/:id', requireSite('yield_log', rowId));
router.delete('/commissary/yield-log/:id', requireSite('yield_log', rowId));
router.patch('/commissary/adjustments/:id', requireSite('adjustment', rowId));
router.delete('/commissary/adjustments/:id', requireSite('adjustment', rowId));
router.post('/daily-audit/recount-orders/:id/cancel', requireSite('recount_order', rowId));

module.exports = router;
