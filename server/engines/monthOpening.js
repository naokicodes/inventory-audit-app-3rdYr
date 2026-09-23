// Step 26a-ii (session-status.md, "Step 26a-ii - the month-start
// recount"): every meat needs a declared opening dated inside each
// calendar month - recounted or copied from last month's final count -
// before that month's figures mean anything. This is the ONLY hard block
// in the app; everywhere else the app flags and assists.
//
// One module serves both ledgers (restaurant meats / commissary meats) via
// a small per-ledger table config, so the must-count rules exist exactly
// once. The Month opening panel, its Copy all button, and the planned
// Terminal shortcut to Copy all must all go through here - the spec is
// explicit that the rules must not drift between two implementations.
//
// Deliberately self-contained (its own date math) so the audit engines can
// require it without a circular require through auditEngine.js.

const LEDGERS = {
  restaurant: {
    meatsSql: `SELECT id, meat_code AS code, name, unit, recount_required FROM meats WHERE restaurant_id = ? AND active = 1 ORDER BY meat_code`,
    openingTable: 'opening_stock',
    endingTable: 'ending_actual',
    // owner columns identifying ONE meat in the opening/ending tables
    ownerWhere: 'restaurant_id = ? AND meat_id = ?',
    ownerParams: (ownerId, meatId) => [ownerId, meatId]
  },
  commissary: {
    meatsSql: `SELECT id, code, name, unit, recount_required FROM commissary_meats WHERE commissary_id = ? AND active = 1 ORDER BY code`,
    openingTable: 'commissary_opening_stock',
    endingTable: 'commissary_ending_actual',
    ownerWhere: 'commissary_meat_id = ?',
    ownerParams: (_ownerId, meatId) => [meatId]
  }
};

const REASON_REQUIRED = 'required';
const REASON_NOT_COUNTED = 'last ending not counted';
const REASON_NEW = 'new';

function isIsoDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
}

/** { start, end, prevEnd } for the calendar month containing `date` - all 'YYYY-MM-DD'. */
function monthBounds(date) {
  const d = new Date(date.slice(0, 7) + '-01T00:00:00Z');
  const start = d.toISOString().slice(0, 10);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const end = new Date(next.getTime() - 86400000).toISOString().slice(0, 10);
  const prevEnd = new Date(d.getTime() - 86400000).toISOString().slice(0, 10);
  return { start, end, prevEnd };
}

/**
 * The earliest declared opening dated inside `date`'s month for one meat,
 * or null. "Any opening dated in M unblocks all of M" - the earliest is the
 * one the panel shows for editing.
 */
function findMonthOpening(db, ledger, ownerId, meatId, date) {
  const L = LEDGERS[ledger];
  const { start, end } = monthBounds(date);
  return db.prepare(
    `SELECT business_date, quantity, opening_source FROM ${L.openingTable}
     WHERE ${L.ownerWhere} AND business_date >= ? AND business_date <= ?
     ORDER BY business_date ASC LIMIT 1`
  ).get(...L.ownerParams(ownerId, meatId), start, end) || null;
}

/** True when this meat-date is blocked: no declared opening anywhere in its month. */
function isBlocked(db, ledger, ownerId, meatId, date) {
  return findMonthOpening(db, ledger, ownerId, meatId, date) === null;
}

/**
 * Must-count vs copyable for one meat in `date`'s month (session-status.md
 * "Must count vs copyable"):
 *   1. recount_required = 1                                  -> 'required'
 *   2. no real count on the last day of M-1                  -> 'last ending not counted'
 *   3. no opening and no count at all before M               -> 'new'
 * Rule 3 always implies rule 2 (no count ever means none on the last day),
 * so a new meat is tagged 'new' in place of 'last ending not counted' -
 * the more specific of the two. 'required' is reported alongside either.
 * Otherwise copyable, with copyQuantity = the last day of M-1's real count.
 */
function classifyMeat(db, ledger, ownerId, meat, date) {
  const L = LEDGERS[ledger];
  const { start, prevEnd } = monthBounds(date);
  const params = L.ownerParams(ownerId, meat.id);

  const lastEnding = db.prepare(
    `SELECT quantity FROM ${L.endingTable} WHERE ${L.ownerWhere} AND business_date = ?`
  ).get(...params, prevEnd);

  const reasons = [];
  if (meat.recount_required === 1) reasons.push(REASON_REQUIRED);
  if (!lastEnding) {
    const earlierCount = db.prepare(
      `SELECT 1 FROM ${L.endingTable} WHERE ${L.ownerWhere} AND business_date < ? LIMIT 1`
    ).get(...params, start);
    const earlierOpening = db.prepare(
      `SELECT 1 FROM ${L.openingTable} WHERE ${L.ownerWhere} AND business_date < ? LIMIT 1`
    ).get(...params, start);
    reasons.push(!earlierCount && !earlierOpening ? REASON_NEW : REASON_NOT_COUNTED);
  }

  const mustCount = reasons.length > 0;
  return {
    mustCount,
    reasons,
    copyQuantity: mustCount ? null : lastEnding.quantity
  };
}

