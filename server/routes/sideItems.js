// Step side-items (ADR-062): read a site's side sheets with their items, and
// fix single items, conversions and sheet links. Every write needs an admin
// (settings-guard) - units too, until permissions.js adds edit_side_items
// (cost-guard). Scoped paths only, never a bare router.use.

const express = require('express');
const db = require('../db/connection.js');
const { withTransaction } = require('../db/activityLog.js');
const requireAdmin = require('../middleware/requireAdmin.js');
const sideItems = require('../engines/sideItems.js');

const router = express.Router();

// Runs one engine write (plus its log row) in a transaction and answers.
function write(res, fn) {
  try {
    res.json({ ok: true, ...withTransaction(db, fn) });
  } catch (err) {
    if (!err.status) throw err;
    res.status(err.status).json({ error: err.message });
  }
}
const ctx = req => ({ actor: req.user.name, source: 'MANUAL' });
const pick = (body, keys) => Object.fromEntries(keys.filter(k => k in (body || {})).map(k => [k, body[k]]));

// Cost only for someone who may see costs: an admin until cost-guard lands.
router.get('/side-items', (req, res) => {
  if (!req.query.site) return res.status(400).json({ error: 'site is required' });
  const withCost = Boolean(req.user) && req.user.can_admin === 1;
  res.json(sideItems.siteSideSheets(db, String(req.query.site), { withCost }));
});

const ITEM_FIELDS = ['name', 'main_unit', 'how_bought', 'cost_per_unit', 'active'];

router.post('/side-items', requireAdmin, (req, res) => write(res, () => ({
  item: sideItems.createItem(db, pick(req.body, ITEM_FIELDS), ctx(req)),
})));

router.put('/side-items/:id', requireAdmin, (req, res) => write(res, () =>
  sideItems.updateItem(db, Number(req.params.id), pick(req.body, ITEM_FIELDS), ctx(req))));

// Body { unit, per_main }: adds the conversion or changes its number.
router.route('/side-items/:id/units').all(requireAdmin).post(setUnit).put(setUnit);
function setUnit(req, res) {
  const { unit, per_main } = req.body || {};
  write(res, () => ({ changed: sideItems.setUnit(db, Number(req.params.id), unit, per_main, ctx(req)) }));
}

// Removes one conversion (ADR-079: Settings only, behind a confirm).
router.delete('/side-items/:id/units/:unit', requireAdmin, (req, res) => write(res, () => ({
  changed: sideItems.removeUnit(db, Number(req.params.id), req.params.unit, ctx(req)),
})));

// Body { sheet_id, side_item_id, sort_order?, active? }: puts an item on a
// side sheet, or changes its order or on/off there.
router.route('/side-item-links').all(requireAdmin).post(setLink).put(setLink);
function setLink(req, res) {
  const { sheet_id, side_item_id, ...rest } = req.body || {};
  write(res, () => ({
    changed: sideItems.setLink(db, Number(sheet_id), Number(side_item_id), pick(rest, ['sort_order', 'active']), ctx(req)),
  }));
}

module.exports = router;
