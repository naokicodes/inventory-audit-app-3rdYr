// One-time (or re-runnable) seed script: loads real meat/dish/recipe data
// from seed-data.json (exported from the original xlsx) into the database.
//
// Safe to re-run: uses INSERT OR IGNORE keyed on the natural unique
// constraints (restaurant code, meat_code, dish_code) so running this
// twice won't create duplicates.
//
// Run with: node server/db/seed.js

// One-time (or re-runnable) seed script: loads real meat/dish/recipe data
// for each restaurant (one JSON file per restaurant - seed-data.json for
// Restaurant A, seed-data-B.json for FC as of step 19) into the database.
//
// Safe to re-run: uses INSERT OR IGNORE keyed on the natural unique
// constraints (restaurant code, meat_code, dish_code) so running this
// twice won't create duplicates.
//
// Run with: node server/db/seed.js

const fs = require('fs');
const path = require('path');
const db = require('./connection.js');

function seedRestaurant(data) {
  // 1. Restaurant
  db.prepare('INSERT OR IGNORE INTO restaurants (name, code) VALUES (?, ?)')
    .run(data.restaurant.name, data.restaurant.code);
  const restaurantId = db.prepare('SELECT id FROM restaurants WHERE code = ?')
    .get(data.restaurant.code).id;

  // 2. Meats
  const insertMeat = db.prepare(
    'INSERT OR IGNORE INTO meats (restaurant_id, meat_code, name, unit, cost_per_unit) VALUES (?, ?, ?, ?, ?)'
  );
  let meatsInserted = 0;
  for (const m of data.meats) {
    // Normalize to uppercase on insert - matches the pattern settings.js's
    // admin-add path already established (meat_code.toUpperCase()). Without
    // this, meat_code has no COLLATE NOCASE in schema.sql (SQLite defaults
    // to case-sensitive BINARY collation), so a bulk-loaded lowercase code
    // would silently fail to match an uppercase one entered via the admin
    // screen - or vice versa. No live bug today (both seed files are
    // already all-uppercase) but a real risk for a future seed file with
    // different casing - see docs/changelog.md.
    const result = insertMeat.run(restaurantId, m.meat_code.toUpperCase(), m.name, m.unit, m.cost_per_unit ?? null);
    if (result.changes > 0) meatsInserted++;
  }

  // 3. Dishes
  const insertDish = db.prepare(
    'INSERT OR IGNORE INTO dishes (restaurant_id, dish_code, name, prep_type, cost_per_portion) VALUES (?, ?, ?, ?, ?)'
  );
  let dishesInserted = 0;
  for (const d of data.dishes) {
    // Same case-normalization as meats above.
    const result = insertDish.run(restaurantId, d.dish_code.toUpperCase(), d.name, d.prep_type, d.cost_per_portion ?? null);
    if (result.changes > 0) dishesInserted++;
  }

  // 4. Recipe_BOM - needs to look up the actual meat_id/dish_id by code
  const getMeatId = db.prepare('SELECT id FROM meats WHERE restaurant_id = ? AND meat_code = ?');
  const getDishId = db.prepare('SELECT id FROM dishes WHERE restaurant_id = ? AND dish_code = ?');
  const insertBom = db.prepare(
    'INSERT INTO recipe_bom (dish_id, meat_id, quantity, effective_from) VALUES (?, ?, ?, ?)'
  );

  // Guard against duplicate rows if this script runs twice - check first
  const bomExists = db.prepare(
    'SELECT 1 FROM recipe_bom WHERE dish_id = ? AND meat_id = ? AND effective_from = ?'
  );

  let bomInserted = 0;
  let bomSkipped = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const r of data.recipe_bom) {
    // Look up by uppercased code too, since that's how meats/dishes were
    // just inserted above - a mixed-case recipe_bom.meat_code/dish_code
    // in the source JSON would otherwise silently miss the match (BINARY
    // collation, no COLLATE NOCASE - see the note on insertMeat above).
    const meat = getMeatId.get(restaurantId, r.meat_code.toUpperCase());
    const dish = getDishId.get(restaurantId, r.dish_code.toUpperCase());
    if (!meat || !dish) {
      console.log(`  SKIPPED: ${r.dish_code} / ${r.meat_code} - meat or dish not found`);
      bomSkipped++;
      continue;
    }
    if (bomExists.get(dish.id, meat.id, today)) {
      bomSkipped++;
      continue;
    }
    insertBom.run(dish.id, meat.id, r.quantity, today);
    bomInserted++;
  }

  console.log(`Restaurant: ${data.restaurant.name} (id=${restaurantId})`);
  console.log(`  Meats: ${meatsInserted} inserted (of ${data.meats.length} in file)`);
  console.log(`  Dishes: ${dishesInserted} inserted (of ${data.dishes.length} in file)`);
  console.log(`  Recipe_BOM: ${bomInserted} inserted, ${bomSkipped} skipped (already existed or missing match)`);
}

