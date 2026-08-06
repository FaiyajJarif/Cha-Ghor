-- V9: Supply Chain module
-- Real-time logistics: outbound shipments (routes + live tracker), warehouse
-- tea batches (stock distribution + dispatch-readiness quality gate), and the
-- sales transaction ledger. Three fresh tables with VARCHAR enum columns via
-- @Enumerated(STRING) -- no native Postgres enums. All KPI cards and the
-- warehouse distribution are computed live in the service. Written defensively
-- (same approach as V4-V8): safe whether or not an earlier schema exists.

CREATE TABLE IF NOT EXISTS shipment (
    id          BIGSERIAL PRIMARY KEY,
    code        VARCHAR(40)   NOT NULL DEFAULT '',
    vehicle     VARCHAR(40),
    origin      VARCHAR(80)   NOT NULL DEFAULT '',
    destination VARCHAR(80)   NOT NULL DEFAULT '',
    weight_kg   NUMERIC(12,2) NOT NULL DEFAULT 0,
    status      VARCHAR(20)   NOT NULL DEFAULT 'LOADING',
    on_time     BOOLEAN       NOT NULL DEFAULT TRUE,
    eta_text    VARCHAR(60),
    speed_kmh   INTEGER,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tea_batch (
    id           BIGSERIAL PRIMARY KEY,
    batch_code   VARCHAR(40)   NOT NULL DEFAULT '',
    grade        VARCHAR(40)   NOT NULL DEFAULT '',
    quality_pct  NUMERIC(5,2),
    quality_note VARCHAR(80),
    stage        VARCHAR(30)   NOT NULL DEFAULT 'PROCESSING',
    weight_kg    NUMERIC(12,2) NOT NULL DEFAULT 0,
    readiness    VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_transaction (
    id           BIGSERIAL PRIMARY KEY,
    trx_id       VARCHAR(40)   NOT NULL DEFAULT '',
    txn_date     DATE          NOT NULL DEFAULT CURRENT_DATE,
    grade        VARCHAR(40)   NOT NULL DEFAULT '',
    batch_code   VARCHAR(40),
    buyer        VARCHAR(120)  NOT NULL DEFAULT '',
    volume_kg    NUMERIC(12,2) NOT NULL DEFAULT 0,
    rate_per_kg  NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_revenue  NUMERIC(14,2) NOT NULL DEFAULT 0,
    pay_status   VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    ship_status  VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Reconcile columns in case older tables already exist.
ALTER TABLE shipment ADD COLUMN IF NOT EXISTS code        VARCHAR(40)   NOT NULL DEFAULT '';
ALTER TABLE shipment ADD COLUMN IF NOT EXISTS vehicle     VARCHAR(40);
ALTER TABLE shipment ADD COLUMN IF NOT EXISTS origin      VARCHAR(80)   NOT NULL DEFAULT '';
ALTER TABLE shipment ADD COLUMN IF NOT EXISTS destination VARCHAR(80)   NOT NULL DEFAULT '';
ALTER TABLE shipment ADD COLUMN IF NOT EXISTS weight_kg   NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE shipment ADD COLUMN IF NOT EXISTS status      VARCHAR(20)   NOT NULL DEFAULT 'LOADING';
ALTER TABLE shipment ADD COLUMN IF NOT EXISTS on_time     BOOLEAN       NOT NULL DEFAULT TRUE;
ALTER TABLE shipment ADD COLUMN IF NOT EXISTS eta_text    VARCHAR(60);
ALTER TABLE shipment ADD COLUMN IF NOT EXISTS speed_kmh   INTEGER;
ALTER TABLE shipment ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ   NOT NULL DEFAULT now();

ALTER TABLE tea_batch ADD COLUMN IF NOT EXISTS batch_code   VARCHAR(40)   NOT NULL DEFAULT '';
ALTER TABLE tea_batch ADD COLUMN IF NOT EXISTS grade        VARCHAR(40)   NOT NULL DEFAULT '';
ALTER TABLE tea_batch ADD COLUMN IF NOT EXISTS quality_pct  NUMERIC(5,2);
ALTER TABLE tea_batch ADD COLUMN IF NOT EXISTS quality_note VARCHAR(80);
ALTER TABLE tea_batch ADD COLUMN IF NOT EXISTS stage        VARCHAR(30)   NOT NULL DEFAULT 'PROCESSING';
ALTER TABLE tea_batch ADD COLUMN IF NOT EXISTS weight_kg    NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE tea_batch ADD COLUMN IF NOT EXISTS readiness    VARCHAR(20)   NOT NULL DEFAULT 'PENDING';
ALTER TABLE tea_batch ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ   NOT NULL DEFAULT now();

ALTER TABLE sales_transaction ADD COLUMN IF NOT EXISTS trx_id      VARCHAR(40)   NOT NULL DEFAULT '';
ALTER TABLE sales_transaction ADD COLUMN IF NOT EXISTS txn_date    DATE          NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE sales_transaction ADD COLUMN IF NOT EXISTS grade       VARCHAR(40)   NOT NULL DEFAULT '';
ALTER TABLE sales_transaction ADD COLUMN IF NOT EXISTS batch_code  VARCHAR(40);
ALTER TABLE sales_transaction ADD COLUMN IF NOT EXISTS buyer       VARCHAR(120)  NOT NULL DEFAULT '';
ALTER TABLE sales_transaction ADD COLUMN IF NOT EXISTS volume_kg   NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_transaction ADD COLUMN IF NOT EXISTS rate_per_kg NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_transaction ADD COLUMN IF NOT EXISTS net_revenue NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_transaction ADD COLUMN IF NOT EXISTS pay_status  VARCHAR(20)   NOT NULL DEFAULT 'PENDING';
ALTER TABLE sales_transaction ADD COLUMN IF NOT EXISTS ship_status VARCHAR(20)   NOT NULL DEFAULT 'PENDING';
ALTER TABLE sales_transaction ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ   NOT NULL DEFAULT now();

-- If an earlier schema created enum-typed columns, convert to VARCHAR so
-- Hibernate @Enumerated(STRING) can store uppercase labels.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'shipment' AND column_name = 'status' AND udt_name <> 'varchar') THEN
    ALTER TABLE shipment ALTER COLUMN status TYPE VARCHAR(20) USING status::text;
    UPDATE shipment SET status = upper(status) WHERE status ~ '^[a-z]';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'tea_batch' AND column_name = 'stage' AND udt_name <> 'varchar') THEN
    ALTER TABLE tea_batch ALTER COLUMN stage TYPE VARCHAR(30) USING stage::text;
    UPDATE tea_batch SET stage = upper(stage) WHERE stage ~ '^[a-z]';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'tea_batch' AND column_name = 'readiness' AND udt_name <> 'varchar') THEN
    ALTER TABLE tea_batch ALTER COLUMN readiness TYPE VARCHAR(20) USING readiness::text;
    UPDATE tea_batch SET readiness = upper(readiness) WHERE readiness ~ '^[a-z]';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'sales_transaction' AND column_name = 'pay_status' AND udt_name <> 'varchar') THEN
    ALTER TABLE sales_transaction ALTER COLUMN pay_status TYPE VARCHAR(20) USING pay_status::text;
    UPDATE sales_transaction SET pay_status = upper(pay_status) WHERE pay_status ~ '^[a-z]';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'sales_transaction' AND column_name = 'ship_status' AND udt_name <> 'varchar') THEN
    ALTER TABLE sales_transaction ALTER COLUMN ship_status TYPE VARCHAR(20) USING ship_status::text;
    UPDATE sales_transaction SET ship_status = upper(ship_status) WHERE ship_status ~ '^[a-z]';
  END IF;
