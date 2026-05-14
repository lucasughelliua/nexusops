-- ============================================================
-- NexusOps — Schema PostgreSQL (Neon / Supabase)
-- Ejecutar en orden. Compatible con Neon serverless.
-- ============================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Para búsquedas de texto

-- ============================================================
-- CANALES DE VENTA
-- ============================================================
CREATE TABLE channels (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,
  type        VARCHAR(50) NOT NULL CHECK (type IN ('vtex','mercadolibre','other')),
  external_id VARCHAR(255),                    -- seller_id de ML, account_name de VTEX
  active      BOOLEAN DEFAULT true,
  config      JSONB DEFAULT '{}',              -- configuraciones adicionales por canal
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CREDENCIALES DE APIs (encriptadas en app layer)
-- ============================================================
CREATE TABLE api_credentials (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id    UUID REFERENCES channels(id) ON DELETE CASCADE,
  access_token  TEXT,                          -- encriptado en app
  refresh_token TEXT,                          -- encriptado en app
  expires_at    TIMESTAMPTZ,
  extra         JSONB DEFAULT '{}',            -- app_id, client_secret, etc.
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÓRDENES (normalizadas de todas las fuentes)
-- ============================================================
CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id       VARCHAR(255) NOT NULL,     -- ID original de la plataforma
  channel_id        UUID REFERENCES channels(id),
  source            VARCHAR(50) NOT NULL,      -- 'vtex' | 'meli_1' | 'meli_2' | 'sheets'
  status            VARCHAR(50) NOT NULL,      -- 'invoiced' | 'canceled' | 'payment-pending'
  payment_status    VARCHAR(50),
  shipping_status   VARCHAR(50),
  total_amount      NUMERIC(14,2) NOT NULL,
  discount_amount   NUMERIC(14,2) DEFAULT 0,
  net_amount        NUMERIC(14,2) NOT NULL,
  shipping_amount   NUMERIC(14,2) DEFAULT 0,
  items_count       INTEGER DEFAULT 1,
  customer_name     VARCHAR(255),
  customer_email    VARCHAR(255),
  customer_province VARCHAR(100),
  customer_city     VARCHAR(100),
  is_canceled       BOOLEAN DEFAULT false,
  is_returned       BOOLEAN DEFAULT false,
  raw_data          JSONB,                     -- respuesta original de la API
  created_at        TIMESTAMPTZ NOT NULL,      -- fecha de la orden en la plataforma
  updated_at        TIMESTAMPTZ NOT NULL,
  synced_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(external_id, source)
);

-- Índices críticos para performance de queries
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_channel_id ON orders(channel_id);
CREATE INDEX idx_orders_source ON orders(source);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date_channel ON orders(created_at DESC, channel_id);
CREATE INDEX idx_orders_province ON orders(customer_province);

-- ============================================================
-- ÍTEMS DE ÓRDENES
-- ============================================================
CREATE TABLE order_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id     UUID REFERENCES orders(id) ON DELETE CASCADE,
  external_id  VARCHAR(255),                  -- ID del item en la plataforma
  sku          VARCHAR(255),
  product_name VARCHAR(500) NOT NULL,
  category     VARCHAR(255),
  brand        VARCHAR(255),
  quantity     INTEGER NOT NULL DEFAULT 1,
  unit_price   NUMERIC(14,2) NOT NULL,
  total_price  NUMERIC(14,2) NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_items_order_id ON order_items(order_id);
CREATE INDEX idx_items_sku ON order_items(sku);

-- ============================================================
-- MÉTRICAS PRE-CALCULADAS (snapshot horario)
-- Evita recalcular en cada visita al dashboard
-- ============================================================
CREATE TABLE metrics_snapshots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id      UUID REFERENCES channels(id),
  date            DATE NOT NULL,
  hour            SMALLINT CHECK (hour >= 0 AND hour <= 23),
  total_revenue   NUMERIC(16,2) DEFAULT 0,
  net_revenue     NUMERIC(16,2) DEFAULT 0,
  orders_count    INTEGER DEFAULT 0,
  avg_ticket      NUMERIC(14,2) DEFAULT 0,
  units_sold      INTEGER DEFAULT 0,
  cancellations   INTEGER DEFAULT 0,
  returns         INTEGER DEFAULT 0,
  conversion_rate NUMERIC(6,4) DEFAULT 0,
  calculated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id, date, hour)
);

CREATE INDEX idx_metrics_date ON metrics_snapshots(date DESC);
CREATE INDEX idx_metrics_channel_date ON metrics_snapshots(channel_id, date DESC);

