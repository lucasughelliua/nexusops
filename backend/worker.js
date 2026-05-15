import { neon } from '@neondatabase/serverless';

const TZ = 'America/Argentina/Buenos_Aires';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      if (!env.DATABASE_URL) {
        return json({ ok: false, error: 'Falta DATABASE_URL en variables del backend' }, 500);
      }

      const sql = neon(env.DATABASE_URL);
      const path = url.pathname;

      if (path === '/' || path === '/health' || path === '/api/health') {
        return json({
          ok: true,
          name: 'NexusOps API',
          status: 'live',
          time: new Date().toISOString()
        });
      }

      if (path === '/api/report/summary' || path === '/api/sales/summary') {
        const data = await getReportSummary(sql, url.searchParams);
        return json(data);
      }

      if (path === '/api/report/orders' || path === '/api/orders') {
        const data = await getOrders(sql, url.searchParams);
        return json(data);
      }

      if (path === '/api/marketing/summary') {
        const data = await getMarketingSummary(sql, url.searchParams);
        return json(data);
      }

      if (path === '/api/debug/today') {
        const data = await getDebugToday(sql);
        return json(data);
      }

      return json({
        ok: false,
        error: 'Ruta no encontrada',
        path
      }, 404);

    } catch (error) {
      return json({
        ok: false,
        error: error && error.message ? error.message : 'Error desconocido',
        stack: error && error.stack ? error.stack : null
      }, 500);
    }
  }
};

async function getReportSummary(sql, searchParams) {
  const range = searchParams.get('range') || searchParams.get('period') || 'today';
  const source = searchParams.get('source') || searchParams.get('channel') || 'all';
  const dateFrom = searchParams.get('date_from') || searchParams.get('from');
  const dateTo = searchParams.get('date_to') || searchParams.get('to');

  const bounds = getBounds(range, dateFrom, dateTo);

  const sales = await getSalesSummary(sql, bounds, source);
  const hourly = await getHourlySales(sql, bounds, source);
  const channels = await getSalesByChannel(sql, bounds, source);
  const topProducts = await getTopProducts(sql, bounds, source);
  const latestOrders = await getLatestOrders(sql, bounds, source, 12);
  const marketing = await getMarketingSummaryByBounds(sql, bounds);

  return {
    ok: true,
    range,
    source,
    timezone: TZ,
    date_from: bounds.fromDate,
    date_to: bounds.toDateInclusive,

    orders: {
      count: sales.orders_count,
      today_count: sales.orders_count,
      raw_rows: sales.raw_rows,
      items_count: sales.items_count
    },

    sales: {
      count: sales.orders_count,
      revenue: sales.revenue,
      net_revenue: sales.net_revenue,
      avg_ticket: sales.avg_ticket,
      units_sold: sales.items_count
    },

    revenue: sales.revenue,
    net_revenue: sales.net_revenue,
    facturacion: sales.revenue,
    ventas: sales.orders_count,
    orders_count: sales.orders_count,
    items_count: sales.items_count,
    avg_ticket: sales.avg_ticket,

    channels,
    hourly,
    top_products: topProducts,
    latest_orders: latestOrders,
    marketing,

    debug: {
      rule: 'Hoy se calcula por fecha local Argentina: (created_at AT TIME ZONE America/Argentina/Buenos_Aires)::date',
      source_table: 'orders',
      order_key: 'COALESCE(external_id, id::text)',
      revenue_column: 'total_amount',
      net_column: 'net_amount',
      raw_rows_in_orders: sales.raw_rows,
      orders_count: sales.orders_count,
      items_count_is_not_orders: true,
      bounds
    }
  };
}

