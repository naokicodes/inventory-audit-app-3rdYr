// Loyverse sales preview (Step loyverse-preview-i) - the read-only dry run
// of the Loyverse port (docs/loyverse-sync.md -> "Dry-run sync for a date").
// Per-dish sales from the Silingan + Likod Loyverse accounts for one business
// date, and (Step loyverse-fc) FC's items by its own Loyverse categories.
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
// The sales day turns at 8am: a receipt belongs to the business date of its
// receipt_date. The rule lives in ../businessDay.js (ADR-036) for the whole app.
const { manilaDate, businessDate, BUSINESS_DAY_START_HOUR } = require('../businessDay.js');

const NAME_MAP_PATH = path.join(__dirname, '..', 'db', 'loyverse-name-map.json');
const RECEIPTS_URL = 'https://api.loyverse.com/v1.0/receipts';
const ITEMS_URL = 'https://api.loyverse.com/v1.0/items';
const CATEGORIES_URL = 'https://api.loyverse.com/v1.0/categories';
// The POS groups the Kitchen Sales switch shows (ADR-066). Only the first has
// the dish table; the others are listed by their own Loyverse categories.
const DISH_GROUP = 'silingan-likod';
const POS_GROUPS = ['silingan-likod', 'fc'];
const NO_CATEGORY = 'No category';
const LOOKBACK_DAYS = 7;
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

