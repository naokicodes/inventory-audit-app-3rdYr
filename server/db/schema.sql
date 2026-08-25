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

CREATE TABLE IF NOT EXISTS new_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  meat_id INTEGER NOT NULL,
  business_date TEXT NOT NULL,    -- ISO format YYYY-MM-DD
  quantity REAL NOT NULL,
  photo_path TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  FOREIGN KEY (meat_id) REFERENCES meats(id),
  UNIQUE (restaurant_id, meat_id, business_date)
);

CREATE TABLE IF NOT EXISTS ending_actual (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  meat_id INTEGER NOT NULL,
  business_date TEXT NOT NULL,
  quantity REAL NOT NULL,
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

-- Seed a reasonable starting set of adjustment types (admin can add more
-- via the UI later - this is just a sensible default, not a fixed list).
INSERT OR IGNORE INTO adjustment_types (name, requires_transfer_locations) VALUES
  ('Wastage', 0),
  ('Staff Meal / In-House', 0),
  ('Allocation / Transfer', 1),
  ('Spoilage', 0),
  ('Damaged', 0);