-- Vista para métricas del día actual por canal
CREATE VIEW daily_metrics AS
SELECT
  channel_id,
  date,
  SUM(total_revenue) AS total_revenue,
  SUM(orders_count) AS orders_count,
  SUM(units_sold) AS units_sold,
  SUM(cancellations) AS cancellations,
  SUM(returns) AS returns,
  CASE WHEN SUM(orders_count) > 0 THEN SUM(total_revenue)/SUM(orders_count) ELSE 0 END AS avg_ticket
FROM metrics_snapshots
GROUP BY channel_id, date;

-- ============================================================
-- LEADS Y CRM (Kommo)
-- ============================================================
CREATE TABLE leads (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id      VARCHAR(255) NOT NULL UNIQUE,
  status           VARCHAR(100),               -- 'open' | 'won' | 'lost'
  pipeline_id      INTEGER,
  pipeline_stage   VARCHAR(255),
  stage_order      INTEGER,
  name             VARCHAR(255),
  estimated_value  NUMERIC(14,2),
  assigned_to      VARCHAR(255),
  campaign_source  VARCHAR(255),
  tags             TEXT[],
  order_id         UUID REFERENCES orders(id), -- si se convirtió en venta
  created_at       TIMESTAMPTZ NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL,
  converted_at     TIMESTAMPTZ,
  closed_at        TIMESTAMPTZ,
  synced_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);

-- ============================================================
-- LOGÍSTICA
-- ============================================================
CREATE TABLE shipments (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id           UUID REFERENCES orders(id),
  external_id        VARCHAR(255),
  carrier            VARCHAR(255),
  tracking_number    VARCHAR(255),
  status             VARCHAR(100),              -- 'in_transit' | 'delivered' | 'delayed' | 'pending'
  is_delayed         BOOLEAN DEFAULT false,
  delay_days         INTEGER DEFAULT 0,
  province           VARCHAR(100),
  city               VARCHAR(100),
  estimated_delivery DATE,
  actual_delivery    DATE,
  shipped_at         TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id)
);

CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_shipments_delayed ON shipments(is_delayed) WHERE is_delayed = true;
CREATE INDEX idx_shipments_province ON shipments(province);

-- ============================================================
-- ALERTAS
-- ============================================================
CREATE TABLE alerts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type         VARCHAR(100) NOT NULL,          -- 'sales_drop' | 'token_expired' | 'stock_low' | etc.
  severity     VARCHAR(20) CHECK (severity IN ('critical','high','medium','low')),
  message      TEXT NOT NULL,
  detail       TEXT,
  channel_id   UUID REFERENCES channels(id),
  resolved     BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ,
  resolved_by  VARCHAR(255)
);

CREATE INDEX idx_alerts_resolved ON alerts(resolved) WHERE resolved = false;
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);

-- ============================================================
-- SYNC LOG — Control de sincronización incremental
-- ============================================================
CREATE TABLE sync_log (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source            VARCHAR(50) NOT NULL,      -- 'vtex' | 'meli_1' | 'meli_2' | 'kommo' | 'logistics' | 'sheets'
  started_at        TIMESTAMPTZ DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  records_processed INTEGER DEFAULT 0,
  records_created   INTEGER DEFAULT 0,
  records_updated   INTEGER DEFAULT 0,
  last_id_synced    VARCHAR(255),              -- último ID procesado
  last_date_synced  TIMESTAMPTZ,              -- último timestamp procesado
  status            VARCHAR(20) CHECK (status IN ('running','success','error','partial')),
  error_message     TEXT,
  duration_ms       INTEGER
);

CREATE INDEX idx_sync_source ON sync_log(source, started_at DESC);

-- Vista del último sync exitoso por fuente
CREATE VIEW last_sync AS
SELECT DISTINCT ON (source)
  source, started_at, finished_at, records_processed,
  last_date_synced, status, error_message
FROM sync_log
WHERE status IN ('success','partial')
ORDER BY source, started_at DESC;

-- ============================================================
-- TENANTS (para uso SaaS multi-cliente)
-- ============================================================
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  plan        VARCHAR(50) DEFAULT 'starter',
  active      BOOLEAN DEFAULT true,
  settings    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Agregar tenant_id a tablas principales para Row Level Security
ALTER TABLE channels ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE orders ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE metrics_snapshots ADD COLUMN tenant_id UUID REFERENCES tenants(id);