async function getSalesSummary(sql, bounds, source) {
  const sourceFilter = buildSourceFilter(source, 'o.source');

  const rows = await sql`
    WITH base AS (
      SELECT
        COALESCE(o.external_id, o.id::text) AS order_key,
        o.source,
        o.status,
        o.is_canceled,
        o.total_amount,
        o.net_amount,
        o.items_count,
        o.created_at
      FROM orders o
      WHERE (o.created_at AT TIME ZONE ${TZ})::date >= ${bounds.fromDate}::date
        AND (o.created_at AT TIME ZONE ${TZ})::date < ${bounds.toDateExclusive}::date
        ${sourceFilter}
    ),

    clean_orders AS (
      SELECT
        order_key,
        MAX(source) AS source,
        MAX(status) AS status,
        BOOL_OR(COALESCE(is_canceled, false)) AS is_canceled,
        MAX(COALESCE(total_amount, 0)) AS revenue,
        MAX(COALESCE(net_amount, total_amount, 0)) AS net_revenue,
        MAX(COALESCE(items_count, 0)) AS items_count,
        MIN(created_at) AS created_at
      FROM base
      WHERE COALESCE(is_canceled, false) = false
      GROUP BY order_key
    )

    SELECT
      (SELECT COUNT(*)::int FROM base) AS raw_rows,
      COUNT(*)::int AS orders_count,
      COALESCE(SUM(revenue), 0)::numeric AS revenue,
      COALESCE(SUM(net_revenue), 0)::numeric AS net_revenue,
      COALESCE(SUM(items_count), 0)::int AS items_count,
      CASE
        WHEN COUNT(*) > 0 THEN COALESCE(SUM(revenue), 0) / COUNT(*)
        ELSE 0
      END::numeric AS avg_ticket
    FROM clean_orders;
  `;

  const row = rows[0] || {};

  return {
    raw_rows: toNumber(row.raw_rows),
    orders_count: toNumber(row.orders_count),
    revenue: toNumber(row.revenue),
    net_revenue: toNumber(row.net_revenue),
    items_count: toNumber(row.items_count),
    avg_ticket: toNumber(row.avg_ticket)
  };
}

async function getHourlySales(sql, bounds, source) {
  const sourceFilter = buildSourceFilter(source, 'o.source');

  const rows = await sql`
    WITH clean_orders AS (
      SELECT
        COALESCE(o.external_id, o.id::text) AS order_key,
        MIN(o.created_at) AS created_at,
        MAX(COALESCE(o.total_amount, 0)) AS revenue
      FROM orders o
      WHERE (o.created_at AT TIME ZONE ${TZ})::date >= ${bounds.fromDate}::date
        AND (o.created_at AT TIME ZONE ${TZ})::date < ${bounds.toDateExclusive}::date
        AND COALESCE(o.is_canceled, false) = false
        ${sourceFilter}
      GROUP BY COALESCE(o.external_id, o.id::text)
    )

    SELECT
      EXTRACT(HOUR FROM created_at AT TIME ZONE ${TZ})::int AS hour,
      COUNT(*)::int AS orders,
      COALESCE(SUM(revenue), 0)::numeric AS revenue
    FROM clean_orders
    GROUP BY 1
    ORDER BY 1;
  `;

  return rows.map(row => ({
    hour: toNumber(row.hour),
    orders: toNumber(row.orders),
    revenue: toNumber(row.revenue)
  }));
}

async function getSalesByChannel(sql, bounds, source) {
  const sourceFilter = buildSourceFilter(source, 'o.source');

  const rows = await sql`
    WITH clean_orders AS (
      SELECT
        COALESCE(o.external_id, o.id::text) AS order_key,
        MAX(o.source) AS source,
        MAX(COALESCE(o.total_amount, 0)) AS revenue,
        MAX(COALESCE(o.items_count, 0)) AS items_count
      FROM orders o
      WHERE (o.created_at AT TIME ZONE ${TZ})::date >= ${bounds.fromDate}::date
        AND (o.created_at AT TIME ZONE ${TZ})::date < ${bounds.toDateExclusive}::date
        AND COALESCE(o.is_canceled, false) = false
        ${sourceFilter}
      GROUP BY COALESCE(o.external_id, o.id::text)
    )

    SELECT
      source,
      COUNT(*)::int AS orders,
      COALESCE(SUM(revenue), 0)::numeric AS revenue,
      COALESCE(SUM(items_count), 0)::int AS items_count
    FROM clean_orders
    GROUP BY source
    ORDER BY revenue DESC;
  `;

  return rows.map(row => ({
    source: row.source || 'sin_canal',
    channel: row.source || 'sin_canal',
    orders: toNumber(row.orders),
    ventas: toNumber(row.orders),
    revenue: toNumber(row.revenue),
    facturacion: toNumber(row.revenue),
    items_count: toNumber(row.items_count)
  }));
}

