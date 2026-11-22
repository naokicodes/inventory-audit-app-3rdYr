// API for the read-only Loyverse sales preview (Step loyverse-preview-i).
// GET /api/loyverse/preview?date=YYYY-MM-DD - per-dish sales from the
// Silingan + Likod accounts for one business date. Writes nothing; the logic
// lives in server/engines/loyversePreview.js.
// GET /api/loyverse/preview?date=&pos=fc (Step landing-sales, ADR-094) - FC's
// side: FC's landing lines in portions, its Pizza table and everything else
// sold. No `pos`, or pos=silingan-likod, is the dish preview (plus its Pizza
// table); any other pos -> 400.
//
// Step sales-cache (ADR-112): each result is kept in memory per
// `<pos>|<date>` for a short time (2 min for today, 30 min for the 7 dates
// before it, until restart for older ones); `fresh=1` always fetches. A result
// with a failed account is never kept. Every body gains `fetchedAt`.
//
// Tokens come from process.env (LOYVERSE_SILINGAN_TOKEN,
// LOYVERSE_LIKOD_TOKEN, LOYVERSE_FC_TOKEN, loaded from .env by
// server/index.js). They are never logged and never sent to the browser.

const express = require('express');
const { computePreview, computeFcLanding, POS_GROUPS, isValidDate, businessDate, LOOKBACK_DAYS } = require('../engines/loyversePreview.js');

const router = express.Router();

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const CACHE_MAX = 120;

// kept: key -> { body, fetchedMs } in fetch order (oldest first);
// inflight: key -> the running fetch's promise.
function createCache() {
  return { kept: new Map(), inflight: new Map() };
}
const defaultCache = createCache();

// How long a result for `date` stays fresh enough, given today's business date.
function maxAgeMs(date, today) {
  const daysBack = Math.round((Date.parse(today) - Date.parse(date)) / DAY);
  if (daysBack <= 0) return 2 * MINUTE;
  if (daysBack <= LOOKBACK_DAYS) return 30 * MINUTE;
  return Infinity;
}

function keep(cache, key, entry) {
  const prev = cache.kept.get(key);
  if (prev && prev.fetchedMs > entry.fetchedMs) return; // a newer fetch already landed
  cache.kept.delete(key);
  cache.kept.set(key, entry);
  while (cache.kept.size > CACHE_MAX) cache.kept.delete(cache.kept.keys().next().value);
}

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
  const cache = deps.cache || defaultCache;
  const nowMs = (deps.now || new Date()).getTime();
  const key = `${pos}|${date}`;
  const fresh = query.fresh === '1';

  if (!fresh) {
    const hit = cache.kept.get(key);
    if (hit && nowMs - hit.fetchedMs < maxAgeMs(date, businessDate(new Date(nowMs)))) {
      return { status: 200, body: withFetchedAt(hit) };
    }
    const running = cache.inflight.get(key);
    if (running) return { status: 200, body: withFetchedAt(await running) };
  }

  const compute = pos === 'fc' ? computeFcLanding : computePreview;
  const run = compute({
    date,
    nameMap: deps.nameMap,
    env: deps.env || process.env,
    fetchImpl: deps.fetchImpl || fetch,
  }).then(body => {
    const entry = { body, fetchedMs: nowMs };
    if ((body.accounts || []).every(a => a.ok)) keep(cache, key, entry);
    return entry;
  });
  cache.inflight.set(key, run);
  const settle = () => { if (cache.inflight.get(key) === run) cache.inflight.delete(key); };
  run.then(settle, settle);
  return { status: 200, body: withFetchedAt(await run) };
}

function withFetchedAt(entry) {
  return { ...entry.body, fetchedAt: new Date(entry.fetchedMs).toISOString() };
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
module.exports.createCache = createCache;
