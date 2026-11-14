// Step side-items (ADR-062, ADR-024): the side-item catalog - items, their
// unit conversions, and which SIDE sheets list them in what order.
//
// Every write helper writes its activity_log row too, but opens no
// transaction: the caller wraps it (a route in withTransaction, the importer
// in its one transaction per run), so the write and its log land together.
// Bad input throws an Error with status 400 and writes nothing.

const { logActivity } = require('../db/activityLog.js');

const HOW_BOUGHT = ['SUPPLIER', 'BUYER', 'COMMI'];
const PESO = 'peso';

const bad = message => Object.assign(new Error(message), { status: 400 });

// ADR-047's name key: lowercase, trimmed, inner spaces collapsed.
const nameKey = name => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const normUnit = unit => String(unit ?? '').trim().toLowerCase();

// "1 1/2" -> 1.5, "3/4" -> 0.75, "2.5" -> 2.5. Anything else (negatives, words,
// x/0) -> null.
function parseQuantity(text) {
  const s = String(text ?? '').trim().replace(/\s+/g, ' ');
  let m;
  if ((m = s.match(/^(\d+(?:\.\d+)?|\.\d+)$/))) return Number(m[1]);
  if ((m = s.match(/^(?:(\d+) )?(\d+)\/(\d+)$/))) {
    if (Number(m[3]) === 0) return null;
    return Number(m[1] || 0) + Number(m[2]) / Number(m[3]);
  }
  return null;
}

// qty in `unit` -> main units, or null when the unit is neither the item's
// main unit nor one of its conversions (never a guess, ADR-024).
function toMain(db, itemId, qty, unit) {
  const item = db.prepare('SELECT main_unit FROM side_items WHERE id = ?').get(itemId);
  if (!item) return null;
  const u = normUnit(unit);
  if (u === item.main_unit) return qty;
  const conv = db.prepare('SELECT per_main FROM side_item_units WHERE side_item_id = ? AND unit = ?').get(itemId, u);
  return conv ? qty * conv.per_main : null;
}

const getItem = (db, id) => db.prepare('SELECT * FROM side_items WHERE id = ?').get(id);

function findItemByName(db, name) {
  const key = nameKey(name);
  return db.prepare('SELECT * FROM side_items').all().find(i => nameKey(i.name) === key) || null;
}

// '' / null -> null; 'supplier' -> 'SUPPLIER'; anything else throws.
function parseHowBought(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const v = String(value).trim().toUpperCase();
  if (!HOW_BOUGHT.includes(v)) throw bad('How it is bought must be supplier, buyer, commi or blank');
  return v;
}

// An on/off flag: true/false, 1/0 or "1"/"0"; anything else throws (so the
// string "false" is never read as on).
function parseFlag(value) {
  if (value === true || value === 1 || value === '1') return 1;
  if (value === false || value === 0 || value === '0') return 0;
  throw bad('On / off must be true or false');
}

// '' / null -> null; otherwise a number 0 or more.
function parseCost(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw bad('Cost must be a number, 0 or more');
  return n;
}

// The checked, normalised item fields present in `fields` (partial update).
function cleanFields(db, fields, id = null) {
  const out = {};
  if ('name' in fields) {
    const name = String(fields.name ?? '').trim().replace(/\s+/g, ' ');
    if (!name) throw bad('An item needs a name');
    const other = findItemByName(db, name);
    if (other && other.id !== id) throw bad(`There is already an item called "${other.name}"`);
    out.name = name;
  }
  if ('main_unit' in fields) {
    out.main_unit = normUnit(fields.main_unit);
    if (!out.main_unit) throw bad('An item needs a main unit');
  }
  if ('how_bought' in fields) out.how_bought = parseHowBought(fields.how_bought);
  if ('cost_per_unit' in fields) out.cost_per_unit = parseCost(fields.cost_per_unit);
  if ('active' in fields) out.active = parseFlag(fields.active);
  return out;
}

