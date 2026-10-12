// Loyverse sales preview (Step loyverse-preview-i) - the read-only dry run
// of the Loyverse port (docs/loyverse-sync.md -> "Dry-run sync for a date").
// Per-dish sales from BOTH Loyverse accounts for one business date.
//
// WRITES NOTHING: no table, no migration, not on the audit engine's path
// (rule 14). Pure logic plus an injected fetch, so tests never touch the
// network. The real port later adds the write into `sales` on top of this
// same module.
//
// Only item_name, quantity, item_id, variant_id and variant_name are read
// from a line item - never a price or total field - and the token never
// appears in any output or error text.

const fs = require('fs');
const path = require('path');

const NAME_MAP_PATH = path.join(__dirname, '..', 'db', 'loyverse-name-map.json');
const RECEIPTS_URL = 'https://api.loyverse.com/v1.0/receipts';
const LOOKBACK_DAYS = 7;
const TIMEZONE = 'Asia/Manila';
const PAGE_LIMIT = 250;

function loadNameMap() {
  return JSON.parse(fs.readFileSync(NAME_MAP_PATH, 'utf8'));
}

// YYYY-MM-DD and a real calendar date (2026-02-30 is rejected).
function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const manilaDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

// Calendar date (YYYY-MM-DD) of an instant, in Asia/Manila.
function manilaDate(instant) {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  return manilaDateFormat.format(d);
}

// created_at window: <date>T00:00:00+08:00 to +LOOKBACK_DAYS. A late-synced
// receipt's created_at is AFTER its receipt_date, never before.
function receiptWindow(date) {
  const start = new Date(`${date}T00:00:00+08:00`);
  const end = new Date(start.getTime() + LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  return { min: start.toISOString(), max: end.toISOString() };
}

function normalize(name) {
  return String(name == null ? '' : name).trim().toLowerCase().replace(/\s+/g, ' ');
}

// '*' -> '.*', anchored; every other regex metachar escaped (the GAS
// escapeRegex fix).
function wildcardRegex(normalizedPattern) {
  const body = normalizedPattern
    .split('*')
    .map(part => part.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}$`);
}

// Per-account resolver: exact (normalized) match first, then the first
// wildcard row in map order. Returns { dish_code, matchedBy, pattern } or null.
function buildResolver(dishes, accountKey) {
  const exact = new Map();
  const wildcards = [];
  for (const dish of dishes) {
    const pattern = dish[accountKey];
    if (!pattern) continue; // '' = this account doesn't sell the dish
    const norm = normalize(pattern);
    if (!exact.has(norm)) exact.set(norm, { dish_code: dish.dish_code, pattern });
    if (norm.includes('*')) {
      wildcards.push({ dish_code: dish.dish_code, pattern, re: wildcardRegex(norm) });
    }
  }
  return function resolve(itemName) {
    const norm = normalize(itemName);
    const hit = exact.get(norm);
    if (hit) return { dish_code: hit.dish_code, matchedBy: 'exact', pattern: hit.pattern };
    for (const w of wildcards) {
      if (w.re.test(norm)) return { dish_code: w.dish_code, matchedBy: 'wildcard', pattern: w.pattern };
    }
    return null;
  };
}

// Pages through every receipt in the window, following `cursor` until null.
// Throws on non-200 or a network error; the message never carries the token.
async function fetchReceipts({ token, window, fetchImpl }) {
  const receipts = [];
  let cursor = null;
  do {
    const params = new URLSearchParams({
      created_at_min: window.min,
      created_at_max: window.max,
      limit: String(PAGE_LIMIT),
    });
    if (cursor) params.set('cursor', cursor);
    const res = await fetchImpl(`${RECEIPTS_URL}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status !== 200) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch (_) { /* ignore */ }
      const msg = `Loyverse API returned ${res.status}${detail ? `: ${detail}` : ''}`;
      throw new Error(msg.split(token).join('[redacted]'));
    }
    const body = await res.json();
    receipts.push(...(Array.isArray(body.receipts) ? body.receipts : []));
    cursor = body.cursor || null;
  } while (cursor);
  return receipts;
}

function num(q) {
  const n = Number(q);
  return Number.isFinite(n) ? n : 0;
}