async function getTopProducts(sql, bounds, source) {
  const sourceFilter = buildSourceFilter(source, 'o.source');

  const rows = await sql`
    SELECT
      COALESCE(oi.product_name, 'Producto sin nombre') AS product_name,
      COALESCE(o.source, 'sin_canal') AS source,
      COALESCE(SUM(oi.quantity), 0)::int AS quantity,
      COALESCE(SUM(oi.total_price), 0)::numeric AS revenue
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    WHERE (o.created_at AT TIME ZONE ${TZ})::date >= ${bounds.fromDate}::date
      AND (o.created_at AT TIME ZONE ${TZ})::date < ${bounds.toDateExclusive}::date
      AND COALESCE(o.is_canceled, false) = false
      ${sourceFilter}
    GROUP BY oi.product_name, o.source
    ORDER BY quantity DESC, revenue DESC
    LIMIT 10;
  `;

  return rows.map((row, index) => ({
    rank: index + 1,
    product_name: row.product_name,
    product: row.product_name,
    source: row.source,
    channel: row.source,
    quantity: toNumber(row.quantity),
    qty: toNumber(row.quantity),
    revenue: toNumber(row.revenue)
  }));
}

async function getLatestOrders(sql, bounds, source, limit) {
  const sourceFilter = buildSourceFilter(source, 'o.source');

  const rows = await sql`
    SELECT
      COALESCE(o.external_id, o.id::text) AS order_id,
      o.source,
      o.status,
      o.payment_status,
      o.shipping_status,
      o.total_amount,
      o.net_amount,
      o.items_count,
      o.customer_name,
      o.customer_province,
      o.customer_city,
      o.created_at,
      (o.created_at AT TIME ZONE ${TZ}) AS created_at_local
    FROM orders o
    WHERE (o.created_at AT TIME ZONE ${TZ})::date >= ${bounds.fromDate}::date
      AND (o.created_at AT TIME ZONE ${TZ})::date < ${bounds.toDateExclusive}::date
      ${sourceFilter}
    ORDER BY o.created_at DESC
    LIMIT ${limit};
  `;

  return rows.map(row => ({
    order_id: row.order_id,
    external_id: row.order_id,
    source: row.source,
    channel: row.source,
    status: row.status,
    payment_status: row.payment_status,
    shipping_status: row.shipping_status,
    total_amount: toNumber(row.total_amount),
    revenue: toNumber(row.total_amount),
    net_amount: toNumber(row.net_amount),
    items_count: toNumber(row.items_count),
    customer_name: row.customer_name,
    customer_province: row.customer_province,
    customer_city: row.customer_city,
    created_at: row.created_at,
    created_at_local: row.created_at_local
  }));
}

async function getOrders(sql, searchParams) {
  const range = searchParams.get('range') || 'today';
  const source = searchParams.get('source') || searchParams.get('channel') || 'all';
  const dateFrom = searchParams.get('date_from') || searchParams.get('from');
  const dateTo = searchParams.get('date_to') || searchParams.get('to');
  const limit = Math.min(toNumber(searchParams.get('limit') || 50), 200);
  const bounds = getBounds(range, dateFrom, dateTo);

  const orders = await getLatestOrders(sql, bounds, source, limit);

  return {
    ok: true,
    range,
    source,
    timezone: TZ,
    date_from: bounds.fromDate,
    date_to: bounds.toDateInclusive,
    count: orders.length,
    orders
  };
}

async function getMarketingSummary(sql, searchParams) {
  const range = searchParams.get('range') || '30d';
  const dateFrom = searchParams.get('date_from') || searchParams.get('from');
  const dateTo = searchParams.get('date_to') || searchParams.get('to');
  const bounds = getBounds(range, dateFrom, dateTo);

  return jsonSafeMarketing(await getMarketingSummaryByBounds(sql, bounds), bounds);
}

