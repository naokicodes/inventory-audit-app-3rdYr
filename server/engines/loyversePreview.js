// Loyverse sales preview (Step loyverse-preview-i) - the read-only dry run
// of the Loyverse port (docs/loyverse-sync.md -> "Dry-run sync for a date").
// Per-dish sales from the Silingan + Likod Loyverse accounts for one business
// date, and (Step landing-sales, ADR-094) FC's side by FC's landing lines.
// Both sides add a Pizza table from each account's pizza list.
//
// WRITES NOTHING: no table, no migration, not on the audit engine's path
// (rule 14). Pure logic plus an injected fetch, so tests never touch the
// network. The real port later adds the write into `sales` on top of this
// same module.
//
// Only item_name, quantity, item_id, variant_id and variant_name are read
// from a line item (and id, item_name, category_id, deleted_at from /items) -
// never a price or money field - and the token never appears in any output or
// error text.

const fs = require('fs');
const path = require('path');
// The sales day turns at 8am: a receipt belongs to the business date of its
// receipt_date. The rule lives in ../businessDay.js (ADR-036) for the whole app.
const { manilaDate, businessDate, BUSINESS_DAY_START_HOUR } = require('../businessDay.js');

const NAME_MAP_PATH = path.join(__dirname, '..', 'db', 'loyverse-name-map.json');
const RECEIPTS_URL = 'https://api.loyverse.com/v1.0/receipts';
const ITEMS_URL = 'https://api.loyverse.com/v1.0/items';
const CATEGORIES_URL = 'https://api.loyverse.com/v1.0/categories';
// The POS groups the Kitchen Sales switch shows (ADR-066): the dish table, and
// FC's landing (ADR-094).
const DISH_GROUP = 'silingan-likod';
const FC_GROUP = 'fc';
const POS_GROUPS = [DISH_GROUP, FC_GROUP];
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
// { ok:false, error }. With a pizza list in the map (`rule`), it also reads
// the account's /items and /categories for the Pizza table (Step
// landing-sales): `pizza` is the account's rows, or null with catalogError when
// that read fails; undefined when the map lists no pizza for the account.
async function previewAccount({ account, date, dishes, env, fetchImpl, rule = null }) {
  const status = { label: account.label, ok: false, receiptsScanned: 0, receiptsKept: 0, receiptTypes: {}, lastReceiptAt: null };
  const noPizza = rule ? null : undefined;
  const token = env[account.tokenEnv];
  if (!token) {
    status.error = 'token not set';
    return { status, pizza: noPizza };
  }

  let receipts;
  try {
    receipts = await fetchReceipts({ token, window: receiptWindow(date), fetchImpl });
  } catch (err) {
    status.error = redact(err, token);
    return { status, pizza: noPizza };
  }

  let pizzaItems = null;
  if (rule) {
    try {
      pizzaItems = await fetchPizzaItems({ rule, token, fetchImpl });
    } catch (err) {
      status.catalogError = redact(err, token);
    }
  }
  const pizzaSold = new Map(); // item_id -> net quantity

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
    // The Pizza table subtracts a REFUND's lines; the dish table keeps
    // counting them like sales (above).
    const pizzaSign = receipt.receipt_type === 'REFUND' ? -1 : 1;
    let hasKitchenLine = false;
    for (const line of receipt.line_items || []) {
      const { item_name, quantity, item_id, variant_id, variant_name } = line;
      const qty = num(quantity);
      if (pizzaItems && pizzaItems.has(item_id)) {
        pizzaSold.set(item_id, (pizzaSold.get(item_id) || 0) + pizzaSign * qty);
      }
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
    pizza: rule ? (pizzaItems ? pizzaRows(pizzaItems, pizzaSold) : null) : undefined,
  };
}

// The accounts of one POS group (ADR-066): 'silingan-likod' (the dish table)
// or 'fc' (FC's landing, ADR-094).
function groupAccounts(nameMap, group) {
  return (nameMap.accounts || []).filter(a => a.group === group);
}

