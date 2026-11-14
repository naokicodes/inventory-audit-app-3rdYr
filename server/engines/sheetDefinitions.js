// Step sheets-tier1: sheet definitions - which sheets each site has (tier 1).
//
// Config only: the list of sheets a site has and which engine each uses. The
// rules live here so the seed now, and the importer and routes later, all go
// through one place. No dated instances, owner or finalization (tier 2).
//
// Every helper takes the db handle first, like siteAccess.js.

const { resolveSiteCode } = require('../db/siteAccess.js');

const ENGINE_TYPES = ['MEAT', 'SIDE'];

// LOWER() rather than COLLATE NOCASE, which is sqlite-only.
function findByCategory(db, siteCode, category) {
  return db.prepare('SELECT id FROM sheet_definitions WHERE site_code = ? AND LOWER(category) = LOWER(?)')
    .get(siteCode, category);
}

/**
 * Validate and insert one definition. Throws a clear error and writes nothing
 * on an unknown site, an empty category, an unknown engine type or a
 * case-insensitive duplicate category on the same site.
 */
function createSheetDefinition(db, { siteCode, category, engineType, active = 1 } = {}) {
  if (!resolveSiteCode(db, siteCode)) {
    throw new Error(`createSheetDefinition: unknown site code "${siteCode}"`);
  }
  const name = typeof category === 'string' ? category.trim() : '';
  if (!name) throw new Error('createSheetDefinition: category is required');
  if (!ENGINE_TYPES.includes(engineType)) {
    throw new Error(`createSheetDefinition: engine type must be one of ${ENGINE_TYPES.join(', ')} (got "${engineType}")`);
  }
  if (findByCategory(db, siteCode, name)) {
    throw new Error(`createSheetDefinition: site "${siteCode}" already has a sheet "${name}"`);
  }
  const id = db.prepare(
    'INSERT INTO sheet_definitions (site_code, category, engine_type, active) VALUES (?, ?, ?, ?)'
  ).run(siteCode, name, engineType, active ? 1 : 0).lastInsertRowid;
  return db.prepare('SELECT * FROM sheet_definitions WHERE id = ?').get(id);
}

function listSheetDefinitions(db, { siteCode, activeOnly = true } = {}) {
  const where = [];
  const params = [];
  if (siteCode !== undefined) { where.push('site_code = ?'); params.push(siteCode); }
  if (activeOnly) where.push('active = 1');
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM sheet_definitions${clause} ORDER BY site_code, category`).all(...params);
}

/**
 * One MEAT "Landing" per active restaurant and one MEAT "Commi" per active
 * commissary. Skips any that already exist, so a re-run inserts nothing.
 */
function ensureDefaultSheets(db) {
  const defaults = [
    ...db.prepare('SELECT code FROM restaurants WHERE active = 1').all().map(r => [r.code, 'Landing']),
    ...db.prepare('SELECT code FROM commissaries WHERE active = 1').all().map(c => [c.code, 'Commi']),
  ];
  let inserted = 0;
  for (const [siteCode, category] of defaults) {
    if (findByCategory(db, siteCode, category)) continue;
    createSheetDefinition(db, { siteCode, category, engineType: 'MEAT' });
    inserted++;
  }
  return { inserted };
}

module.exports = { ENGINE_TYPES, createSheetDefinition, listSheetDefinitions, ensureDefaultSheets };
