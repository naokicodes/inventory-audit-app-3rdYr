# Graph Report - inventory-audit-app-3rdYr  (2026-08-31)

## Corpus Check
- 73 files · ~120,331 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 446 nodes · 673 edges · 27 communities
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.83)
- Token cost: 336,934 input · 0 output

## Community Hubs (Navigation)
- Restaurant Audit Engine
- Graphify Skill Docs
- Commissary Audit Engine
- DB Connection & Migrations
- Commissary Yield Engine
- Schema: Commissary Tables
- Express App Wiring
- Settings Admin: Conversion Standards
- Commissary Route Tests
- Allocations & Activity Log
- History Route Tests
- Landing/Dashboard/Sales Pages
- Package Manifest
- Stock Receipts Tests
- Allocations Page & Command Panel Widgets
- Settings Route Tests
- Allocations Route Tests
- Commissary Shipments & Terminal
- Activity Log Tests
- Commands Route Tests
- Sales Route Tests
- History & Stock Receipts Routes
- Commissary Yield Log Page/Route
- Stock Receipts Route
- Command Panel Widget Core

## God Nodes (most connected - your core abstractions)
1. `Settings Page` - 30 edges
2. `withTransaction()` - 18 edges
3. `restaurants` - 16 edges
4. `logActivity()` - 15 edges
5. `Allocations Page` - 15 edges
6. `Data Model doc` - 14 edges
7. `computeMeatAudit()` - 13 edges
8. `Rules for Claude Code` - 13 edges
9. `Commissary Shipments Page` - 13 edges
10. `commissary_meats` - 12 edges

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
- **Rule-1 onboarding reading list** — docs_rules_for_claude_code, docs_data_model, docs_scope, docs_daily_workflow, docs_tech_stack [EXTRACTED 1.00]
- **graphify's Claude Code routing chain** — _claude_claude, _claude_skills_graphify_skill, claude [INFERRED 0.85]
- **Multi-Commissary generalization design + schema + step tracking** — docs_data_model_multi_commissary_generalization, docs_data_model_commissary_meats, docs_data_model_commissary_meat_map, docs_session_status_step23a [EXTRACTED 1.00]
- **All pages including command-panel.js + command scripts** — public_allocations, public_commissary_shipments, public_commissary, public_daily_audit, public_history, public_index, public_sales, public_settings, public_stock_receipts, public_terminal, public_command_panel_js, public_commands_sync_batch_stock_js, public_commands_oversold_check_js [EXTRACTED 1.00]
- **Primary navigation shared across all app pages** — public_index, public_daily_audit, public_stock_receipts, public_commissary, public_commissary_shipments, public_sales, public_terminal, public_allocations, public_dashboard, public_settings, public_history [EXTRACTED 1.00]
- **Commissary-meat/restaurant pairing flow: Shipments, Terminal, and Settings' Presets/Conversion Standards** — public_commissary_shipments, public_terminal, public_settings_shipment_presets_section, public_settings_conversion_standards_section, server_routes_commissary_get_api_commissary_shipment_presets, server_routes_commissary_get_api_commissary_conversion_standards [INFERRED 0.85]

## Communities (27 total, 0 thin omitted)

### Community 0 - "Restaurant Audit Engine"
Cohesion: 0.07
Nodes (38): recalcDishRow (client-side live recalculation), addDays(), computeDailyAudit(), computeDishAudit(), computeMeatAudit(), computeMixedDailyAudit(), getAdjustmentsTotal(), getBeginningStock() (+30 more)

### Community 1 - "Graphify Skill Docs"
Cohesion: 0.08
Nodes (44): .claude/CLAUDE.md (graphify router), graphify add & watch reference, graphify exports & benchmark reference, graphify extraction subagent prompt spec, graphify GitHub clone & cross-repo merge reference, graphify commit hook & CLAUDE.md integration reference, graphify query/path/explain reference, graphify transcribe reference (+36 more)

### Community 2 - "Commissary Audit Engine"
Cohesion: 0.07
Nodes (31): { addDays }, computeCommissaryDailyAudit(), computeCommissaryMeatAudit(), getCommissaryBackedUp(), getCommissaryBeginningStock(), getCommissaryEndingActual(), getCommissaryStockIn(), getCommissaryUsage() (+23 more)

### Community 3 - "DB Connection & Migrations"
Cohesion: 0.08
Nodes (22): { DatabaseSync }, db, DB_PATH, fs, { migrateStockReceiptsNullableDestination, migrateLocationsActiveColumn, migrateConversionColumns, migrateCommissaryMultiTenant }, path, schema, SCHEMA_PATH (+14 more)

### Community 4 - "Commissary Yield Engine"
Cohesion: 0.10
Nodes (22): computeActualLossPct(), computeExcessLoss(), computeYieldLogForDate(), computeYieldMetrics(), computeYieldRow(), computeYieldStatus(), getAllowedLeewayPct(), assert (+14 more)

### Community 5 - "Schema: Commissary Tables"
Cohesion: 0.18
Nodes (28): activity_log, adjustment_types, adjustments, commissaries, commissary_conversion_standards, commissary_ending_actual, commissary_meat_map, commissary_meats (+20 more)

### Community 6 - "Express App Wiring"
Cohesion: 0.07
Nodes (21): allocationsRoutes, app, commandsRoutes, commissaryRoutes, dailyAuditRoutes, dashboardRoutes, express, historyRoutes (+13 more)

