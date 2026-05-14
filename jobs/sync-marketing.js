/**
 * NexusOps — sync-marketing.js
 * Sincronización de Meta Ads + Perfit + Google Ads
 * Correr con: node sync-marketing.js [meta|meta_full|perfit|google_ads|all]
 */

import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const todayISO = () => new Date().toISOString().split('T')[0];
const daysAgoISO = d => new Date(Date.now() - 86400000 * d).toISOString().split('T')[0];
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const int = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };

// ============================================================
// FETCH CON RETRY
// ============================================================
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
          await sleep(2000 * Math.pow(2, i)); continue;
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
    UPDATE sync_log SET
      status=$1, finished_at=NOW(), records_processed=$2,
      records_created=$3, records_updated=$4,
      last_date_synced=$5, error_message=$6,
      duration_ms=EXTRACT(EPOCH FROM (NOW()-started_at))*1000
    WHERE id=$7
  `, [status, records, created, updated, lastDate, error, id]);
}

// ============================================================
// HELPERS DB
// ============================================================
async function getOrCreateChannel(name, type) {
  let { rows: [ch] } = await db.query(`SELECT id FROM channels WHERE name=$1 AND type=$2`, [name, type]);
  if (!ch) {
    const { rows: [c] } = await db.query(`INSERT INTO channels(name,type,active) VALUES($1,$2,true) RETURNING id`, [name, type]);
    ch = c;
  }
  return ch.id;
}

async function upsertCampaign(data) {
  const { rows } = await db.query(`
    INSERT INTO marketing_campaigns
      (external_id,source,channel_id,name,status,objective,
       daily_budget,lifetime_budget,start_date,end_date,created_at,updated_at)
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
      (campaign_id,source,date,
       impressions,reach,clicks,spend,cpm,cpc,ctr,frequency,
       conversions,conv_value,leads,video_views,
       sent,delivered,opens,unique_opens,
       clicks_email,unique_clicks,unsubscribes,
       bounces_soft,bounces_hard,spam_reports,revenue_attr)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
    ON CONFLICT (campaign_id,date) DO UPDATE SET
      impressions=EXCLUDED.impressions, reach=EXCLUDED.reach,
      clicks=EXCLUDED.clicks, spend=EXCLUDED.spend,
      cpm=EXCLUDED.cpm, cpc=EXCLUDED.cpc, ctr=EXCLUDED.ctr,
      frequency=EXCLUDED.frequency, conversions=EXCLUDED.conversions,
      conv_value=EXCLUDED.conv_value, leads=EXCLUDED.leads,
      sent=EXCLUDED.sent, delivered=EXCLUDED.delivered,
      opens=EXCLUDED.opens, unique_opens=EXCLUDED.unique_opens,
      clicks_email=EXCLUDED.clicks_email, unique_clicks=EXCLUDED.unique_clicks,
      unsubscribes=EXCLUDED.unsubscribes, bounces_soft=EXCLUDED.bounces_soft,
      bounces_hard=EXCLUDED.bounces_hard, spam_reports=EXCLUDED.spam_reports,
      revenue_attr=EXCLUDED.revenue_attr, synced_at=NOW()
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
// JOB: META ADS
// ============================================================
export async function syncMetaAds(daysBack = 30) {
  const source = 'meta';
  const logId = await startSyncLog(source);
  const token = process.env.META_ACCESS_TOKEN?.trim();
  const adAccountId = process.env.META_AD_ACCOUNT_ID?.trim();

  if (!token) throw new Error('Falta META_ACCESS_TOKEN');
  if (!adAccountId) throw new Error('Falta META_AD_ACCOUNT_ID');

  const lastSync = await getLastSync(source);
  const dateFrom = lastSync
    ? new Date(new Date(lastSync) - 86400000).toISOString().split('T')[0]
    : daysAgoISO(daysBack);
  const dateTo = todayISO();

  console.log(`[Meta] Sincronizando ${dateFrom} → ${dateTo}`);
  const channelId = await getOrCreateChannel('Meta Ads', 'other');
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

  console.log(`[Meta] ${totalCampaigns} campañas`);

  // 2. Insights por campaña
  const { rows: campaigns } = await db.query(`SELECT id,external_id FROM marketing_campaigns WHERE source='meta'`);

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
      if (data.error) { console.warn(`[Meta] insights error ${camp.external_id}`); continue; }

      for (const ins of (data.data || [])) {
        const actions = ins.actions || [];
        const actionValues = ins.action_values || [];
        const getA = t => int(actions.find(a => a.action_type === t)?.value);
        const getAV = t => num(actionValues.find(a => a.action_type === t)?.value);
        const conversions = getA('purchase') + getA('offsite_conversion.fb_pixel_purchase');
        const convValue = getAV('purchase') + getAV('offsite_conversion.fb_pixel_purchase');
        const leads = getA('lead') + getA('offsite_conversion.fb_pixel_lead');

        await upsertMetrics({
          campaign_id: camp.id, source, date: ins.date_start,
          impressions: int(ins.impressions), reach: int(ins.reach),
          clicks: int(ins.clicks), spend: num(ins.spend),
          cpm: num(ins.cpm), cpc: num(ins.cpc),
          ctr: num(ins.ctr), frequency: num(ins.frequency),
          conversions, conv_value: convValue, leads,
        });
        totalMetrics++;
      }
    } catch (e) { console.warn(`[Meta] camp ${camp.external_id}:`, e.message); }
    await sleep(100);
  }

  await endSyncLog(logId, { status: 'success', records: totalCampaigns + totalMetrics, created: totalMetrics, lastDate: dateTo });
  console.log(`[Meta] ✓ ${totalCampaigns} campañas, ${totalMetrics} métricas`);
}