-- RLS (descomentar al activar multi-tenant)
-- ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY orders_tenant ON orders USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- ============================================================
-- MARKETING / ADS / EMAIL
-- Tablas requeridas por jobs/sync-marketing.js
-- ============================================================
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id     VARCHAR(255) NOT NULL,
  source          VARCHAR(50) NOT NULL,
  channel_id      UUID REFERENCES channels(id),
  name            VARCHAR(500) NOT NULL,
  status          VARCHAR(100),
  objective       VARCHAR(255),
  daily_budget    NUMERIC(14,2),
  lifetime_budget NUMERIC(14,2),
  start_date      DATE,
  end_date        DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  synced_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(external_id, source)
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_source ON marketing_campaigns(source);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_channel ON marketing_campaigns(channel_id);

CREATE TABLE IF NOT EXISTS marketing_metrics (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id     UUID REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  source          VARCHAR(50) NOT NULL,
  date            DATE NOT NULL,
  impressions     INTEGER DEFAULT 0,
  reach           INTEGER DEFAULT 0,
  clicks          INTEGER DEFAULT 0,
  spend           NUMERIC(14,2) DEFAULT 0,
  cpm             NUMERIC(14,4) DEFAULT 0,
  cpc             NUMERIC(14,4) DEFAULT 0,
  ctr             NUMERIC(14,4) DEFAULT 0,
  frequency       NUMERIC(14,4) DEFAULT 0,
  conversions     NUMERIC(14,4) DEFAULT 0,
  conv_value      NUMERIC(14,2) DEFAULT 0,
  leads           INTEGER DEFAULT 0,
  video_views     INTEGER DEFAULT 0,
  sent            INTEGER DEFAULT 0,
  delivered       INTEGER DEFAULT 0,
  opens           INTEGER DEFAULT 0,
  unique_opens    INTEGER DEFAULT 0,
  clicks_email    INTEGER DEFAULT 0,
  unique_clicks   INTEGER DEFAULT 0,
  unsubscribes    INTEGER DEFAULT 0,
  bounces_soft    INTEGER DEFAULT 0,
  bounces_hard    INTEGER DEFAULT 0,
  spam_reports    INTEGER DEFAULT 0,
  revenue_attr    NUMERIC(14,2) DEFAULT 0,
  synced_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, date)
);

CREATE INDEX IF NOT EXISTS idx_marketing_metrics_date ON marketing_metrics(date DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_metrics_source_date ON marketing_metrics(source, date DESC);

-- ============================================================
-- DASHBOARD USERS (auth real en DB)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS dashboard_users (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username   VARCHAR(100) NOT NULL UNIQUE,
  name       VARCHAR(255) NOT NULL,
  role       VARCHAR(50) DEFAULT 'viewer' CHECK (role IN ('admin','gerente','marketing','ops','viewer')),
  pin_hash   TEXT NOT NULL,
  active     BOOLEAN DEFAULT true,
  perms      TEXT[] DEFAULT '{}',
  color      VARCHAR(20) DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usuario admin inicial (lucasughelli / PIN: 1785)
INSERT INTO dashboard_users (username, name, role, pin_hash, active, perms, color)
VALUES (
  'lucasughelli',
  'Lucas U.',
  'admin',
  crypt('1785', gen_salt('bf')),
  true,
  ARRAY['executive','live','channels','marketing','logistics','alerts'],
  '#1d4ed8'
) ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- GOOGLE ADS (tablas adicionales para métricas extendidas)
-- ============================================================
CREATE TABLE IF NOT EXISTS google_ads_campaigns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id     VARCHAR(255) NOT NULL UNIQUE,
  customer_id     VARCHAR(50),
  name            VARCHAR(500),
  status          VARCHAR(50),
  channel_type    VARCHAR(100),
  bidding_strategy VARCHAR(100),
  daily_budget    NUMERIC(14,2),
  synced_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- KOMMO PIPELINES (para análisis de embudo)
-- ============================================================
CREATE TABLE IF NOT EXISTS kommo_pipelines (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id  VARCHAR(255) NOT NULL UNIQUE,
  name         VARCHAR(255),
  is_main      BOOLEAN DEFAULT false,
  synced_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kommo_stages (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pipeline_id  UUID REFERENCES kommo_pipelines(id),
  external_id  VARCHAR(255) NOT NULL UNIQUE,
  name         VARCHAR(255),
  sort_order   INTEGER DEFAULT 0,
  is_won       BOOLEAN DEFAULT false,
  is_lost      BOOLEAN DEFAULT false
);
