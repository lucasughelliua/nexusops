/**
 * NexusOps — sync-marketing.js
 * Jobs separados:
 *   node sync-marketing.js meta_full
 *   node sync-marketing.js perfit
 *   node sync-marketing.js google_ads
 *   node sync-marketing.js kommo
 *
 * No usa dotenv. En GitHub Actions toma todo desde Secrets.
 */

import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (d) => new Date(Date.now() - 86400000 * d).toISOString().slice(0, 10);
const isoFromUnix = (ts) => (ts ? new Date(Number(ts) * 1000).toISOString() : null);
const dateFromUnix = (ts) => (ts ? new Date(Number(ts) * 1000).toISOString().slice(0, 10) : todayISO());
const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const normalized = String(v).replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};
const int = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}`);
  return value;
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
        const msg = data?.error?.message || data?.message || data?.userMessage || text || `HTTP ${res.status}`;
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
      if (i < retries) {
        await sleep(1000 * Math.pow(2, i));
        continue;
      }
    }
  }
  throw lastError;
}

async function getLastSync(source) {
  const { rows } = await db.query(
    `SELECT last_date_synced FROM sync_log WHERE source=$1 AND status IN ('success','partial') ORDER BY started_at DESC LIMIT 1`,
    [source]
  );
  return rows[0]?.last_date_synced || null;
}

async function startSyncLog(source) {
  const { rows } = await db.query(
    `INSERT INTO sync_log(source,status) VALUES($1,'running') RETURNING id`,
    [source]
  );
  return rows[0].id;
}

async function endSyncLog(id, { status, records = 0, created = 0, updated = 0, lastDate = null, error = null }) {
  await db.query(`
    UPDATE sync_log SET
      status=$1,
      finished_at=NOW(),
      records_processed=$2,
      records_created=$3,
      records_updated=$4,
      last_date_synced=$5,
      error_message=$6,
      duration_ms=EXTRACT(EPOCH FROM (NOW()-started_at))*1000
    WHERE id=$7
  `, [status, records, created, updated, lastDate, error, id]);
}

async function getOrCreateChannel(name, type = 'other', externalId = null) {
  let { rows: [ch] } = await db.query(
    `SELECT id FROM channels WHERE name=$1 AND type=$2 LIMIT 1`,
    [name, type]
  );
  if (!ch) {
    const { rows: [created] } = await db.query(
      `INSERT INTO channels(name,type,external_id,active) VALUES($1,$2,$3,true) RETURNING id`,
      [name, type, externalId]
    );
    ch = created;
  }
  return ch.id;
}

async function upsertCampaign(data) {
  const { rows } = await db.query(`
    INSERT INTO marketing_campaigns
      (external_id,source,channel_id,name,status,objective,daily_budget,lifetime_budget,start_date,end_date,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (external_id,source) DO UPDATE SET
      channel_id=EXCLUDED.channel_id,
      name=EXCLUDED.name,
      status=EXCLUDED.status,
      objective=EXCLUDED.objective,
      daily_budget=EXCLUDED.daily_budget,
      lifetime_budget=EXCLUDED.lifetime_budget,
      start_date=EXCLUDED.start_date,
      end_date=EXCLUDED.end_date,
      updated_at=EXCLUDED.updated_at,
      synced_at=NOW()
    RETURNING id
  `, [
    data.external_id,
    data.source,
    data.channel_id,
    data.name || data.external_id,
    data.status || 'unknown',
    data.objective || null,
    data.daily_budget || null,
    data.lifetime_budget || null,
    data.start_date || null,
    data.end_date || null,
    data.created_at || new Date().toISOString(),
    data.updated_at || new Date().toISOString(),
  ]);
  return rows[0].id;
}

async function upsertMetrics(data) {
  await db.query(`
    INSERT INTO marketing_metrics
      (campaign_id,source,date,impressions,reach,clicks,spend,cpm,cpc,ctr,frequency,
       conversions,conv_value,leads,video_views,sent,delivered,opens,unique_opens,
       clicks_email,unique_clicks,unsubscribes,bounces_soft,bounces_hard,spam_reports,revenue_attr)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
    ON CONFLICT (campaign_id,date) DO UPDATE SET
      impressions=EXCLUDED.impressions,
      reach=EXCLUDED.reach,
      clicks=EXCLUDED.clicks,
      spend=EXCLUDED.spend,
      cpm=EXCLUDED.cpm,
      cpc=EXCLUDED.cpc,
      ctr=EXCLUDED.ctr,
      frequency=EXCLUDED.frequency,
      conversions=EXCLUDED.conversions,
      conv_value=EXCLUDED.conv_value,
      leads=EXCLUDED.leads,
      video_views=EXCLUDED.video_views,
      sent=EXCLUDED.sent,
      delivered=EXCLUDED.delivered,
      opens=EXCLUDED.opens,
      unique_opens=EXCLUDED.unique_opens,
      clicks_email=EXCLUDED.clicks_email,
      unique_clicks=EXCLUDED.unique_clicks,
      unsubscribes=EXCLUDED.unsubscribes,
      bounces_soft=EXCLUDED.bounces_soft,
      bounces_hard=EXCLUDED.bounces_hard,
      spam_reports=EXCLUDED.spam_reports,
      revenue_attr=EXCLUDED.revenue_attr,
      synced_at=NOW()
  `, [
    data.campaign_id,
    data.source,
    data.date,
    int(data.impressions),
    int(data.reach),
    int(data.clicks),
    num(data.spend),
    num(data.cpm),
    num(data.cpc),
    num(data.ctr),
    num(data.frequency),
    num(data.conversions),
    num(data.conv_value),
    int(data.leads),
    int(data.video_views),
    int(data.sent),
    int(data.delivered),
    int(data.opens),
    int(data.unique_opens),
    int(data.clicks_email),
    int(data.unique_clicks),
    int(data.unsubscribes),
    int(data.bounces_soft),
    int(data.bounces_hard),
    int(data.spam_reports),
    num(data.revenue_attr),
  ]);
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let insideQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && insideQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }
    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }
    if (char === ',' && !insideQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  result.push(current.trim());
  return result;
}

function normalizeGa4Date(value) {
  const raw = String(value || '').trim();
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return todayISO();
}

// ============================================================
// META
// ============================================================
export async function syncMetaAds(daysBack = 30) {
  const source = 'meta';
  const logId = await startSyncLog(source);
  try {
    const token = requireEnv('META_ACCESS_TOKEN');
    const adAccountId = requireEnv('META_AD_ACCOUNT_ID');
    const lastSync = await getLastSync(source);
    const dateFrom = lastSync ? new Date(new Date(lastSync) - 86400000).toISOString().slice(0, 10) : daysAgoISO(daysBack);
    const dateTo = todayISO();

    console.log(`[Meta] Sincronizando ${dateFrom} → ${dateTo}`);
    const channelId = await getOrCreateChannel('Meta Ads', 'other', adAccountId);
    let totalCampaigns = 0;
    let totalMetrics = 0;

    let after = null;
    while (true) {
      const params = new URLSearchParams({
        access_token: token,
        fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time',
        limit: '100',
      });
      if (after) params.set('after', after);
      const data = await fetchJson(`https://graph.facebook.com/v19.0/${adAccountId}/campaigns?${params}`);
      for (const camp of data.data || []) {
        await upsertCampaign({
          external_id: String(camp.id),
          source,
          channel_id: channelId,
          name: camp.name,
          status: camp.status,
          objective: camp.objective,
          daily_budget: camp.daily_budget ? Number(camp.daily_budget) / 100 : null,
          lifetime_budget: camp.lifetime_budget ? Number(camp.lifetime_budget) / 100 : null,
          start_date: camp.start_time?.slice(0, 10) || null,
          end_date: camp.stop_time?.slice(0, 10) || null,
          created_at: camp.created_time,
          updated_at: camp.updated_time,
        });
        totalCampaigns++;
      }
      after = data.paging?.cursors?.after;
      if (!data.paging?.next) break;
      await sleep(250);
    }

    const { rows: campaigns } = await db.query(`SELECT id, external_id FROM marketing_campaigns WHERE source='meta'`);
    for (const camp of campaigns) {
      try {
        const params = new URLSearchParams({
          access_token: token,
          level: 'campaign',
          time_increment: '1',
          time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
          fields: 'date_start,impressions,reach,clicks,spend,cpm,cpc,ctr,frequency,actions,action_values',
          limit: '90',
        });
        const data = await fetchJson(`https://graph.facebook.com/v19.0/${camp.external_id}/insights?${params}`);
        for (const ins of data.data || []) {
          const actions = ins.actions || [];
          const actionValues = ins.action_values || [];
          const getA = (t) => int(actions.find((a) => a.action_type === t)?.value);
          const getAV = (t) => num(actionValues.find((a) => a.action_type === t)?.value);
          const conversions = getA('purchase') + getA('offsite_conversion.fb_pixel_purchase');
          const convValue = getAV('purchase') + getAV('offsite_conversion.fb_pixel_purchase');
          const leads = getA('lead') + getA('offsite_conversion.fb_pixel_lead');
          await upsertMetrics({
            campaign_id: camp.id,
            source,
            date: ins.date_start,
            impressions: ins.impressions,
            reach: ins.reach,
            clicks: ins.clicks,
            spend: ins.spend,
            cpm: ins.cpm,
            cpc: ins.cpc,
            ctr: ins.ctr,
            frequency: ins.frequency,
            conversions,
            conv_value: convValue,
            revenue_attr: convValue,
            leads,
          });
          totalMetrics++;
        }
      } catch (e) {
        console.warn(`[Meta] campaña ${camp.external_id}: ${e.message}`);
      }
      await sleep(150);
    }

    await endSyncLog(logId, { status: 'success', records: totalCampaigns + totalMetrics, created: totalMetrics, lastDate: dateTo });
    console.log(`[Meta] OK: ${totalCampaigns} campañas, ${totalMetrics} métricas`);
  } catch (e) {
    await endSyncLog(logId, { status: 'error', error: e.message });
    throw e;
  }
}

