// API for the read-only Loyverse sales preview (Step loyverse-preview-i).
// GET /api/loyverse/preview?date=YYYY-MM-DD - per-dish sales from the
// Silingan + Likod accounts for one business date. Writes nothing; the logic
// lives in server/engines/loyversePreview.js.
// GET /api/loyverse/preview?date=&pos=fc (Step loyverse-fc, ADR-066) - FC's
// items sold that date, grouped by FC's own Loyverse categories. No `pos`, or
// pos=silingan-likod, is the dish preview unchanged; any other pos -> 400.
//
// Tokens come from process.env (LOYVERSE_SILINGAN_TOKEN,
// LOYVERSE_LIKOD_TOKEN, LOYVERSE_FC_TOKEN, loaded from .env by
// server/index.js). They are never logged and never sent to the browser.

const express = require('express');
const { computePreview, computeCategories, POS_GROUPS, isValidDate, businessDate } = require('../engines/loyversePreview.js');

const router = express.Router();

// Pure handler so tests can call it with a stub env + fetch.
// Returns { status, body }.
async function handlePreview(query, deps = {}) {
  const pos = query.pos === undefined || query.pos === '' ? 'silingan-likod' : query.pos;
  if (!POS_GROUPS.includes(pos)) {
    return { status: 400, body: { error: `pos must be one of: ${POS_GROUPS.join(', ')}` } };
  }
  const date = query.date === undefined || query.date === '' ? businessDate(deps.now || new Date()) : query.date;
  if (!isValidDate(date)) {
    return { status: 400, body: { error: 'date must be YYYY-MM-DD' } };
  }
  if (pos !== 'silingan-likod') {
    const body = await computeCategories({
      date,
      group: pos,
      nameMap: deps.nameMap,
      env: deps.env || process.env,
      fetchImpl: deps.fetchImpl || fetch,
    });
    return { status: 200, body };
  }
  const body = await computePreview({
    date,
    nameMap: deps.nameMap,
    env: deps.env || process.env,
    fetchImpl: deps.fetchImpl || fetch,
  });
  return { status: 200, body };
}

router.get('/loyverse/preview', async (req, res) => {
  try {
    const { status, body } = await handlePreview(req.query);
    res.status(status).json(body);
  } catch (err) {
    console.error('loyverse preview failed:', err.message);
    res.status(500).json({ error: 'preview failed' });
  }
});

module.exports = router;
module.exports.handlePreview = handlePreview;