function createItem(db, fields, { actor = null, source = 'MANUAL' } = {}) {
  const f = cleanFields(db, { how_bought: null, cost_per_unit: null, active: 1, ...fields });
  if (!('name' in f)) throw bad('An item needs a name');
  if (!('main_unit' in f)) throw bad('An item needs a main unit');
  if (f.main_unit === PESO) f.cost_per_unit = 1; // valued at face (ADR-062)
  const id = Number(db.prepare(
    'INSERT INTO side_items (name, main_unit, how_bought, cost_per_unit, active) VALUES (?, ?, ?, ?, ?)'
  ).run(f.name, f.main_unit, f.how_bought, f.cost_per_unit, f.active).lastInsertRowid);
  const after = getItem(db, id);
  logActivity(db, { actor, entityType: 'side_items', entityId: id, action: 'CREATE', before: null, after, source });
  return after;
}

// Changes only the fields given. Returns the item, and whether anything
// changed (no change writes nothing, not even a log row).
function updateItem(db, id, fields, { actor = null, source = 'MANUAL' } = {}) {
  const before = getItem(db, id);
  if (!before) throw Object.assign(new Error('No such item'), { status: 404 });
  const f = cleanFields(db, fields, id);
  if ((f.main_unit ?? before.main_unit) === PESO) f.cost_per_unit = 1;
  const keys = Object.keys(f).filter(k => f[k] !== before[k]);
  if (keys.length === 0) return { item: before, changed: false };
  // ADR-078: the main unit is fixed once the item has a conversion (every
  // factor is "main units in one of this unit"). side-sheets adds "no counts".
  if (keys.includes('main_unit')
      && db.prepare('SELECT 1 FROM side_item_units WHERE side_item_id = ?').get(id)) {
    throw Object.assign(new Error('This item has conversions. Make a new item instead.'), { status: 409 });
  }
  db.prepare(`UPDATE side_items SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...keys.map(k => f[k]), id);
  const after = getItem(db, id);
  logActivity(db, { actor, entityType: 'side_items', entityId: id, action: 'UPDATE', before, after, source });
  return { item: after, changed: true };
}

// Adds a conversion, or changes how many main units one of `unit` is.
// Returns whether anything changed. Only removeUnit (Settings) removes one.
function setUnit(db, itemId, unit, perMain, { actor = null, source = 'MANUAL' } = {}) {
  const item = getItem(db, itemId);
  if (!item) throw Object.assign(new Error('No such item'), { status: 404 });
  const u = normUnit(unit);
  if (!u) throw bad('A conversion needs a unit');
  if (u === item.main_unit) throw bad(`"${u}" is the main unit already`);
  const n = Number(perMain);
  if (perMain === '' || perMain === null || !Number.isFinite(n) || n <= 0) {
    throw bad('How many main units must be a number above 0');
  }
  const before = db.prepare('SELECT * FROM side_item_units WHERE side_item_id = ? AND unit = ?').get(itemId, u);
  if (before && before.per_main === n) return false;
  let id;
  if (before) {
    db.prepare('UPDATE side_item_units SET per_main = ? WHERE id = ?').run(n, before.id);
    id = before.id;
  } else {
    id = Number(db.prepare('INSERT INTO side_item_units (side_item_id, unit, per_main) VALUES (?, ?, ?)')
      .run(itemId, u, n).lastInsertRowid);
  }
  const after = db.prepare('SELECT * FROM side_item_units WHERE id = ?').get(id);
  logActivity(db, {
    actor, entityType: 'side_item_units', entityId: id, action: before ? 'UPDATE' : 'CREATE',
    before: before || null, after, source,
  });
  return true;
}

// Removes a conversion (ADR-079: Settings only, with a confirm; the import
// never calls this). Past counts keep their saved main-unit numbers.
function removeUnit(db, itemId, unit, { actor = null, source = 'MANUAL' } = {}) {
  if (!getItem(db, itemId)) throw Object.assign(new Error('No such item'), { status: 404 });
  const u = normUnit(unit);
  const before = db.prepare('SELECT * FROM side_item_units WHERE side_item_id = ? AND unit = ?').get(itemId, u);
  if (!before) throw Object.assign(new Error(`This item has no "${u}" conversion`), { status: 404 });
  db.prepare('DELETE FROM side_item_units WHERE id = ?').run(before.id);
  logActivity(db, { actor, entityType: 'side_item_units', entityId: before.id, action: 'DELETE', before, after: null, source });
  return true;
}

// Puts an item on a SIDE sheet, or changes its order or on/off there.
// `link` holds sort_order and/or active. Returns whether anything changed.
function setLink(db, sheetId, itemId, link, { actor = null, source = 'MANUAL' } = {}) {
  const sheet = db.prepare('SELECT engine_type FROM sheet_definitions WHERE id = ?').get(sheetId);
  if (!sheet) throw Object.assign(new Error('No such sheet'), { status: 404 });
  if (sheet.engine_type !== 'SIDE') throw bad('That is not a side sheet');
  if (!getItem(db, itemId)) throw Object.assign(new Error('No such item'), { status: 404 });
  const want = {};
  if ('sort_order' in link) {
    want.sort_order = Number(link.sort_order);
    if (!Number.isInteger(want.sort_order)) throw bad('Order must be a whole number');
  }
  if ('active' in link) want.active = parseFlag(link.active);

  const before = db.prepare('SELECT * FROM side_item_sheets WHERE sheet_id = ? AND side_item_id = ?').get(sheetId, itemId);
  let id;
  if (!before) {
    id = Number(db.prepare(
      'INSERT INTO side_item_sheets (sheet_id, side_item_id, sort_order, active) VALUES (?, ?, ?, ?)'
    ).run(sheetId, itemId, want.sort_order ?? 0, want.active ?? 1).lastInsertRowid);
  } else {
    const keys = Object.keys(want).filter(k => want[k] !== before[k]);
    if (keys.length === 0) return false;
    db.prepare(`UPDATE side_item_sheets SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`)
      .run(...keys.map(k => want[k]), before.id);
    id = before.id;
  }
  const after = db.prepare('SELECT * FROM side_item_sheets WHERE id = ?').get(id);
  logActivity(db, {
    actor, entityType: 'side_item_sheets', entityId: id, action: before ? 'UPDATE' : 'CREATE',
    before: before || null, after, source,
  });
  return true;
}

// A site's SIDE sheets, each with its items in order (switched-off ones too,
// so Settings can switch them back on). Cost only when withCost.
function siteSideSheets(db, siteCode, { withCost = false } = {}) {
  const sheets = db.prepare(
    "SELECT id, category AS name, active FROM sheet_definitions WHERE site_code = ? AND engine_type = 'SIDE' ORDER BY category"
  ).all(siteCode);
  const items = db.prepare(`
    SELECT i.id, i.name, i.main_unit, i.how_bought, i.cost_per_unit, i.active AS item_active,
           l.active AS link_active, l.sort_order
      FROM side_item_sheets l JOIN side_items i ON i.id = l.side_item_id
     WHERE l.sheet_id = ? ORDER BY l.sort_order, i.name`);
  const units = db.prepare('SELECT unit, per_main FROM side_item_units WHERE side_item_id = ? ORDER BY unit');
  return sheets.map(s => ({
    ...s,
    items: items.all(s.id).map(({ cost_per_unit, ...i }) => ({
      ...i,
      units: units.all(i.id),
      ...(withCost ? { cost_per_unit } : {}),
    })),
  }));
}

module.exports = {
  HOW_BOUGHT, nameKey, normUnit, parseQuantity, toMain, parseHowBought, parseCost,
  findItemByName, createItem, updateItem, setUnit, removeUnit, setLink, siteSideSheets,
};