END $$;

-- Relax any extra NOT NULL columns an earlier schema may have added that this
-- module never populates. No-op on a fresh DB where V9 created the tables.
DO $$
DECLARE
  tbl text;
  col text;
BEGIN
  FOR tbl, col IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_name IN ('shipment', 'tea_batch', 'sales_transaction')
      AND is_nullable = 'NO'
      AND column_default IS NULL
      AND column_name NOT IN (
        'id', 'code', 'origin', 'destination', 'weight_kg', 'status', 'on_time',
        'batch_code', 'grade', 'stage', 'readiness',
        'trx_id', 'txn_date', 'buyer', 'volume_kg', 'rate_per_kg', 'net_revenue',
        'pay_status', 'ship_status', 'created_at'
      )
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', tbl, col);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_shipment_created_at  ON shipment (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipment_status      ON shipment (status);
CREATE INDEX IF NOT EXISTS idx_tea_batch_created_at ON tea_batch (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tea_batch_stage      ON tea_batch (stage);
CREATE INDEX IF NOT EXISTS idx_sales_txn_date       ON sales_transaction (txn_date DESC, id DESC);

-- ---- Seed (only when empty) -----------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM shipment) THEN
    INSERT INTO shipment (code, vehicle, origin, destination, weight_kg, status, on_time, eta_text, speed_kmh, created_at) VALUES
      ('BT-8821','TR-449','Srimangal','Dhaka',1200,'IN_TRANSIT',TRUE,'2h 45m rem.',32, now() - INTERVAL '1 hour'),
      ('TK-9921','TR-210','Sylhet','Dhaka',1200,'IN_TRANSIT',TRUE,'2h 45m rem.',40, now() - INTERVAL '2 hours'),
      ('TK-4412','TR-334','Srimangal','Chattogram',2500,'IN_TRANSIT',FALSE,'+1h 20m',28, now() - INTERVAL '3 hours'),
      ('TK-8831','TR-402','Habiganj','Dhaka',800,'LOADING',TRUE,'4h 10m rem.',0, now() - INTERVAL '30 minutes'),
      ('TK-7725','TR-118','Moulvibazar','Sylhet',600,'AT_WEIGH_IN',TRUE,'0h 40m rem.',0, now() - INTERVAL '90 minutes'),
      ('TK-6610','TR-090','Srimangal','Dhaka',5000,'DELIVERED',TRUE,'Delivered',0, now() - INTERVAL '2 days'),
      ('TK-6511','TR-077','Sylhet','Chattogram',4100,'DELIVERED',TRUE,'Delivered',0, now() - INTERVAL '3 days'),
      ('TK-6402','TR-065','Habiganj','Dhaka',3000,'DELIVERED',TRUE,'Delivered',0, now() - INTERVAL '4 days');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tea_batch) THEN
    INSERT INTO tea_batch (batch_code, grade, quality_pct, quality_note, stage, weight_kg, readiness, created_at) VALUES
      ('TC-1022','BOP',98.00,'Premium','READY_FOR_DISPATCH',850,'PASSED', now() - INTERVAL '5 hours'),
      ('TC-1025','CTC',94.00,'Standard','READY_FOR_DISPATCH',1400,'PASSED', now() - INTERVAL '6 hours'),
      ('TC-1031','BOP',96.00,'Premium','READY_FOR_DISPATCH',10200,'PASSED', now() - INTERVAL '8 hours'),
      ('TC-1027','CTC',90.00,'Sorting','PROCESSING',4200,'PENDING', now() - INTERVAL '3 hours'),
      ('TC-1029','DUST',NULL,'Pending Lab Report','RAW_LEAF',1770,'PENDING', now() - INTERVAL '1 hour');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sales_transaction) THEN
    INSERT INTO sales_transaction (trx_id, txn_date, grade, batch_code, buyer, volume_kg, rate_per_kg, net_revenue, pay_status, ship_status) VALUES
      ('TX-90812','2026-07-03','BOP','TC-1022','Dhaka Tea Traders',1200,450.00,540000.00,'PAID','DELIVERED'),
      ('TX-11873','2026-06-17','CTC-DUST','TC-1025','Dhaka Tea Traders',760,450.00,342000.00,'PAID','DELIVERED'),
      ('TX-40812','2026-05-24','BOP','TC-1022','Global Cha Co.',1200,450.00,540000.00,'PAID','DELIVERED'),
      ('TX-42492','2026-05-21','BOP','TC-1022','Dhaka Tea Traders',757,450.00,340650.00,'PAID','DELIVERED'),
      ('TX-90248','2026-04-24','BOP','TC-1031','Srimangol Auction',313,450.00,140850.00,'PAID','DELIVERED'),
      ('TX-90711','2026-07-10','CTC','TC-1025','Chattogram Exporters',2000,460.00,920000.00,'PAID','DELIVERED'),
      ('TX-90715','2026-07-12','DUST','TC-1029','Global Cha Co.',900,300.00,270000.00,'PENDING','IN_TRANSIT'),
      ('TX-90720','2026-07-14','BOP','TC-1031','Dhaka Tea Traders',1500,455.00,682500.00,'PENDING','PENDING'),
      ('TX-90722','2026-07-15','CTC','TC-1027','Sylhet Wholesale',1100,440.00,484000.00,'PAID','IN_TRANSIT'),
      ('TX-90724','2026-07-16','BOP','TC-1022','Global Cha Co.',500,450.00,225000.00,'PENDING','PENDING'),
      ('TX-88010','2026-03-02','BOP','TC-1031','Srimangol Auction',2200,445.00,979000.00,'PAID','DELIVERED'),
      ('TX-88044','2026-02-19','CTC-DUST','TC-1025','Chattogram Exporters',1750,430.00,752500.00,'PAID','DELIVERED'),
      ('TX-87901','2026-01-28','DUST','TC-1029','Global Cha Co.',1300,300.00,390000.00,'PAID','DELIVERED'),
      ('TX-87720','2025-12-15','BOP','TC-1022','Dhaka Tea Traders',1600,450.00,720000.00,'PAID','DELIVERED');
  END IF;
END $$;
