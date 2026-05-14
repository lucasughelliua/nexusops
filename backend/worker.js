/**
 * NexusOps Marketing Intelligence — Worker endpoints
 *
 * Agregar estas rutas dentro de tu worker.js existente.
 * Si tu worker ya tiene router, copiá las funciones SQL y los bloques de rutas.
 *
 * Requiere:
 * DATABASE_URL
 * API_KEY
 */

import { neon } from '@neondatabase/serverless';

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-session-token',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    },
  });
}

function bad(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

function requireApiKey(req, env) {
  const key = req.headers.get('x-api-key');
  return key && key === env.API_KEY;
}

async function bodyJson(req) {
  try { return await req.json(); } catch { return {}; }
}

function getDateRange(url) {
  const dateFrom = url.searchParams.get('date_from') || url.searchParams.get('dateFrom') || new Date(Date.now() - 86400000 * 30).toISOString().split('T')[0];
  const dateTo = url.searchParams.get('date_to') || url.searchParams.get('dateTo') || new Date().toISOString().split('T')[0];
  return { dateFrom, dateTo };
}

function getDashboardFilters(url) {
  return {
    channel: url.searchParams.get('channel') || 'all',
    source: url.searchParams.get('source') || 'all',
    campaign: url.searchParams.get('campaign') || '',
    brand: url.searchParams.get('brand') || '',
    category: url.searchParams.get('category') || '',
    product: url.searchParams.get('product') || '',
    sku: url.searchParams.get('sku') || '',
    province: url.searchParams.get('province') || '',
    status: url.searchParams.get('status') || '',
    paymentStatus: url.searchParams.get('payment_status') || url.searchParams.get('paymentStatus') || '',
  };
}

function sourceMatch(source, channel) {
  const s = String(source || '').toLowerCase();
  const c = String(channel || '').toLowerCase();
  if (!c || c === 'all') return true;
  if (c === 'ml1') return s === 'meli_1' || s === 'ml_1' || s.includes('meli_1');
  if (c === 'ml2') return s === 'meli_2' || s === 'ml_2' || s.includes('meli_2');
  return s === c || s.includes(c);
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function createSession(env, user) {
  const raw = `${user.id}:${Date.now()}:${crypto.randomUUID()}`;
  const token = await sha256(raw);
  const payload = {
    id: user.id,
    name: user.name,
    role: user.role,
    exp: Date.now() + 1000 * 60 * 60 * 12,
  };
  const encoded = btoa(JSON.stringify(payload));
  return `${encoded}.${token.slice(0, 16)}`;
}

function parseSession(req) {
  const token = req.headers.get('x-session-token') || '';
  const [encoded] = token.split('.');
  if (!encoded) return null;
  try {
    const payload = JSON.parse(atob(encoded));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function requireAdmin(req) {
  const session = parseSession(req);
  return session && session.role === 'admin' ? session : null;
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return json({ ok: true });

    const url = new URL(req.url);
    const path = url.pathname;
    const sql = neon(env.DATABASE_URL);

    try {
      if (!requireApiKey(req, env)) return bad('Unauthorized', 401);

      // --------------------------------------------------------
      // AUTH
      // --------------------------------------------------------
      if (path === '/api/v1/auth/login' && req.method === 'POST') {
        const body = await bodyJson(req);
        const pin = String(body.pin || '').trim();

        if (!/^\d{4}$/.test(pin)) return bad('El PIN debe tener 4 números', 400);

        const users = await sql`
          SELECT id, name, role, active
          FROM dashboard_users
          WHERE active = true
          AND pin_hash = crypt(${pin}, pin_hash)
          LIMIT 1
        `;

        if (!users.length) return bad('PIN inválido', 401);

        const token = await createSession(env, users[0]);
        return json({ ok: true, user: users[0], token });
      }

      // --------------------------------------------------------
      // ADMIN USERS
      // --------------------------------------------------------
      if (path === '/api/v1/admin/users' && req.method === 'GET') {
        const admin = requireAdmin(req);
        if (!admin) return bad('Admin requerido', 403);

        const rows = await sql`
          SELECT id, name, role, active, created_at, updated_at
          FROM dashboard_users
          ORDER BY created_at DESC
        `;
        return json({ ok: true, data: rows });
      }

      if (path === '/api/v1/admin/users' && req.method === 'POST') {
        const admin = requireAdmin(req);
        if (!admin) return bad('Admin requerido', 403);

        const body = await bodyJson(req);
        const name = String(body.name || '').trim();
        const pin = String(body.pin || '').trim();
        const role = body.role === 'admin' ? 'admin' : 'viewer';

        if (!name) return bad('Falta name');
        if (!/^\d{4}$/.test(pin)) return bad('El PIN debe tener 4 números');

        const rows = await sql`
          INSERT INTO dashboard_users(name, pin_hash, role, active)
          VALUES (${name}, crypt(${pin}, gen_salt('bf')), ${role}, true)
          RETURNING id, name, role, active, created_at, updated_at
        `;

        return json({ ok: true, data: rows[0] });
      }

      if (path.startsWith('/api/v1/admin/users/') && req.method === 'PATCH') {
        const admin = requireAdmin(req);
        if (!admin) return bad('Admin requerido', 403);

        const id = path.split('/').pop();
        const body = await bodyJson(req);

        const existing = await sql`SELECT id FROM dashboard_users WHERE id=${id} LIMIT 1`;
        if (!existing.length) return bad('Usuario no encontrado', 404);

        if (body.pin !== undefined) {
          const pin = String(body.pin || '').trim();
          if (!/^\d{4}$/.test(pin)) return bad('El PIN debe tener 4 números');
          await sql`UPDATE dashboard_users SET pin_hash=crypt(${pin}, gen_salt('bf')), updated_at=NOW() WHERE id=${id}`;
        }

        if (body.name !== undefined) {
          await sql`UPDATE dashboard_users SET name=${String(body.name).trim()}, updated_at=NOW() WHERE id=${id}`;
        }

        if (body.role !== undefined) {
          const role = body.role === 'admin' ? 'admin' : 'viewer';
          await sql`UPDATE dashboard_users SET role=${role}, updated_at=NOW() WHERE id=${id}`;
        }

        if (body.active !== undefined) {
          await sql`UPDATE dashboard_users SET active=${!!body.active}, updated_at=NOW() WHERE id=${id}`;
        }

        const rows = await sql`
          SELECT id, name, role, active, created_at, updated_at
          FROM dashboard_users WHERE id=${id}
        `;
        return json({ ok: true, data: rows[0] });
      }

      if (path.startsWith('/api/v1/admin/users/') && req.method === 'DELETE') {
        const admin = requireAdmin(req);
        if (!admin) return bad('Admin requerido', 403);

        const id = path.split('/').pop();
        await sql`UPDATE dashboard_users SET active=false, updated_at=NOW() WHERE id=${id}`;
        return json({ ok: true });
      }

      // --------------------------------------------------------
      // MARKETING OVERVIEW
      // --------------------------------------------------------
      if (path === '/api/v1/marketing/overview' && req.method === 'GET') {
        const { dateFrom, dateTo } = getDateRange(url);

        const rows = await sql`
          SELECT
            source,
            SUM(spend) AS spend,
            SUM(impressions) AS impressions,
            SUM(reach) AS reach,
            SUM(clicks) AS clicks,
            SUM(inline_link_clicks) AS inline_link_clicks,
            SUM(outbound_clicks) AS outbound_clicks,
            SUM(landing_page_views) AS landing_page_views,
            SUM(purchases) AS purchases,
            SUM(purchase_value) AS purchase_value,
            SUM(leads) AS leads,
            SUM(sent) AS sent,
            SUM(delivered) AS delivered,
            SUM(opens) AS opens,
            SUM(unique_opens) AS unique_opens,
            SUM(clicks_email) AS clicks_email,
            SUM(unique_clicks_email) AS unique_clicks_email,
            SUM(unsubscribes) AS unsubscribes,
            SUM(bounces_soft) AS bounces_soft,
            SUM(bounces_hard) AS bounces_hard,
            CASE WHEN SUM(spend) > 0 THEN SUM(purchase_value) / SUM(spend) ELSE 0 END AS roas,
            CASE WHEN SUM(spend) > 0 THEN (SUM(purchase_value) - SUM(spend)) / SUM(spend) ELSE 0 END AS roi,
            CASE WHEN SUM(purchases) > 0 THEN SUM(spend) / SUM(purchases) ELSE 0 END AS cpa,
            CASE WHEN SUM(leads) > 0 THEN SUM(spend) / SUM(leads) ELSE 0 END AS cpl,
            CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::NUMERIC / SUM(impressions) * 100 ELSE 0 END AS ctr,
            CASE WHEN SUM(landing_page_views) > 0 THEN SUM(purchases)::NUMERIC / SUM(landing_page_views) * 100 ELSE 0 END AS conversion_rate,
            CASE WHEN SUM(purchases) > 0 THEN SUM(purchase_value) / SUM(purchases) ELSE 0 END AS aov,
            CASE WHEN SUM(delivered) > 0 THEN SUM(unique_opens)::NUMERIC / SUM(delivered) * 100 ELSE 0 END AS open_rate,
            CASE WHEN SUM(delivered) > 0 THEN SUM(unique_clicks_email)::NUMERIC / SUM(delivered) * 100 ELSE 0 END AS email_click_rate,
            CASE WHEN SUM(unique_opens) > 0 THEN SUM(unique_clicks_email)::NUMERIC / SUM(unique_opens) * 100 ELSE 0 END AS ctor
          FROM marketing_metrics
          WHERE date >= ${dateFrom}::date AND date <= ${dateTo}::date
          GROUP BY source
        `;

        // Meta orgánico/posts queda intencionalmente fuera del dashboard: solo campañas pagas.
        return json({ ok: true, date_from: dateFrom, date_to: dateTo, data: rows, organic: [] });
      }

      // --------------------------------------------------------
      // META
      // --------------------------------------------------------
      if (path === '/api/v1/marketing/meta/campaigns' && req.method === 'GET') {
        const { dateFrom, dateTo } = getDateRange(url);
        const page = Math.max(parseInt(url.searchParams.get('page') || '1'), 1);
        const perPage = 20;
        const offset = (page - 1) * perPage;
        const countRows = await sql`
          WITH paid_campaigns AS (
            SELECT mc.id
            FROM marketing_campaigns mc
            LEFT JOIN marketing_metrics mm
              ON mm.campaign_id=mc.id
             AND mm.date >= ${dateFrom}::date
             AND mm.date <= ${dateTo}::date
            WHERE mc.source='meta'
              AND mc.name !~* '^(instagram post|publicaci[oó]n de instagram)'
              AND mc.name !~* 'post$'
            GROUP BY mc.id
            HAVING COALESCE(SUM(mm.spend),0) > 0
                OR COALESCE(SUM(mm.impressions),0) > 0
                OR COALESCE(SUM(mm.clicks),0) > 0
                OR COALESCE(SUM(mm.purchases),0) > 0
                OR COALESCE(SUM(mm.conversions),0) > 0
                OR COALESCE(SUM(mm.leads),0) > 0
          ) SELECT COUNT(*)::int AS total FROM paid_campaigns
        `;
        const rows = await sql`
          WITH paid_campaigns AS (
            SELECT
              mc.id, mc.external_id, mc.name, mc.status, mc.objective, mc.channel_id, mc.created_at, mc.synced_at,
              COALESCE(SUM(mm.spend),0) AS spend,
              COALESCE(SUM(mm.impressions),0) AS impressions,
              COALESCE(SUM(mm.clicks),0) AS clicks,
              COALESCE(SUM(mm.purchases),0) AS purchases,
              COALESCE(SUM(mm.purchase_value),0) AS purchase_value,
              COALESCE(SUM(mm.conversions),0) AS conversions,
              COALESCE(SUM(mm.conv_value),0) AS conv_value,
              COALESCE(SUM(mm.leads),0) AS leads
            FROM marketing_campaigns mc
            LEFT JOIN marketing_metrics mm
              ON mm.campaign_id=mc.id
             AND mm.date >= ${dateFrom}::date
             AND mm.date <= ${dateTo}::date
            WHERE mc.source='meta'
              AND mc.name !~* '^(instagram post|publicaci[oó]n de instagram)'
              AND mc.name !~* 'post$'
            GROUP BY mc.id
            HAVING COALESCE(SUM(mm.spend),0) > 0
                OR COALESCE(SUM(mm.impressions),0) > 0
                OR COALESCE(SUM(mm.clicks),0) > 0
                OR COALESCE(SUM(mm.purchases),0) > 0
                OR COALESCE(SUM(mm.conversions),0) > 0
                OR COALESCE(SUM(mm.leads),0) > 0
          )
          SELECT *,
            CASE WHEN impressions > 0 THEN clicks::NUMERIC/impressions*100 ELSE 0 END AS ctr,
            CASE WHEN impressions > 0 THEN spend::NUMERIC/impressions*1000 ELSE 0 END AS cpm,
            CASE WHEN clicks > 0 THEN spend::NUMERIC/clicks ELSE 0 END AS cpc,
            CASE WHEN COALESCE(purchases, conversions) > 0 THEN spend::NUMERIC/NULLIF(COALESCE(purchases, conversions),0) ELSE 0 END AS cpa,
            CASE WHEN spend > 0 THEN COALESCE(NULLIF(purchase_value,0), conv_value)/spend ELSE 0 END AS roas
          FROM paid_campaigns
          ORDER BY spend DESC, impressions DESC, synced_at DESC NULLS LAST
          LIMIT ${perPage} OFFSET ${offset}
        `;
        return json({ ok: true, page, per_page: perPage, total: countRows[0]?.total || 0, data: rows });
      }

      if (path === '/api/v1/marketing/meta/insights' && req.method === 'GET') {
        const { dateFrom, dateTo } = getDateRange(url);
        const level = url.searchParams.get('level') || 'campaign';

        const rows = await sql`
          SELECT *
          FROM meta_insights_daily
          WHERE date >= ${dateFrom}::date AND date <= ${dateTo}::date
          AND level=${level}
          ORDER BY date DESC, spend DESC
          LIMIT 1000
        `;
        return json({ ok: true, data: rows });
      }

      if (path === '/api/v1/marketing/meta/breakdowns' && req.method === 'GET') {
        const { dateFrom, dateTo } = getDateRange(url);
        const type = url.searchParams.get('type') || 'age';

        const rows = await sql`
          SELECT
            breakdown_type,
            breakdown_value,
            SUM(impressions) AS impressions,
            SUM(reach) AS reach,
            SUM(clicks) AS clicks,
            SUM(spend) AS spend,
            SUM(purchases) AS purchases,
            SUM(purchase_value) AS purchase_value,
            SUM(leads) AS leads,
            CASE WHEN SUM(spend) > 0 THEN SUM(purchase_value)/SUM(spend) ELSE 0 END AS roas
          FROM meta_insights_breakdowns
          WHERE date >= ${dateFrom}::date AND date <= ${dateTo}::date
          AND breakdown_type=${type}
          GROUP BY breakdown_type, breakdown_value
          ORDER BY spend DESC
        `;
        return json({ ok: true, data: rows });
      }

      if (path === '/api/v1/marketing/meta/adsets' && req.method === 'GET') {
        const rows = await sql`SELECT * FROM meta_adsets ORDER BY synced_at DESC LIMIT 1000`;
        return json({ ok: true, data: rows });
      }

      if (path === '/api/v1/marketing/meta/ads' && req.method === 'GET') {
        const rows = await sql`
          SELECT a.*, c.thumbnail_url, c.image_url, c.title, c.body
          FROM meta_ads a
          LEFT JOIN meta_ad_creatives c ON c.external_id=a.creative_external_id
          ORDER BY a.synced_at DESC
          LIMIT 1000
        `;
        return json({ ok: true, data: rows });
      }

      if (path === '/api/v1/marketing/meta/organic' && req.method === 'GET') {
        const { dateFrom, dateTo } = getDateRange(url);
        const rows = await sql`
          SELECT *
          FROM meta_organic_daily
          WHERE date >= ${dateFrom}::date AND date <= ${dateTo}::date
          ORDER BY date DESC
        `;
        return json({ ok: true, data: rows });
      }

      // --------------------------------------------------------
      // PERFIT
      // --------------------------------------------------------
      if (path === '/api/v1/marketing/perfit/campaigns' && req.method === 'GET') {
        const { dateFrom, dateTo } = getDateRange(url);
        const page = Math.max(parseInt(url.searchParams.get('page') || '1'), 1);
        const perPage = 20;
        const offset = (page - 1) * perPage;
        const countRows = await sql`
          SELECT COUNT(*)::int AS total
          FROM marketing_campaigns mc
          WHERE mc.source='perfit'
        `;
        const rows = await sql`
          SELECT
            mc.id, mc.external_id, mc.name, mc.status, mc.created_at, mc.synced_at,
            COALESCE(SUM(mm.sent),0) AS sent,
            COALESCE(SUM(mm.delivered),0) AS delivered,
            COALESCE(SUM(mm.unique_opens),0) AS unique_opens,
            COALESCE(SUM(mm.unique_clicks_email),0) AS unique_clicks,
            COALESCE(SUM(mm.unsubscribes),0) AS unsubscribes,
            COALESCE(SUM(mm.bounces_soft),0) AS bounces_soft,
            COALESCE(SUM(mm.bounces_hard),0) AS bounces_hard,
            CASE WHEN COALESCE(SUM(mm.delivered),0) > 0 THEN SUM(mm.unique_opens)::NUMERIC / SUM(mm.delivered) * 100 ELSE 0 END AS open_rate,
            CASE WHEN COALESCE(SUM(mm.delivered),0) > 0 THEN SUM(mm.unique_clicks_email)::NUMERIC / SUM(mm.delivered) * 100 ELSE 0 END AS click_rate,
            CASE WHEN COALESCE(SUM(mm.unique_opens),0) > 0 THEN SUM(mm.unique_clicks_email)::NUMERIC / SUM(mm.unique_opens) * 100 ELSE 0 END AS ctor
          FROM marketing_campaigns mc
          LEFT JOIN marketing_metrics mm ON mm.campaign_id=mc.id AND mm.date >= ${dateFrom}::date AND mm.date <= ${dateTo}::date
          WHERE mc.source='perfit'
          GROUP BY mc.id
          ORDER BY mc.created_at DESC NULLS LAST, mc.synced_at DESC NULLS LAST
          LIMIT ${perPage} OFFSET ${offset}
        `;
        return json({ ok: true, page, per_page: perPage, total: countRows[0]?.total || 0, data: rows });
      }

      if (path === '/api/v1/marketing/perfit/metrics' && req.method === 'GET') {
        const { dateFrom, dateTo } = getDateRange(url);
        const rows = await sql`
          SELECT
            mm.*,
            mc.name AS campaign_name,
            CASE WHEN delivered > 0 THEN unique_opens::NUMERIC/delivered*100 ELSE 0 END AS open_rate,
            CASE WHEN delivered > 0 THEN unique_clicks_email::NUMERIC/delivered*100 ELSE 0 END AS click_rate,
            CASE WHEN unique_opens > 0 THEN unique_clicks_email::NUMERIC/unique_opens*100 ELSE 0 END AS ctor,
            CASE WHEN sent > 0 THEN (bounces_soft + bounces_hard)::NUMERIC/sent*100 ELSE 0 END AS bounce_rate,
            CASE WHEN delivered > 0 THEN unsubscribes::NUMERIC/delivered*100 ELSE 0 END AS unsubscribe_rate
          FROM marketing_metrics mm
          JOIN marketing_campaigns mc ON mc.id=mm.campaign_id
          WHERE mm.source='perfit'
          AND mm.date >= ${dateFrom}::date AND mm.date <= ${dateTo}::date
          ORDER BY mm.date DESC
        `;
        return json({ ok: true, data: rows });
      }


      // --------------------------------------------------------
      // PRODUCTOS TOP (desde order_items reales)
      // --------------------------------------------------------
      if ((path === '/api/v1/products/top' || path === '/api/v1/products/top-by-channel') && req.method === 'GET') {
        const { dateFrom, dateTo } = getDateRange(url);
        const channel = url.searchParams.get('channel') || 'all';
        const limit   = parseInt(url.searchParams.get('limit') || '30');
        const byChannel = path.includes('top-by-channel');

        let rows;
        try {
          if (channel !== 'all') {
            rows = await sql`
              SELECT
                oi.product_name,
                o.source AS source,
                SUM(oi.quantity) AS quantity,
                SUM(oi.total_price) AS revenue,
                COUNT(DISTINCT o.id) AS order_count
              FROM order_items oi
              JOIN orders o ON o.id = oi.order_id
              WHERE o.created_at >= ${dateFrom}::date AND o.created_at < (${dateTo}::date + INTERVAL '1 day')
                AND NOT o.is_canceled
                AND o.source = ${channel}
              GROUP BY oi.product_name, o.source
              ORDER BY quantity DESC
              LIMIT ${limit}
            `;
          } else {
            rows = await sql`
              SELECT
                oi.product_name,
                o.source AS source,
                SUM(oi.quantity) AS quantity,
                SUM(oi.total_price) AS revenue,
                COUNT(DISTINCT o.id) AS order_count
              FROM order_items oi
              JOIN orders o ON o.id = oi.order_id
              WHERE o.created_at >= ${dateFrom}::date AND o.created_at < (${dateTo}::date + INTERVAL '1 day')
                AND NOT o.is_canceled
              GROUP BY oi.product_name, o.source
              ORDER BY quantity DESC
              LIMIT ${limit}
            `;
          }
        } catch(e) {
          return json({ ok: false, error: e.message, data: [] });
        }
        return json({ ok: true, data: rows || [] });
      }

      // --------------------------------------------------------
      // MÉTRICAS EJECUTIVAS (órdenes históricas + hoy)
      // --------------------------------------------------------
      if (path === '/api/v1/metrics/executive' && req.method === 'GET') {
        const { dateFrom, dateTo } = getDateRange(url);
        try {
          const rows = await sql`
            SELECT
              COALESCE(SUM(o.total_amount), 0) AS total_revenue,
              COALESCE(SUM(o.net_amount), 0) AS net_revenue,
              COUNT(*)::int AS orders_count,
              COALESCE(AVG(o.total_amount), 0) AS avg_ticket,
              COALESCE(SUM(oi.quantity), 0) AS units_sold,
              COUNT(*) FILTER (WHERE o.is_canceled)::int AS cancellations,
              COUNT(*) FILTER (WHERE o.is_returned)::int AS returns
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            WHERE o.created_at >= ${dateFrom}::date AND o.created_at < (${dateTo}::date + INTERVAL '1 day')
              AND NOT o.is_canceled
          `;
          return json(rows[0] || {});
        } catch(e) {
          return json({ error: e.message }, 500);
        }
      }

      if (path === '/api/v1/metrics/executive/compare' && req.method === 'GET') {
        const { dateFrom, dateTo } = getDateRange(url);
        try {
          const rows = await sql`
            WITH current AS (
              SELECT
                COALESCE(SUM(total_amount), 0) AS revenue,
                COUNT(*)::int AS orders,
                COALESCE(AVG(total_amount), 0) AS ticket
              FROM orders
              WHERE created_at >= ${dateFrom}::date AND created_at < (${dateTo}::date + INTERVAL '1 day')
                AND NOT is_canceled
            ),
            previous AS (
              SELECT
                COALESCE(SUM(total_amount), 0) AS revenue,
                COUNT(*)::int AS orders
              FROM orders
              WHERE created_at::DATE BETWEEN
                (${dateFrom}::date - (${dateTo}::date - ${dateFrom}::date + 1))
                AND (${dateFrom}::date - 1)
                AND NOT is_canceled
            )
            SELECT
              c.revenue AS today_revenue,
              c.orders AS today_orders,
              c.ticket AS today_ticket,
              p.revenue AS yesterday_revenue,
              p.orders AS yesterday_orders,
              CASE WHEN p.revenue > 0 THEN ROUND((c.revenue - p.revenue) / p.revenue * 100, 2) ELSE 0 END AS revenue_delta_pct,
              CASE WHEN p.orders > 0 THEN ROUND((c.orders - p.orders)::NUMERIC / p.orders * 100, 2) ELSE 0 END AS orders_delta_pct
            FROM current c, previous p
          `;
          return json(rows[0] || {});
        } catch(e) {
          return json({ error: e.message }, 500);
        }
      }

      if (path === '/api/v1/metrics/channels' && req.method === 'GET') {
        const { dateFrom, dateTo } = getDateRange(url);
        try {
          const rows = await sql`
            SELECT
              o.source,
              c.name AS channel_name,
              COALESCE(SUM(o.total_amount), 0) AS revenue,
              COUNT(*)::int AS orders_count,
              COALESCE(AVG(o.total_amount), 0) AS avg_ticket,
              COUNT(*) FILTER (WHERE o.is_canceled)::int AS cancellations
            FROM orders o
            LEFT JOIN channels c ON c.id = o.channel_id
            WHERE o.created_at >= ${dateFrom}::date AND o.created_at < (${dateTo}::date + INTERVAL '1 day')
              AND NOT o.is_canceled
            GROUP BY o.source, c.name
            ORDER BY revenue DESC
          `;
          return json({ ok: true, data: rows });
        } catch(e) {
          return json({ ok: false, error: e.message, data: [] });
        }
      }

      if (path === '/api/v1/orders/live' && req.method === 'GET') {
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
        try {
          const rows = await sql`
            SELECT
              o.external_id,
              o.source,
              o.total_amount,
              o.status,
              o.payment_status,
              o.customer_province,
              o.created_at,
              c.name AS channel_name,
              ARRAY_AGG(oi.product_name ORDER BY oi.total_price DESC NULLS LAST) AS products
            FROM orders o
            LEFT JOIN channels c ON c.id = o.channel_id
            LEFT JOIN order_items oi ON oi.order_id = o.id
            WHERE o.created_at >= NOW() - INTERVAL '7 days'
            GROUP BY o.id, c.name
            ORDER BY o.created_at DESC
            LIMIT ${limit}
          `;
          return json(rows);
        } catch(e) {
          return json([]);
        }
      }

      if (path === '/api/v1/sync/status' && req.method === 'GET') {
        try {
          const rows = await sql`
            SELECT DISTINCT ON (source)
              source, started_at, finished_at, records_processed,
              last_date_synced, status, error_message
            FROM sync_log
            ORDER BY source, started_at DESC
          `;
          return json(rows);
        } catch(e) {
          return json([]);
        }
      }

      // --------------------------------------------------------
      // GOOGLE ADS desde Google Sheets (GA4 export)
      // --------------------------------------------------------
      if (path === '/api/v1/marketing/google-ads' && req.method === 'GET') {
        const { dateFrom, dateTo } = getDateRange(url);
        try {
          const rows = await sql`
            SELECT
              mc.name AS campaign_name,
              mc.status,
              SUM(mm.clicks) AS clicks,
              SUM(mm.reach) AS sessions,
              SUM(mm.conversions) AS conversions,
              SUM(mm.conv_value) AS revenue,
              SUM(mm.spend) AS spend,
              CASE WHEN SUM(mm.spend) > 0 THEN SUM(mm.conv_value)/SUM(mm.spend) ELSE 0 END AS roas,
              CASE WHEN SUM(mm.clicks) > 0 THEN SUM(mm.conversions)/SUM(mm.clicks)*100 ELSE 0 END AS conv_rate
            FROM marketing_campaigns mc
            JOIN marketing_metrics mm ON mm.campaign_id = mc.id
            WHERE mc.source = 'google_ads'
              AND mm.date >= ${dateFrom}::date AND mm.date <= ${dateTo}::date
            GROUP BY mc.id, mc.name, mc.status
            ORDER BY revenue DESC
          `;
          return json({ ok: true, data: rows });
        } catch(e) {
          return json({ ok: false, error: e.message, data: [] });
        }
      }

      // --------------------------------------------------------
      // KOMMO CRM metrics
      // --------------------------------------------------------
      if (path === '/api/v1/marketing/kommo' && req.method === 'GET') {
        const { dateFrom, dateTo } = getDateRange(url);
        try {
          const summary = await sql`
            SELECT
              COUNT(*) FILTER (WHERE status = 'open')::int AS open_leads,
              COUNT(*) FILTER (WHERE status = 'won')::int AS won_leads,
              COUNT(*) FILTER (WHERE status = 'lost')::int AS lost_leads,
              COUNT(*)::int AS total_leads,
              COALESCE(SUM(estimated_value) FILTER (WHERE status = 'won'), 0) AS won_revenue,
              COALESCE(SUM(estimated_value), 0) AS pipeline_value
            FROM leads
            WHERE created_at >= ${dateFrom}::date AND created_at < (${dateTo}::date + INTERVAL '1 day')
          `;
          const byDay = await sql`
            SELECT
              created_at::DATE AS date,
              COUNT(*)::int AS new_leads,
              COUNT(*) FILTER (WHERE status = 'won')::int AS won_leads,
              COALESCE(SUM(estimated_value) FILTER (WHERE status = 'won'), 0) AS revenue
            FROM leads
            WHERE created_at >= ${dateFrom}::date AND created_at < (${dateTo}::date + INTERVAL '1 day')
            GROUP BY created_at::DATE
            ORDER BY date ASC
          `;
          return json({ ok: true, summary: summary[0], by_day: byDay });
        } catch(e) {
          return json({ ok: false, error: e.message });
        }
      }


      // --------------------------------------------------------
      // DASHBOARD V1 — Analytics unificado con filtros reales
      // --------------------------------------------------------
      if ((path === '/api/v1/dashboard/summary' || path === '/api/v1/dashboard/channels' || path === '/api/v1/dashboard/timeseries' || path === '/api/v1/dashboard/top-products' || path === '/api/v1/dashboard/filters' || path === '/api/v1/dashboard/tv') && req.method === 'GET') {
        const { dateFrom, dateTo } = getDateRange(url);
        const f = getDashboardFilters(url);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);

        if (path === '/api/v1/dashboard/summary') {
          const rows = await sql`
            WITH filtered_orders AS (
              SELECT DISTINCT o.*
              FROM orders o
              LEFT JOIN order_items oi ON oi.order_id = o.id
              WHERE o.created_at >= ${dateFrom}::date AND o.created_at < (${dateTo}::date + INTERVAL '1 day')
                AND (${f.channel} = 'all' OR o.source = ${f.channel} OR (${f.channel}='ml1' AND o.source IN ('meli_1','ml_1')) OR (${f.channel}='ml2' AND o.source IN ('meli_2','ml_2')))
                AND (${f.province} = '' OR o.customer_province ILIKE '%' || ${f.province} || '%')
                AND (${f.status} = '' OR o.status = ${f.status})
                AND (${f.paymentStatus} = '' OR o.payment_status = ${f.paymentStatus})
                AND (${f.brand} = '' OR oi.brand ILIKE '%' || ${f.brand} || '%')
                AND (${f.category} = '' OR oi.category ILIKE '%' || ${f.category} || '%')
                AND (${f.product} = '' OR oi.product_name ILIKE '%' || ${f.product} || '%')
                AND (${f.sku} = '' OR oi.sku ILIKE '%' || ${f.sku} || '%')
            ), item_units AS (
              SELECT COALESCE(SUM(oi.quantity),0)::int AS units_sold
              FROM order_items oi
              JOIN filtered_orders fo ON fo.id = oi.order_id
            )
            SELECT
              COALESCE(SUM(fo.total_amount), 0) AS total_revenue,
              COALESCE(SUM(fo.net_amount), 0) AS net_revenue,
              COUNT(*)::int AS orders_count,
              COALESCE(AVG(fo.total_amount), 0) AS avg_ticket,
              (SELECT units_sold FROM item_units) AS units_sold,
              COUNT(*) FILTER (WHERE fo.is_canceled)::int AS cancellations,
              COUNT(*) FILTER (WHERE fo.is_returned)::int AS returns,
              0 AS conversion_rate
            FROM filtered_orders fo
          `;
          return json({ ok: true, date_from: dateFrom, date_to: dateTo, data: rows[0] || {} });
        }

        if (path === '/api/v1/dashboard/channels') {
          const rows = await sql`
            WITH filtered_orders AS (
              SELECT o.id, o.source, o.channel_id, o.total_amount
              FROM orders o
              WHERE o.created_at >= ${dateFrom}::date AND o.created_at < (${dateTo}::date + INTERVAL '1 day')
                AND NOT o.is_canceled
                AND (${f.channel} = 'all' OR o.source = ${f.channel} OR (${f.channel}='ml1' AND o.source IN ('meli_1','ml_1')) OR (${f.channel}='ml2' AND o.source IN ('meli_2','ml_2')))
            ), item_units AS (
              SELECT fo.source, COALESCE(SUM(oi.quantity),0)::int AS units_sold
              FROM filtered_orders fo
              LEFT JOIN order_items oi ON oi.order_id = fo.id
              GROUP BY fo.source
            )
            SELECT
              fo.source,
              COALESCE(MAX(c.name), fo.source) AS channel_name,
              COALESCE(SUM(fo.total_amount),0) AS revenue,
              COUNT(*)::int AS orders_count,
              COALESCE(AVG(fo.total_amount),0) AS avg_ticket,
              COALESCE(MAX(iu.units_sold),0)::int AS units_sold
            FROM filtered_orders fo
            LEFT JOIN channels c ON c.id = fo.channel_id
            LEFT JOIN item_units iu ON iu.source = fo.source
            GROUP BY fo.source
            ORDER BY revenue DESC
          `;
          return json({ ok: true, data: rows });
        }

        if (path === '/api/v1/dashboard/timeseries') {
          const rows = await sql`
            SELECT
              o.created_at::DATE AS date,
              o.source,
              COALESCE(SUM(o.total_amount),0) AS revenue,
              COUNT(DISTINCT o.id)::int AS orders_count,
              COALESCE(SUM(oi.quantity),0)::int AS units_sold
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            WHERE o.created_at >= ${dateFrom}::date AND o.created_at < (${dateTo}::date + INTERVAL '1 day')
              AND NOT o.is_canceled
              AND (${f.channel} = 'all' OR o.source = ${f.channel} OR (${f.channel}='ml1' AND o.source IN ('meli_1','ml_1')) OR (${f.channel}='ml2' AND o.source IN ('meli_2','ml_2')))
            GROUP BY o.created_at::DATE, o.source
            ORDER BY date ASC, revenue DESC
          `;
          return json({ ok: true, data: rows });
        }

        if (path === '/api/v1/dashboard/top-products') {
          const rows = await sql`
            SELECT
              oi.product_name,
              oi.sku,
              oi.brand,
              oi.category,
              o.source,
              SUM(oi.quantity)::int AS quantity,
              SUM(oi.total_price) AS revenue,
              COUNT(DISTINCT o.id)::int AS order_count
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.created_at >= ${dateFrom}::date AND o.created_at < (${dateTo}::date + INTERVAL '1 day')
              AND NOT o.is_canceled
              AND (${f.channel} = 'all' OR o.source = ${f.channel} OR (${f.channel}='ml1' AND o.source IN ('meli_1','ml_1')) OR (${f.channel}='ml2' AND o.source IN ('meli_2','ml_2')))
              AND (${f.brand} = '' OR oi.brand ILIKE '%' || ${f.brand} || '%')
              AND (${f.category} = '' OR oi.category ILIKE '%' || ${f.category} || '%')
              AND (${f.product} = '' OR oi.product_name ILIKE '%' || ${f.product} || '%')
              AND (${f.sku} = '' OR oi.sku ILIKE '%' || ${f.sku} || '%')
            GROUP BY oi.product_name, oi.sku, oi.brand, oi.category, o.source
            ORDER BY quantity DESC, revenue DESC
            LIMIT ${limit}
          `;
          return json({ ok: true, data: rows });
        }

        if (path === '/api/v1/dashboard/filters') {
          const [channels, provinces, brands, categories, products, skus, campaigns] = await Promise.all([
            sql`SELECT DISTINCT source AS value, source AS label FROM orders ORDER BY source`,
            sql`SELECT DISTINCT customer_province AS value, customer_province AS label FROM orders WHERE customer_province IS NOT NULL AND customer_province <> '' ORDER BY customer_province LIMIT 200`,
            sql`SELECT DISTINCT brand AS value, brand AS label FROM order_items WHERE brand IS NOT NULL AND brand <> '' ORDER BY brand LIMIT 200`,
            sql`SELECT DISTINCT category AS value, category AS label FROM order_items WHERE category IS NOT NULL AND category <> '' ORDER BY category LIMIT 200`,
            sql`SELECT DISTINCT product_name AS value, product_name AS label FROM order_items WHERE product_name IS NOT NULL AND product_name <> '' ORDER BY product_name LIMIT 500`,
            sql`SELECT DISTINCT sku AS value, sku AS label FROM order_items WHERE sku IS NOT NULL AND sku <> '' ORDER BY sku LIMIT 500`,
            sql`SELECT DISTINCT name AS value, name AS label, source FROM marketing_campaigns WHERE name IS NOT NULL ORDER BY name LIMIT 500`,
          ]);
          return json({ ok: true, data: { channels, provinces, brands, categories, products, skus, campaigns } });
        }

        if (path === '/api/v1/dashboard/tv') {
          const [summary, channels, top, recent, sync, kommo, marketing] = await Promise.all([
            sql`SELECT COALESCE(SUM(total_amount),0) AS total_revenue, COUNT(*)::int AS orders_count, COALESCE(AVG(total_amount),0) AS avg_ticket, COALESCE(SUM(items_count),0)::int AS units_sold FROM orders WHERE created_at >= ${dateFrom}::date AND created_at < (${dateTo}::date + INTERVAL '1 day') AND NOT is_canceled`,
            sql`SELECT source, COALESCE(SUM(total_amount),0) AS revenue, COUNT(*)::int AS orders_count FROM orders WHERE created_at >= ${dateFrom}::date AND created_at < (${dateTo}::date + INTERVAL '1 day') AND NOT is_canceled GROUP BY source ORDER BY revenue DESC`,
            sql`SELECT oi.product_name, o.source, SUM(oi.quantity)::int AS quantity, SUM(oi.total_price) AS revenue FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.created_at >= ${dateFrom}::date AND o.created_at < (${dateTo}::date + INTERVAL '1 day') AND NOT o.is_canceled GROUP BY oi.product_name,o.source ORDER BY quantity DESC LIMIT 40`,
            sql`SELECT o.external_id,o.source,o.total_amount,o.status,o.payment_status,o.customer_province,o.created_at,COALESCE(c.name,o.source) AS channel_name, ARRAY_AGG(oi.product_name ORDER BY oi.total_price DESC NULLS LAST) AS products FROM orders o LEFT JOIN channels c ON c.id=o.channel_id LEFT JOIN order_items oi ON oi.order_id=o.id WHERE o.created_at >= ${dateFrom}::date AND o.created_at < (${dateTo}::date + INTERVAL '1 day') GROUP BY o.id,c.name ORDER BY o.created_at DESC LIMIT 10`,
            sql`SELECT DISTINCT ON (source) source, status, records_processed, last_date_synced, error_message, started_at, finished_at FROM sync_log ORDER BY source, started_at DESC`,
            sql`SELECT COUNT(*)::int AS total_leads, COUNT(*) FILTER (WHERE status='won')::int AS won_leads, COALESCE(SUM(estimated_value) FILTER (WHERE status='won'),0) AS won_revenue, COALESCE(SUM(estimated_value),0) AS pipeline_value FROM leads WHERE created_at >= ${dateFrom}::date AND created_at < (${dateTo}::date + INTERVAL '1 day')`,
            sql`SELECT source, COALESCE(SUM(spend),0) AS spend, COALESCE(SUM(conv_value),0) AS revenue, COALESCE(SUM(conversions),0) AS conversions, COALESCE(SUM(leads),0) AS leads FROM marketing_metrics WHERE date >= ${dateFrom}::date AND date <= ${dateTo}::date GROUP BY source`,
          ]);
          return json({ ok: true, date_from: dateFrom, date_to: dateTo, summary: summary[0], channels, top_products: top, recent_orders: recent, sync, kommo: kommo[0], marketing });
        }
      }

      if (path === '/api/v1/debug/data-health' && req.method === 'GET') {
        try {
          const [orders, orderItems, marketing, campaigns, leads, sync] = await Promise.all([
            sql`SELECT COUNT(*)::int AS count, MIN(created_at) AS min_date, MAX(created_at) AS max_date, COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int AS today_count FROM orders`,
            sql`SELECT COUNT(*)::int AS count FROM order_items`,
            sql`SELECT source, COUNT(*)::int AS rows, MIN(date) AS min_date, MAX(date) AS max_date, COALESCE(SUM(spend),0) AS spend, COALESCE(SUM(impressions),0) AS impressions, COALESCE(SUM(clicks),0) AS clicks FROM marketing_metrics GROUP BY source ORDER BY source`,
            sql`SELECT source, COUNT(*)::int AS count FROM marketing_campaigns GROUP BY source ORDER BY source`,
            sql`SELECT COUNT(*)::int AS count, MIN(created_at) AS min_date, MAX(created_at) AS max_date FROM leads`,
            sql`SELECT DISTINCT ON (source) source, status, records_processed, last_date_synced, error_message, started_at, finished_at FROM sync_log ORDER BY source, started_at DESC`,
          ]);
          return json({ ok:true, orders:orders[0], order_items:orderItems[0], marketing, campaigns, leads:leads[0], sync });
        } catch(e) {
          return json({ ok:false, error:e.message }, 500);
        }
      }

      return bad('Not found', 404);
    } catch (e) {
      return bad(e.message, 500);
    }
  },
};
