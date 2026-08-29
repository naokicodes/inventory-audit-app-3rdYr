-- Database schema for the Inventory Audit App.
-- Matches docs/data-model.md exactly - see that file for the reasoning
-- behind each table. Do not add/rename/remove columns here without
-- updating that doc first (it's the source of truth, not this file).
--
-- Only INPUT tables and lookup/reference tables are created here.
-- Calculated values (beginning stock, usage, expected ending, variance,
-- portion tracking) are NEVER stored as tables - they're computed by the
-- audit engine on read. See data-model.md section 6 for those formulas.

-- 1. restaurants
CREATE TABLE IF NOT EXISTS restaurants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1  -- boolean: 0 or 1
);

-- 2. meats
CREATE TABLE IF NOT EXISTS meats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  meat_code TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('kg', 'unit')),
  cost_per_unit REAL,
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  UNIQUE (restaurant_id, meat_code)
);

-- 3. dishes
CREATE TABLE IF NOT EXISTS dishes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  dish_code TEXT NOT NULL,
  name TEXT NOT NULL,
  prep_type TEXT NOT NULL CHECK (prep_type IN ('DIRECT', 'BATCH_PREPPED')),
  cost_per_portion REAL,
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  UNIQUE (restaurant_id, dish_code)
);

-- 4. recipe_bom (the engine - links dishes to the meats they use)
CREATE TABLE IF NOT EXISTS recipe_bom (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dish_id INTEGER NOT NULL,
  meat_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  effective_from TEXT NOT NULL,   -- date, ISO format YYYY-MM-DD
  effective_until TEXT,           -- date, nullable = current version
  FOREIGN KEY (dish_id) REFERENCES dishes(id),
  FOREIGN KEY (meat_id) REFERENCES meats(id)
);

-- 5. Daily input tables

-- stock_receipts: unified log of everything received at a restaurant,
-- whether shipped from the commissary or delivered direct. Replaces the
-- old new_stock table (see docs/commissary-and-stock-receipts.md) -
-- new_stock has been retired as of the Stock Receipts page (step 4).
-- No unique constraint on (restaurant_id, meat_id, business_date):
-- deliveries are irregular and can repeat within a day. new_stock(meat,
-- date) becomes SUM(quantity) over matching non-deleted rows for that
-- date - see data-model.md section 5/6.
--
-- restaurant_id/meat_id are nullable as of step 9 (2026-08-28): NULL on
-- both together represents an "Unallocated" commissary shipment - shipped
-- from the commissary but not yet assigned to a restaurant. Only valid
-- when source = COMMISSARY (a DIRECT receipt always has a restaurant).
-- See data-model.md section 5 and commissary-and-stock-receipts.md Part 2.
-- NOTE: this table may already exist with the OLD NOT NULL constraints in
-- someone's local inventory.db - CREATE TABLE IF NOT EXISTS below cannot
-- loosen that retroactively. server/db/migrate.js handles the one-time
-- rebuild for pre-existing databases; it runs before this file, in
-- connection.js.
CREATE TABLE IF NOT EXISTS stock_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER,
  meat_id INTEGER,
  business_date TEXT NOT NULL,    -- ISO format YYYY-MM-DD
  quantity REAL NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('DIRECT', 'COMMISSARY')),
  commissary_meat_id INTEGER,     -- set only when source = COMMISSARY
  notes TEXT,
  photo_path TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,                -- soft delete only, no hard DELETE
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  FOREIGN KEY (meat_id) REFERENCES meats(id),
  FOREIGN KEY (commissary_meat_id) REFERENCES commissary_meats(id),
  -- Both null together, and only for a COMMISSARY-source row (an
  -- Unallocated shipment). A DIRECT receipt must always have a
  -- restaurant+meat; a COMMISSARY receipt may have both, or neither.
  CHECK (
    (restaurant_id IS NOT NULL AND meat_id IS NOT NULL)
    OR (restaurant_id IS NULL AND meat_id IS NULL AND source = 'COMMISSARY')
  )
);

