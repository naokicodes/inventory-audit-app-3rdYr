# Graph Report - inventory-audit-app-3rdYr  (2026-09-02)

## Corpus Check
- 64 files · ~153,666 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 490 nodes · 730 edges · 31 communities
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e57ef4f7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- auditEngine.js
- Data Model doc
- dashboard.test.js
- connection.js
- commissary.js
- Schema: Commissary Tables
- index.js
- Settings Admin: Conversion Standards
- commissary.test.js
- commands.js
- history.test.js
- Landing/Dashboard/Sales Pages
- Package Manifest
- stockReceipts.test.js
- Allocations Page & Command Panel Widgets
- Settings Route Tests
- Allocations Route Tests
- Commissary Shipments Page
- Activity Log Tests
- commands.test.js
- Sales Route Tests
- Stock Receipts Page
- Commissary Page
- Stock Receipts Route
- Command Panel Widget Core
- withTransaction
- activityLog.js
- terminal.test.js
- Session History — resolved, kept for "why", not "what's next"

## God Nodes (most connected - your core abstractions)
1. `Settings Page` - 30 edges
2. `withTransaction()` - 18 edges
3. `restaurants` - 16 edges
4. `logActivity()` - 15 edges
5. `Allocations Page` - 15 edges
6. `computeMeatAudit()` - 14 edges
7. `Data Model doc` - 14 edges
8. `Rules for Claude Code` - 13 edges
9. `Commissary Shipments Page` - 13 edges
10. `Stock Receipts Page` - 12 edges

## Surprising Connections (you probably didn't know these)
- `recalcMeatRow (client-side live recalculation)` --references--> `computeMeatAudit()`  [EXTRACTED]
  public/daily-audit.html → server/engines/auditEngine.js
- `session-status.md as cross-session persistent memory` --semantically_similar_to--> `graphify (knowledge graph tool)`  [INFERRED] [semantically similar]
  docs/session-status.md → .claude/skills/graphify/SKILL.md
- `recalcDishRow (client-side live recalculation)` --references--> `computeDishAudit()`  [EXTRACTED]
  public/daily-audit.html → server/engines/auditEngine.js
- `Rule 17: WIP hand-offs allowed` --semantically_similar_to--> `graphify update/cluster-only reference`  [INFERRED] [semantically similar]
  docs/rules-for-claude-code.md → .claude/skills/graphify/references/update.md
- `CLAUDE.md (project graphify rules)` --conceptually_related_to--> `/graphify Skill`  [INFERRED]
  CLAUDE.md → .claude/skills/graphify/SKILL.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **All pages including command-panel.js + command scripts** — public_allocations, public_commissary_shipments, public_commissary, public_daily_audit, public_history, public_index, public_sales, public_settings, public_stock_receipts, public_terminal, public_command_panel_js, public_commands_sync_batch_stock_js, public_commands_oversold_check_js [EXTRACTED 1.00]
- **Primary navigation shared across all app pages** — public_index, public_daily_audit, public_stock_receipts, public_commissary, public_commissary_shipments, public_sales, public_terminal, public_allocations, public_dashboard, public_settings, public_history [EXTRACTED 1.00]
- **Multi-Commissary generalization design + schema + step tracking** — docs_data_model_multi_commissary_generalization, docs_data_model_commissary_meats, docs_data_model_commissary_meat_map, docs_session_status_step23a [EXTRACTED 1.00]
- **Rule-1 onboarding reading list** — docs_rules_for_claude_code, docs_data_model, docs_scope, docs_daily_workflow, docs_tech_stack [EXTRACTED 1.00]
- **graphify's Claude Code routing chain** — _claude_claude, _claude_skills_graphify_skill, claude [INFERRED 0.85]
- **Commissary-meat/restaurant pairing flow: Shipments, Terminal, and Settings' Presets/Conversion Standards** — public_commissary_shipments, public_terminal, public_settings_shipment_presets_section, public_settings_conversion_standards_section, server_routes_commissary_get_api_commissary_shipment_presets, server_routes_commissary_get_api_commissary_conversion_standards [INFERRED 0.85]

## Communities (31 total, 0 thin omitted)