// created_at window: <date>T08:00:00+08:00 (the business day's start) to
// +LOOKBACK_DAYS. A late-synced receipt's created_at is AFTER its
// receipt_date, never before, so it is still caught.
function receiptWindow(date) {
  const hh = String(BUSINESS_DAY_START_HOUR).padStart(2, '0');
  const start = new Date(`${date}T${hh}:00:00+08:00`);
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
    const cell = dish[accountKey];
    if (!cell) continue; // '' = this account doesn't sell the dish
    // A cell may list several names separated by '|' (the GAS behaviour) - a
    // dish renamed keeps its old name beside the new one. Split, trim, drop
    // empties; each name is exact or wildcard on its own. The reported pattern
    // is the single name that matched, not the whole cell.
    for (const name of String(cell).split('|')) {
      const pattern = name.trim();
      if (!pattern) continue; // an empty '|' part is ignored
      const norm = normalize(pattern);
      if (!exact.has(norm)) exact.set(norm, { dish_code: dish.dish_code, pattern });
      if (norm.includes('*')) {
        wildcards.push({ dish_code: dish.dish_code, pattern, re: wildcardRegex(norm) });
      }
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

// Pages through one Loyverse list endpoint, following `cursor` until null, and
// returns every entry under `listKey`. Throws on non-200 or a network error;
// the message never carries the token.
async function fetchPaged({ url, query = {}, listKey, token, fetchImpl }) {
  const out = [];
  let cursor = null;
  do {
    const params = new URLSearchParams({ ...query, limit: String(PAGE_LIMIT) });
    if (cursor) params.set('cursor', cursor);
    const res = await fetchImpl(`${url}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status !== 200) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch (_) { /* ignore */ }
      const msg = `Loyverse API returned ${res.status}${detail ? `: ${detail}` : ''}`;
      throw new Error(msg.split(token).join('[redacted]'));
    }
    const body = await res.json();
    out.push(...(Array.isArray(body[listKey]) ? body[listKey] : []));
    cursor = body.cursor || null;
  } while (cursor);
  return out;
}

// Every receipt in the window.
function fetchReceipts({ token, window, fetchImpl }) {
  return fetchPaged({
    url: RECEIPTS_URL,
    query: { created_at_min: window.min, created_at_max: window.max },
    listKey: 'receipts',
    token,
    fetchImpl,
  });
}

function redact(err, token) {
  return String(err && err.message ? err.message : err).split(token).join('[redacted]');
}

function num(q) {
  const n = Number(q);
  return Number.isFinite(n) ? n : 0;
}

// One account: fetch, keep, resolve. Never throws - a failure comes back as
// { ok:false, error }.
async function previewAccount({ account, date, dishes, env, fetchImpl }) {
  const status = { label: account.label, ok: false, receiptsScanned: 0, receiptsKept: 0, receiptTypes: {}, lastReceiptAt: null };
  const token = env[account.tokenEnv];
  if (!token) {
    status.error = 'token not set';
    return { status };
  }

  let receipts;
  try {
    receipts = await fetchReceipts({ token, window: receiptWindow(date), fetchImpl });
  } catch (err) {
    status.error = redact(err, token);
    return { status };
  }

  const resolve = buildResolver(dishes, account.key);
  const quantities = new Map(); // dish_code -> qty
  const unmatched = new Map();  // raw item_name -> qty
  const candidates = new Map(); // dish|item_id|variant_id -> candidate
  // The latest kept receipt that has at least one kitchen (name-mapped) line.
  // Compared by time, since Loyverse may return receipts out of order.
  let lastReceiptAtMs = -Infinity;

  status.receiptsScanned = receipts.length;
  for (const receipt of receipts) {
    if (receipt.cancelled_at) continue;
    if (businessDate(receipt.receipt_date) !== date) continue;
    status.receiptsKept++;
    // Diagnostic only: REFUND receipts are still counted like sales (GAS
    // behaviour); the real port decides how refunds subtract.
    if (receipt.receipt_type) {
      status.receiptTypes[receipt.receipt_type] = (status.receiptTypes[receipt.receipt_type] || 0) + 1;
    }
    let hasKitchenLine = false;
    for (const line of receipt.line_items || []) {
      const { item_name, quantity, item_id, variant_id, variant_name } = line;
      const qty = num(quantity);
      const match = resolve(item_name);
      if (!match) {
        unmatched.set(item_name, (unmatched.get(item_name) || 0) + qty);
        continue;
      }
      hasKitchenLine = true;
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
    // Drinks-only or unmatched-only receipts don't set the time; a REFUND
    // with a kitchen line does. receipt_date is kept as Loyverse sent it.
    if (hasKitchenLine) {
      const t = new Date(receipt.receipt_date).getTime();
      if (Number.isFinite(t) && t > lastReceiptAtMs) {
        lastReceiptAtMs = t;
        status.lastReceiptAt = receipt.receipt_date;
      }
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

// The accounts of one POS group (ADR-066): 'silingan-likod' (the dish table)
// or 'fc' (the category cards).
function groupAccounts(nameMap, group) {
  return (nameMap.accounts || []).filter(a => a.group === group);
}

// The full preview for one business date. `env` holds the tokens (normally
// process.env); `fetchImpl` is injected (normally global fetch). Reads only
// the silingan-likod accounts, so FC's token (set or not) never touches it.
async function computePreview({ date, nameMap = loadNameMap(), env = process.env, fetchImpl = fetch }) {
  if (!isValidDate(date)) throw new Error('date must be YYYY-MM-DD');
  const dishes = nameMap.dishes || [];
  const accounts = groupAccounts(nameMap, DISH_GROUP);

  const results = await Promise.all(
    accounts.map(account => previewAccount({ account, date, dishes, env, fetchImpl }))
  );

  const byKey = {};
  accounts.forEach((account, i) => { byKey[account.key] = results[i]; });

  const dishRows = dishes.map(dish => {
    const row = { dish_code: dish.dish_code, name: dish.name };
    for (const account of accounts) {
      const r = byKey[account.key];
      row[account.key] = r.status.ok ? (r.quantities.get(dish.dish_code) || 0) : null;
    }
    row.total = dishTotal(row, dish, accounts);
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

// A dish's total sums the accounts that succeeded AND sell the dish (the dish's
// map column for that account is not ''). It is null only when EVERY account
// that sells the dish failed - so a down account never reads as 0 - and a dish
// the failed account doesn't sell still gets an exact total (#27 Reading B,
// architecture review 2026-10-13). No per-row partial flag now; if one is ever
// wanted it is added here, in the engine, never computed in a page.
function dishTotal(row, dish, accounts) {
  let total = 0;
  let sellers = 0;
  let sellersOk = 0;
  for (const account of accounts) {
    if (!dish[account.key]) continue; // '' = this account doesn't sell the dish
    sellers++;
    if (row[account.key] === null) continue; // this seller's account failed
    sellersOk++;
    total += row[account.key];
  }
  return sellers > 0 && sellersOk === 0 ? null : total;
}

// One account for the category view (Step loyverse-fc). Same window, fetch and
// failure rules as previewAccount; a REFUND receipt's lines SUBTRACT here.
// Then the account's /items and /categories place each line's item_id in a
// category. If either catalog call fails, the receipts still count: every
// line lands in "No category" and status.catalogError says why. Never throws.
async function categoryAccount({ account, date, env, fetchImpl }) {
  const status = { label: account.label, ok: false, receiptsScanned: 0, receiptsKept: 0, receiptTypes: {}, lastReceiptAt: null };
  const token = env[account.tokenEnv];
  if (!token) {
    status.error = 'token not set';
    return { status };
  }

  let receipts;
  try {
    receipts = await fetchReceipts({ token, window: receiptWindow(date), fetchImpl });
  } catch (err) {
    status.error = redact(err, token);
    return { status };
  }

  // item_id -> category name. Deleted items and categories are asked for too:
  // an item sold that day may have been deleted since.
  let categoryOf = null;
  try {
    const [items, categories] = await Promise.all([
      fetchPaged({ url: ITEMS_URL, query: { show_deleted: 'true' }, listKey: 'items', token, fetchImpl }),
      fetchPaged({ url: CATEGORIES_URL, query: { show_deleted: 'true' }, listKey: 'categories', token, fetchImpl }),
    ]);
    const catName = new Map(categories.map(c => [c.id, c.name]));
    categoryOf = new Map();
    for (const item of items) {
      const name = item.category_id != null ? catName.get(item.category_id) : null;
      if (name) categoryOf.set(item.id, name);
    }
  } catch (err) {
    status.catalogError = redact(err, token);
  }

  const lines = []; // { category, name, quantity }
  let lastReceiptAtMs = -Infinity;
  status.receiptsScanned = receipts.length;
  for (const receipt of receipts) {
    if (receipt.cancelled_at) continue;
    if (businessDate(receipt.receipt_date) !== date) continue;
    status.receiptsKept++;
    if (receipt.receipt_type) {
      status.receiptTypes[receipt.receipt_type] = (status.receiptTypes[receipt.receipt_type] || 0) + 1;
    }
    const sign = receipt.receipt_type === 'REFUND' ? -1 : 1;
    let hasLine = false;
    for (const line of receipt.line_items || []) {
      const { item_name, quantity, item_id } = line;
      hasLine = true;
      const category = (categoryOf && categoryOf.get(item_id)) || NO_CATEGORY;
      lines.push({ category, name: item_name == null ? '' : String(item_name), quantity: sign * num(quantity) });
    }
    if (hasLine) {
      const t = new Date(receipt.receipt_date).getTime();
      if (Number.isFinite(t) && t > lastReceiptAtMs) {
        lastReceiptAtMs = t;
        status.lastReceiptAt = receipt.receipt_date;
      }
    }
  }

  status.ok = true;
  return { status, lines };
}

// FC's side of Kitchen Sales (ADR-066): items sold on one business date,
// grouped by the group's own Loyverse categories. Categories sorted by name;
// items biggest first (then by name); an item netting 0 is left out, and a
// category left empty is dropped. Only item_name, quantity and item_id are
// read from a line - never a money field.
async function computeCategories({ date, group, nameMap = loadNameMap(), env = process.env, fetchImpl = fetch }) {
  if (!isValidDate(date)) throw new Error('date must be YYYY-MM-DD');
  const accounts = groupAccounts(nameMap, group);
  const results = await Promise.all(
    accounts.map(account => categoryAccount({ account, date, env, fetchImpl }))
  );

  const byCategory = new Map(); // category -> Map(item name -> qty)
  for (const r of results) {
    for (const { category, name, quantity } of r.lines || []) {
      if (!byCategory.has(category)) byCategory.set(category, new Map());
      const items = byCategory.get(category);
      items.set(name, (items.get(name) || 0) + quantity);
    }
  }

  const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const categories = [...byCategory]
    .map(([name, items]) => ({
      name,
      items: [...items]
        .filter(([, quantity]) => quantity !== 0)
        .map(([itemName, quantity]) => ({ name: itemName, quantity }))
        .sort((a, b) => b.quantity - a.quantity || byName(a.name.toLowerCase(), b.name.toLowerCase())),
    }))
    .filter(c => c.items.length > 0)
    .sort((a, b) => byName(a.name.toLowerCase(), b.name.toLowerCase()));

  return { date, group, accounts: results.map(r => r.status), categories };
}

module.exports = {
  computePreview,
  computeCategories,
  POS_GROUPS,
  NO_CATEGORY,
  loadNameMap,
  isValidDate,
  manilaDate,
  businessDate,
  receiptWindow,
  normalize,
  wildcardRegex,
  buildResolver,
  LOOKBACK_DAYS,
  BUSINESS_DAY_START_HOUR,
};
