// Minimal server entry point.
// Purpose right now: confirm the whole toolchain (Node, Express, SQLite,
// folder structure) works before any real routes or business logic exist.
// See docs/tech-stack.md and docs/rules-for-claude-code.md before adding to this.

const path = require('path');
const express = require('express');

// Touching the db connection here just to confirm it opens without error.
require('./db/connection.js');

const dailyAuditRoutes = require('./routes/dailyAudit.js');
const settingsRoutes = require('./routes/settings.js');
const stockReceiptsRoutes = require('./routes/stockReceipts.js');
const commissaryRoutes = require('./routes/commissary.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api', dailyAuditRoutes);
app.use('/api', settingsRoutes);
app.use('/api', stockReceiptsRoutes);
app.use('/api', commissaryRoutes);

app.listen(PORT, () => {
  console.log(`Inventory Audit App running at http://localhost:${PORT}`);
});
