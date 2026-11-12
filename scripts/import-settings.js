// Step import-identity: import the people workbook (identity tabs) into the
// database selected by DB_PATH (unset = the live inventory.db, as everywhere).
//
//   npm run import:settings -- <folder of tab CSVs>           import Roles.csv / Users.csv
//   npm run import:settings -- --export <empty folder>        write them from the database
//
// Standalone and off the runtime path; not wired into the reseed yet. The
// logic lives in server/db/importSettings.js.

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const exportMode = args[0] === '--export';
const dirArg = exportMode ? args[1] : args[0];

if (!dirArg) {
  console.error('Usage: node scripts/import-settings.js <folder of tab CSVs>');
  console.error('       node scripts/import-settings.js --export <empty folder>');
  process.exit(1);
}
const dir = path.resolve(dirArg);

// Checked BEFORE connection.js is required, so a bad path never opens (or
// migrates) the database.
if (!exportMode && !(fs.existsSync(dir) && fs.statSync(dir).isDirectory())) {
  console.error(`import-settings: ${dir} is not a folder. Export each workbook tab as <TabName>.csv into one folder.`);
  process.exit(1);
}

const db = require('../server/db/connection.js');
const { importIdentity, formatReport, exportIdentity } = require('../server/db/importSettings.js');

if (exportMode) {
  const result = exportIdentity(db, dir);
  if (result.refused) {
    console.error(result.refused);
    process.exit(1);
  }
  console.log(`Exported ${result.roles} role(s) and ${result.users} user(s):`);
  for (const f of result.files) console.log(`  ${f}`);
} else {
  console.log(`Importing identity tabs from ${dir}\n`);
  console.log(formatReport(importIdentity(db, dir)));
}
