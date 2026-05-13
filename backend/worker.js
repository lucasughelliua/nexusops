/**
 * NexusOps — Cloudflare Worker (Thin API Layer)
 * 
 * NO llama APIs externas. Solo sirve datos de la DB/KV.
 * Instalar: npm create cloudflare@latest nexusops-api
 * Deploy: wrangler deploy
 * 
 * wrangler.toml mínimo:
 * name = "nexusops-api"
 * main = "src/worker.js"
 * compatibility_date = "2024-01-01"
 * [[kv_namespaces]]
 * binding = "CACHE"
 * id = "TU_KV_ID"
 */

import { Pool } from '@neondatabase/serverless';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extra },
  });
}

function error(msg, status = 400) {
  return json({ error: msg }, status);
}

// ---- Router simple ----
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = request.method;

    if (method === 'OPTIONS') return new Response(null, { headers: CORS });

    // Auth básica con API key
    const apiKey = request.headers.get('x-api-key');
    if (apiKey !== env.API_KEY) return error('Unauthorized', 401);

    const db = new Pool({ connectionString: env.DATABASE_URL });

    try {
      // ---- MÉTRICAS EJECUTIVAS ----
      if (path === '/metrics/executive' && method === 'GET') {
        // Intentar desde KV cache primero (TTL: 5 min)
        const cached = await env.CACHE.get('metrics:executive');
        if (cached) {
          return json(JSON.parse(cached), 200, { 'X-Cache': 'HIT' });
        }

        const { rows } = await db.query(`
          SELECT
            SUM(o.total_amount) AS total_revenue,
            SUM(o.net_amount) AS net_revenue,
            COUNT(*) AS orders_count,
            AVG(o.total_amount) AS avg_ticket,
            SUM(oi.quantity) AS units_sold,
            COUNT(*) FILTER (WHERE o.is_canceled) AS cancellations,
            COUNT(*) FILTER (WHERE o.is_returned) AS returns
          FROM orders o
          LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE o.created_at >= CURRENT_DATE
        `);

        const data = rows[0];
        await env.CACHE.put('metrics:executive', JSON.stringify(data), { expirationTtl: 300 });
        return json(data, 200, { 'X-Cache': 'MISS' });
      }

      // ---- MÉTRICAS EJECUTIVAS CON COMPARATIVA ----
      if (path === '/metrics/executive/compare' && method === 'GET') {
        const { rows } = await db.query(`
          WITH today AS (
            SELECT
              SUM(total_amount) AS revenue,
              COUNT(*) AS orders,
              AVG(total_amount) AS ticket
            FROM orders
            WHERE created_at >= CURRENT_DATE
              AND NOT is_canceled
          ),
          yesterday AS (
            SELECT
              SUM(total_amount) AS revenue,
              COUNT(*) AS orders,
              AVG(total_amount) AS ticket
            FROM orders
            WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
              AND created_at < CURRENT_DATE
              AND NOT is_canceled
          ),
          last_week_same_hour AS (
            SELECT
              SUM(total_amount) AS revenue,
              COUNT(*) AS orders
            FROM orders
            WHERE created_at >= (NOW() - INTERVAL '7 days')::DATE
              AND created_at < (NOW() - INTERVAL '7 days')
              AND NOT is_canceled
          )
          SELECT
            t.revenue AS today_revenue,
            t.orders AS today_orders,
            t.ticket AS today_ticket,
            y.revenue AS yesterday_revenue,
            y.orders AS yesterday_orders,
            y.ticket AS yesterday_ticket,
            lw.revenue AS last_week_revenue,
            lw.orders AS last_week_orders,
            ROUND((t.revenue - y.revenue) / NULLIF(y.revenue, 0) * 100, 2) AS revenue_delta_pct,
            ROUND((t.orders - y.orders) / NULLIF(y.orders::NUMERIC, 0) * 100, 2) AS orders_delta_pct
          FROM today t, yesterday y, last_week_same_hour lw
        `);
        return json(rows[0]);
      }

      // ---- ÓRDENES EN VIVO ----
      if (path === '/orders/live' && method === 'GET') {
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
        const { rows } = await db.query(`
          SELECT
            o.external_id,
            o.source,
            o.total_amount,
            o.status,
            o.payment_status,
            o.shipping_status,
            o.customer_province,
            o.customer_city,
            o.created_at,
            c.name AS channel_name,
            ARRAY_AGG(oi.product_name ORDER BY oi.total_price DESC) AS products
          FROM orders o
          JOIN channels c ON c.id = o.channel_id
          LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE o.created_at >= NOW() - INTERVAL '24 hours'
          GROUP BY o.id, c.name
          ORDER BY o.created_at DESC
          LIMIT $1
        `, [limit]);
        return json(rows);
      }

      // ---- ÓRDENES CON FILTROS ----
      if (path === '/orders' && method === 'GET') {
        const channelId = url.searchParams.get('channel');
        const dateFrom = url.searchParams.get('date_from') || new Date(Date.now() - 86400000 * 7).toISOString();
        const dateTo = url.searchParams.get('date_to') || new Date().toISOString();
        const page = parseInt(url.searchParams.get('page') || '1');
        const pageSize = 50;
        const offset = (page - 1) * pageSize;

        const params = [dateFrom, dateTo, pageSize, offset];
        let where = 'WHERE o.created_at >= $1 AND o.created_at <= $2';
        if (channelId) { params.splice(2, 0, channelId); where += ` AND o.channel_id = $3`; }

        const { rows } = await db.query(`
          SELECT o.*, c.name AS channel_name
          FROM orders o JOIN channels c ON c.id = o.channel_id
          ${where}
          ORDER BY o.created_at DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}
        `, params);
        return json({ data: rows, page, pageSize });
      }

      // ---- MÉTRICAS POR CANAL ----
      if (path.match(/^\/channels\/[^/]+\/metrics$/) && method === 'GET') {
        const channelId = path.split('/')[2];
        const { rows } = await db.query(`
          SELECT
            SUM(total_amount) AS revenue,
            COUNT(*) AS orders,
            AVG(total_amount) AS avg_ticket,
            COUNT(*) FILTER (WHERE is_canceled) AS cancellations
          FROM orders
          WHERE channel_id = $1 AND created_at >= CURRENT_DATE
        `, [channelId]);
        return json(rows[0]);
      }

      // ---- CANALES ----
      if (path === '/channels' && method === 'GET') {
        const { rows } = await db.query('SELECT id, name, type, active FROM channels WHERE active = true ORDER BY name');
        return json(rows);
      }

      // ---- TOP PRODUCTOS ----
      if (path === '/products/top' && method === 'GET') {
        const period = url.searchParams.get('period') || '1d';
        const interval = period === '7d' ? '7 days' : period === '30d' ? '30 days' : '1 day';
        const channelFilter = url.searchParams.get('channel');

        const params = [interval];
        let where = '';
        if (channelFilter) { params.push(channelFilter); where = 'AND o.channel_id = $2'; }

        const { rows } = await db.query(`
          SELECT
            oi.sku,
            oi.product_name,
            oi.category,
            SUM(oi.quantity) AS units_sold,
            SUM(oi.total_price) AS revenue,
            COUNT(DISTINCT o.id) AS order_count
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE o.created_at >= NOW() - $1::INTERVAL
            AND NOT o.is_canceled ${where}
          GROUP BY oi.sku, oi.product_name, oi.category
          ORDER BY revenue DESC
          LIMIT 20
        `, params);
        return json(rows);
      }

      // ---- EMBUDO KOMMO ----
      if (path === '/marketing/funnel' && method === 'GET') {
        const { rows } = await db.query(`
          SELECT
            pipeline_stage,
            stage_order,
            COUNT(*) AS count,
            SUM(estimated_value) AS total_value,
            AVG(estimated_value) AS avg_value
          FROM leads
          WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY pipeline_stage, stage_order
          ORDER BY stage_order
        `);
        return json(rows);
      }

      // ---- LEADS ----
      if (path === '/marketing/leads' && method === 'GET') {
        const status = url.searchParams.get('status');
        const params = [];
        let where = 'WHERE created_at >= CURRENT_DATE - INTERVAL \'30 days\'';
        if (status) { params.push(status); where += ` AND status = $${params.length}`; }

        const { rows } = await db.query(`
          SELECT id, name, status, pipeline_stage, estimated_value, campaign_source, created_at, converted_at
          FROM leads ${where}
          ORDER BY created_at DESC LIMIT 50
        `, params);
        return json(rows);
      }

      // ---- RESUMEN LOGÍSTICO ----
      if (path === '/logistics/summary' && method === 'GET') {
        const { rows } = await db.query(`
          SELECT
            COUNT(*) AS total_shipments,
            COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
            COUNT(*) FILTER (WHERE status = 'in_transit') AS in_transit,
            COUNT(*) FILTER (WHERE status = 'pending') AS pending_dispatch,
            COUNT(*) FILTER (WHERE is_delayed) AS delayed,
            ROUND(AVG(
              CASE WHEN actual_delivery IS NOT NULL AND shipped_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (actual_delivery::TIMESTAMPTZ - shipped_at)) / 86400
              END
            ), 1) AS avg_delivery_days,
            ROUND(
              COUNT(*) FILTER (WHERE status = 'delivered' AND NOT is_delayed)::NUMERIC /
              NULLIF(COUNT(*) FILTER (WHERE status = 'delivered'), 0) * 100, 1
            ) AS on_time_pct
          FROM shipments
          WHERE shipped_at >= CURRENT_DATE - INTERVAL '30 days'
        `);
        return json(rows[0]);
      }

      // ---- ENVÍOS DEMORADOS ----
      if (path === '/logistics/delayed' && method === 'GET') {
        const { rows } = await db.query(`
          SELECT
            s.*, o.external_id AS order_external_id, o.customer_province
          FROM shipments s
          JOIN orders o ON o.id = s.order_id
          WHERE s.is_delayed = true AND s.status != 'delivered'
          ORDER BY s.delay_days DESC
          LIMIT 50
        `);
        return json(rows);
      }

      // ---- ALERTAS ACTIVAS ----
      if (path === '/alerts/active' && method === 'GET') {
        const { rows } = await db.query(`
          SELECT * FROM alerts
          WHERE resolved = false
          ORDER BY
            CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
            created_at DESC
        `);
        return json(rows);
      }

      // ---- RESOLVER ALERTA ----
      if (path.match(/^\/alerts\/[^/]+\/resolve$/) && method === 'POST') {
        const alertId = path.split('/')[2];
        const { rows } = await db.query(`
          UPDATE alerts SET resolved = true, resolved_at = NOW()
          WHERE id = $1 RETURNING *
        `, [alertId]);
        return json(rows[0] || { error: 'Not found' });
      }

      // ---- ESTADO SYNC ----
      if (path === '/sync/status' && method === 'GET') {
        const { rows } = await db.query(`
          SELECT * FROM last_sync ORDER BY source
        `);
        return json(rows);
      }

      // ---- TRIGGER IMPORTACIÓN SHEETS (protegido) ----
      if (path === '/sync/sheets' && method === 'POST') {
        // Solo desde IP de confianza o header especial
        const secret = request.headers.get('x-sync-secret');
        if (secret !== env.SYNC_SECRET) return error('Forbidden', 403);
        // En producción: publicar mensaje a una cola o llamar al job directamente
        return json({ message: 'Importación de Sheets encolada', timestamp: new Date().toISOString() });
      }

      return error('Not found', 404);
    } catch (err) {
      console.error(err);
      return error('Internal server error', 500);
    } finally {
      await db.end();
    }
  },
};
