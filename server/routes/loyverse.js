// API for the read-only Loyverse sales preview (Step loyverse-preview-i).
// GET /api/loyverse/preview?date=YYYY-MM-DD - per-dish sales from both
// Loyverse accounts for one business date. Writes nothing; the logic lives
// in server/engines/loyversePreview.js.
//
// Tokens come from process.env (LOYVERSE_SILINGAN_TOKEN,
// LOYVERSE_LIKOD_TOKEN, loaded from .env by server/index.js). They are
// never logged and never sent to the browser.

const express = require('express');
const { computePreview, isValidDate, manilaDate } = require('../engines/loyversePreview.js');

const router = express.Router();

// Pure handler so tests can call it with a stub env + fetch.
// Returns { status, body }.
async function handlePreview(query, deps = {}) {
  const date = query.date === undefined || query.date === '' ? manilaDate(deps.now || new Date()) : query.date;
  if (!isValidDate(date)) {
    return { status: 400, body: { error: 'date must be YYYY-MM-DD' } };
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
