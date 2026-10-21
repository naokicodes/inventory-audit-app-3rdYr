// Step user-sites: user_sites table + the site resolver in siteAccess.js.
//
// Runs against an in-memory DB built from schema.sql - never the live
// inventory.db.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { getUserSiteCodes, userHasSite, resolveSiteCode } = require('./siteAccess.js');

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

console.log('Site Access Tests\n');

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const restaurantId = db.prepare("INSERT INTO restaurants (name, code) VALUES ('Silang', 'SILT')").run().lastInsertRowid;
const commissaryId = db.prepare("INSERT INTO commissaries (name, code) VALUES ('Commissary A', 'COM-A')").run().lastInsertRowid;
const roleId = db.prepare("INSERT INTO roles (name) VALUES ('checker')").run().lastInsertRowid;
const addUser = name => db.prepare('INSERT INTO users (name, default_role_id) VALUES (?, ?)').run(name, roleId).lastInsertRowid;
const ana = addUser('ana');
const ben = addUser('ben');
const addSite = (userId, code) => db.prepare('INSERT INTO user_sites (user_id, site_code) VALUES (?, ?)').run(userId, code);
addSite(ana, 'SILT');
addSite(ana, 'COM-A');
addSite(ben, 'SILT');

test('schema creates user_sites with a (user_id, site_code) primary key and a users FK', () => {
  const cols = db.prepare("PRAGMA table_info('user_sites')").all();
  assert.deepStrictEqual(cols.filter(c => c.pk).map(c => c.name), ['user_id', 'site_code']);
  assert.throws(() => addSite(ana, 'SILT'), /UNIQUE|PRIMARY KEY/);
  assert.throws(() => addSite(99999, 'SILT'), /FOREIGN KEY constraint failed/);
});

test('getUserSiteCodes returns the union of a user\'s memberships', () => {
  assert.deepStrictEqual(getUserSiteCodes(db, ana), ['COM-A', 'SILT']);
  assert.deepStrictEqual(getUserSiteCodes(db, ben), ['SILT']);
  assert.deepStrictEqual(getUserSiteCodes(db, 99999), []);
});

test('userHasSite is true for a membership and false otherwise', () => {
  assert.strictEqual(userHasSite(db, ana, 'COM-A'), true);
  assert.strictEqual(userHasSite(db, ben, 'SILT'), true);
  assert.strictEqual(userHasSite(db, ben, 'COM-A'), false);
  assert.strictEqual(userHasSite(db, ana, 'NOPE'), false);
});

test('resolveSiteCode finds a restaurant code and a commissary code', () => {
  assert.deepStrictEqual(resolveSiteCode(db, 'SILT'), { type: 'restaurant', id: Number(restaurantId) });
  assert.deepStrictEqual(resolveSiteCode(db, 'COM-A'), { type: 'commissary', id: Number(commissaryId) });
});

test('resolveSiteCode returns null for an unknown code', () => {
  assert.strictEqual(resolveSiteCode(db, 'NOPE'), null);
});

test('resolveSiteCode flags a code that exists in both tables', () => {
  db.prepare("INSERT INTO commissaries (name, code) VALUES ('Clash', 'SILT')").run();
  assert.throws(() => resolveSiteCode(db, 'SILT'), /exists in both restaurants and commissaries/);
});

db.close();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
