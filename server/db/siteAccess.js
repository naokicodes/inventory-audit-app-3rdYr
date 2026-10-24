// Step user-sites: site membership resolver (membership model B).
//
// user_sites.site_code is a restaurants.code OR a commissaries.code, with no
// FK on site_code. resolveSiteCode is the ONE place the "code matches either
// table" logic lives. Data layer only - no enforcement is wired yet (that
// needs the logged-in user from the stub-login slice).
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

module.exports = { getUserSiteCodes, userHasSite, resolveSiteCode };
