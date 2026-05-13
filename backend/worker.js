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
  const dateFrom = url.searchParams.get('date_from') || new Date(Date.now() - 86400000 * 30).toISOString().split('T')[0];
  const dateTo = url.searchParams.get('date_to') || new Date().toISOString().split('T')[0];
  return { dateFrom, dateTo };
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
          WHERE date BETWEEN ${dateFrom} AND ${dateTo}
          GROUP BY source
        `;

        const organic = await sql`
          SELECT
            source,
            MAX(followers) AS followers,
            MAX(fans) AS fans,
            SUM(impressions) AS impressions,
            SUM(reach) AS reach,
            SUM(profile_views) AS profile_views,
            SUM(website_clicks) AS website_clicks,
            SUM(engagement) AS engagement,
            SUM(interactions) AS interactions,
            MAX(posts) AS posts
          FROM meta_organic_daily
          WHERE date BETWEEN ${dateFrom} AND ${dateTo}
          GROUP BY source
        `;

        return json({ ok: true, date_from: dateFrom, date_to: dateTo, data: rows, organic });
      }

      // --------------------------------------------------------
      // META
      // --------------------------------------------------------
      if (path === '/api/v1/marketing/meta/campaigns' && req.method === 'GET') {
        const rows = await sql`
          SELECT
            mc.*,
            COALESCE(SUM(mm.spend),0) AS spend,
            COALESCE(SUM(mm.impressions),0) AS impressions,
            COALESCE(SUM(mm.clicks),0) AS clicks,
            COALESCE(SUM(mm.purchases),0) AS purchases,
            COALESCE(SUM(mm.purchase_value),0) AS purchase_value,
            COALESCE(SUM(mm.leads),0) AS leads,
            CASE WHEN COALESCE(SUM(mm.spend),0) > 0 THEN SUM(mm.purchase_value)/SUM(mm.spend) ELSE 0 END AS roas
          FROM marketing_campaigns mc
          LEFT JOIN marketing_metrics mm ON mm.campaign_id=mc.id
          WHERE mc.source='meta'
          GROUP BY mc.id
          ORDER BY mc.synced_at DESC
        `;
        return json({ ok: true, data: rows });
      }

      if (path === '/api/v1/marketing/meta/insights' && req.method === 'GET') {
        const { dateFrom, dateTo } = getDateRange(url);
        const level = url.searchParams.get('level') || 'campaign';

        const rows = await sql`
          SELECT *
          FROM meta_insights_daily
          WHERE date BETWEEN ${dateFrom} AND ${dateTo}
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
          WHERE date BETWEEN ${dateFrom} AND ${dateTo}
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
          WHERE date BETWEEN ${dateFrom} AND ${dateTo}
          ORDER BY date DESC
        `;
        return json({ ok: true, data: rows });
      }

      // --------------------------------------------------------
      // PERFIT
      // --------------------------------------------------------
      if (path === '/api/v1/marketing/perfit/campaigns' && req.method === 'GET') {
        const rows = await sql`
          SELECT
            mc.*,
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
          LEFT JOIN marketing_metrics mm ON mm.campaign_id=mc.id
          WHERE mc.source='perfit'
          GROUP BY mc.id
          ORDER BY mc.created_at DESC
        `;
        return json({ ok: true, data: rows });
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
          AND mm.date BETWEEN ${dateFrom} AND ${dateTo}
          ORDER BY mm.date DESC
        `;
        return json({ ok: true, data: rows });
      }

      return bad('Not found', 404);
    } catch (e) {
      return bad(e.message, 500);
    }
  },
};
