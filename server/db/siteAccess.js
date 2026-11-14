// Step user-sites: site membership resolver (membership model B).
//
// user_sites.site_code is a restaurants.code OR a commissaries.code, with no
// FK on site_code. resolveSiteCode is the ONE place the "code matches either
// table" logic lives. Enforcement is server/middleware/requireSiteAccess.js
// (step site-filter), through canUseSite and siteCodeFor below.
//
// Every helper takes the db handle first, like logActivity in activityLog.js.

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

/**
 * Step site-filter (A6): THE site check, for a logged-in user (the caller
 * handles a null user). Bypass roles reach every site: can_admin (admin,
 * super-admin) or read_only (management). Everyone else needs a user_sites
 * row. `date` is accepted and unused - role-assignments (3zj) and
 * write-permission (3zr) widen this helper without touching the routes.
 */
function canUseSite(db, user, siteCode, date) {
  if (user.can_admin === 1 || user.read_only === 1) return true;
  return userHasSite(db, user.id, siteCode);
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

module.exports = { getUserSiteCodes, userHasSite, resolveSiteCode, canUseSite, siteCodeFor, siteOfRow };
