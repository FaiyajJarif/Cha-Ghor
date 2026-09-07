-- V5: Inventory / Requisition module
-- Creates the estate store (`inventory_item`) and the supervisor requisition
-- queue (`requisition`), then seeds realistic demo data (only when each table is
-- empty). Written defensively -- same approach as V4 -- so it is safe whether or
-- not an earlier schema (e.g. V1__init.sql) already created these tables with
-- extra NOT NULL columns this module never populates.

-- ---------------------------------------------------------------------------
-- inventory_item
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_item (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(160)  NOT NULL DEFAULT '',
    category      VARCHAR(20)   NOT NULL DEFAULT 'TOOLS',
    code_label    VARCHAR(40),
    code_value    VARCHAR(80),
    quantity      NUMERIC(12,2) NOT NULL DEFAULT 0,
    capacity      NUMERIC(12,2) NOT NULL DEFAULT 0,
    unit          VARCHAR(20)   NOT NULL DEFAULT 'units',
    unit_value    NUMERIC(12,2) NOT NULL DEFAULT 0,
    reorder_level NUMERIC(12,2) NOT NULL DEFAULT 0,
    site          VARCHAR(40)   NOT NULL DEFAULT 'Central Hub',
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Reconcile columns in case an older inventory_item already exists.
ALTER TABLE inventory_item ADD COLUMN IF NOT EXISTS name          VARCHAR(160)  NOT NULL DEFAULT '';
ALTER TABLE inventory_item ADD COLUMN IF NOT EXISTS category      VARCHAR(20)   NOT NULL DEFAULT 'TOOLS';
ALTER TABLE inventory_item ADD COLUMN IF NOT EXISTS code_label    VARCHAR(40);
ALTER TABLE inventory_item ADD COLUMN IF NOT EXISTS code_value    VARCHAR(80);
ALTER TABLE inventory_item ADD COLUMN IF NOT EXISTS quantity      NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE inventory_item ADD COLUMN IF NOT EXISTS capacity      NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE inventory_item ADD COLUMN IF NOT EXISTS unit          VARCHAR(20)   NOT NULL DEFAULT 'units';
ALTER TABLE inventory_item ADD COLUMN IF NOT EXISTS unit_value    NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE inventory_item ADD COLUMN IF NOT EXISTS reorder_level NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE inventory_item ADD COLUMN IF NOT EXISTS site          VARCHAR(40)   NOT NULL DEFAULT 'Central Hub';
ALTER TABLE inventory_item ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ   NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory_item (category);
CREATE INDEX IF NOT EXISTS idx_inventory_site     ON inventory_item (site);

-- ---------------------------------------------------------------------------
-- requisition
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS requisition (
    id           BIGSERIAL PRIMARY KEY,
    item_label   VARCHAR(160) NOT NULL DEFAULT '',
    requester    VARCHAR(120) NOT NULL DEFAULT '',
    detail       VARCHAR(160),
    status       VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    requested_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    decided_at   TIMESTAMPTZ,
    decided_by   BIGINT
);

ALTER TABLE requisition ADD COLUMN IF NOT EXISTS item_label   VARCHAR(160) NOT NULL DEFAULT '';
ALTER TABLE requisition ADD COLUMN IF NOT EXISTS requester    VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE requisition ADD COLUMN IF NOT EXISTS detail       VARCHAR(160);
ALTER TABLE requisition ADD COLUMN IF NOT EXISTS status       VARCHAR(20)  NOT NULL DEFAULT 'PENDING';
ALTER TABLE requisition ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ  NOT NULL DEFAULT now();
ALTER TABLE requisition ADD COLUMN IF NOT EXISTS decided_at   TIMESTAMPTZ;
ALTER TABLE requisition ADD COLUMN IF NOT EXISTS decided_by   BIGINT;

CREATE INDEX IF NOT EXISTS idx_requisition_status ON requisition (status);

-- If the `requisition` table was created by V1 with a native Postgres enum
-- `requisition_status` (lowercase labels: pending/approved/held/rejected),
-- convert the column to plain VARCHAR so that:
--   (a) Hibernate @Enumerated(STRING) can store uppercase values ("PENDING"), and
--   (b) the seed inserts below succeed.
-- This is a no-op when V5 itself created the table (VARCHAR already).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'requisition'
      AND column_name = 'status'
      AND udt_name <> 'varchar'
  ) THEN
    ALTER TABLE requisition ALTER COLUMN status TYPE VARCHAR(20) USING status::text;
    -- Also update any existing lowercase enum values to uppercase so the app
    -- and any future queries are consistent.
    UPDATE requisition SET status = upper(status) WHERE status ~ '^[a-z]';
  END IF;
END $$;

-- An earlier schema may have created these tables with extra NOT NULL columns
-- (no default) that this module does not populate. Relax any such column so the
-- seed below -- and future inserts from this module -- succeed. No-op on a fresh
-- DB where V5 itself created the tables.
-- Each table has its own whitelist so columns like 'quantity' are only protected
-- on inventory_item (where this module writes them) but relaxed on requisition
-- (where V1 may have added them and this module never writes them).
DO $$
DECLARE
  col text;
