// Step blind-count (session-status.md "Step blind-count"): meat counters
// count blind on the restaurant landing, every saved ending is kept in
// count_entries, and a head chef can order a quiet recount.
//
// isBlind and canOrderRecount are the only places that decide who is blind
// and who may order; role-assignments (3zj) changes them here and nowhere
// else. siteCode is unused until then (ADR-038).
//
// Every helper takes the db handle first, like logActivity in activityLog.js.

const { withTransaction } = require('../db/activityLog.js');
const { isBlocked } = require('./monthOpening.js');

const KINDS = ['MEAT', 'PORTION'];
const ENTRY_TYPES = ['COUNT', 'RECOUNT', 'EDIT'];

// Blind = can enter counts and nothing more (today: checker). No user = blind.
function isBlind(user, siteCode) {
  if (!user) return true;
  return user.can_enter_counts === 1 && user.can_finalize === 0 && user.can_admin === 0 && user.read_only === 0;
}

// head-chef, admin, super-admin. Management sees, never orders.
function canOrderRecount(user, siteCode) {
  return !isBlind(user, siteCode) && (user.can_finalize === 1 || user.can_admin === 1);
}

function checkKind(kind) {
  if (!KINDS.includes(kind)) throw new Error(`blindCount: invalid kind "${kind}"`);
}

function openOrdersFor(db, restaurantId, date, userId) {
  if (!userId) return [];
  return db.prepare(`
    SELECT id, kind, item_id FROM recount_orders
     WHERE restaurant_id = ? AND business_date = ? AND assigned_user_id = ? AND status = 'OPEN'
  `).all(restaurantId, date, userId);
}

// The latest saved remark for one item/date (portion remarks live only here).
function latestRemark(db, restaurantId, date, kind, itemId) {
  const row = db.prepare(`
    SELECT remark FROM count_entries
     WHERE restaurant_id = ? AND business_date = ? AND kind = ? AND item_id = ?
     ORDER BY id DESC LIMIT 1
  `).get(restaurantId, date, kind, itemId);
  return row ? row.remark : null;
}

// The ONE stripping function. Takes the rows GET /daily-audit or
// GET /daily-audit/mixed would return and keeps only what a blind counter may
// see: ids, name, unit, the current count, its remark and an open-recount
// flag (a recount ordered for this user). Never beginning, new stock, sales,
// adjustments, ending_calculated, variance or any portion expected value.
function blindView(db, restaurantId, date, user, rows) {
  const mine = openOrdersFor(db, restaurantId, date, user && user.id);
  return {
    blind: true,
    rows: rows.map(row => {
      const kind = row.type === 'DISH' ? 'PORTION' : 'MEAT';
      const itemId = row.item_id ?? row.meat_id;
      return {
        type: row.type || 'MEAT',
        item_id: itemId,
        name: row.name,
        unit: row.unit,
        count: kind === 'MEAT' ? (row.actual ?? row.ending_actual ?? null) : (row.portionActual ?? null),
        remark: kind === 'MEAT' ? (row.remarks || '') : (latestRemark(db, restaurantId, date, kind, itemId) || ''),
        recount_open: mine.some(o => o.kind === kind && o.item_id === itemId),
      };
    }),
  };
}

// The stored current value { quantity, remark } for one item/date, or null.
function currentCount(db, restaurantId, date, kind, itemId) {
  if (kind === 'MEAT') {
    const row = db.prepare(
      `SELECT quantity, notes FROM ending_actual WHERE restaurant_id = ? AND meat_id = ? AND business_date = ?`
    ).get(restaurantId, itemId, date);
    return row ? { quantity: row.quantity, remark: row.notes } : null;
  }
  const row = db.prepare(
    `SELECT portions_counted FROM portion_ending_actual WHERE restaurant_id = ? AND dish_id = ? AND business_date = ?`
  ).get(restaurantId, itemId, date);
  return row ? { quantity: row.portions_counted, remark: latestRemark(db, restaurantId, date, kind, itemId) } : null;
}

/**
 * Save one ending and its history row in ONE transaction.
 *   entry: { restaurantId, date, kind, itemId, quantity, remark, touched, user }
 *   writeCurrent(remark): the route's existing upsert
 * remark undefined = not sent, keep the current one. A repost of the same
 * quantity and remark that the user never touched is not a save (the page
 * posts every row on every save - the 25d-ii lesson): nothing is written.
 * Returns the entry_type written, or null.
 */
