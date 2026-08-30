// Tests for item 2 of the 2026-08-29 "Future considerations" list -
// the management dashboard's cross-location stock rollup. Mirrors
// dashboard.js's exact route logic against a real in-memory node:sqlite
// DB, same approach as every other route test in this project.

const { DatabaseSync } = require('node:sqlite');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

console.log('Dashboard Route Tests (item 2: stock rollup)\n');

const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(schema);

const { computeMeatAudit } = require('../engines/auditEngine.js');
const { computeCommissaryMeatAudit } = require('../engines/commissaryAuditEngine.js');

// ---- fixtures: Commissary's Jowl, feeding FC's Bagnet and Sisig ----
db.prepare(`INSERT INTO restaurants (id, name, code) VALUES (1, 'FC', 'FC')`).run();
db.prepare(`INSERT INTO restaurants (id, name, code, active) VALUES (2, 'Closed Branch', 'CB', 0)`).run();
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit) VALUES (1, 1, 'M01', 'Bagnet', 'unit')`).run();
db.prepare(`INSERT INTO meats (id, restaurant_id, meat_code, name, unit) VALUES (2, 1, 'M02', 'Sisig', 'unit')`).run();
db.prepare(`INSERT INTO commissaries (id, code, name) VALUES (1, 'COM-A', 'Commissary A')`).run();
db.prepare(`INSERT INTO meat_types (id, name) VALUES (1, 'Jowl')`).run();
db.prepare(`INSERT INTO commissary_meats (id, commissary_id, code, name, unit, allowed_leeway_pct, meat_type_id) VALUES (1, 1, 'CM01', 'Jowl', 'kg', 0.2, 1)`).run();
db.prepare(`INSERT INTO commissary_meats (id, commissary_id, code, name, unit, allowed_leeway_pct, active) VALUES (2, 1, 'CM02', 'Retired Meat', 'kg', 0.2, 0)`).run();

// Standards: Jowl -> Bagnet at 0.3 units/kg, Jowl -> Sisig at 0.25 units/kg.
// Keyed by meat_type_id (step 23b) - commissary meat id=1 (Jowl) is tagged
// with meat_type_id=1 above.
db.prepare(`INSERT INTO commissary_conversion_standards (meat_type_id, restaurant_id, meat_id, ratio_per_unit) VALUES (1, 1, 1, 0.3)`).run();
db.prepare(`INSERT INTO commissary_conversion_standards (meat_type_id, restaurant_id, meat_id, ratio_per_unit) VALUES (1, 1, 2, 0.25)`).run();

// Mirrors dashboard.js's currentBalance()
function currentBalance(auditResult) {
  if (auditResult.actual !== null && auditResult.actual !== undefined) return auditResult.actual;
  if (auditResult.endingCalculated !== null && auditResult.endingCalculated !== undefined) return auditResult.endingCalculated;
  return null;
}

// Mirrors GET /api/dashboard/stock-rollup
function stockRollup(date, restaurantIds) {
  if (!date) return { status: 400, error: 'date is required' };

  const restaurants = restaurantIds
    ? restaurantIds.map(id => db.prepare('SELECT id, name FROM restaurants WHERE id = ? AND active = 1').get(id)).filter(Boolean)
    : db.prepare('SELECT id, name FROM restaurants WHERE active = 1 ORDER BY name').all();

  const commissaryMeats = db.prepare('SELECT id, code, name, unit, meat_type_id FROM commissary_meats WHERE active = 1 ORDER BY code').all();

  const rows = commissaryMeats.map(cm => {
    const commissaryAudit = computeCommissaryMeatAudit(db, cm.id, date);
    const commissaryBalance = currentBalance(commissaryAudit);
    const commissaryHasData = commissaryAudit.status !== 'MISSING_BEGINNING_STOCK';

    const byRestaurant = {};
    let grandTotal = commissaryBalance || 0;
    let anyRestaurantHasData = false;

    for (const restaurant of restaurants) {
      const standards = cm.meat_type_id === null ? [] : db.prepare(`
        SELECT meat_id, ratio_per_unit FROM commissary_conversion_standards
        WHERE meat_type_id = ? AND restaurant_id = ? AND active = 1
      `).all(cm.meat_type_id, restaurant.id);

      let restaurantTotal = 0;
      let restaurantHasData = false;
      for (const std of standards) {
        const meatAudit = computeMeatAudit(db, restaurant.id, std.meat_id, date);
        const balance = currentBalance(meatAudit);
        if (balance !== null) {
          restaurantTotal += balance / std.ratio_per_unit;
          restaurantHasData = true;
          anyRestaurantHasData = true;
        }
      }

      byRestaurant[restaurant.id] = { total: restaurantTotal, hasData: restaurantHasData, standardCount: standards.length };
      grandTotal += restaurantTotal;
    }

    return {
      commissary_meat_id: cm.id, code: cm.code, name: cm.name, unit: cm.unit,
      commissary_balance: commissaryBalance, commissary_has_data: commissaryHasData,
      by_restaurant: byRestaurant, grand_total: grandTotal,
      row_has_any_data: commissaryHasData || anyRestaurantHasData
    };
  });

  return { status: 200, date, restaurants, rows };
}

test('date is required', () => {
  const r = stockRollup(null);
  assert.strictEqual(r.status, 400);
});

test('with no data anywhere yet, rows exist but everything is 0/no-data', () => {
  const r = stockRollup('2026-08-01');
  assert.strictEqual(r.rows.length, 1, 'only 1 active commissary meat - the retired one is excluded');
  const jowlRow = r.rows.find(row => row.code === 'CM01');
  assert.strictEqual(jowlRow.commissary_has_data, false);
  assert.strictEqual(jowlRow.row_has_any_data, false);
  assert.strictEqual(jowlRow.grand_total, 0);
});

test('the retired commissary meat never appears as a row', () => {
  const r = stockRollup('2026-08-01');
  assert.strictEqual(r.rows.find(row => row.code === 'CM02'), undefined);
});

test('a closed/inactive restaurant is excluded from the default (no filter) restaurant list', () => {
  const r = stockRollup('2026-08-01');
  assert.strictEqual(r.restaurants.length, 1);
  assert.strictEqual(r.restaurants[0].id, 1);
});

test('the real Jowl scenario: Commissary balance + reverse-converted Bagnet + Sisig sum correctly into one grand total', () => {
  // Commissary: opening 20kg, no stock in/backed/usage yet at this date
  db.prepare(`INSERT INTO commissary_opening_stock (commissary_meat_id, business_date, quantity) VALUES (1, '2026-08-15', 20)`).run();
  // FC: Bagnet has 6 units on hand (opening_stock), Sisig has 5 units
  db.prepare(`INSERT INTO opening_stock (restaurant_id, meat_id, business_date, quantity) VALUES (1, 1, '2026-08-15', 6)`).run();
  db.prepare(`INSERT INTO opening_stock (restaurant_id, meat_id, business_date, quantity) VALUES (1, 2, '2026-08-15', 5)`).run();

  const r = stockRollup('2026-08-15');
  const jowlRow = r.rows.find(row => row.code === 'CM01');

  // Bagnet: 6 units / 0.3 units-per-kg = 20kg implied
  // Sisig: 5 units / 0.25 units-per-kg = 20kg implied
  // FC total: 40kg. Commissary: 20kg. Grand total: 60kg.
  assert.strictEqual(jowlRow.commissary_balance, 20);
  assert.strictEqual(jowlRow.by_restaurant[1].total, 40);
  assert.strictEqual(jowlRow.by_restaurant[1].hasData, true);
  assert.strictEqual(jowlRow.by_restaurant[1].standardCount, 2);
  assert.strictEqual(jowlRow.grand_total, 60);
  assert.strictEqual(jowlRow.row_has_any_data, true);
});

test('filtering to a specific restaurant_ids list only includes those restaurants', () => {
  db.prepare(`INSERT INTO restaurants (id, name, code) VALUES (3, 'Silingan', 'A')`).run();
  const r = stockRollup('2026-08-15', [1]);
  assert.strictEqual(r.restaurants.length, 1);
  assert.strictEqual(r.restaurants[0].id, 1);
});

test('a restaurant_id that does not exist or is inactive is silently dropped from the filter, not an error', () => {
  const r = stockRollup('2026-08-15', [1, 2, 9999]);
  // restaurant 2 is the inactive Closed Branch, 9999 doesn't exist
  assert.strictEqual(r.restaurants.length, 1);
});

test('a real physical actual count is preferred over the calculated ending for the balance', () => {
  db.prepare(`INSERT INTO commissary_ending_actual (commissary_meat_id, business_date, quantity) VALUES (1, '2026-08-15', 999)`).run();
  const r = stockRollup('2026-08-15');
  const jowlRow = r.rows.find(row => row.code === 'CM01');
  assert.strictEqual(jowlRow.commissary_balance, 999, 'actual count should win over the calculated 20');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
