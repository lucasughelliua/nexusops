/**
 * NexusOps — sync-marketing.js
 * Jobs separados por canal:
 *   node sync-marketing.js meta_full    → Meta Ads (Facebook + Instagram)
 *   node sync-marketing.js perfit       → Perfit Email Marketing
 *   node sync-marketing.js google_ads   → Google Ads API (oficial)
 *   node sync-marketing.js kommo        → Kommo CRM leads
 */

import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (d) => new Date(Date.now() - 86400000 * d).toISOString().slice(0, 10);
const isoFromUnix = (ts) => (ts ? new Date(Number(ts) * 1000).toISOString() : null);
const num = (v) => { const n = Number(String(v || 0).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Falta variable de entorno: ${name}`);
  return v;
}

async function fetchJson(url, options = {}, retries = 3) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      if (!res.ok) {
        const msg = data?.error?.message || data?.message || data?.userMessage || `HTTP ${res.status}`;
        if ((res.status === 429 || res.status >= 500) && i < retries) {
          const wait = 2000 * Math.pow(2, i);
          console.warn(`[fetch] ${res.status}. Reintento en ${wait / 1000}s`);
          await sleep(wait);
          continue;
        }
        throw new Error(`${res.status} ${msg}`);
      }
      return data;
    } catch (e) {
      lastError = e;
      if (i < retries) { await sleep(1000 * Math.pow(2, i)); continue; }
    }
  }
  throw lastError;
}

// ============================================================
// SYNC LOG
// ============================================================
async function getLastSync(source) {
  const { rows } = await db.query(
    `SELECT last_date_synced FROM sync_log WHERE source=$1 AND status IN ('success','partial') ORDER BY started_at DESC LIMIT 1`,
    [source]
  );
  return rows[0]?.last_date_synced || null;
}

async function startSyncLog(source) {
  const { rows } = await db.query(
    `INSERT INTO sync_log(source,status) VALUES($1,'running') RETURNING id`, [source]
  );
  return rows[0].id;
}

async function endSyncLog(id, { status, records = 0, created = 0, updated = 0, lastDate = null, error = null }) {
  await db.query(`
    UPDATE sync_log SET status=$1, finished_at=NOW(), records_processed=$2,
      records_created=$3, records_updated=$4, last_date_synced=$5, error_message=$6,
      duration_ms=EXTRACT(EPOCH FROM (NOW()-started_at))*1000
    WHERE id=$7
  `, [status, records, created, updated, lastDate, error, id]);
}

// ============================================================
// DB HELPERS
// ============================================================
async function getOrCreateChannel(name, type, externalId = null) {
  let { rows: [ch] } = await db.query(`SELECT id FROM channels WHERE name=$1 AND type=$2`, [name, type]);
  if (!ch) {
    const { rows: [c] } = await db.query(
      `INSERT INTO channels(name,type,external_id,active) VALUES($1,$2,$3,true) RETURNING id`,
      [name, type, externalId]
    );
    ch = c;
  }
  return ch.id;
}

async function upsertCampaign(data) {
  const { rows } = await db.query(`
    INSERT INTO marketing_campaigns
      (external_id,source,channel_id,name,status,objective,daily_budget,lifetime_budget,start_date,end_date,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (external_id,source) DO UPDATE SET
      status=EXCLUDED.status, name=EXCLUDED.name,
      daily_budget=EXCLUDED.daily_budget, updated_at=EXCLUDED.updated_at, synced_at=NOW()
    RETURNING id
  `, [
    data.external_id, data.source, data.channel_id, data.name,
    data.status || 'unknown', data.objective || null,
    data.daily_budget || null, data.lifetime_budget || null,
    data.start_date || null, data.end_date || null,
    data.created_at || new Date().toISOString(),
    data.updated_at || new Date().toISOString(),
  ]);
  return rows[0].id;
}

async function upsertMetrics(data) {
  await db.query(`
    INSERT INTO marketing_metrics
      (campaign_id,source,date,impressions,reach,clicks,spend,cpm,cpc,ctr,frequency,
       conversions,conv_value,leads,video_views,
       sent,delivered,opens,unique_opens,clicks_email,unique_clicks,
       unsubscribes,bounces_soft,bounces_hard,spam_reports,revenue_attr)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
    ON CONFLICT (campaign_id,date) DO UPDATE SET
      impressions=EXCLUDED.impressions, reach=EXCLUDED.reach, clicks=EXCLUDED.clicks,
      spend=EXCLUDED.spend, cpm=EXCLUDED.cpm, cpc=EXCLUDED.cpc, ctr=EXCLUDED.ctr,
      frequency=EXCLUDED.frequency, conversions=EXCLUDED.conversions, conv_value=EXCLUDED.conv_value,
      leads=EXCLUDED.leads, sent=EXCLUDED.sent, delivered=EXCLUDED.delivered,
      opens=EXCLUDED.opens, unique_opens=EXCLUDED.unique_opens, clicks_email=EXCLUDED.clicks_email,
      unique_clicks=EXCLUDED.unique_clicks, unsubscribes=EXCLUDED.unsubscribes,
      bounces_soft=EXCLUDED.bounces_soft, bounces_hard=EXCLUDED.bounces_hard,
      spam_reports=EXCLUDED.spam_reports, revenue_attr=EXCLUDED.revenue_attr, synced_at=NOW()
  `, [
    data.campaign_id, data.source, data.date,
    data.impressions||0, data.reach||0, data.clicks||0,
    data.spend||0, data.cpm||0, data.cpc||0, data.ctr||0, data.frequency||0,
    data.conversions||0, data.conv_value||0, data.leads||0, data.video_views||0,
    data.sent||0, data.delivered||0, data.opens||0, data.unique_opens||0,
    data.clicks_email||0, data.unique_clicks||0, data.unsubscribes||0,
    data.bounces_soft||0, data.bounces_hard||0, data.spam_reports||0, data.revenue_attr||0,
  ]);
}

// ============================================================
// JOB 1: META ADS (Facebook + Instagram)
// ============================================================
export async function syncMetaAds(daysBack = 30) {
  const source = 'meta';
  const logId = await startSyncLog(source);
  try {
    const token = requireEnv('META_ACCESS_TOKEN');
    const adAccountId = requireEnv('META_AD_ACCOUNT_ID');
    const lastSync = await getLastSync(source);
    const dateFrom = lastSync
      ? new Date(new Date(lastSync) - 86400000).toISOString().split('T')[0]
      : daysAgoISO(daysBack);
    const dateTo = todayISO();

    console.log(`[Meta] Sincronizando ${dateFrom} → ${dateTo}`);
    const channelId = await getOrCreateChannel('Meta Ads', 'other', adAccountId);
    let totalCampaigns = 0, totalMetrics = 0;

    // 1. Campañas
    let after = null;
    while (true) {
      const params = new URLSearchParams({
        access_token: token,
        fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time',
        limit: '100',
      });
      if (after) params.set('after', after);

      const data = await fetchJson(`https://graph.facebook.com/v19.0/${adAccountId}/campaigns?${params}`);
      if (data.error) throw new Error(`Meta: ${data.error.message}`);

      for (const camp of (data.data || [])) {
        await upsertCampaign({
          external_id: camp.id, source, channel_id: channelId,
          name: camp.name, status: camp.status, objective: camp.objective,
          daily_budget: camp.daily_budget ? camp.daily_budget / 100 : null,
          lifetime_budget: camp.lifetime_budget ? camp.lifetime_budget / 100 : null,
          start_date: camp.start_time?.split('T')[0] || null,
          end_date: camp.stop_time?.split('T')[0] || null,
          created_at: camp.created_time, updated_at: camp.updated_time,
        });
        totalCampaigns++;
      }
      after = data.paging?.cursors?.after;
      if (!data.paging?.next) break;
      await sleep(200);
    }

    // 2. Insights por campaña
    const { rows: campaigns } = await db.query(
      `SELECT id, external_id FROM marketing_campaigns WHERE source='meta'`
    );

    for (const camp of campaigns) {
      try {
        const params = new URLSearchParams({
          access_token: token,
          level: 'campaign', time_increment: '1',
          time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
          fields: 'date_start,impressions,reach,clicks,spend,cpm,cpc,ctr,frequency,actions,action_values',
          limit: '90',
        });
        const data = await fetchJson(`https://graph.facebook.com/v19.0/${camp.external_id}/insights?${params}`);
        if (data.error) continue;

        for (const ins of (data.data || [])) {
          const actions = ins.actions || [];
          const actionValues = ins.action_values || [];
          const getA = (t) => int(actions.find((a) => a.action_type === t)?.value);
          const getAV = (t) => num(actionValues.find((a) => a.action_type === t)?.value);
          const purchases = getA('purchase') + getA('offsite_conversion.fb_pixel_purchase');
          const purchaseValue = getAV('purchase') + getAV('offsite_conversion.fb_pixel_purchase');
          const leads = getA('lead') + getA('offsite_conversion.fb_pixel_lead');

          await upsertMetrics({
            campaign_id: camp.id, source, date: ins.date_start,
            impressions: int(ins.impressions), reach: int(ins.reach),
            clicks: int(ins.clicks), spend: num(ins.spend),
            cpm: num(ins.cpm), cpc: num(ins.cpc), ctr: num(ins.ctr), frequency: num(ins.frequency),
            conversions: purchases, conv_value: purchaseValue, leads, revenue_attr: purchaseValue,
          });
          totalMetrics++;
        }
      } catch (e) { console.warn(`[Meta] camp ${camp.external_id}:`, e.message); }
      await sleep(100);
    }

    await endSyncLog(logId, { status: 'success', records: totalCampaigns + totalMetrics, created: totalMetrics, lastDate: dateTo });
    console.log(`[Meta] ✓ ${totalCampaigns} campañas, ${totalMetrics} métricas`);
  } catch (e) {
    await endSyncLog(logId, { status: 'error', error: e.message });
    throw e;
  }
}

