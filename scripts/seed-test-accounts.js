// Step test-accounts: `npm run seed:test` creates the "Test ..." accounts on a
// non-live, non-beta database (ADR-039). The previews run it right after the
// reseed, with the same DB_PATH.
//
// Checked BEFORE connection.js is required, exactly as seed.js does for the
// reseed refusal: a refused run never opens (or migrates) the file it refuses.

const { testAccountsRefusal, ensureTestAccounts } = require('../server/db/testAccounts.js');

const refusal = testAccountsRefusal();
if (refusal) {
  console.error(refusal);
  process.exit(1);
}

const db = require('../server/db/connection.js');

const { users, memberships, skipped } = ensureTestAccounts(db);
console.log(
  `Test accounts: ${users} user(s) created, ${memberships} membership(s) added, ` +
  `${skipped} site(s) skipped in ${process.env.DB_PATH}`
);