// ============================================================
// PERFIT
// ============================================================
export async function syncPerfit() {
  const source = 'perfit';
  const logId = await startSyncLog(source);
  try {
    const apiKey = requireEnv('PERFIT_API_KEY');
    const account = requireEnv('PERFIT_ACCOUNT');
    const daysBack = int(process.env.PERFIT_DAYS_BACK || 30);
    const lastSync = await getLastSync(source);
    const dateFrom = lastSync ? new Date(new Date(lastSync) - 86400000).toISOString().slice(0, 10) : daysAgoISO(daysBack);
    const baseUrl = `https://api.myperfit.com/v2/${account}`;

    console.log(`[Perfit] Sincronizando desde ${dateFrom}`);
    const channelId = await getOrCreateChannel('Perfit', 'other', account);

    const authStrategies = [
      (url) => ({ url: `${url}${url.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(apiKey)}`, opts: {} }),
      (url) => ({ url, opts: { headers: { Authorization: `Bearer ${apiKey}` } } }),
      (url) => ({ url, opts: { headers: { 'X-Auth-Token': apiKey } } }),
      (url) => ({ url, opts: { headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}` } } }),
    ];
    const namespaces = ['campaigns', 'mailings', 'messages'];
    let workingAuth = null;
    let workingNamespace = null;

    outer: for (const auth of authStrategies) {
      for (const ns of namespaces) {
        try {
          const { url, opts } = auth(`${baseUrl}/${ns}?limit=1`);
          await fetchJson(url, { method: 'GET', ...opts }, 1);
          workingAuth = auth;
          workingNamespace = ns;
          console.log(`[Perfit] Auth OK con /${ns}`);
          break outer;
        } catch (_) {}
      }
    }

    if (!workingAuth || !workingNamespace) throw new Error('No se pudo autenticar con Perfit. Revisar PERFIT_API_KEY y PERFIT_ACCOUNT.');

    async function perfitGet(path) {
      const { url, opts } = workingAuth(`${baseUrl}${path}`);
      return fetchJson(url, { method: 'GET', ...opts });
    }

    let totalCampaigns = 0;
    let totalMetrics = 0;
    for (let page = 1; page <= 20; page++) {
      const offset = (page - 1) * 50;
      const data = await perfitGet(`/${workingNamespace}?limit=50&offset=${offset}`);
      const items = Array.isArray(data) ? data : (data?.data || data?.results || data?.items || []);
      if (!items.length) break;

      for (const item of items) {
        const sentAt = item.sentAt || item.sent_at || item.scheduledAt || item.createdAt || item.created_at;
        const sentDate = sentAt ? new Date(sentAt).toISOString().slice(0, 10) : todayISO();
        if (sentDate < dateFrom) continue;

        const campaignId = await upsertCampaign({
          external_id: String(item.id),
          source,
          channel_id: channelId,
          name: item.name || item.subject || item.title || `Perfit ${item.id}`,
          status: item.status || 'sent',
          created_at: sentAt || new Date().toISOString(),
          updated_at: sentAt || new Date().toISOString(),
        });
        totalCampaigns++;

        for (const sNs of ['stats', 'statistics', 'report']) {
          try {
            const stats = await perfitGet(`/${workingNamespace}/${item.id}/${sNs}`);
            const s = stats?.data || stats || {};
            await upsertMetrics({
              campaign_id: campaignId,
              source,
              date: sentDate,
              sent: s.sent || s.total || s.totalSent || 0,
              delivered: s.delivered || s.totalDelivered || 0,
              opens: s.opens || s.opened || s.totalOpens || 0,
              unique_opens: s.uniqueOpens || s.unique_opens || 0,
              clicks_email: s.clicks || s.totalClicks || 0,
              unique_clicks: s.uniqueClicks || s.unique_clicks || 0,
              unsubscribes: s.unsubscribes || s.unsubscribed || 0,
              bounces_soft: s.softBounces || s.soft_bounces || 0,
              bounces_hard: s.hardBounces || s.hard_bounces || 0,
              spam_reports: s.spam || s.spamComplaints || 0,
              revenue_attr: s.revenue || s.revenueAttr || 0,
              conv_value: s.revenue || s.revenueAttr || 0,
            });
            totalMetrics++;
            break;
          } catch (_) {}
        }
        await sleep(150);
      }

      console.log(`[Perfit] Página ${page}: ${items.length}`);
      if (items.length < 50) break;
      await sleep(300);
    }

    await endSyncLog(logId, { status: 'success', records: totalCampaigns + totalMetrics, created: totalMetrics, lastDate: todayISO() });
    console.log(`[Perfit] OK: ${totalCampaigns} campañas, ${totalMetrics} métricas`);
  } catch (e) {
    await endSyncLog(logId, { status: 'error', error: e.message });
    throw e;
  }
}

// ============================================================
// GOOGLE ADS vía GA4 CSV publicado
// ============================================================
export async function syncGoogleAdsFromGa4Csv() {
  const source = 'google_ads';
  const logId = await startSyncLog(source);
  try {
    const csvUrl = requireEnv('GA4_CSV_URL');
    console.log('[Google Ads/GA4] Descargando CSV...');

    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error(`CSV error HTTP ${res.status}`);

    const csv = await res.text();
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) {
      await endSyncLog(logId, { status: 'success', records: 0, lastDate: todayISO() });
      console.log('[Google Ads/GA4] CSV vacío');
      return;
    }

    const headers = parseCSVLine(lines.shift()).map((h) => h.toLowerCase().trim());
    console.log('[Google Ads/GA4] Headers:', headers.join(' | '));

    const idx = (names, fallback) => {
      for (const name of names) {
        const i = headers.indexOf(name.toLowerCase());
        if (i >= 0) return i;
      }
      return fallback;
    };

    const iDate = idx(['date', 'fecha'], 0);
    const iSource = idx(['source', 'session source', 'sessionSource'], 1);
    const iMedium = idx(['medium', 'session medium', 'sessionMedium'], 2);
    const iCampaign = idx(['campaign', 'session campaign', 'sessionCampaignName', 'campaign name'], 3);
    const iSessions = idx(['sessions', 'sesiones'], 4);
    const iUsers = idx(['users', 'totalUsers', 'usuarios'], 5);
    const iConversions = idx(['conversions', 'conversiones'], 6);
    const iRevenue = idx(['revenue', 'purchaseRevenue', 'ingresos'], 7);

    const channelId = await getOrCreateChannel('Google Ads', 'other', 'ga4_csv');
    let processed = 0;
    const skipped = { notGoogleAds: 0 };

    for (const line of lines) {
      const cols = parseCSVLine(line);
      const sourceValue = String(cols[iSource] || '').toLowerCase();
      const mediumValue = String(cols[iMedium] || '').toLowerCase();
      const isGoogleAds = sourceValue.includes('google') && ['cpc', 'paid', 'paid_search', 'ppc'].some((m) => mediumValue.includes(m));
      if (!isGoogleAds) {
        skipped.notGoogleAds++;
        continue;
      }

      const date = normalizeGa4Date(cols[iDate]);
      const campaignName = cols[iCampaign] || 'Google Ads sin campaña';
      const externalId = `ga4_google_ads_${campaignName}`.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 180);
      const sessions = int(cols[iSessions]);
      const users = int(cols[iUsers]);
      const conversions = num(cols[iConversions]);
      const revenue = num(cols[iRevenue]);

      const campaignId = await upsertCampaign({
        external_id: externalId,
        source,
        channel_id: channelId,
        name: campaignName,
        status: 'active',
        objective: 'ga4_attribution',
      });

      await upsertMetrics({
        campaign_id: campaignId,
        source,
        date,
        reach: users,
        clicks: sessions,
        conversions,
        conv_value: revenue,
        revenue_attr: revenue,
        leads: Math.round(conversions),
      });
      processed++;
    }

    await endSyncLog(logId, { status: 'success', records: processed, created: processed, lastDate: todayISO() });
    console.log(`[Google Ads/GA4] OK: ${processed} filas. Omitidas no Google Ads: ${skipped.notGoogleAds}`);
  } catch (e) {
    await endSyncLog(logId, { status: 'error', error: e.message });
    throw e;
  }
}

// ============================================================
// KOMMO
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
    const subdomain = requireEnv('KOMMO_SUBDOMAIN').replace(/^https?:\/\//, '').replace('.kommo.com', '').replace(/\/$/, '');
    const token = requireEnv('KOMMO_LONG_LIVED_TOKEN');
    const daysBack = int(process.env.KOMMO_DAYS_BACK || 30);
    const lastSync = await getLastSync(source);
    const fromDate = lastSync ? new Date(new Date(lastSync) - 86400000) : new Date(Date.now() - 86400000 * daysBack);
    const toDate = new Date();
    const fromTs = Math.floor(fromDate.getTime() / 1000);
    const toTs = Math.floor(toDate.getTime() / 1000);
    const base = `https://${subdomain}.kommo.com`;

    console.log(`[Kommo] Sincronizando updated_at ${fromDate.toISOString()} → ${toDate.toISOString()}`);

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
      const status = kommoLeadStatus(lead);
      const createdAt = isoFromUnix(lead.created_at) || new Date().toISOString();
      const updatedAt = isoFromUnix(lead.updated_at) || createdAt;
      const closedAt = isoFromUnix(lead.closed_at);
      const date = createdAt.slice(0, 10);
      const value = num(lead.price || 0);

      await db.query(`
        INSERT INTO leads
          (external_id,status,pipeline_id,pipeline_stage,name,estimated_value,assigned_to,campaign_source,tags,created_at,updated_at,converted_at,closed_at,synced_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
        ON CONFLICT (external_id) DO UPDATE SET
          status=EXCLUDED.status,
          pipeline_id=EXCLUDED.pipeline_id,
          pipeline_stage=EXCLUDED.pipeline_stage,
          name=EXCLUDED.name,
          estimated_value=EXCLUDED.estimated_value,
          assigned_to=EXCLUDED.assigned_to,
          campaign_source=EXCLUDED.campaign_source,
          tags=EXCLUDED.tags,
          updated_at=EXCLUDED.updated_at,
          converted_at=EXCLUDED.converted_at,
          closed_at=EXCLUDED.closed_at,
          synced_at=NOW()
      `, [
        String(lead.id),
        status,
        lead.pipeline_id || null,
        String(lead.status_id || ''),
        lead.name || `Lead ${lead.id}`,
        value,
        lead.responsible_user_id ? String(lead.responsible_user_id) : null,
        'kommo',
        (lead._embedded?.tags || []).map((t) => t.name).filter(Boolean),
        createdAt,
        updatedAt,
        status === 'won' ? (closedAt || updatedAt) : null,
        closedAt,
      ]);
      upserted++;

      const bucket = byDay.get(date) || { leads: 0, won: 0, revenue: 0, open: 0, lost: 0 };
      bucket.leads++;
      if (status === 'won') {
        bucket.won++;
        bucket.revenue += value;
      } else if (status === 'lost') {
        bucket.lost++;
      } else {
        bucket.open++;
      }
      byDay.set(date, bucket);
    }

    const channelId = await getOrCreateChannel('Kommo CRM', 'other', subdomain);
    const campaignId = await upsertCampaign({
      external_id: 'kommo_crm_leads',
      source,
      channel_id: channelId,
      name: 'Kommo CRM Leads',
      status: 'active',
      objective: 'crm',
    });

    for (const [date, b] of byDay.entries()) {
      await upsertMetrics({
        campaign_id: campaignId,
        source,
        date,
        leads: b.leads,
        conversions: b.won,
        conv_value: b.revenue,
        revenue_attr: b.revenue,
      });
    }

    await endSyncLog(logId, { status: 'success', records: upserted, created: upserted, lastDate: toDate.toISOString() });
    console.log(`[Kommo] OK: ${upserted} leads, ${byDay.size} días agregados`);
  } catch (e) {
    await endSyncLog(logId, { status: 'error', error: e.message });
    throw e;
  }
}

const job = process.argv[2];

(async () => {
  try {
    if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');

    if (job === 'meta' || job === 'meta_full') {
      await syncMetaAds(int(process.env.META_DAYS_BACK || 30));
    } else if (job === 'perfit') {
      await syncPerfit();
    } else if (job === 'google_ads' || job === 'ga4_google_ads') {
      await syncGoogleAdsFromGa4Csv();
    } else if (job === 'kommo') {
      await syncKommo();
    } else if (job === 'all') {
      await syncMetaAds(int(process.env.META_DAYS_BACK || 30));
      await syncPerfit();
      await syncGoogleAdsFromGa4Csv();
      await syncKommo();
    } else {
      throw new Error('Job desconocido. Usar: meta_full | perfit | google_ads | kommo | all');
    }
  } catch (e) {
    console.error(`[${job || 'sin_job'}] ERROR:`, e.message || e);
    process.exit(1);
  } finally {
    await db.end();
  }
})();