CREATE TABLE IF NOT EXISTS ending_actual (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  meat_id INTEGER NOT NULL,
  business_date TEXT NOT NULL,
  quantity REAL NOT NULL,
  notes TEXT,
  photo_path TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  FOREIGN KEY (meat_id) REFERENCES meats(id),
  UNIQUE (restaurant_id, meat_id, business_date)
);

-- One-time opening count per meat - only used to seed beginning_stock
-- on the very first day this app is used for that meat. Every day after,
-- beginning_stock is calculated from the prior day's ending_actual.
CREATE TABLE IF NOT EXISTS opening_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  meat_id INTEGER NOT NULL,
  business_date TEXT NOT NULL,    -- the first date this app tracks this meat
  quantity REAL NOT NULL,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  FOREIGN KEY (meat_id) REFERENCES meats(id),
  UNIQUE (restaurant_id, meat_id)
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  dish_id INTEGER NOT NULL,
  business_date TEXT NOT NULL,
  quantity REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('LOYVERSE', 'MANUAL')),
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  FOREIGN KEY (dish_id) REFERENCES dishes(id)
);

-- Step 16: one MANUAL row per (restaurant, dish, date), so the Sales
-- grid's "PATCH a single day's cell" can upsert safely. Scoped to
-- MANUAL only (partial index) so a future LOYVERSE sync can post
-- several raw transaction rows for the same dish/day without conflict -
-- see data-model.md's sales section. Safe to add via plain
-- CREATE-IF-NOT-EXISTS: this is a new index on a feature with no prior
-- MANUAL rows possible before this step, not a constraint loosened on
-- existing data (see the schema.sql gotcha in rules-for-claude-code.md).
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_manual_unique
  ON sales (restaurant_id, dish_id, business_date)
  WHERE source = 'MANUAL';

CREATE TABLE IF NOT EXISTS prepped (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  dish_id INTEGER NOT NULL,
  business_date TEXT NOT NULL,
  portions_produced REAL NOT NULL,
  created_by TEXT,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  FOREIGN KEY (dish_id) REFERENCES dishes(id),
  UNIQUE (restaurant_id, dish_id, business_date)
);

CREATE TABLE IF NOT EXISTS portion_ending_actual (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  dish_id INTEGER NOT NULL,
  business_date TEXT NOT NULL,
  portions_counted REAL NOT NULL,
  photo_path TEXT,
  created_by TEXT,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  FOREIGN KEY (dish_id) REFERENCES dishes(id),
  UNIQUE (restaurant_id, dish_id, business_date)
);

-- 7. locations (for transfers/allocations - restaurants AND stations)
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER,           -- nullable: null = shared/central (e.g. commissary)
  name TEXT NOT NULL,
  is_restaurant_level INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
);

-- 8. adjustment_types (admin-managed, flexible - not hardcoded)
CREATE TABLE IF NOT EXISTS adjustment_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  requires_transfer_locations INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

-- 9. adjustments
CREATE TABLE IF NOT EXISTS adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  meat_id INTEGER NOT NULL,
  business_date TEXT NOT NULL,
  quantity REAL NOT NULL,
  adjustment_type_id INTEGER NOT NULL,
  from_location_id INTEGER,
  to_location_id INTEGER,
  notes TEXT,
  created_by TEXT,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  FOREIGN KEY (meat_id) REFERENCES meats(id),
  FOREIGN KEY (adjustment_type_id) REFERENCES adjustment_types(id),
  FOREIGN KEY (from_location_id) REFERENCES locations(id),
  FOREIGN KEY (to_location_id) REFERENCES locations(id)
);

-- 10. Commissary tables (see docs/commissary-and-stock-receipts.md)

-- commissary_meats: global list, independent of any restaurant's own
-- meats table.
CREATE TABLE IF NOT EXISTS commissary_meats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('kg', 'unit')),
  allowed_leeway_pct REAL NOT NULL,
  cost_per_unit REAL,
  active INTEGER NOT NULL DEFAULT 1
);