/**
 * The Month opening panel's data for one restaurant/commissary and the
 * month containing `date`. One entry per active meat:
 *   { meat_id, code, name, unit, opening, must_count, reasons, copy_quantity }
 * `opening` is the earliest opening dated in the month (null = blocked);
 * must_count/reasons/copy_quantity are always reported, so the panel can
 * render unopened rows and the edit list from one response.
 */
function getMonthOpeningStatus(db, ledger, ownerId, date) {
  const meats = db.prepare(LEDGERS[ledger].meatsSql).all(ownerId);
  const { start, end } = monthBounds(date);
  const rows = meats.map(meat => {
    const c = classifyMeat(db, ledger, ownerId, meat, date);
    return {
      meat_id: meat.id,
      code: meat.code,
      name: meat.name,
      unit: meat.unit,
      opening: findMonthOpening(db, ledger, ownerId, meat.id, date),
      must_count: c.mustCount,
      reasons: c.reasons,
      copy_quantity: c.copyQuantity
    };
  });
  return {
    month_start: start,
    month_end: end,
    complete: rows.every(r => r.opening !== null),
    rows
  };
}

function findMeat(db, ledger, ownerId, meatId) {
  return db.prepare(LEDGERS[ledger].meatsSql).all(ownerId).find(m => m.id === Number(meatId)) || null;
}

// Literal SQL per ledger rather than a templated table name, so
// scripts/audit-write-paths.js (a static scan) can see these write paths.
function insertOpening(db, ledger, ownerId, meatId, date, quantity, source) {
  if (ledger === 'restaurant') {
    db.prepare(
      `INSERT INTO opening_stock (restaurant_id, meat_id, business_date, quantity, opening_source) VALUES (?, ?, ?, ?, ?)`
    ).run(ownerId, meatId, date, quantity, source);
  } else {
    db.prepare(
      `INSERT INTO commissary_opening_stock (commissary_meat_id, business_date, quantity, opening_source) VALUES (?, ?, ?, ?)`
    ).run(meatId, date, quantity, source);
  }
}

/**
 * Records a RECOUNT opening dated `date` (the page's selected date - the
 * day the recount actually happens). Returns { ok } or { error, status }.
 * Only for a meat with no opening in the month yet: an entered opening is
 * corrected through 26a's PATCH routes, never re-declared here.
 */
function recordRecount(db, ledger, ownerId, meatId, date, quantity) {
  if (!findMeat(db, ledger, ownerId, meatId)) {
    return { status: 404, error: 'No active meat with that id for this restaurant/commissary' };
  }
  if (quantity === null || quantity === undefined || quantity === '' || isNaN(Number(quantity))) {
    return { status: 400, error: 'quantity must be a number' };
  }
  if (findMonthOpening(db, ledger, ownerId, meatId, date)) {
    return { status: 409, error: 'This meat already has an opening this month - edit it instead' };
  }
  insertOpening(db, ledger, ownerId, meatId, date, Number(quantity), 'RECOUNT');
  return { ok: true };
}

/**
 * Copy all: for every active COPYABLE meat with no opening in the month,
 * declares an opening dated the 1st of the month with quantity = the last
 * day of M-1's real count, source COPY. Must-count meats are never copied.
 * Returns the meat ids copied. Safe to repeat - an already-opened meat is
 * skipped.
 */
function copyAll(db, ledger, ownerId, date) {
  const status = getMonthOpeningStatus(db, ledger, ownerId, date);
  const copied = [];
  for (const row of status.rows) {
    if (row.opening !== null || row.must_count) continue;
    insertOpening(db, ledger, ownerId, row.meat_id, status.month_start, row.copy_quantity, 'COPY');
    copied.push(row.meat_id);
  }
  return copied;
}

module.exports = {
  isIsoDate,
  monthBounds,
  findMonthOpening,
  isBlocked,
  classifyMeat,
  getMonthOpeningStatus,
  recordRecount,
  copyAll
};