// ============================================================
// JOB 2: PERFIT EMAIL MARKETING
// ============================================================
export async function syncPerfit() {
  const source = 'perfit';
  const logId = await startSyncLog(source);
  try {
    const apiKey = requireEnv('PERFIT_API_KEY');
    const account = requireEnv('PERFIT_ACCOUNT');
    const lastSync = await getLastSync(source);
    const daysBack = int(process.env.PERFIT_DAYS_BACK || 30);
    const dateFrom = lastSync
      ? new Date(new Date(lastSync) - 86400000).toISOString().split('T')[0]
      : daysAgoISO(daysBack);

    console.log(`[Perfit] Account: ${account}, desde: ${dateFrom}`);
    const baseUrl = `https://api.myperfit.com/v2/${account}`;
    const channelId = await getOrCreateChannel('Perfit', 'other', account);

    // Estrategia multi-auth: probar en orden hasta encontrar la que funciona
    const authStrategies = [
      (url) => ({ url: `${url}${url.includes('?') ? '&' : '?'}api_key=${apiKey}`, opts: {} }),
      (url) => ({ url, opts: { headers: { 'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}` } } }),
      (url) => ({ url, opts: { headers: { 'Authorization': `Bearer ${apiKey}` } } }),
      (url) => ({ url, opts: { headers: { 'X-Auth-Token': apiKey } } }),
    ];

    let workingAuth = null, workingNs = null;
    for (const auth of authStrategies) {
      for (const ns of ['campaigns', 'mailings', 'messages']) {
        try {
          const { url, opts } = auth(`${baseUrl}/${ns}?limit=1`);
          const data = await fetchJson(url, { method: 'GET', ...opts }, 1);
          if (data?.error?.status === 401 || data?.success === false) continue;
          workingAuth = auth; workingNs = ns;
          console.log(`[Perfit] Auth OK con namespace: ${ns}`);
          break;
        } catch (_) {}
      }
      if (workingAuth) break;
    }

    if (!workingAuth) {
      await endSyncLog(logId, { status: 'error', error: 'No se pudo autenticar con Perfit. Verificar API key.' });
      console.error('[Perfit] ✗ Autenticación fallida');
      return;
    }

    const perfitGet = async (path) => {
      const { url, opts } = workingAuth(`${baseUrl}${path}`);
      return fetchJson(url, { method: 'GET', ...opts });
    };

    let totalCampaigns = 0, totalMetrics = 0, page = 1;

    while (true) {
      const offset = (page - 1) * 50;
      let data;
      try { data = await perfitGet(`/${workingNs}?limit=50&offset=${offset}`); }
      catch (e) { console.warn(`[Perfit] Página ${page}:`, e.message); break; }

      const items = Array.isArray(data) ? data : (data?.data || data?.results || data?.items || []);
      if (!items.length) break;

      for (const item of items) {
        const sentAt = item.sentAt || item.sent_at || item.scheduledAt || item.createdAt || item.created_at;
        if (!sentAt) continue;
        const sentDate = new Date(sentAt).toISOString().split('T')[0];
        if (sentDate < dateFrom) continue;

        const campId = await upsertCampaign({
          external_id: String(item.id), source, channel_id: channelId,
          name: item.name || item.subject || item.title || `Campaña ${item.id}`,
          status: item.status || 'sent',
          created_at: sentAt, updated_at: sentAt,
        });
        totalCampaigns++;

        for (const sNs of ['stats', 'statistics', 'report']) {
          try {
            const stats = await perfitGet(`/${workingNs}/${item.id}/${sNs}`);
            const s = stats?.data || stats || {};
            await upsertMetrics({
              campaign_id: campId, source, date: sentDate,
              sent: int(s.sent || s.total || s.totalSent || 0),
              delivered: int(s.delivered || s.totalDelivered || 0),
              opens: int(s.opens || s.opened || s.totalOpens || 0),
              unique_opens: int(s.uniqueOpens || s.unique_opens || 0),
              clicks_email: int(s.clicks || s.totalClicks || 0),
              unique_clicks: int(s.uniqueClicks || s.unique_clicks || 0),
              unsubscribes: int(s.unsubscribes || s.unsubscribed || 0),
              bounces_soft: int(s.softBounces || s.soft_bounces || 0),
              bounces_hard: int(s.hardBounces || s.hard_bounces || 0),
              spam_reports: int(s.spam || s.spamComplaints || 0),
              revenue_attr: num(s.revenue || s.revenueAttr || 0),
            });
            totalMetrics++;
            break;
          } catch (_) {}
        }
        await sleep(200);
      }

      console.log(`[Perfit] Página ${page}: ${items.length} campañas`);
      if (items.length < 50) break;
      page++;
      await sleep(300);
    }

    await endSyncLog(logId, { status: 'success', records: totalCampaigns + totalMetrics, created: totalMetrics, lastDate: todayISO() });
    console.log(`[Perfit] ✓ ${totalCampaigns} campañas, ${totalMetrics} métricas`);
  } catch (e) {
    await endSyncLog(logId, { status: 'error', error: e.message });
    throw e;
  }
}

// ============================================================
// JOB 3: GOOGLE ADS (API oficial v18)
// ============================================================
export async function syncGoogleAds() {
  const source = 'google_ads';
  const logId = await startSyncLog(source);
  try {
    const clientId      = requireEnv('GOOGLE_ADS_CLIENT_ID');
    const clientSecret  = requireEnv('GOOGLE_ADS_CLIENT_SECRET');
    const refreshToken  = requireEnv('GOOGLE_ADS_REFRESH_TOKEN');
    const devToken      = requireEnv('GOOGLE_ADS_DEVELOPER_TOKEN');
    const customerId    = requireEnv('GOOGLE_ADS_CUSTOMER_ID').replace(/-/g, '');
    const loginCustId   = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '') || customerId;
    const daysBack      = int(process.env.GOOGLE_ADS_DAYS_BACK || 30);
    const apiVersion    = process.env.GOOGLE_ADS_API_VERSION || 'v18';

    const lastSync  = await getLastSync(source);
    const dateFrom  = lastSync
      ? new Date(new Date(lastSync) - 86400000).toISOString().split('T')[0]
      : daysAgoISO(daysBack);
    const dateTo    = todayISO();

    console.log(`[Google Ads] Sincronizando ${dateFrom} → ${dateTo} (customer: ${customerId})`);

    // Obtener access token via OAuth2
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(`OAuth2 error: ${JSON.stringify(tokenData)}`);
    const accessToken = tokenData.access_token;

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': devToken,
      'Content-Type': 'application/json',
    };
    if (loginCustId !== customerId) headers['login-customer-id'] = loginCustId;

    // Query GAQL: métricas por campaña por día
    const query = `
      SELECT
        segments.date,
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.conversions_value,
        metrics.all_conversions,
        metrics.view_through_conversions,
        metrics.average_cpc,
        metrics.average_cpm,
        metrics.ctr,
        metrics.search_impression_share,
        metrics.absolute_top_impression_percentage,
        metrics.top_impression_percentage
      FROM campaign
      WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
        AND campaign.status != 'REMOVED'
      ORDER BY segments.date DESC, metrics.cost_micros DESC
    `;

    const adsRes = await fetch(
      `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:searchStream`,
      { method: 'POST', headers, body: JSON.stringify({ query }) }
    );

    if (!adsRes.ok) {
      const errText = await adsRes.text();
      throw new Error(`Google Ads API ${adsRes.status}: ${errText.substring(0, 500)}`);
    }

    const channelId = await getOrCreateChannel('Google Ads', 'other', customerId);
    let totalMetrics = 0, campaignMap = new Map();

    const adsData = await adsRes.json();
    const batches = Array.isArray(adsData) ? adsData : [adsData];

    for (const batch of batches) {
      for (const item of (batch.results || [])) {
        const camp   = item.campaign || {};
        const seg    = item.segments || {};
        const met    = item.metrics  || {};

        // Upsert campaña
        let campDbId = campaignMap.get(camp.id);
        if (!campDbId) {
          campDbId = await upsertCampaign({
            external_id: String(camp.id || ''),
            source, channel_id: channelId,
            name: camp.name || `Campaign ${camp.id}`,
            status: (camp.status || 'UNKNOWN').toLowerCase(),
            objective: camp.advertisingChannelType || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          campaignMap.set(camp.id, campDbId);
        }

        const spend = num(met.costMicros || 0) / 1_000_000;
        const clicks = int(met.clicks || 0);
        const impressions = int(met.impressions || 0);
        const conversions = num(met.conversions || 0);
        const convValue = num(met.conversionsValue || 0);
        const avgCpc = num(met.averageCpc || 0) / 1_000_000;
        const avgCpm = num(met.averageCpm || 0) / 1_000_000;
        const ctr = num(met.ctr || 0) * 100; // Google devuelve 0.02 = 2%

        await upsertMetrics({
          campaign_id: campDbId, source, date: seg.date,
          impressions, clicks, spend,
          cpm: avgCpm, cpc: avgCpc, ctr,
          conversions, conv_value: convValue, leads: Math.round(conversions),
          revenue_attr: convValue,
        });
        totalMetrics++;
      }
    }

    await endSyncLog(logId, { status: 'success', records: totalMetrics, created: totalMetrics, lastDate: dateTo });
    console.log(`[Google Ads] ✓ ${campaignMap.size} campañas, ${totalMetrics} métricas`);
  } catch (e) {
    await endSyncLog(logId, { status: 'error', error: e.message });
    throw e;
  }
}

// ============================================================
// JOB 4: KOMMO CRM
// ============================================================
function kommoLeadStatus(lead) {
  const statusId = Number(lead.status_id || 0);
  if (statusId === 142) return 'won';
  if (statusId === 143) return 'lost';
  return 'open';
}

export async function syncKommo() {
  const source = 'kommo';
  const logId = await startSyncLog(source);
  try {
    const subdomain = requireEnv('KOMMO_SUBDOMAIN')
      .replace(/^https?:\/\//, '').replace('.kommo.com', '').replace(/\/$/, '');
    const token = requireEnv('KOMMO_LONG_LIVED_TOKEN');
    const daysBack = int(process.env.KOMMO_DAYS_BACK || 30);
    const lastSync = await getLastSync(source);
    const fromDate = lastSync
      ? new Date(new Date(lastSync) - 86400000)
      : new Date(Date.now() - 86400000 * daysBack);
    const toDate = new Date();
    const fromTs = Math.floor(fromDate.getTime() / 1000);
    const toTs   = Math.floor(toDate.getTime() / 1000);
    const base   = `https://${subdomain}.kommo.com`;

    console.log(`[Kommo] Sincronizando desde ${fromDate.toISOString().slice(0,10)}`);

    const leads = [];
    for (let page = 1; page <= 50; page++) {
      const url = `${base}/api/v4/leads?limit=250&page=${page}&filter[updated_at][from]=${fromTs}&filter[updated_at][to]=${toTs}`;
      const data = await fetchJson(url, { headers: { Authorization: `Bearer ${token}` } }, 3);
      const batch = data?._embedded?.leads || [];
      if (!batch.length) break;
      leads.push(...batch);
      console.log(`[Kommo] Página ${page}: ${batch.length} leads`);
      if (batch.length < 250) break;
      await sleep(300);
    }

    let upserted = 0;
    const byDay = new Map();

    for (const lead of leads) {
      const status    = kommoLeadStatus(lead);
      const createdAt = isoFromUnix(lead.created_at) || new Date().toISOString();
      const updatedAt = isoFromUnix(lead.updated_at) || createdAt;
      const closedAt  = isoFromUnix(lead.closed_at);
      const date      = createdAt.slice(0, 10);
      const value     = num(lead.price || 0);

      // Upsert en tabla leads
      await db.query(`
        INSERT INTO leads
          (external_id,status,pipeline_id,pipeline_stage,name,estimated_value,
           assigned_to,campaign_source,tags,created_at,updated_at,converted_at,closed_at,synced_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
        ON CONFLICT (external_id) DO UPDATE SET
          status=EXCLUDED.status, pipeline_id=EXCLUDED.pipeline_id,
          pipeline_stage=EXCLUDED.pipeline_stage, name=EXCLUDED.name,
          estimated_value=EXCLUDED.estimated_value, assigned_to=EXCLUDED.assigned_to,
          campaign_source=EXCLUDED.campaign_source, tags=EXCLUDED.tags,
          updated_at=EXCLUDED.updated_at, converted_at=EXCLUDED.converted_at,
          closed_at=EXCLUDED.closed_at, synced_at=NOW()
      `, [
        String(lead.id), status, lead.pipeline_id || null, String(lead.status_id || ''),
        lead.name || `Lead ${lead.id}`, value,
        lead.responsible_user_id ? String(lead.responsible_user_id) : null,
        'kommo',
        (lead._embedded?.tags || []).map((t) => t.name).filter(Boolean),
        createdAt, updatedAt,
        status === 'won' ? (closedAt || updatedAt) : null,
        closedAt,
      ]);
      upserted++;

      const bucket = byDay.get(date) || { leads: 0, won: 0, revenue: 0, open: 0, lost: 0 };
      bucket.leads++;
      if (status === 'won') { bucket.won++; bucket.revenue += value; }
      else if (status === 'lost') { bucket.lost++; }
      else { bucket.open++; }
      byDay.set(date, bucket);
    }

    // Guardar agregados diarios en marketing_metrics para el dashboard
    const channelId = await getOrCreateChannel('Kommo CRM', 'other', subdomain);
    const campaignId = await upsertCampaign({
      external_id: 'kommo_crm_leads', source, channel_id: channelId,
      name: 'Kommo CRM — Leads',
      status: 'active', objective: 'crm',
    });

    for (const [date, b] of byDay.entries()) {
      await upsertMetrics({
        campaign_id: campaignId, source, date,
        leads: b.leads, conversions: b.won,
        conv_value: b.revenue, revenue_attr: b.revenue,
      });
    }

    await endSyncLog(logId, { status: 'success', records: upserted, created: upserted, lastDate: toDate.toISOString() });
    console.log(`[Kommo] ✓ ${upserted} leads, ${byDay.size} días`);
  } catch (e) {
    await endSyncLog(logId, { status: 'error', error: e.message });
    throw e;
  }
}

// ============================================================
// ENTRYPOINT
// ============================================================
const job = process.argv[2];
(async () => {
  try {
    const daysBack = int(process.env.META_DAYS_BACK || 30);
    if      (job === 'meta_full')  await syncMetaAds(daysBack);
    else if (job === 'perfit')     await syncPerfit();
    else if (job === 'google_ads') await syncGoogleAds();
    else if (job === 'kommo')      await syncKommo();
    else if (job === 'all') {
      await syncMetaAds(daysBack);
      await syncPerfit();
      await syncGoogleAds();
      await syncKommo();
    }
    else console.error('Job desconocido. Usar: meta_full | perfit | google_ads | kommo | all');
  } catch (e) {
    console.error(`[${job}] ERROR FATAL:`, e.message);
    process.exit(1);
  } finally {
    await db.end();
  }
})();