-- commissary_meat_map: explicit mapping between commissary meats and a
-- restaurant's own meats. Never inferred from matching code strings -
-- commissary and restaurant codes are confirmed NOT aligned.
CREATE TABLE IF NOT EXISTS commissary_meat_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commissary_meat_id INTEGER NOT NULL,
  restaurant_id INTEGER NOT NULL,
  meat_id INTEGER NOT NULL,
  FOREIGN KEY (commissary_meat_id) REFERENCES commissary_meats(id),
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  FOREIGN KEY (meat_id) REFERENCES meats(id),
  UNIQUE (commissary_meat_id, restaurant_id)
);

-- commissary_yield_log: one row per raw delivery/processing event at the
-- commissary, not tied to any restaurant. actual_loss_pct, status, and
-- excess loss are calculated on read, not stored - see data-model.md
-- section 10.
CREATE TABLE IF NOT EXISTS commissary_yield_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commissary_meat_id INTEGER NOT NULL,
  business_date TEXT NOT NULL,    -- ISO format YYYY-MM-DD
  raw_weight_in REAL NOT NULL,
  backed_weight_out REAL NOT NULL,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,                -- soft delete only, no hard DELETE
  FOREIGN KEY (commissary_meat_id) REFERENCES commissary_meats(id)
);

-- Step 20a (2026-08-29, schema only - see docs/session-status.md step 20):
-- Commissary's own Landing-style audit tables. No engine/routes/UI yet -
-- these tables aren't referenced anywhere else in the app as of this
-- commit. commissary_meat_map above is deliberately left untouched (see
-- step 20's "commissary_meat_map's fate" note in session-status.md) - it
-- becomes vestigial once commissary_shipment_lines exists, but isn't
-- deleted, repurposed, or schema-changed here.

-- commissary_ending_actual: mirrors ending_actual - the real physical
-- count at the commissary, one per commissary meat per day.
CREATE TABLE IF NOT EXISTS commissary_ending_actual (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commissary_meat_id INTEGER NOT NULL,
  business_date TEXT NOT NULL,    -- ISO format YYYY-MM-DD
  quantity REAL NOT NULL,
  notes TEXT,
  photo_path TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (commissary_meat_id) REFERENCES commissary_meats(id),
  UNIQUE (commissary_meat_id, business_date)
);

-- commissary_opening_stock: mirrors opening_stock (step 12's pattern) -
-- one-time first-ever beginning value per commissary meat. Every day
-- after derives from the prior day's commissary_ending_actual.
CREATE TABLE IF NOT EXISTS commissary_opening_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commissary_meat_id INTEGER NOT NULL,
  business_date TEXT NOT NULL,    -- the first date this app tracks this meat
  quantity REAL NOT NULL,
  FOREIGN KEY (commissary_meat_id) REFERENCES commissary_meats(id),
  UNIQUE (commissary_meat_id)
);

-- commissary_stock_receipts: raw meat arriving at Commissary from an
-- outside supplier ("Stock In"). Distinct from stock_receipts, which is
-- restaurant-facing - this is Commissary receiving, not a restaurant
-- receiving. NOT soft-deleted / not activity_log-scoped here: rule 9 in
-- rules-for-claude-code.md names only stock_receipts and
-- commissary_yield_log for that pattern and explicitly warns against
-- silently extending it to other tables - flagged for the architect
-- conversation rather than assumed.
CREATE TABLE IF NOT EXISTS commissary_stock_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commissary_meat_id INTEGER NOT NULL,
  business_date TEXT NOT NULL,
  quantity REAL NOT NULL,
  notes TEXT,
  photo_path TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (commissary_meat_id) REFERENCES commissary_meats(id)
);

