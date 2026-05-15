CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('vtex','mercadolibre','other')),
  external_id VARCHAR(255),
  active BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(255) NOT NULL,
  channel_id UUID REFERENCES channels(id),
  source VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  payment_status VARCHAR(50),
  shipping_status VARCHAR(50),
  total_amount NUMERIC(14,2) NOT NULL,
  discount_amount NUMERIC(14,2) DEFAULT 0,
  net_amount NUMERIC(14,2) NOT NULL,
  shipping_amount NUMERIC(14,2) DEFAULT 0,
  items_count INTEGER DEFAULT 1,
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  customer_province VARCHAR(100),
  customer_city VARCHAR(100),
  is_canceled BOOLEAN DEFAULT false,
  is_returned BOOLEAN DEFAULT false,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(external_id, source)
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS external_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS channel_id UUID,
  ADD COLUMN IF NOT EXISTS source VARCHAR(50),
  ADD COLUMN IF NOT EXISTS status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS shipping_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS shipping_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS items_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS customer_province VARCHAR(100),
  ADD COLUMN IF NOT EXISTS customer_city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS is_canceled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_returned BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS raw_data JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_external_source_unique
ON orders(external_id, source);

CREATE INDEX IF NOT EXISTS idx_orders_created_at
ON orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_source
ON orders(source);

CREATE INDEX IF NOT EXISTS idx_orders_status
ON orders(status);

CREATE INDEX IF NOT EXISTS idx_orders_local_date
ON orders(((created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date));

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  external_id VARCHAR(255),
  sku VARCHAR(255),
  product_name VARCHAR(500) NOT NULL,
  category VARCHAR(255),
  brand VARCHAR(255),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL,
  total_price NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS order_id UUID,
  ADD COLUMN IF NOT EXISTS external_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS sku VARCHAR(255),
  ADD COLUMN IF NOT EXISTS product_name VARCHAR(500),
  ADD COLUMN IF NOT EXISTS category VARCHAR(255),
  ADD COLUMN IF NOT EXISTS brand VARCHAR(255),
  ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS total_price NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_items_order_id
ON order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_items_sku
ON order_items(sku);

CREATE TABLE IF NOT EXISTS marketing_daily (
  date DATE NOT NULL,
  source TEXT NOT NULL,
  campaign_key TEXT NOT NULL DEFAULT 'default',
  campaign_id TEXT,
  campaign_name TEXT,

  spend NUMERIC DEFAULT 0,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  conversions NUMERIC DEFAULT 0,
  revenue NUMERIC DEFAULT 0,
  leads BIGINT DEFAULT 0,

  emails_sent BIGINT DEFAULT 0,
  emails_delivered BIGINT DEFAULT 0,
  opens BIGINT DEFAULT 0,
  bounces BIGINT DEFAULT 0,
  unsubscribes BIGINT DEFAULT 0,

  raw JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (date, source, campaign_key)
);

ALTER TABLE marketing_daily
  ADD COLUMN IF NOT EXISTS campaign_key TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS campaign_name TEXT,
  ADD COLUMN IF NOT EXISTS spend NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impressions BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversions NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leads BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emails_sent BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emails_delivered BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opens BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bounces BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unsubscribes BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS raw JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_marketing_daily_date
ON marketing_daily(date DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_daily_source_date
ON marketing_daily(source, date DESC);

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(100),
  pipeline_id INTEGER,
  pipeline_stage VARCHAR(255),
  stage_order INTEGER,
  name VARCHAR(255),
  estimated_value NUMERIC(14,2),
  assigned_to VARCHAR(255),
  campaign_source VARCHAR(255),
  tags TEXT[],
  order_id UUID REFERENCES orders(id),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  converted_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_status
ON leads(status);

CREATE INDEX IF NOT EXISTS idx_leads_created_at
ON leads(created_at DESC);

CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id),
  external_id VARCHAR(255),
  carrier VARCHAR(255),
  tracking_number VARCHAR(255),
  status VARCHAR(100),
  is_delayed BOOLEAN DEFAULT false,
  delay_days INTEGER DEFAULT 0,
  province VARCHAR(100),
  city VARCHAR(100),
  estimated_delivery DATE,
  actual_delivery DATE,
  shipped_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id)
);

CREATE INDEX IF NOT EXISTS idx_shipments_status
ON shipments(status);

CREATE INDEX IF NOT EXISTS idx_shipments_delayed
ON shipments(is_delayed)
WHERE is_delayed = true;

CREATE INDEX IF NOT EXISTS idx_shipments_province
ON shipments(province);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) DEFAULT 'info',
  title VARCHAR(255),
  message TEXT,
  source VARCHAR(50),
  data JSONB DEFAULT '{}',
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alerts_created_at
ON alerts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_resolved
ON alerts(resolved);
