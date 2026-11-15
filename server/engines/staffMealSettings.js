// Step staff-meal-settings (ADR-027, ADR-044): each restaurant's staff meal
// slots (a fixed budget and/or a per-head rate) and the group-wide dated rice
// rates. Every write runs in its own transaction with its activity_log row
// (MANUAL). Bad input throws an Error with status 400 and writes nothing.
// `actor` is the logged-in user ({ id, name }) or null.

const { withTransaction, logActivity } = require('../db/activityLog.js');
const { resolveSiteCode } = require('../db/siteAccess.js');
const { businessDate } = require('../businessDay.js');

const bad = message => Object.assign(new Error(message), { status: 400 });
const notFound = message => Object.assign(new Error(message), { status: 404 });

const getSlot = (db, id) => db.prepare('SELECT * FROM staff_meal_slots WHERE id = ?').get(id);

// '' / null -> null (none); otherwise a number 0 or more.
function parseAmount(value, label) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw bad(`${label} must be blank or a number, 0 or more`);
  return n;
}

function parseFlag(value) {
  if (value === true || value === 1 || value === '1') return 1;
  if (value === false || value === 0 || value === '0') return 0;
  throw bad('Active must be true or false');
}

// The checked fields present in `fields` (partial update). siteCode is the
// slot's site, for the unique-name check.
function cleanSlotFields(db, fields, siteCode, id = null) {
  const out = {};
  if ('name' in fields) {
    out.name = String(fields.name ?? '').trim().replace(/\s+/g, ' ');
    if (!out.name) throw bad('A meal slot needs a name');
    const other = db.prepare('SELECT id FROM staff_meal_slots WHERE site_code = ? AND name = ?').get(siteCode, out.name);
    if (other && other.id !== id) throw bad(`This restaurant already has a slot called "${out.name}"`);
  }
  if ('sort_order' in fields) {
    out.sort_order = Number(fields.sort_order);
    if (!Number.isInteger(out.sort_order)) throw bad('Order must be a whole number');
  }
  if ('fixed_budget' in fields) out.fixed_budget = parseAmount(fields.fixed_budget, 'Fixed budget');
  if ('per_head_rate' in fields) out.per_head_rate = parseAmount(fields.per_head_rate, 'Per-head rate');
  if ('active' in fields) out.active = parseFlag(fields.active);
  return out;
}

function listSlots(db, siteCode, { activeOnly = false } = {}) {
  return db.prepare(`SELECT * FROM staff_meal_slots WHERE site_code = ? ${activeOnly ? 'AND active = 1' : ''}
                     ORDER BY sort_order, id`).all(siteCode);
}

function createSlot(db, fields, actor = null) {
  const siteCode = String(fields.site_code ?? '').trim();
  const site = siteCode ? resolveSiteCode(db, siteCode) : null;
  if (!site) throw bad('Pick a restaurant');
  if (site.type !== 'restaurant') throw bad('Staff meal slots are for restaurants, not a commissary');
  const f = cleanSlotFields(db, { fixed_budget: null, per_head_rate: null, active: 1, ...fields }, siteCode);
  if (!('name' in f)) throw bad('A meal slot needs a name');
  // A new slot goes last unless an order is given.
  if (!('sort_order' in f)) {
    f.sort_order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM staff_meal_slots WHERE site_code = ?').get(siteCode).n;
  }
  return withTransaction(db, () => {
    const id = Number(db.prepare(`INSERT INTO staff_meal_slots (site_code, name, sort_order, fixed_budget, per_head_rate, active)
                                  VALUES (?, ?, ?, ?, ?, ?)`)
      .run(siteCode, f.name, f.sort_order, f.fixed_budget, f.per_head_rate, f.active).lastInsertRowid);
    const after = getSlot(db, id);
    logActivity(db, { actor: actor?.name ?? null, entityType: 'staff_meal_slots', entityId: id, action: 'CREATE', before: null, after, source: 'MANUAL' });
    return after;
  });
}

// Changes only the fields given; the site is fixed. No change writes nothing.
function updateSlot(db, id, fields, actor = null) {
  const before = getSlot(db, id);
  if (!before) throw notFound('No such meal slot');
  const f = cleanSlotFields(db, fields, before.site_code, before.id);
  const keys = Object.keys(f).filter(k => f[k] !== before[k]);
  if (keys.length === 0) return { slot: before, changed: false };
  return withTransaction(db, () => {
    db.prepare(`UPDATE staff_meal_slots SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`)
      .run(...keys.map(k => f[k]), id);
    const after = getSlot(db, id);
    logActivity(db, { actor: actor?.name ?? null, entityType: 'staff_meal_slots', entityId: id, action: 'UPDATE', before, after, source: 'MANUAL' });
    return { slot: after, changed: true };
  });
}

// ADR-027: the fixed amount is the budget, head count x rate the maximum.
// Only a rate: the maximum is also the budget. Neither: no budget (nulls).
function budgetFor({ fixed_budget, per_head_rate }, headCount) {
  const maximum = per_head_rate == null ? null : headCount * per_head_rate;
  return { budget: fixed_budget ?? maximum, maximum };
}

const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

function riceRateOn(db, date) {
  return db.prepare(`SELECT * FROM staff_rice_rates WHERE effective_from <= ?
                     ORDER BY effective_from DESC, id DESC LIMIT 1`).get(date) || null;
}

const listRiceRates = db => db.prepare('SELECT * FROM staff_rice_rates ORDER BY effective_from DESC, id DESC').all();

// Every value above 0; from today's business date (ADR-036) unless a later
// day is given, never a past one, so a change never rewrites a past day.
function addRiceRate(db, fields, actor = null) {
  const today = businessDate(new Date());
  const from = fields.effective_from == null || String(fields.effective_from).trim() === '' ? today : String(fields.effective_from).trim();
  if (!isDate(from)) throw bad('From which day must be a date (YYYY-MM-DD)');
  if (from < today) throw bad('A rice rate cannot start on a past day');
  const values = {};
  for (const [key, label] of [['cups_per_head', 'Cups per head'], ['grams_per_cup', 'Grams per cup'], ['price_per_kg', 'Price per kg']]) {
    const raw = fields[key];
    const n = Number(raw);
    if (raw === null || raw === undefined || String(raw).trim() === '' || !Number.isFinite(n) || n <= 0) {
      throw bad(`${label} must be a number above 0`);
    }
    values[key] = n;
  }
  return withTransaction(db, () => {
    const id = Number(db.prepare(`INSERT INTO staff_rice_rates (effective_from, cups_per_head, grams_per_cup, price_per_kg, created_by_user_id)
                                  VALUES (?, ?, ?, ?, ?)`)
      .run(from, values.cups_per_head, values.grams_per_cup, values.price_per_kg, actor?.id ?? null).lastInsertRowid);
    const after = db.prepare('SELECT * FROM staff_rice_rates WHERE id = ?').get(id);
    logActivity(db, { actor: actor?.name ?? null, entityType: 'staff_rice_rates', entityId: id, action: 'CREATE', before: null, after, source: 'MANUAL' });
    return after;
  });
}

module.exports = { listSlots, createSlot, updateSlot, budgetFor, riceRateOn, listRiceRates, addRiceRate };