// The full preview for one business date. `env` holds the tokens (normally
// process.env); `fetchImpl` is injected (normally global fetch). Reads only
// the silingan-likod accounts, so FC's token (set or not) never touches it.
// `pizza` (Step landing-sales) is the two accounts' Pizza table, or null.
async function computePreview({ date, nameMap = loadNameMap(), env = process.env, fetchImpl = fetch }) {
  if (!isValidDate(date)) throw new Error('date must be YYYY-MM-DD');
  const dishes = nameMap.dishes || [];
  const accounts = groupAccounts(nameMap, DISH_GROUP);

  const results = await Promise.all(accounts.map(account =>
    previewAccount({ account, date, dishes, env, fetchImpl, rule: pizzaRule(nameMap, account.key) })
  ));

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
    pizza: pizzaTable(accounts, results),
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

// --- Pizza tables (Step landing-sales, ADR-094) ---
// The map's `pizza.<account key>` lists an account's pizza items: Loyverse
// category names (normalized) and item names (the dish cells' rules: exact,
// '*' wildcard, '|'). Returns null when the map lists none for the account.
function pizzaRule(nameMap, key) {
  const cfg = nameMap.pizza && nameMap.pizza[key];
  if (!cfg) return null;
  return {
    categories: new Set((cfg.categories || []).map(normalize)),
    matchName: buildResolver((cfg.items || []).map(name => ({ dish_code: 'pizza', name })), 'name'),
  };
}

// The account's pizza items from its /items and /categories: item_id ->
// { name, deleted }. Deleted items and categories are asked for too: an item
// sold that day may have been deleted since. Throws on a failed call.
async function fetchPizzaItems({ rule, token, fetchImpl }) {
  const [items, categories] = await Promise.all([
    fetchPaged({ url: ITEMS_URL, query: { show_deleted: 'true' }, listKey: 'items', token, fetchImpl }),
    fetchPaged({ url: CATEGORIES_URL, query: { show_deleted: 'true' }, listKey: 'categories', token, fetchImpl }),
  ]);
  const catName = new Map(categories.map(c => [c.id, normalize(c.name)]));
  const out = new Map();
  for (const item of items) {
    const cat = item.category_id != null ? catName.get(item.category_id) : undefined;
    const name = item.item_name == null ? '' : String(item.item_name);
    if ((cat !== undefined && rule.categories.has(cat)) || rule.matchName(name)) {
      out.set(item.id, { name, deleted: !!item.deleted_at });
    }
  }
  return out;
}

// One account's pizza rows: normalized name -> { name, quantity }. Every item
// not deleted (0 when unsold), plus a deleted one that appears on a receipt
// that day. `sold` is item_id -> net quantity (a REFUND's lines subtract).
function pizzaRows(pizzaItems, sold) {
  const rows = new Map();
  for (const [id, item] of pizzaItems) {
    if (item.deleted && !sold.has(id)) continue;
    const key = normalize(item.name);
    let row = rows.get(key);
    if (!row) { row = { name: item.name, quantity: 0, deleted: item.deleted }; rows.set(key, row); }
    if (row.deleted && !item.deleted) { row.name = item.name; row.deleted = false; } // the live item's spelling
    row.quantity += sold.get(id) || 0;
  }
  return new Map([...rows].map(([key, { name, quantity }]) => [key, { name, quantity }]));
}

// The Pizza table of one side: { columns: [account keys], rows: [{ name,
// <key>: n, total }] } joined by normalized name, sorted by name. A failed
// account's cell is null (its list is unknown, so its names come from the
// others); total sums the cells that are not null, dishTotal's rule. null when
// no account of the side has a pizza list, or every one of them failed.
function pizzaTable(accounts, results) {
  const cols = [];
  accounts.forEach((account, i) => { if (results[i].pizza !== undefined) cols.push({ key: account.key, r: results[i] }); });
  if (cols.length === 0 || cols.every(c => !c.r.pizza)) return null;
  const joined = new Map(); // normalized name -> { name, counts }
  for (const { key, r } of cols) {
    if (!r.pizza) continue;
    for (const [norm, { name, quantity }] of r.pizza) {
      if (!joined.has(norm)) joined.set(norm, { name, counts: {} });
      joined.get(norm).counts[key] = quantity;
    }
  }
  const rows = [...joined.values()].map(({ name, counts }) => {
    const row = { name };
    let total = 0;
    for (const { key, r } of cols) {
      row[key] = r.pizza ? (counts[key] || 0) : null;
      if (row[key] !== null) total += row[key];
    }
    row.total = total;
    return row;
  });
  rows.sort((a, b) => byName(a.name.toLowerCase(), b.name.toLowerCase()));
  return { columns: cols.map(c => c.key), rows };
}

function byName(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Adds `quantity` to the row of `name` (normalized) in `map`, creating it with
// `extra` fields the first time.
function addNamed(map, name, quantity, extra = {}) {
  const key = normalize(name);
  let row = map.get(key);
  if (!row) { row = { name, quantity: 0, ...extra }; map.set(key, row); }
  row.quantity += quantity;
}

// Names with a non-zero net quantity, biggest first, then by name.
function listed(map) {
  return [...map.values()]
    .filter(r => r.quantity !== 0)
    .sort((a, b) => b.quantity - a.quantity || byName(a.name.toLowerCase(), b.name.toLowerCase()));
}

// --- FC's side: the landing (Step landing-sales, ADR-094) ---
// The map's `fcLanding`: `lines` in the sheet's order, and `items` - each a
// Loyverse name (the dish cells' rules) with `pos` (portions counted on a line
// per one sold) and optional `takes` (an amount taken from a line's stock).
function landingRule(nameMap) {
  const fl = nameMap.fcLanding || {};
  const items = fl.items || [];
  const resolve = buildResolver(items.map((item, i) => ({ dish_code: i, name: item.name })), 'name');
  return {
    lines: fl.lines || [],
    entryFor(itemName) {
      const hit = resolve(itemName);
      return hit ? items[hit.dish_code] : null;
    },
  };
}

// One FC account. The receipt pass of the old category view (loyverse-fc):
// the window, cancelled skipped, the business date, a REFUND's lines subtract
// (ADR-076), never a money field. Each line's item_name resolves against
// fcLanding first, then the account's pizza list (by item_id), else "other".
// If /items or /categories fails, the landing still counts (it needs names
// only), pizza is null with catalogError, and pizza sales fall into other.
// Never throws.
async function fcAccount({ account, date, env, fetchImpl, rule, landing }) {
  const status = { label: account.label, ok: false, receiptsScanned: 0, receiptsKept: 0, receiptTypes: {}, lastReceiptAt: null };
  const noPizza = rule ? null : undefined;
  const token = env[account.tokenEnv];
  if (!token) {
    status.error = 'token not set';
    return { status, pizza: noPizza };
  }

  let receipts;
  try {
    receipts = await fetchReceipts({ token, window: receiptWindow(date), fetchImpl });
  } catch (err) {
    status.error = redact(err, token);
    return { status, pizza: noPizza };
  }

  let pizzaItems = null;
  if (rule) {
    try {
      pizzaItems = await fetchPizzaItems({ rule, token, fetchImpl });
    } catch (err) {
      status.catalogError = redact(err, token);
    }
  }

  const landed = []; // { entry, name, quantity }
  const pizzaSold = new Map(); // item_id -> net quantity
  const other = new Map(); // normalized name -> { name, quantity }
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
      const name = item_name == null ? '' : String(item_name);
      const qty = sign * num(quantity);
      const entry = landing.entryFor(name);
      if (entry) landed.push({ entry, name, quantity: qty });
      else if (pizzaItems && pizzaItems.has(item_id)) pizzaSold.set(item_id, (pizzaSold.get(item_id) || 0) + qty);
      else addNamed(other, name, qty);
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
  return {
    status,
    landed,
    pizza: rule ? (pizzaItems ? pizzaRows(pizzaItems, pizzaSold) : null) : undefined,
    other,
  };
}

// FC's side of Kitchen Sales (ADR-094): every landing line in the sheet's
// order (0s included) with the portions sold (quantity x portions) and the
// amount other dishes took (quantity x amount); the line's items and takers
// (non-zero only, biggest first); FC's Pizza table; and "other" - everything
// else sold, biggest first. Plain numbers: the page formats halves.
async function computeFcLanding({ date, nameMap = loadNameMap(), env = process.env, fetchImpl = fetch }) {
  if (!isValidDate(date)) throw new Error('date must be YYYY-MM-DD');
  const accounts = groupAccounts(nameMap, FC_GROUP);
  const landing = landingRule(nameMap);
  const results = await Promise.all(accounts.map(account =>
    fcAccount({ account, date, env, fetchImpl, rule: pizzaRule(nameMap, account.key), landing })
  ));

  const perLine = new Map(landing.lines.map(line => [line, { items: new Map(), takenBy: new Map() }]));
  const other = new Map();
  for (const r of results) {
    for (const { entry, name, quantity } of r.landed || []) {
      for (const [line, portions] of Object.entries(entry.pos || {})) {
        const l = perLine.get(line);
        if (l) addNamed(l.items, name, quantity, { portions });
      }
      for (const [line, amount] of Object.entries(entry.takes || {})) {
        const l = perLine.get(line);
        if (l) addNamed(l.takenBy, name, quantity, { amount });
      }
    }
    for (const { name, quantity } of (r.other || new Map()).values()) addNamed(other, name, quantity);
  }

  const landingRows = landing.lines.map(line => {
    const l = perLine.get(line);
    const items = listed(l.items).map(({ name, quantity, portions }) => ({ name, quantity, portions }));
    const takenBy = listed(l.takenBy).map(({ name, quantity, amount }) => ({ name, quantity, amount }));
    return {
      line,
      sold: items.reduce((s, i) => s + i.quantity * i.portions, 0),
      taken: takenBy.reduce((s, t) => s + t.quantity * t.amount, 0),
      items,
      takenBy,
    };
  });

  return {
    date,
    group: FC_GROUP,
    accounts: results.map(r => r.status),
    landing: landingRows,
    pizza: pizzaTable(accounts, results),
    other: listed(other).map(({ name, quantity }) => ({ name, quantity })),
  };
}

module.exports = {
  computePreview,
  computeFcLanding,
  POS_GROUPS,
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