async function getMarketingSummaryByBounds(sql, bounds) {
  const exists = await sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'marketing_daily'
    ) AS exists;
  `;

  if (!exists[0] || !exists[0].exists) {
    return {
      ok: true,
      rows: [],
      totals: emptyMarketingTotals(),
      by_source: [],
      campaigns: []
    };
  }

  const totalsRows = await sql`
    SELECT
      COALESCE(SUM(spend), 0)::numeric AS spend,
      COALESCE(SUM(impressions), 0)::bigint AS impressions,
      COALESCE(SUM(clicks), 0)::bigint AS clicks,
      COALESCE(SUM(conversions), 0)::numeric AS conversions,
      COALESCE(SUM(revenue), 0)::numeric AS revenue,
      COALESCE(SUM(leads), 0)::bigint AS leads,
      COALESCE(SUM(emails_sent), 0)::bigint AS emails_sent,
      COALESCE(SUM(emails_delivered), 0)::bigint AS emails_delivered,
      COALESCE(SUM(opens), 0)::bigint AS opens,
      COALESCE(SUM(bounces), 0)::bigint AS bounces,
      COALESCE(SUM(unsubscribes), 0)::bigint AS unsubscribes
    FROM marketing_daily
    WHERE date >= ${bounds.fromDate}::date
      AND date < ${bounds.toDateExclusive}::date;
  `;

  const sourceRows = await sql`
    SELECT
      source,
      COUNT(*)::int AS rows,
      MIN(date) AS min_date,
      MAX(date) AS max_date,
      COALESCE(SUM(spend), 0)::numeric AS spend,
      COALESCE(SUM(impressions), 0)::bigint AS impressions,
      COALESCE(SUM(clicks), 0)::bigint AS clicks,
      COALESCE(SUM(conversions), 0)::numeric AS conversions,
      COALESCE(SUM(revenue), 0)::numeric AS revenue,
      COALESCE(SUM(leads), 0)::bigint AS leads,
      COALESCE(SUM(emails_sent), 0)::bigint AS emails_sent,
      COALESCE(SUM(emails_delivered), 0)::bigint AS emails_delivered,
      COALESCE(SUM(opens), 0)::bigint AS opens,
      COALESCE(SUM(bounces), 0)::bigint AS bounces,
      COALESCE(SUM(unsubscribes), 0)::bigint AS unsubscribes,
      MAX(updated_at) AS updated_at
    FROM marketing_daily
    WHERE date >= ${bounds.fromDate}::date
      AND date < ${bounds.toDateExclusive}::date
    GROUP BY source
    ORDER BY source;
  `;

  const campaignRows = await sql`
    SELECT
      source,
      campaign_key,
      campaign_id,
      campaign_name,
      COALESCE(SUM(spend), 0)::numeric AS spend,
      COALESCE(SUM(impressions), 0)::bigint AS impressions,
      COALESCE(SUM(clicks), 0)::bigint AS clicks,
      COALESCE(SUM(conversions), 0)::numeric AS conversions,
      COALESCE(SUM(revenue), 0)::numeric AS revenue,
      COALESCE(SUM(leads), 0)::bigint AS leads,
      COALESCE(SUM(emails_sent), 0)::bigint AS emails_sent,
      COALESCE(SUM(emails_delivered), 0)::bigint AS emails_delivered,
      COALESCE(SUM(opens), 0)::bigint AS opens,
      COALESCE(SUM(bounces), 0)::bigint AS bounces,
      COALESCE(SUM(unsubscribes), 0)::bigint AS unsubscribes
    FROM marketing_daily
    WHERE date >= ${bounds.fromDate}::date
      AND date < ${bounds.toDateExclusive}::date
    GROUP BY source, campaign_key, campaign_id, campaign_name
    ORDER BY spend DESC, revenue DESC
    LIMIT 200;
  `;

  const totals = normalizeMarketingRow(totalsRows[0] || emptyMarketingTotals());

  return {
    ok: true,
    totals,
    by_source: sourceRows.map(normalizeMarketingRow),
    campaigns: campaignRows.map(normalizeMarketingRow)
  };
}

function jsonSafeMarketing(marketing, bounds) {
  return {
    ok: true,
    timezone: TZ,
    date_from: bounds.fromDate,
    date_to: bounds.toDateInclusive,
    ...marketing
  };
}

async function getDebugToday(sql) {
  const today = getTodayBA();
  const tomorrow = addDays(today, 1);

  const rows = await sql`
    SELECT
      COALESCE(external_id, id::text) AS order_key,
      source,
      status,
      payment_status,
      shipping_status,
      total_amount,
      net_amount,
      items_count,
      is_canceled,
      created_at,
      created_at AT TIME ZONE ${TZ} AS fecha_argentina
    FROM orders
    WHERE (created_at AT TIME ZONE ${TZ})::date >= ${today}::date
      AND (created_at AT TIME ZONE ${TZ})::date < ${tomorrow}::date
    ORDER BY created_at DESC;
  `;

  const summary = await sql`
    SELECT
      COUNT(*)::int AS rows_in_orders,
      COUNT(DISTINCT COALESCE(external_id, id::text))::int AS unique_orders,
      COALESCE(SUM(total_amount), 0)::numeric AS gross_revenue,
      COALESCE(SUM(net_amount), 0)::numeric AS net_revenue,
      COALESCE(SUM(items_count), 0)::int AS items_count
    FROM orders
    WHERE (created_at AT TIME ZONE ${TZ})::date >= ${today}::date
      AND (created_at AT TIME ZONE ${TZ})::date < ${tomorrow}::date;
  `;

  return {
    ok: true,
    timezone: TZ,
    today,
    tomorrow,
    summary: summary[0] || {},
    orders: rows
  };
}

function getBounds(range, dateFrom, dateTo) {
  const today = getTodayBA();

  let fromDate;
  let toDateExclusive;

  if (dateFrom && dateTo) {
    fromDate = normalizeDateOnly(dateFrom);
    toDateExclusive = addDays(normalizeDateOnly(dateTo), 1);
  } else if (range === 'yesterday' || range === 'ayer') {
    fromDate = addDays(today, -1);
    toDateExclusive = today;
  } else if (range === '7d') {
    fromDate = addDays(today, -6);
    toDateExclusive = addDays(today, 1);
  } else if (range === '30d') {
    fromDate = addDays(today, -29);
    toDateExclusive = addDays(today, 1);
  } else if (range === '90d') {
    fromDate = addDays(today, -89);
    toDateExclusive = addDays(today, 1);
  } else if (range === 'mtd') {
    fromDate = today.slice(0, 8) + '01';
    toDateExclusive = addDays(today, 1);
  } else if (range === 'last_month' || range === 'mes_anterior') {
    const firstThisMonth = today.slice(0, 8) + '01';
    const lastPrevMonth = addDays(firstThisMonth, -1);
    fromDate = lastPrevMonth.slice(0, 8) + '01';
    toDateExclusive = firstThisMonth;
  } else if (range === 'ytd') {
    fromDate = today.slice(0, 4) + '-01-01';
    toDateExclusive = addDays(today, 1);
  } else {
    fromDate = today;
    toDateExclusive = addDays(today, 1);
  }

  return {
    fromDate,
    toDateExclusive,
    toDateInclusive: addDays(toDateExclusive, -1)
  };
}

function buildSourceFilter(source, columnSql) {
  if (!source || source === 'all' || source === 'todos') {
    return sqlEmpty();
  }

  const normalized = String(source).trim().toLowerCase();

  if (normalized === 'meli') {
    return sqlRaw(`AND ${columnSql} IN ('meli', 'meli_1', 'meli_2', 'mercadolibre')`);
  }

  return sqlRaw(`AND ${columnSql} = '${escapeSql(normalized)}'`);
}

function sqlEmpty() {
  return { [Symbol.for('neon.raw')]: '' };
}

function sqlRaw(value) {
  return { [Symbol.for('neon.raw')]: value };
}

function normalizeMarketingRow(row) {
  const spend = toNumber(row.spend);
  const revenue = toNumber(row.revenue);
  const impressions = toNumber(row.impressions);
  const clicks = toNumber(row.clicks);
  const conversions = toNumber(row.conversions);

  return {
    ...row,
    spend,
    investment: spend,
    inversion: spend,
    impressions,
    clicks,
    clics: clicks,
    conversions,
    conversiones: conversions,
    revenue,
    leads: toNumber(row.leads),
    emails_sent: toNumber(row.emails_sent),
    emails_delivered: toNumber(row.emails_delivered),
    opens: toNumber(row.opens),
    bounces: toNumber(row.bounces),
    unsubscribes: toNumber(row.unsubscribes),
    ctr: impressions > 0 ? clicks / impressions : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpa: conversions > 0 ? spend / conversions : 0,
    roas: spend > 0 ? revenue / spend : 0
  };
}

function emptyMarketingTotals() {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
    leads: 0,
    emails_sent: 0,
    emails_delivered: 0,
    opens: 0,
    bounces: 0,
    unsubscribes: 0
  };
}

function getTodayBA() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function normalizeDateOnly(value) {
  const str = String(value || '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  const match = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const date = new Date(str);

  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  }

  throw new Error(`Fecha inválida: ${value}`);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      ...corsHeaders(),
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate'
    }
  });
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization'
  };
}
