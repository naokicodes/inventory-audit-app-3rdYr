// Step user-sites: site membership resolver (membership model B).
//
// user_sites.site_code is a restaurants.code OR a commissaries.code, with no
// FK on site_code. resolveSiteCode is the ONE place the "code matches either
// table" logic lives. Enforcement is server/middleware/requireSiteAccess.js
// (step site-filter), through canUseSite and siteCodeFor below.
//
// Every helper takes the db handle first, like logActivity in activityLog.js.

const { businessDate } = require('../businessDay.js');

function getUserSiteCodes(db, userId) {
  return db.prepare('SELECT site_code FROM user_sites WHERE user_id = ? ORDER BY site_code')
    .all(userId)
    .map(r => r.site_code);
}

function userHasSite(db, userId, siteCode) {
  return db.prepare('SELECT 1 FROM user_sites WHERE user_id = ? AND site_code = ?')
    .get(userId, siteCode) !== undefined;
}

/**
 * Look a site code up in restaurants, then commissaries.
 * Returns { type: 'restaurant'|'commissary', id } or null for an unknown code.
 * Throws if the code exists in both tables - model B assumes codes are unique
 * across the two, so a collision is a data error, not a lookup result.
 */
function resolveSiteCode(db, siteCode) {
  const restaurant = db.prepare('SELECT id FROM restaurants WHERE code = ?').get(siteCode);
  const commissary = db.prepare('SELECT id FROM commissaries WHERE code = ?').get(siteCode);
  if (restaurant && commissary) {
    throw new Error(`resolveSiteCode: site code "${siteCode}" exists in both restaurants and commissaries`);
  }
  if (restaurant) return { type: 'restaurant', id: restaurant.id };
  if (commissary) return { type: 'commissary', id: commissary.id };
  return null;
}

// Bypass roles reach every site: can_admin (admin, super-admin) or
// read_only (management).
const isBypass = user => user.can_admin === 1 || user.read_only === 1;

// The two ways a non-bypass user holds a site. canUseSite and usableSiteCodes
// both read these, so the two cannot drift (ADR-091).
const MEMBER_SITES_SQL = 'SELECT site_code FROM user_sites WHERE user_id = ?';
// Step role-assignments: a live user_roles row at that site - an active role
// whose until_date is NULL or on/after the business date.
const LIVE_ROLE_SITES_SQL = `
  SELECT ur.site_code FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN users u ON u.id = ur.user_id
   WHERE ur.user_id = ? AND ur.site_code IS NOT NULL AND r.active = 1 AND u.active = 1
     AND (ur.until_date IS NULL OR ur.until_date >= ?)`;

/**
 * Step site-filter-ii (ADR-091): the site codes canUseSite would pass for a
 * logged-in user on business date `date` (default today's), sorted. A bypass
 * role gets every restaurant and commissary code.
 */
function usableSiteCodes(db, user, date) {
  if (isBypass(user)) {
    return db.prepare('SELECT code FROM restaurants UNION SELECT code FROM commissaries ORDER BY code')
      .all().map(r => r.code);
  }
  return db.prepare(`${MEMBER_SITES_SQL} UNION ${LIVE_ROLE_SITES_SQL} ORDER BY site_code`)
    .all(user.id, user.id, date || businessDate(new Date()))
    .map(r => r.site_code);
}

/**
 * Step site-filter (A6): THE site check, for a logged-in user (the caller
 * handles a null user). Bypass roles reach every site; everyone else needs a
 * user_sites row or a live user_roles row at that site (usableSiteCodes).
 * write-permission (3zr) widens this helper again without touching the routes.
 */
function canUseSite(db, user, siteCode, date) {
  if (isBypass(user)) return true;
  return usableSiteCodes(db, user, date).includes(siteCode);
}

/**
 * Step site-filter-ii: for a list read with no site id, the codes to narrow
 * the rows to, or null for no narrowing - logged out (until write-permission,
 * ADR-040) and bypass roles see every row.
 */
function listSiteCodes(db, user) {
  return !user || isBypass(user) ? null : usableSiteCodes(db, user, null);
}

/** A WHERE clause keeping rows whose site code `expr` is one of `codes`; none -> no rows. */
function siteCodeIn(expr, codes) {
  return codes.length
    ? { sql: `${expr} IN (${codes.map(() => '?').join(', ')})`, params: codes }
    : { sql: '0', params: [] };
}

// Each kind of id -> the code of the site it belongs to, through
// restaurants.code / commissaries.code (never by matching strings).
const SITE_CODE_SQL = {
  restaurant: 'SELECT code FROM restaurants WHERE id = ?',
  commissary: 'SELECT code FROM commissaries WHERE id = ?',
  commissary_meat: `SELECT c.code FROM commissary_meats cm
                      JOIN commissaries c ON c.id = cm.commissary_id WHERE cm.id = ?`,
  // ADR-074: a receipt with no restaurant (a retired "Unallocated" one) is
  // the commissary's of its commissary_meat_id. Neither -> code NULL.
  stock_receipt: `SELECT CASE WHEN s.restaurant_id IS NULL THEN c.code ELSE r.code END AS code
                    FROM stock_receipts s
                    LEFT JOIN restaurants r ON r.id = s.restaurant_id
                    LEFT JOIN commissary_meats cm ON cm.id = s.commissary_meat_id
                    LEFT JOIN commissaries c ON c.id = cm.commissary_id WHERE s.id = ?`,
  recount_order: `SELECT r.code FROM recount_orders o
                    JOIN restaurants r ON r.id = o.restaurant_id WHERE o.id = ?`,
  yield_log: `SELECT c.code FROM commissary_yield_log y
                JOIN commissary_meats cm ON cm.id = y.commissary_meat_id
                JOIN commissaries c ON c.id = cm.commissary_id WHERE y.id = ?`,
  adjustment: `SELECT c.code FROM commissary_adjustments a
                 JOIN commissary_meats cm ON cm.id = a.commissary_meat_id
                 JOIN commissaries c ON c.id = cm.commissary_id WHERE a.id = ?`,
  // Step site-filter-ii: a preset is its commissary meat's; a conversion
  // standard is its restaurant's.
  shipment_preset: `SELECT c.code FROM commissary_shipment_presets p
                      JOIN commissary_meats cm ON cm.id = p.commissary_meat_id
                      JOIN commissaries c ON c.id = cm.commissary_id WHERE p.id = ?`,
  conversion_standard: `SELECT r.code FROM commissary_conversion_standards cs
                          JOIN restaurants r ON r.id = cs.restaurant_id WHERE cs.id = ?`,
};

/**
 * The site of an id of `kind`: undefined if there is no such row, else
 * { code } where code is null for a row with no site (ADR-074 needs the
 * difference for a stock receipt with neither restaurant nor commissary).
 */
function siteOfRow(db, kind, id) {
  const row = db.prepare(SITE_CODE_SQL[kind]).get(id);
  return row ? { code: row.code } : undefined;
}

/** The site code an id of `kind` belongs to, or null (no such row, or a row with no site). */
function siteCodeFor(db, kind, id) {
  const site = siteOfRow(db, kind, id);
  return site ? site.code : null;
}

module.exports = {
  getUserSiteCodes, userHasSite, resolveSiteCode, isBypass, canUseSite, usableSiteCodes,
  listSiteCodes, siteCodeIn, siteCodeFor, siteOfRow,
};
