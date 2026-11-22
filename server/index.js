// Server entry point - mounts every route module under /api and serves
// public/ as static files. See docs/tech-stack.md and
// docs/rules-for-claude-code.md before adding to this.

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const { lanUrls } = require('./lanAddress.js');

// Secrets (Loyverse tokens) live in .env at the repo root, gitignored. Load
// it with Node's built-in loader when present, so it works however the
// server is started. Never logged.
const ENV_PATH = path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

// Step db-start (F10): opening a missing file would quietly create an empty
// database. When DB_PATH names a file that is not there, stop before the
// database opens. Unset DB_PATH (dev's inventory.db) is unchanged.
if (process.env.DB_PATH) {
  const dbFile = require('./db/dbPath.js').resolveDbPath(process.env.DB_PATH);
  if (!fs.existsSync(dbFile)) {
    console.error(`The database file ${dbFile} is missing. Nothing was started. On a new install, run the setup again; otherwise check DB_PATH in .env.`);
    process.exit(1);
  }
}

// Touching the db connection here just to confirm it opens without error.
// A database opened by a newer version of the app stops the server here.
let db;
try {
  db = require('./db/connection.js');
} catch (err) {
  if (err.code !== 'DB_SCHEMA_TOO_NEW') throw err;
  console.error(err.message);
  process.exit(1);
}

// Step role-assignments: beta.db is never reseeded, so the supervisor role and
// the default role switches are applied here, once per database.
require('./db/permissions.js').ensureRoleDefaults(db);

// Step db-start (I-15): the same for the sheet definitions - only what is
// missing is added, so a site added in Settings and a never-reseeded beta.db
// get their Landing / Commi sheet.
require('./engines/sheetDefinitions.js').ensureDefaultSheets(db);

const dailyAuditRoutes = require('./routes/dailyAudit.js');
const settingsRoutes = require('./routes/settings.js');
const stockReceiptsRoutes = require('./routes/stockReceipts.js');
const commissaryRoutes = require('./routes/commissary.js');
const historyRoutes = require('./routes/history.js');
const commandsRoutes = require('./routes/commands.js');
const salesRoutes = require('./routes/sales.js');
const allocationsRoutes = require('./routes/allocations.js');
const dashboardRoutes = require('./routes/dashboard.js');
const loyverseRoutes = require('./routes/loyverse.js');
const authRoutes = require('./routes/auth.js');
const sideItemsRoutes = require('./routes/sideItems.js');
const rolesRoutes = require('./routes/roles.js');
const requireSiteAccess = require('./middleware/requireSiteAccess.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
// Step stub-login: every /api request gets req.user (null if not logged in).
app.use('/api', authRoutes.currentUser);
app.use('/api', requireSiteAccess);
app.use('/api', authRoutes);
app.use('/api', dailyAuditRoutes);
app.use('/api', settingsRoutes);
app.use('/api', stockReceiptsRoutes);
app.use('/api', commissaryRoutes);
app.use('/api', historyRoutes);
app.use('/api', commandsRoutes);
app.use('/api', salesRoutes);
app.use('/api', allocationsRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', loyverseRoutes);
app.use('/api', sideItemsRoutes);
app.use('/api', rolesRoutes);

app.listen(PORT, () => {
  // Print localhost for this PC plus every LAN address a phone on the same
  // Wi-Fi can reach, so nobody has to run ipconfig. Addresses only - never a
  // token or anything from .env. The server still listens on all addresses.
  const urls = lanUrls(os.networkInterfaces(), PORT);
  console.log('Inventory Audit App running at:');
  console.log(`  This PC:  http://localhost:${PORT}`);
  if (urls.length === 0) {
    console.log('  Phones: no network address found (check Wi-Fi)');
  } else {
    console.log('  Phones on the same Wi-Fi:');
    for (const { name, url } of urls) {
      console.log(`    ${url}   (${name})`);
    }
  }
});
