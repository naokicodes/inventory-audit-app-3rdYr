// Server entry point - mounts every route module under /api and serves
// public/ as static files. See docs/tech-stack.md and
// docs/rules-for-claude-code.md before adding to this.

const fs = require('fs');
const path = require('path');
const express = require('express');

// Secrets (Loyverse tokens) live in .env at the repo root, gitignored. Load
// it with Node's built-in loader when present, so it works however the
// server is started. Never logged.
const ENV_PATH = path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

// Touching the db connection here just to confirm it opens without error.
require('./db/connection.js');

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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
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

app.listen(PORT, () => {
  console.log(`Inventory Audit App running at http://localhost:${PORT}`);
});