// One account: fetch, keep, resolve. Never throws - a failure comes back as
// { ok:false, error }.
async function previewAccount({ account, date, dishes, env, fetchImpl }) {
  const status = { label: account.label, ok: false, receiptsScanned: 0, receiptsKept: 0, receiptTypes: {} };
  const token = env[account.tokenEnv];
  if (!token) {
    status.error = 'token not set';
    return { status };
  }

  let receipts;
  try {
    receipts = await fetchReceipts({ token, window: receiptWindow(date), fetchImpl });
  } catch (err) {
    status.error = String(err && err.message ? err.message : err).split(token).join('[redacted]');
    return { status };
  }

  const resolve = buildResolver(dishes, account.key);
  const quantities = new Map(); // dish_code -> qty
  const unmatched = new Map();  // raw item_name -> qty
  const candidates = new Map(); // dish|item_id|variant_id -> candidate

  status.receiptsScanned = receipts.length;
  for (const receipt of receipts) {
    if (receipt.cancelled_at) continue;
    if (manilaDate(receipt.receipt_date) !== date) continue;
    status.receiptsKept++;
    // Diagnostic only: REFUND receipts are still counted like sales (GAS
    // behaviour); the real port decides how refunds subtract.
    if (receipt.receipt_type) {
      status.receiptTypes[receipt.receipt_type] = (status.receiptTypes[receipt.receipt_type] || 0) + 1;
    }
    for (const line of receipt.line_items || []) {
      const { item_name, quantity, item_id, variant_id, variant_name } = line;
      const qty = num(quantity);
      const match = resolve(item_name);
      if (!match) {
        unmatched.set(item_name, (unmatched.get(item_name) || 0) + qty);
        continue;
      }
      quantities.set(match.dish_code, (quantities.get(match.dish_code) || 0) + qty);
      const key = `${match.dish_code}|${item_id}|${variant_id}`;
      let c = candidates.get(key);
      if (!c) {
        c = {
          dish_code: match.dish_code,
          account: account.label,
          item_id: item_id == null ? null : item_id,
          variant_id: variant_id == null ? null : variant_id,
          item_name,
          variant_name: variant_name == null ? null : variant_name,
          matchedBy: match.matchedBy,
          pattern: match.pattern,
          quantity: 0,
        };
        candidates.set(key, c);
      }
      c.quantity += qty;
    }
  }

  status.ok = true;
  return {
    status,
    quantities,
    unmatched: [...unmatched].map(([item_name, quantity]) => ({ account: account.label, item_name, quantity })),
    idCandidates: [...candidates.values()],
  };
}

// The full preview for one business date. `env` holds the tokens (normally
// process.env); `fetchImpl` is injected (normally global fetch).
async function computePreview({ date, nameMap = loadNameMap(), env = process.env, fetchImpl = fetch }) {
  if (!isValidDate(date)) throw new Error('date must be YYYY-MM-DD');
  const dishes = nameMap.dishes || [];

  const results = await Promise.all(
    nameMap.accounts.map(account => previewAccount({ account, date, dishes, env, fetchImpl }))
  );

  const byKey = {};
  nameMap.accounts.forEach((account, i) => { byKey[account.key] = results[i]; });

  const dishRows = dishes.map(dish => {
    const row = { dish_code: dish.dish_code, name: dish.name };
    for (const account of nameMap.accounts) {
      const r = byKey[account.key];
      row[account.key] = r.status.ok ? (r.quantities.get(dish.dish_code) || 0) : null;
    }
    row.total = dishTotal(row, nameMap.accounts);
    return row;
  });

  return {
    date,
    accounts: results.map(r => r.status),
    dishes: dishRows,
    unmatched: results.flatMap(r => r.unmatched || []),
    idCandidates: results.flatMap(r => r.idCandidates || []),
  };
}

// UNDECIDED - see the needs-architect issue linked from this step's PR: the
// spec settles a failed account's COLUMN (null, never 0) but not the TOTAL.
// Placeholder until decided: null when any account failed.
function dishTotal(row, accounts) {
  let total = 0;
  for (const account of accounts) {
    if (row[account.key] === null) return null;
    total += row[account.key];
  }
  return total;
}

module.exports = {
  computePreview,
  loadNameMap,
  isValidDate,
  manilaDate,
  receiptWindow,
  normalize,
  wildcardRegex,
  buildResolver,
  LOOKBACK_DAYS,
};