### Community 0 - "auditEngine.js"
Cohesion: 0.05
Nodes (44): recalcDishRow (client-side live recalculation), computeDailyAudit(), computeDishAudit(), computeMeatAudit(), computeMixedDailyAudit(), getAdjustmentsTotal(), getBeginningStock(), getEndingActual() (+36 more)

### Community 1 - "Data Model doc"
Cohesion: 0.08
Nodes (43): .claude/CLAUDE.md (graphify router), graphify add & watch reference, graphify exports & benchmark reference, graphify extraction subagent prompt spec, graphify GitHub clone & cross-repo merge reference, graphify commit hook & CLAUDE.md integration reference, graphify query/path/explain reference, graphify transcribe reference (+35 more)

### Community 2 - "dashboard.test.js"
Cohesion: 0.09
Nodes (28): addDays(), { addDays }, computeCommissaryDailyAudit(), computeCommissaryMeatAudit(), getCommissaryBackedUp(), getCommissaryBeginningStock(), getCommissaryEndingActual(), getCommissaryStockIn() (+20 more)

### Community 3 - "connection.js"
Cohesion: 0.07
Nodes (24): { DatabaseSync }, db, DB_PATH, fs, { migrateStockReceiptsNullableDestination, migrateLocationsActiveColumn, migrateConversionColumns, migrateCommissaryMultiTenant, migrateConversionStandardsMeatType, migrateYieldLogOutputMeatColumn }, path, schema, SCHEMA_PATH (+16 more)

### Community 4 - "commissary.js"
Cohesion: 0.09
Nodes (23): computeActualLossPct(), computeExcessLoss(), computeYieldLogForDate(), computeYieldMetrics(), computeYieldRow(), computeYieldStatus(), getAllowedLeewayPct(), assert (+15 more)

### Community 5 - "Schema: Commissary Tables"
Cohesion: 0.18
Nodes (28): activity_log, adjustment_types, adjustments, commissaries, commissary_conversion_standards, commissary_ending_actual, commissary_meat_map, commissary_meats (+20 more)

### Community 6 - "index.js"
Cohesion: 0.07
Nodes (21): allocationsRoutes, app, commandsRoutes, commissaryRoutes, dailyAuditRoutes, dashboardRoutes, express, historyRoutes (+13 more)

### Community 7 - "Settings Admin: Conversion Standards"
Cohesion: 0.09
Nodes (22): Settings Page, POST /api/commissary/conversion-standards, POST /api/commissary/shipment-presets, PUT /api/commissary/conversion-standards/:id, PUT /api/commissary/shipment-presets/:id, DELETE /api/settings/recipes/:id, GET /api/settings/dishes, GET /api/settings/meats (+14 more)

### Community 8 - "commissary.test.js"
Cohesion: 0.11
Nodes (13): assert, { computeCommissaryDailyAudit }, { computeYieldRow }, createShipment(), { DatabaseSync }, db, fs, getPresetWithLines() (+5 more)

### Community 9 - "commands.js"
Cohesion: 0.40
Nodes (4): db, express, router, { withTransaction, logActivity }

### Community 10 - "history.test.js"
Cohesion: 0.18
Nodes (8): assert, { DatabaseSync }, db, fs, path, receiptId, schema, { withTransaction, logActivity }

### Community 11 - "Landing/Dashboard/Sales Pages"
Cohesion: 0.18
Nodes (13): Landing (Daily Audit) Page, Dashboard Page, Dashboard Reverse-Conversion Rollup, Home/Index Page, Sales Page, Settings Conversion Standards Admin Section, GET /api/daily-audit/mixed, POST /api/daily-audit (+5 more)

### Community 12 - "Package Manifest"
Cohesion: 0.17
Nodes (11): express, dependencies, express, description, engines, node, main, name (+3 more)

### Community 13 - "stockReceipts.test.js"
Cohesion: 0.22
Nodes (7): assert, { DatabaseSync }, db, fs, path, schema, { withTransaction, logActivity }

### Community 14 - "Allocations Page & Command Panel Widgets"
Cohesion: 0.18
Nodes (11): Allocations Page, Allocations Conversion Adjustment Type, Allocations Transfer Adjustment Type, command-panel.js (shared client script), commands/oversold-check.js, commands/sync-batch-stock.js, GET /api/allocations, POST /api/allocations (+3 more)

### Community 15 - "Settings Route Tests"
Cohesion: 0.10
Nodes (6): assert, { DatabaseSync }, db, fs, path, schema

