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

// Mirrors dashboard.js's computeRestaurantTotals()
function computeRestaurantTotals(date, restaurants, meatTypeId) {
  const byRestaurant = {};
  let restaurantsSum = 0;
  let anyHasData = false;

  for (const restaurant of restaurants) {
    const standards = meatTypeId === null ? [] : db.prepare(`
      SELECT meat_id, ratio_per_unit FROM commissary_conversion_standards
      WHERE meat_type_id = ? AND restaurant_id = ? AND active = 1
    `).all(meatTypeId, restaurant.id);

    let restaurantTotal = 0;
    let restaurantHasData = false;
    for (const std of standards) {
      const meatAudit = computeMeatAudit(db, restaurant.id, std.meat_id, date);
      const balance = currentBalance(meatAudit);
      if (balance !== null) {
        restaurantTotal += balance / std.ratio_per_unit;
        restaurantHasData = true;
        anyHasData = true;
      }
    }

    byRestaurant[restaurant.id] = { total: restaurantTotal, hasData: restaurantHasData, standardCount: standards.length };
    restaurantsSum += restaurantTotal;
  }

  return { byRestaurant, restaurantsSum, anyHasData };
}

// Mirrors GET /api/dashboard/stock-rollup (step 23b-vi-a: grouped by
// (meat_type_id, unit), per data-model.md section 10c)
function stockRollup(date, restaurantIds) {
  if (!date) return { status: 400, error: 'date is required' };

  const restaurants = restaurantIds
    ? restaurantIds.map(id => db.prepare('SELECT id, name FROM restaurants WHERE id = ? AND active = 1').get(id)).filter(Boolean)
    : db.prepare('SELECT id, name FROM restaurants WHERE active = 1 ORDER BY name').all();

  const commissaryMeats = db.prepare(`
    SELECT cm.id, cm.code, cm.name, cm.unit, cm.meat_type_id, cm.commissary_id,
           c.code as commissary_code, c.name as commissary_name
    FROM commissary_meats cm
    JOIN commissaries c ON c.id = cm.commissary_id
    WHERE cm.active = 1
  `).all();

  const perMeat = commissaryMeats.map(cm => {
    const commissaryAudit = computeCommissaryMeatAudit(db, cm.id, date);
    return {
      ...cm,
      balance: currentBalance(commissaryAudit),
      hasData: commissaryAudit.status !== 'MISSING_BEGINNING_STOCK'
    };
  });

  const groups = new Map();
  const untaggedMeats = [];
  for (const m of perMeat) {
    if (m.meat_type_id === null) {
      untaggedMeats.push(m);
      continue;
    }
    const key = `${m.meat_type_id}::${m.unit}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }

  const meatTypeRows = [...groups.values()].map(members => {
    const meatTypeId = members[0].meat_type_id;
    const unit = members[0].unit;
    // Mirrors dashboard.js's dangling-meat_type_id guard (step 23b-vi-b)
    const meatType = db.prepare('SELECT name, active FROM meat_types WHERE id = ?').get(meatTypeId);
    const meatTypeName = meatType ? meatType.name : `(unknown meat type #${meatTypeId})`;
    const meatTypeActive = meatType ? !!meatType.active : false;

    const commissaryBalance = members.reduce((sum, m) => sum + (m.balance || 0), 0);
    const commissaryHasData = members.some(m => m.hasData);
    const byCommissary = members
      .map(m => ({
        commissary_id: m.commissary_id,
        code: m.commissary_code,
        name: m.commissary_name,
        commissary_meat_id: m.id,
        balance: m.balance,
        has_data: m.hasData
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    const { byRestaurant, restaurantsSum, anyHasData } = computeRestaurantTotals(date, restaurants, meatTypeId);

    return {
      kind: 'meat_type', meat_type_id: meatTypeId, name: meatTypeName, unit,
      meat_type_active: meatTypeActive,
      commissary_balance: commissaryBalance, commissary_has_data: commissaryHasData,
      by_commissary: byCommissary, by_restaurant: byRestaurant,
      grand_total: commissaryBalance + restaurantsSum,
      row_has_any_data: commissaryHasData || anyHasData
    };
  });

  const untaggedRows = untaggedMeats.map(m => ({
    kind: 'untagged', commissary_meat_id: m.id, code: m.code, name: m.name, unit: m.unit,
    commissary_balance: m.balance, commissary_has_data: m.hasData,
    by_restaurant: {}, grand_total: m.balance || 0, row_has_any_data: m.hasData
  }));

  const rows = [...meatTypeRows, ...untaggedRows].sort((a, b) => a.name.localeCompare(b.name));

  return { status: 200, date, restaurants, rows };
}

test('date is required', () => {
  const r = stockRollup(null);
  assert.strictEqual(r.status, 400);
});

function findJowlGroup(rows) {
  return rows.find(row => row.kind === 'meat_type' && row.meat_type_id === 1 && row.unit === 'kg');
}

test('with no data anywhere yet, rows exist but everything is 0/no-data', () => {
  const r = stockRollup('2026-08-01');
  assert.strictEqual(r.rows.length, 1, 'only 1 active commissary meat - the retired one is excluded');
  const jowlRow = findJowlGroup(r.rows);
  assert.strictEqual(jowlRow.kind, 'meat_type');
  assert.strictEqual(jowlRow.commissary_has_data, false);
  assert.strictEqual(jowlRow.row_has_any_data, false);
  assert.strictEqual(jowlRow.grand_total, 0);
});

test('the retired commissary meat never appears as a row (nor inside by_commissary)', () => {
  const r = stockRollup('2026-08-01');
  const jowlRow = findJowlGroup(r.rows);
  assert.strictEqual(jowlRow.by_commissary.find(bc => bc.commissary_meat_id === 2), undefined);
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
  const jowlRow = findJowlGroup(r.rows);

  // Bagnet: 6 units / 0.3 units-per-kg = 20kg implied
  // Sisig: 5 units / 0.25 units-per-kg = 20kg implied
  // FC total: 40kg. Commissary: 20kg. Grand total: 60kg.
  assert.strictEqual(jowlRow.commissary_balance, 20);
  assert.strictEqual(jowlRow.by_restaurant[1].total, 40);
  assert.strictEqual(jowlRow.by_restaurant[1].hasData, true);
  assert.strictEqual(jowlRow.by_restaurant[1].standardCount, 2);
  assert.strictEqual(jowlRow.grand_total, 60);
  assert.strictEqual(jowlRow.row_has_any_data, true);
  assert.strictEqual(jowlRow.by_commissary.length, 1);
  assert.strictEqual(jowlRow.by_commissary[0].commissary_meat_id, 1);
  assert.strictEqual(jowlRow.by_commissary[0].balance, 20);
  assert.strictEqual(jowlRow.by_commissary[0].code, 'COM-A', 'by_commissary carries the COMMISSARY\'s own code/name, not the meat\'s');
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
  const jowlRow = findJowlGroup(r.rows);
  assert.strictEqual(jowlRow.commissary_balance, 999, 'actual count should win over the calculated 20');
});

// Step 23b-vi-a: fixtures below are added AFTER every test above that
// asserts an exact row count/value for the single-commissary scenario,
// so none of those existing assertions shift - same pattern 23b-iv/23b-v
// used for their own second-commissary fixtures.

// A second commissary, with its own Jowl-equivalent ALSO tagged to
// meat_type_id=1 at the same unit (kg) - this is the actual double-count
// scenario the whole grouping restructure exists to fix.
db.prepare(`INSERT INTO commissaries (id, code, name) VALUES (2, 'COM-B', 'Commissary B')`).run();
db.prepare(`INSERT INTO commissary_meats (id, commissary_id, code, name, unit, allowed_leeway_pct, meat_type_id) VALUES (3, 2, 'CM01', 'Jowl', 'kg', 0.2, 1)`).run();
db.prepare(`INSERT INTO commissary_opening_stock (commissary_meat_id, business_date, quantity) VALUES (3, '2026-08-15', 15)`).run();

// A unit MISMATCH within the same meat type: tagged to meat_type_id=1,
// but counted in "unit" rather than "kg" - must split into its own row,
// never merge into the kg group.
db.prepare(`INSERT INTO commissary_meats (id, commissary_id, code, name, unit, allowed_leeway_pct, meat_type_id) VALUES (4, 1, 'CM03', 'Jowl (counted)', 'unit', 0.2, 1)`).run();
db.prepare(`INSERT INTO commissary_opening_stock (commissary_meat_id, business_date, quantity) VALUES (4, '2026-08-15', 7)`).run();

// An untagged meat - must get its own row, never dropped.
db.prepare(`INSERT INTO commissary_meats (id, commissary_id, code, name, unit, allowed_leeway_pct) VALUES (5, 1, 'CM04', 'Miscuts', 'kg', 0.1)`).run();
db.prepare(`INSERT INTO commissary_opening_stock (commissary_meat_id, business_date, quantity) VALUES (5, '2026-08-15', 3)`).run();

test('THE MOTIVATING CASE: two commissaries both stocking a meat tagged to the same meat_type_id are grouped into one row, and restaurant figures are counted ONCE, not once per commissary', () => {
  const r = stockRollup('2026-08-15');
  const jowlRow = findJowlGroup(r.rows);

  // commissary_balance: Commissary A's 999 (actual, from the test above)
  // + Commissary B's 15 (opening stock, no actual yet) = 1014. Summed
  // once across by_commissary, never double-counted.
  assert.strictEqual(jowlRow.commissary_balance, 1014);
  assert.strictEqual(jowlRow.by_commissary.length, 2, 'one entry per commissary sharing this meat_type_id+unit');
  assert.deepStrictEqual(jowlRow.by_commissary.map(bc => bc.commissary_meat_id).sort(), [1, 3]);

  // THE ACTUAL BUG THIS STEP FIXES: by_restaurant[FC].total must still be
  // exactly 40 (6/0.3 + 5/0.25, same as the single-commissary test above)
  // - NOT 80. If restaurant totals were computed once per commissary meat
  // instead of once per group, this would double to 80 since both
  // commissary meats share the same meat_type_id and thus the same
  // standards.
  assert.strictEqual(jowlRow.by_restaurant[1].total, 40, 'restaurant total must be computed ONCE per group, not once per commissary sharing the type');
  assert.strictEqual(jowlRow.grand_total, 1054, '1014 (both commissaries) + 40 (restaurant total, counted once) = 1054, not 1094');
});

test('a unit mismatch within one meat type splits into two separate rows, never merged', () => {
  const r = stockRollup('2026-08-15');
  const kgRow = r.rows.find(row => row.kind === 'meat_type' && row.meat_type_id === 1 && row.unit === 'kg');
  const unitRow = r.rows.find(row => row.kind === 'meat_type' && row.meat_type_id === 1 && row.unit === 'unit');
  assert.ok(kgRow, 'the kg-unit group must exist');
  assert.ok(unitRow, 'the unit-unit group must exist as its own row');
  assert.notStrictEqual(kgRow, unitRow);
  assert.strictEqual(unitRow.by_commissary.length, 1);
  assert.strictEqual(unitRow.by_commissary[0].commissary_meat_id, 4);
  assert.strictEqual(unitRow.commissary_balance, 7);
  // Same meat_type_id, so the SAME restaurant standards apply here too -
  // this is intentional per data-model.md section 10c: grouping only
  // splits on unit disagreement, it doesn't create separate standards.
  assert.strictEqual(unitRow.by_restaurant[1].total, 40);
});

test('an untagged commissary meat gets its own "untagged" row and is not dropped', () => {
  const r = stockRollup('2026-08-15');
  const untaggedRow = r.rows.find(row => row.kind === 'untagged' && row.commissary_meat_id === 5);
  assert.ok(untaggedRow, 'the untagged meat must still appear as a row');
  assert.strictEqual(untaggedRow.code, 'CM04');
  assert.strictEqual(untaggedRow.name, 'Miscuts');
  assert.strictEqual(untaggedRow.commissary_balance, 3);
  assert.deepStrictEqual(untaggedRow.by_restaurant, {}, 'an untagged meat can have no standards, so no restaurant figures are possible');
  assert.strictEqual(untaggedRow.grand_total, 3);
  assert.strictEqual(untaggedRow.by_commissary, undefined, 'untagged rows have no by_commissary field at all, per data-model.md section 10c');
});

test('rows are sorted by name, not code - meat_type and untagged rows interleave by their own name', () => {
  const r = stockRollup('2026-08-15');
  const names = r.rows.map(row => row.name);
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  assert.deepStrictEqual(names, sorted);
});

// Step 23b-vi-b: an active and an inactive meat type, each with a real
// commissary meat tagged to it. Added late, same reasoning as the
// fixtures above - after every test that asserts an exact row count.
db.prepare(`INSERT INTO meat_types (id, name, active) VALUES (2, 'Retired Type', 0)`).run();
db.prepare(`INSERT INTO commissary_meats (id, commissary_id, code, name, unit, allowed_leeway_pct, meat_type_id) VALUES (6, 1, 'CM05', 'Old Cut', 'kg', 0.1, 2)`).run();
db.prepare(`INSERT INTO commissary_opening_stock (commissary_meat_id, business_date, quantity) VALUES (6, '2026-08-15', 4)`).run();

test('meat_type_active is true for an active meat type', () => {
  const r = stockRollup('2026-08-15');
  const jowlRow = findJowlGroup(r.rows);
  assert.strictEqual(jowlRow.meat_type_active, true);
});

test('meat_type_active is false for an inactive meat type, but the row still APPEARS - never filtered on it', () => {
  const r = stockRollup('2026-08-15');
  const retiredRow = r.rows.find(row => row.kind === 'meat_type' && row.meat_type_id === 2);
  assert.ok(retiredRow, 'an inactive meat type\'s row must still appear - deactivating a type is a cataloguing statement, not a claim the stock vanished');
  assert.strictEqual(retiredRow.meat_type_active, false);
  assert.strictEqual(retiredRow.commissary_balance, 4, 'the real stock is still counted, same as any other row');
});

test('a dangling meat_type_id degrades gracefully instead of throwing / 500ing the route', () => {
  // Simulates a commissary_meats row whose meat_type_id points at a
  // meat_types row that no longer exists - SQLite doesn't enforce FKs
  // unless PRAGMA foreign_keys=ON, so this IS reachable in practice even
  // though this test file itself normally runs with FKs on; toggle it
  // off just for this one insert to construct the scenario, same as the
  // real gap this guard protects against.
  db.exec('PRAGMA foreign_keys = OFF');
  db.prepare(`INSERT INTO commissary_meats (id, commissary_id, code, name, unit, allowed_leeway_pct, meat_type_id) VALUES (7, 1, 'CM06', 'Ghost Cut', 'kg', 0.1, 9999)`).run();
  db.prepare(`INSERT INTO commissary_opening_stock (commissary_meat_id, business_date, quantity) VALUES (7, '2026-08-15', 2)`).run();
  db.exec('PRAGMA foreign_keys = ON');

  assert.doesNotThrow(() => stockRollup('2026-08-15'), 'a dangling meat_type_id must not throw and take down the whole route');
  const r = stockRollup('2026-08-15');
  const ghostRow = r.rows.find(row => row.kind === 'meat_type' && row.meat_type_id === 9999);
  assert.ok(ghostRow, 'the row must still appear rather than being silently dropped');
  assert.strictEqual(ghostRow.meat_type_active, false, 'a meat type that cannot be found is treated as not active');
  assert.strictEqual(ghostRow.commissary_balance, 2);
  assert.ok(ghostRow.name.includes('9999'), 'the fallback label should identify which meat_type_id is missing');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