// One JSON file per restaurant. Add a new filename here (and the file
// itself) to onboard another restaurant - no other code change needed,
// per step 19's "no new code expected" framing turning out almost true.
const restaurantSeedFiles = ['seed-data.json', 'seed-data-B.json'];
for (const filename of restaurantSeedFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, filename), 'utf8'));
  seedRestaurant(data);
}

// 5. Commissary meats - each commissary's own independent catalog (step
// 23a, 2026-08-31 - see docs/data-model.md section 10b). Today there's
// still just the one real commissary this app has ever tracked, so it's
// seeded here rather than from its own JSON file - matches
// migrate.js's own backfill code/name for anyone whose local database
// pre-dates this step.
db.prepare(`INSERT OR IGNORE INTO commissaries (code, name) VALUES ('COM-A', 'Commissary A')`).run();
const commissaryId = db.prepare(`SELECT id FROM commissaries WHERE code = 'COM-A'`).get().id;

// Full real 15-row M01-M15 set - see docs/changelog.md's step-9 entry for
// the verification history; the "only 3 hand-verified meats" state this
// comment used to describe was resolved before step 10 ever landed.
const commissaryDataPath = path.join(__dirname, 'commissary-seed-data.json');
const commissaryData = JSON.parse(fs.readFileSync(commissaryDataPath, 'utf8'));

// meat_types has no UNIQUE constraint on name, so INSERT OR IGNORE would
// insert a fresh duplicate row every run - look up by name first, only
// insert when absent, and reuse the id either way.
const getMeatTypeId = db.prepare('SELECT id FROM meat_types WHERE name = ?');
const insertMeatType = db.prepare('INSERT INTO meat_types (name) VALUES (?)');
const meatTypeIds = {};
let meatTypesInserted = 0;
for (const typeName of commissaryData.meat_types) {
  const existing = getMeatTypeId.get(typeName);
  if (existing) {
    meatTypeIds[typeName] = existing.id;
  } else {
    const result = insertMeatType.run(typeName);
    meatTypeIds[typeName] = result.lastInsertRowid;
    meatTypesInserted++;
  }
}
console.log(`Meat types: ${meatTypesInserted} inserted (of ${commissaryData.meat_types.length} in file)`);

const insertCommissaryMeat = db.prepare(
  'INSERT OR IGNORE INTO commissary_meats (commissary_id, code, name, unit, allowed_leeway_pct, cost_per_unit, meat_type_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
let commissaryMeatsInserted = 0;
for (const cm of commissaryData.commissary_meats) {
  const result = insertCommissaryMeat.run(commissaryId, cm.code, cm.name, cm.unit, cm.allowed_leeway_pct, cm.cost_per_unit ?? null, meatTypeIds[cm.meat_type]);
  if (result.changes > 0) commissaryMeatsInserted++;
}
console.log(`Commissary meats: ${commissaryMeatsInserted} inserted (of ${commissaryData.commissary_meats.length} in file - full real Meats sheet, M01-M15)`);