BEGIN
  -- inventory_item: protect columns this module populates
  FOR col IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'inventory_item'
      AND is_nullable = 'NO'
      AND column_default IS NULL
      AND column_name NOT IN (
        'id', 'name', 'category', 'quantity', 'capacity', 'unit',
        'unit_value', 'reorder_level', 'site', 'created_at'
      )
  LOOP
    EXECUTE format('ALTER TABLE inventory_item ALTER COLUMN %I DROP NOT NULL', col);
  END LOOP;

  -- requisition: protect only the columns this module populates
  FOR col IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'requisition'
      AND is_nullable = 'NO'
      AND column_default IS NULL
      AND column_name NOT IN (
        'id', 'item_label', 'requester', 'status', 'requested_at'
      )
  LOOP
    EXECUTE format('ALTER TABLE requisition ALTER COLUMN %I DROP NOT NULL', col);
  END LOOP;
END $$;

-- ---- Seed inventory_item (only when empty) --------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM inventory_item) THEN
    INSERT INTO inventory_item
      (name, category, code_label, code_value, quantity, capacity, unit, unit_value, reorder_level, site)
    VALUES
      ('Pruning Shears',     'TOOLS',     'Model', 'Felco 2 Pro',    82, 100, 'pcs',   450,    20, 'Central Hub'),
      ('Urea Fertilizer',    'CHEMICALS', 'Grade', '46-0-0 Grade A', 15, 100, 'kg',     60,    25, 'Factory'),
      ('NPK 15-15-15',       'CHEMICALS', 'Sku',   'FRT-009',        77, 100, 'kg',     75,    25, 'Central Hub'),
      ('Skiffing Machines',  'TOOLS',     'Model', 'Bahco P16',      93, 100, 'pcs',  8500,    10, 'Remote store'),
      ('Brush Cutters',      'TOOLS',     'Model', 'Stihl FS 120',   81, 100, 'pcs', 12000,    10, 'Central Hub'),
      ('Plucking Baskets',   'TOOLS',     'Sku',   'BSK-220',        68, 100, 'pcs',   180,    30, 'Central Hub'),
      ('Gumboots',           'TOOLS',     'Sku',   'GB-45',          45, 100, 'pairs', 320,    20, 'Factory'),
      ('Glyphosate',         'CHEMICALS', 'Grade', '41% SL',         22, 100, 'L',     540,    20, 'Central Hub'),
      ('Tea Roller Machine', 'MACHINERY', 'Model', 'TR-450',         88, 100, 'units', 145000,  5, 'Factory'),
      ('Knapsack Sprayer',   'MACHINERY', 'Model', 'KS-16',          35, 100, 'pcs',  2600,    15, 'Central Hub'),
      ('Water Pump',         'MACHINERY', 'Model', 'WP-3HP',         12, 100, 'pcs', 18500,    10, 'Remote store'),
      ('Diesel Fuel',        'CHEMICALS', 'Sku',   'FUEL-DSL',       58, 100, 'L',     110,    30, 'Central Hub'),
      ('Copper Fungicide',   'CHEMICALS', 'Grade', '50% WP',          9, 100, 'kg',    680,    20, 'Factory'),
      ('Secateurs',          'TOOLS',     'Model', 'ARS VS-8R',      74, 100, 'pcs',   890,    20, 'Central Hub');
  END IF;
END $$;

-- ---- Seed requisition (only when empty) -----------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM requisition) THEN
    -- Four pending requests feed the "Pending Approvals" panel + PENDING REQ KPI.
    INSERT INTO requisition (item_label, requester, detail, status, requested_at) VALUES
      ('Gloves (20 Pairs)',        'S. Kumar',  'Section 7 • Plucking Team',  'PENDING', now() - INTERVAL '10 minutes'),
      ('Fuel (40L Diesel)',        'M. Jinnah', 'Logistics • Tractor M-2',    'PENDING', now() - INTERVAL '24 minutes'),
      ('Pruning Shears (5 Units)', 'R. Das',    'Section 3 • Pruning Crew',   'PENDING', now() - INTERVAL '2 hours'),
      ('Urea Fertilizer (50 kg)',  'A. Roy',    'Factory • Nursery',         'PENDING', now() - INTERVAL '5 hours');

    -- Three approved today feed the "Approved Issues / Today" KPI.
    INSERT INTO requisition (item_label, requester, detail, status, requested_at, decided_at) VALUES
      ('Sprayer Nozzles (10)', 'B. Ghosh', 'Section 2 • Spraying',   'APPROVED', now() - INTERVAL '6 hours', now() - INTERVAL '1 hour'),
      ('Tea Sacks (100)',      'N. Islam', 'Factory • Packing',     'APPROVED', now() - INTERVAL '8 hours', now() - INTERVAL '2 hours'),
      ('Diesel (20L)',         'P. Barua', 'Logistics • Generator', 'APPROVED', now() - INTERVAL '7 hours', now() - INTERVAL '90 minutes');
  END IF;
END $$;