### Community 16 - "Allocations Route Tests"
Cohesion: 0.20
Nodes (6): assert, { DatabaseSync }, db, fs, path, schema

### Community 17 - "Commissary Shipments Page"
Cohesion: 0.29
Nodes (10): currentOnHand (Prefer Actual over Calculated), Commissary Shipments Page, Implied Input from Conversion Standards (Line-Sum Hint), Settings Shipment Presets Admin Section, Terminal Page, Terminal 'ship' Command Grammar, GET /api/commissary/conversion-standards, GET /api/commissary/daily-audit (+2 more)

### Community 18 - "Activity Log Tests"
Cohesion: 0.22
Nodes (7): assert, { DatabaseSync }, db, fs, path, schema, { withTransaction, logActivity }

### Community 19 - "commands.test.js"
Cohesion: 0.25
Nodes (5): assert, { DatabaseSync }, fs, path, { withTransaction, logActivity }

### Community 20 - "Sales Route Tests"
Cohesion: 0.25
Nodes (6): assert, { DatabaseSync }, fs, patchSales(), path, test()

### Community 21 - "Stock Receipts Page"
Cohesion: 0.33
Nodes (6): Stock Receipts Page, DELETE /api/stock-receipts/:id, GET /api/stock-receipts, GET /api/stock-receipts/meats, PATCH /api/stock-receipts/:id, POST /api/stock-receipts

### Community 22 - "Commissary Page"
Cohesion: 0.22
Nodes (9): Commissary Page, Admin History Page, DELETE /api/commissary/yield-log/:id, GET /api/commissary/meats, GET /api/commissary/yield-log, PATCH /api/commissary/yield-log/:id, POST /api/commissary/yield-log, GET /api/history (+1 more)

### Community 23 - "Stock Receipts Route"
Cohesion: 0.33
Nodes (4): db, express, router, { withTransaction, logActivity }

### Community 24 - "Command Panel Widget Core"
Cohesion: 0.60
Nodes (3): register(), renderList(), runCommand()

### Community 27 - "withTransaction"
Cohesion: 0.31
Nodes (10): logActivity(), withTransaction(), runSync(), createPreset(), updatePreset(), insertReceiptCreateThenUpdate(), insertYieldEntry(), createReceipt() (+2 more)

### Community 28 - "activityLog.js"
Cohesion: 0.33
Nodes (4): db, express, router, { withTransaction }

### Community 30 - "terminal.test.js"
Cohesion: 0.21
Nodes (10): assert, comAJowl, comAJowl2, comAPata, comBJowl, commissaryMeats, commissaryMeatToken(), ghostMeat (+2 more)

### Community 31 - "Session History — resolved, kept for "why", not "what's next""
Cohesion: 0.15
Nodes (12): 23c-ii split into four sub-steps — resolved 2026-09-01 (architect), Item 3 design — RESOLVED 2026-08-30, ready to build, none of it started yet, Original five items, raised 2026-08-29, Original five items, raised 2026-08-29 — all resolved, Remaining scope (steps 10–19), Remaining scope (steps 10–19) — all complete, Round 2 findings (2026-08-30) — the plate refilled, UI explicitly delayed, Round 2, item 3's design, and step 23 in full (+4 more)

## Knowledge Gaps
- **240 isolated node(s):** `name`, `version`, `description`, `main`, `dev` (+235 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 301 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `computeMeatAudit()` connect `auditEngine.js` to `Data Model doc`, `dashboard.test.js`?**
  _High betweenness centrality (0.260) - this node is a cross-community bridge._
- **Why does `Unallocated Commissary Receipt` connect `Data Model doc` to `Stock Receipts Page`?**
  _High betweenness centrality (0.251) - this node is a cross-community bridge._
- **Why does `recalcMeatRow (client-side live recalculation)` connect `Data Model doc` to `auditEngine.js`?**
  _High betweenness centrality (0.250) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _240 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `auditEngine.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05450733752620545 - nodes in this community are weakly interconnected._
- **Should `Data Model doc` be split into smaller, more focused modules?**
  _Cohesion score 0.08416389811738649 - nodes in this community are weakly interconnected._
- **Should `dashboard.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08912655971479501 - nodes in this community are weakly interconnected._