-- commissary_shipments: one row per outbound batch from Commissary to a
-- destination restaurant. total_quantity feeds the top table's matching
-- "[Kitchen]-Out" column (Remake V3) and thus Commissary's own usage.
CREATE TABLE IF NOT EXISTS commissary_shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commissary_meat_id INTEGER NOT NULL,
  restaurant_id INTEGER NOT NULL,   -- destination
  business_date TEXT NOT NULL,
  total_quantity REAL NOT NULL,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (commissary_meat_id) REFERENCES commissary_meats(id),
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
);

-- commissary_shipment_lines: the named-portion breakdown of a shipment
-- (e.g. Jowl -> Bagnet/Sisig/Sinigang/Dinuguan for FC). meat_id is the
-- DESTINATION restaurant's own meat row, not a commissary meat. No
-- enforced reconciliation against the parent shipment's total_quantity -
-- informational only (different units on each side; see step 20's
-- reasoning in session-status.md). Each line writing a normal
-- stock_receipts row for the destination is step 20c's job (write
-- route), not this schema step.
CREATE TABLE IF NOT EXISTS commissary_shipment_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER NOT NULL,
  meat_id INTEGER NOT NULL,         -- destination restaurant's own meat
  quantity REAL NOT NULL,
  FOREIGN KEY (shipment_id) REFERENCES commissary_shipments(id),
  FOREIGN KEY (meat_id) REFERENCES meats(id)
);

-- commissary_shipment_presets: settings-managed "quick formulas" for the
-- shipment entry form - pure autofill, never authoritative (the auditor
-- can always change every number before saving). Scoped to one
-- (commissary_meat_id, restaurant_id) pair, inferred from Remake V3's
-- "one sub-table per destination kitchen" layout - the draft in
-- session-status.md didn't state this explicitly, flagged for review.
CREATE TABLE IF NOT EXISTS commissary_shipment_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commissary_meat_id INTEGER NOT NULL,
  restaurant_id INTEGER NOT NULL,   -- destination this preset targets
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (commissary_meat_id) REFERENCES commissary_meats(id),
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
);

-- commissary_shipment_preset_lines: the preset's own named-portion
-- breakdown, mirroring commissary_shipment_lines' shape.
CREATE TABLE IF NOT EXISTS commissary_shipment_preset_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  preset_id INTEGER NOT NULL,
  meat_id INTEGER NOT NULL,
  default_quantity REAL NOT NULL,
  FOREIGN KEY (preset_id) REFERENCES commissary_shipment_presets(id),
  FOREIGN KEY (meat_id) REFERENCES meats(id)
);

-- Loyverse name resolution (see docs/loyverse-sync.md) - created now since
-- it's simple and referenced by the sync doc, even though sync itself is
-- a later phase. Empty until that phase, no harm in having it exist.
CREATE TABLE IF NOT EXISTS loyverse_name_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  raw_item_name TEXT NOT NULL,    -- supports wildcard patterns, e.g. "Sisig%"
  dish_id INTEGER NOT NULL,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  FOREIGN KEY (dish_id) REFERENCES dishes(id)
);

-- 11. activity_log (audit trail)
-- Every write to stock_receipts or commissary_yield_log writes a matching
-- row here in the same transaction (see data-model.md section 11). Scoped
-- to those two tables for now - extending to other input tables is
-- follow-up work, not bundled into this change.
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  actor TEXT,                     -- plain text, no auth system yet
  entity_type TEXT NOT NULL,      -- e.g. "stock_receipts"
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
  before TEXT,                    -- JSON snapshot, nullable
  after TEXT,                     -- JSON snapshot, nullable
  source TEXT NOT NULL CHECK (source IN ('SYSTEM', 'MANUAL'))
);

-- Seed a reasonable starting set of adjustment types (admin can add more
-- via the UI later - this is just a sensible default, not a fixed list).
INSERT OR IGNORE INTO adjustment_types (name, requires_transfer_locations) VALUES
  ('Wastage', 0),
  ('Staff Meal / In-House', 0),
  ('Allocation / Transfer', 1),
  ('Spoilage', 0),
  ('Damaged', 0),
  ('Other / Uncategorized', 0);