### Community 7 - "Settings Admin: Conversion Standards"
Cohesion: 0.09
Nodes (22): Settings Page, POST /api/commissary/conversion-standards, POST /api/commissary/shipment-presets, PUT /api/commissary/conversion-standards/:id, PUT /api/commissary/shipment-presets/:id, DELETE /api/settings/recipes/:id, GET /api/settings/dishes, GET /api/settings/meats (+14 more)

### Community 8 - "Commissary Route Tests"
Cohesion: 0.13
Nodes (11): assert, createShipment(), { DatabaseSync }, db, fs, getPresetWithLines(), getReceiptRow(), listPresetsForPair() (+3 more)

### Community 9 - "Allocations & Activity Log"
Cohesion: 0.16
Nodes (11): withTransaction(), db, express, router, { withTransaction }, db, express, router (+3 more)

### Community 10 - "History Route Tests"
Cohesion: 0.16
Nodes (11): logActivity(), assert, { DatabaseSync }, db, fs, insertReceiptCreateThenUpdate(), insertYieldEntry(), path (+3 more)

### Community 11 - "Landing/Dashboard/Sales Pages"
Cohesion: 0.18
Nodes (13): Landing (Daily Audit) Page, Dashboard Page, Dashboard Reverse-Conversion Rollup, Home/Index Page, Sales Page, Settings Conversion Standards Admin Section, GET /api/daily-audit/mixed, POST /api/daily-audit (+5 more)

### Community 12 - "Package Manifest"
Cohesion: 0.17
Nodes (11): express, dependencies, express, description, engines, node, main, name (+3 more)

### Community 13 - "Stock Receipts Tests"
Cohesion: 0.20
Nodes (10): assert, createReceipt(), { DatabaseSync }, db, fs, getReceiptRow(), patchReceipt(), path (+2 more)

### Community 14 - "Allocations Page & Command Panel Widgets"
Cohesion: 0.18
Nodes (11): Allocations Page, Allocations Conversion Adjustment Type, Allocations Transfer Adjustment Type, command-panel.js (shared client script), commands/oversold-check.js, commands/sync-batch-stock.js, GET /api/allocations, POST /api/allocations (+3 more)

### Community 15 - "Settings Route Tests"
Cohesion: 0.18
Nodes (6): assert, { DatabaseSync }, db, fs, path, schema

### Community 16 - "Allocations Route Tests"
Cohesion: 0.20
Nodes (6): assert, { DatabaseSync }, db, fs, path, schema

### Community 17 - "Commissary Shipments & Terminal"
Cohesion: 0.39
Nodes (9): Commissary Shipments Page, Implied Input from Conversion Standards (Line-Sum Hint), Terminal Page, Terminal 'ship' Command Grammar, GET /api/commissary/conversion-standards, GET /api/commissary/meats, GET /api/commissary/shipment-presets, POST /api/commissary/shipments (+1 more)

### Community 18 - "Activity Log Tests"
Cohesion: 0.22
Nodes (7): assert, { DatabaseSync }, db, fs, path, schema, { withTransaction, logActivity }

### Community 19 - "Commands Route Tests"
Cohesion: 0.22
Nodes (6): assert, { DatabaseSync }, fs, path, runSync(), { withTransaction, logActivity }

### Community 20 - "Sales Route Tests"
Cohesion: 0.25
Nodes (6): assert, { DatabaseSync }, fs, patchSales(), path, test()

### Community 21 - "History & Stock Receipts Routes"
Cohesion: 0.25
Nodes (8): Admin History Page, Stock Receipts Page, GET /api/history, GET /api/history/filters, DELETE /api/stock-receipts/:id, GET /api/stock-receipts, PATCH /api/stock-receipts/:id, POST /api/stock-receipts

### Community 22 - "Commissary Yield Log Page/Route"
Cohesion: 0.29
Nodes (7): Commissary Page, currentOnHand (Prefer Actual over Calculated), DELETE /api/commissary/yield-log/:id, GET /api/commissary/daily-audit, GET /api/commissary/yield-log, PATCH /api/commissary/yield-log/:id, POST /api/commissary/yield-log

### Community 23 - "Stock Receipts Route"
Cohesion: 0.33
Nodes (4): db, express, router, { withTransaction, logActivity }

### Community 24 - "Command Panel Widget Core"
Cohesion: 0.60
Nodes (3): register(), renderList(), runCommand()

## Knowledge Gaps
- **221 isolated node(s):** `name`, `version`, `description`, `main`, `dev` (+216 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 269 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `computeMeatAudit()` connect `Restaurant Audit Engine` to `Graphify Skill Docs`, `Commissary Audit Engine`?**
  _High betweenness centrality (0.301) - this node is a cross-community bridge._
- **Why does `Unallocated Commissary Receipt` connect `Graphify Skill Docs` to `History & Stock Receipts Routes`?**
  _High betweenness centrality (0.292) - this node is a cross-community bridge._
- **Why does `recalcMeatRow (client-side live recalculation)` connect `Graphify Skill Docs` to `Restaurant Audit Engine`?**
  _High betweenness centrality (0.291) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _221 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Restaurant Audit Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.06567992599444958 - nodes in this community are weakly interconnected._
- **Should `Graphify Skill Docs` be split into smaller, more focused modules?**
  _Cohesion score 0.08139534883720931 - nodes in this community are weakly interconnected._
- **Should `Commissary Audit Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.07396870554765292 - nodes in this community are weakly interconnected._