function saveCount(db, entry, writeCurrent) {
  const { restaurantId, date, kind, itemId, quantity, touched, user } = entry;
  checkKind(kind);
  const current = currentCount(db, restaurantId, date, kind, itemId);
  const remark = entry.remark === undefined ? (current ? current.remark : null) : (entry.remark || null);
  const changed = !current || current.quantity !== quantity || (current.remark || null) !== remark;
  if (!changed && !touched) return null;

  return withTransaction(db, () => {
    const orders = openOrdersFor(db, restaurantId, date, user && user.id)
      .filter(o => o.kind === kind && o.item_id === itemId);
    const counted = db.prepare(`
      SELECT 1 FROM count_entries WHERE restaurant_id = ? AND business_date = ? AND kind = ? AND item_id = ?
    `).get(restaurantId, date, kind, itemId);
    const entryType = orders.length ? 'RECOUNT' : (counted ? 'EDIT' : 'COUNT');
    if (!ENTRY_TYPES.includes(entryType)) throw new Error(`blindCount: invalid entry_type "${entryType}"`);

    writeCurrent(remark);
    db.prepare(`
      INSERT INTO count_entries (restaurant_id, business_date, kind, item_id, quantity, remark, entry_type, user_id, user_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(restaurantId, date, kind, itemId, quantity, remark, entryType, user ? user.id : null, user ? user.name : null);
    for (const o of orders) {
      db.prepare(`UPDATE recount_orders SET status = 'DONE', done_at = datetime('now') WHERE id = ?`).run(o.id);
    }
    return entryType;
  });
}

// Active users with a membership at the site whose (active) role can enter counts.
function recountPeople(db, siteCode) {
  return db.prepare(`
    SELECT u.id, u.name FROM users u
      JOIN roles r ON r.id = u.default_role_id
      JOIN user_sites s ON s.user_id = u.id AND s.site_code = ?
     WHERE u.active = 1 AND r.active = 1 AND r.can_enter_counts = 1
     ORDER BY u.name
  `).all(siteCode);
}

function itemExists(db, restaurantId, kind, itemId) {
  const sql = kind === 'MEAT'
    ? `SELECT 1 FROM meats WHERE id = ? AND restaurant_id = ? AND active = 1`
    : `SELECT 1 FROM dishes WHERE id = ? AND restaurant_id = ? AND active = 1 AND prep_type = 'BATCH_PREPPED'`;
  return db.prepare(sql).get(itemId, restaurantId) !== undefined;
}

/**
 * Order a recount: items ticked on the review page + one person. All or
 * nothing. Returns { ok, ids, warnings } or { status, error }.
 * The caller has already checked canOrderRecount.
 */
function createRecountOrders(db, { restaurantId, siteCode, date, items, assignedUserId, user }) {
  if (!Array.isArray(items) || items.length === 0) return { status: 400, error: 'Tick at least one item.' };
  for (const it of items) {
    if (!KINDS.includes(it.kind) || !itemExists(db, restaurantId, it.kind, Number(it.item_id))) {
      return { status: 400, error: 'Unknown item.' };
    }
    if (it.kind === 'MEAT' && isBlocked(db, 'restaurant', restaurantId, Number(it.item_id), date)) {
      return { status: 400, error: 'An item needs its month opening before a recount can be ordered.' };
    }
  }
  if (!recountPeople(db, siteCode).some(p => p.id === Number(assignedUserId))) {
    return { status: 400, error: 'Pick an active person at this site who can count.' };
  }

  const warnings = [];
  const ids = withTransaction(db, () => items.map(it => {
    const itemId = Number(it.item_id);
    const first = db.prepare(`
      SELECT 1 FROM count_entries
       WHERE restaurant_id = ? AND business_date = ? AND kind = ? AND item_id = ? AND entry_type = 'COUNT' AND user_id = ?
    `).get(restaurantId, date, it.kind, itemId, Number(assignedUserId));
    if (first) warnings.push({ kind: it.kind, item_id: itemId, warning: 'did the first count' });
    return Number(db.prepare(`
      INSERT INTO recount_orders (restaurant_id, business_date, kind, item_id, ordered_by_user_id, assigned_user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(restaurantId, date, it.kind, itemId, user.id, Number(assignedUserId)).lastInsertRowid);
  }));
  return { ok: true, ids, warnings };
}

// OPEN -> CANCELLED. Returns { ok } or { status, error }.
function cancelRecountOrder(db, restaurantId, orderId) {
  const result = db.prepare(`
    UPDATE recount_orders SET status = 'CANCELLED', done_at = datetime('now')
     WHERE id = ? AND restaurant_id = ? AND status = 'OPEN'
  `).run(orderId, restaurantId);
  return result.changes ? { ok: true } : { status: 404, error: 'No open recount order with that id.' };
}

// The landing person's history: every entry and order for the date, plus
// who can be picked for a recount.
function countHistory(db, restaurantId, siteCode, date, user) {
  return {
    user_id: user ? user.id : null, // the page shows "Recount: <items>" for orders assigned to this id
    can_order: canOrderRecount(user, siteCode),
    entries: db.prepare(`
      SELECT id, kind, item_id, quantity, remark, entry_type, user_id, user_name, created_at
        FROM count_entries WHERE restaurant_id = ? AND business_date = ? ORDER BY id
    `).all(restaurantId, date),
    orders: db.prepare(`
      SELECT o.id, o.kind, o.item_id, o.status, o.assigned_user_id, u.name AS assigned_name
        FROM recount_orders o JOIN users u ON u.id = o.assigned_user_id
       WHERE o.restaurant_id = ? AND o.business_date = ? ORDER BY o.id
    `).all(restaurantId, date),
    people: recountPeople(db, siteCode),
  };
}

module.exports = {
  isBlind,
  canOrderRecount,
  blindView,
  saveCount,
  recountPeople,
  createRecountOrders,
  cancelRecountOrder,
  countHistory,
};