// ============================================================
// JOB: PERFIT
// Estrategia: probar múltiples métodos de auth y endpoints
// ============================================================
export async function syncPerfit() {
  const source = 'perfit';
  const logId = await startSyncLog(source);

  const apiKey = process.env.PERFIT_API_KEY?.trim();
  const account = process.env.PERFIT_ACCOUNT?.trim();

  if (!apiKey) throw new Error('Falta PERFIT_API_KEY');
  if (!account) throw new Error('Falta PERFIT_ACCOUNT');

  const lastSync = await getLastSync(source);
  const daysBack = parseInt(process.env.PERFIT_DAYS_BACK || '30', 10);
  const dateFrom = lastSync
    ? new Date(new Date(lastSync) - 86400000).toISOString().split('T')[0]
    : daysAgoISO(daysBack);

  const baseUrl = `https://api.myperfit.com/v2/${account}`;
  console.log(`[Perfit] Account: ${account}, desde: ${dateFrom}`);

  // Intentar con todas las estrategias de auth posibles
  const authStrategies = [
    // 1. API key como query param
    (url) => ({ url: `${url}${url.includes('?')?'&':'?'}api_key=${apiKey}`, opts: {} }),
    // 2. Basic auth con key como usuario
    (url) => ({ url, opts: { headers: { 'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}` } } }),
    // 3. Bearer token
    (url) => ({ url, opts: { headers: { 'Authorization': `Bearer ${apiKey}` } } }),
    // 4. X-Auth-Token header
    (url) => ({ url, opts: { headers: { 'X-Auth-Token': apiKey } } }),
  ];

  let workingAuth = null;
  let workingNamespace = null;

  // Probar combinaciones de auth + namespace
  const namespaces = ['campaigns', 'mailings', 'messages'];

  outer: for (const auth of authStrategies) {
    for (const ns of namespaces) {
      try {
        const { url, opts } = auth(`${baseUrl}/${ns}?limit=1`);
        console.log(`[Perfit] Probando auth → /${ns}`);
        const data = await fetchJson(url, { method: 'GET', ...opts }, 1);

        // Verificar que no sea un error de autenticación
        if (data?.error?.status === 401 || data?.success === false) continue;

        workingAuth = auth;
        workingNamespace = ns;
        console.log(`[Perfit] ✓ Auth funcionando con namespace: ${ns}`);
        break outer;
      } catch (e) {
        // Continuar probando
      }
    }
  }

  if (!workingAuth || !workingNamespace) {
    const errMsg = 'No se pudo autenticar con Perfit. Ir a Perfit → Ajustes → click en tu Usuario → "Obtener API key" y actualizar el secret PERFIT_API_KEY en GitHub.';
    await endSyncLog(logId, { status: 'error', records: 0, error: errMsg });
    console.error('[Perfit] ✗', errMsg);
    return;
  }

  async function perfitGet(path) {
    const { url, opts } = workingAuth(`${baseUrl}${path}`);
    return fetchJson(url, { method: 'GET', ...opts });
  }

  const channelId = await getOrCreateChannel('Perfit', 'other');
  let totalCampaigns = 0, totalMetrics = 0;

  // Paginar campañas
  let page = 1;
  while (true) {
    const offset = (page - 1) * 50;
    let data;
    try {
      data = await perfitGet(`/${workingNamespace}?limit=50&offset=${offset}`);
    } catch (e) {
      console.warn(`[Perfit] Error página ${page}:`, e.message);
      break;
    }

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

      // Obtener stats
      for (const sNs of ['stats', 'statistics', 'report']) {
        try {
          const stats = await perfitGet(`/${workingNamespace}/${item.id}/${sNs}`);
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

    console.log(`[Perfit] Página ${page}: ${items.length} items`);
    if (items.length < 50) break;
    page++;
    await sleep(300);
  }

  await endSyncLog(logId, { status: 'success', records: totalCampaigns + totalMetrics, created: totalMetrics, lastDate: todayISO() });
  console.log(`[Perfit] ✓ ${totalCampaigns} campañas, ${totalMetrics} métricas`);
}



// ============================================================
// JOB: GOOGLE ADS
// Usa REST searchStream. Versión por defecto v24; podés cambiarla con GOOGLE_ADS_API_VERSION.
// ============================================================
export async function syncGoogleAds() {
  const source = 'google_ads';
  const logId = await startSyncLog(source);

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim();
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  const customerId = String(process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '').trim();
  const loginCustomerId = String(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/-/g, '').trim();
  const apiVersion = process.env.GOOGLE_ADS_API_VERSION || 'v24';

  if (!clientId) throw new Error('Falta GOOGLE_ADS_CLIENT_ID');
  if (!clientSecret) throw new Error('Falta GOOGLE_ADS_CLIENT_SECRET');
  if (!refreshToken) throw new Error('Falta GOOGLE_ADS_REFRESH_TOKEN');
  if (!developerToken) throw new Error('Falta GOOGLE_ADS_DEVELOPER_TOKEN');
  if (!customerId) throw new Error('Falta GOOGLE_ADS_CUSTOMER_ID');

  const lastSync = await getLastSync(source);
  const daysBack = parseInt(process.env.GOOGLE_ADS_DAYS_BACK || '30', 10);
  const dateFrom = lastSync
    ? new Date(new Date(lastSync) - 86400000).toISOString().split('T')[0]
    : daysAgoISO(daysBack);
  const dateTo = todayISO();

  console.log(`[Google Ads] Sincronizando ${dateFrom} → ${dateTo} (${apiVersion})`);
  const channelId = await getOrCreateChannel('Google Ads', 'other');

  const tokenData = await fetchJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

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
      metrics.ctr,
      metrics.average_cpc,
      metrics.average_cpm
    FROM campaign
    WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
    ORDER BY segments.date ASC
  `;

  const headers = {
    Authorization: `Bearer ${tokenData.access_token}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json'
  };
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;

  const data = await fetchJson(
    `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:searchStream`,
    { method: 'POST', headers, body: JSON.stringify({ query }) },
    4
  );

  let totalCampaigns = 0;
  let totalMetrics = 0;
  const batches = Array.isArray(data) ? data : [];

  for (const batch of batches) {
    for (const row of (batch.results || [])) {
      const date = row.segments?.date;
      const campaign = row.campaign || {};
      const metrics = row.metrics || {};
      if (!date || !campaign.id) continue;

      const campaignDbId = await upsertCampaign({
        external_id: String(campaign.id),
        source,
        channel_id: channelId,
        name: campaign.name || `Google Campaign ${campaign.id}`,
        status: campaign.status || 'unknown',
        objective: campaign.advertisingChannelType || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      totalCampaigns++;

      const spend = num(metrics.costMicros) / 1000000;
      const clicks = int(metrics.clicks);
      const impressions = int(metrics.impressions);
      const conversions = num(metrics.conversions);
      const convValue = num(metrics.conversionsValue);

      await upsertMetrics({
        campaign_id: campaignDbId,
        source,
        date,
        impressions,
        reach: 0,
        clicks,
        spend,
        cpm: num(metrics.averageCpm) / 1000000,
        cpc: num(metrics.averageCpc) / 1000000,
        ctr: num(metrics.ctr),
        conversions,
        conv_value: convValue,
        leads: Math.round(conversions),
        revenue_attr: convValue
      });
      totalMetrics++;
    }
  }

  await endSyncLog(logId, {
    status: 'success',
    records: totalCampaigns + totalMetrics,
    created: totalMetrics,
    updated: 0,
    lastDate: dateTo
  });

  console.log(`[Google Ads] ✓ ${totalCampaigns} campañas/muestras, ${totalMetrics} métricas`);
}

// ENTRYPOINT
const job = process.argv[2];
(async () => {
  try {
    const daysBack = parseInt(process.env.META_DAYS_BACK || '30', 10);
    if (job === 'meta' || job === 'meta_full') await syncMetaAds(daysBack);
    else if (job === 'perfit') await syncPerfit();
    else if (job === 'google_ads') await syncGoogleAds();
    else if (job === 'all') { await syncMetaAds(daysBack); await syncPerfit(); await syncGoogleAds(); }
    else console.error('Job desconocido. Usar: meta | perfit | google_ads | all');
  } catch (e) {
    console.error(`[${job}] ERROR:`, e.message);
    process.exit(1);
  } finally {
    await db.end();
  }
})();
