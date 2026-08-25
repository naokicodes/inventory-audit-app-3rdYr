// One-time (or re-runnable) seed script: loads real meat/dish/recipe data
// from seed-data.json (exported from the original xlsx) into the database.
//
// Safe to re-run: uses INSERT OR IGNORE keyed on the natural unique
// constraints (restaurant code, meat_code, dish_code) so running this
// twice won't create duplicates.
//
// Run with: node server/db/seed.js

const fs = require('fs');
const path = require('path');
const db = require('./connection.js');

const dataPath = path.join(__dirname, 'seed-data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

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
  const result = insertMeat.run(restaurantId, m.meat_code, m.name, m.unit, m.cost_per_unit ?? null);
  if (result.changes > 0) meatsInserted++;
}

// 3. Dishes
const insertDish = db.prepare(
  'INSERT OR IGNORE INTO dishes (restaurant_id, dish_code, name, prep_type, cost_per_portion) VALUES (?, ?, ?, ?, ?)'
);
let dishesInserted = 0;
for (const d of data.dishes) {
  const result = insertDish.run(restaurantId, d.dish_code, d.name, d.prep_type, d.cost_per_portion ?? null);
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
  const meat = getMeatId.get(restaurantId, r.meat_code);
  const dish = getDishId.get(restaurantId, r.dish_code);
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
console.log(`Meats: ${meatsInserted} inserted (of ${data.meats.length} in file)`);
console.log(`Dishes: ${dishesInserted} inserted (of ${data.dishes.length} in file)`);
console.log(`Recipe_BOM: ${bomInserted} inserted, ${bomSkipped} skipped (already existed or missing match)`);
