/**
 * NexusOps — Jobs de sincronización Meta Ads + Perfit
 * Agregar al archivo jobs/sync.js existente
 * 
 * Secrets necesarios en GitHub Actions:
 * META_ACCESS_TOKEN       → Token de acceso de Meta Business
 * META_AD_ACCOUNT_ID      → ID de cuenta publicitaria (act_XXXXXXXXX)
 * PERFIT_API_KEY          → API key de Perfit
 * PERFIT_ACCOUNT          → Nombre de cuenta Perfit (subdominio)
 */

import { Pool } from 'pg';
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================================
// SCHEMA ADICIONAL — ejecutar en Neon
// ============================================================
/*
CREATE TABLE marketing_campaigns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id     VARCHAR(255) NOT NULL,
  source          VARCHAR(50) NOT NULL,       -- 'meta' | 'perfit'
  channel_id      UUID REFERENCES channels(id),
  name            VARCHAR(500) NOT NULL,
  status          VARCHAR(50),               -- 'ACTIVE'|'PAUSED'|'ARCHIVED'
  objective       VARCHAR(100),
  daily_budget    NUMERIC(14,2),
  lifetime_budget NUMERIC(14,2),
  start_date      DATE,
  end_date        DATE,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(external_id, source)
);

CREATE TABLE marketing_metrics (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id     UUID REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  source          VARCHAR(50) NOT NULL,
  date            DATE NOT NULL,
  -- Meta metrics
  impressions     INTEGER DEFAULT 0,
  reach           INTEGER DEFAULT 0,
  clicks          INTEGER DEFAULT 0,
  spend           NUMERIC(14,2) DEFAULT 0,
  cpm             NUMERIC(10,4) DEFAULT 0,
  cpc             NUMERIC(10,4) DEFAULT 0,
  ctr             NUMERIC(8,4) DEFAULT 0,
  frequency       NUMERIC(8,4) DEFAULT 0,
  conversions     INTEGER DEFAULT 0,
  conv_value      NUMERIC(14,2) DEFAULT 0,
  leads           INTEGER DEFAULT 0,
  video_views     INTEGER DEFAULT 0,
  -- Perfit metrics
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

CREATE INDEX idx_mkt_metrics_date ON marketing_metrics(date DESC);
CREATE INDEX idx_mkt_metrics_campaign ON marketing_metrics(campaign_id, date DESC);
CREATE INDEX idx_mkt_campaigns_source ON marketing_campaigns(source, status);

-- Vista de métricas agregadas por período
CREATE VIEW marketing_summary AS
SELECT
  mc.source,
  mc.name AS campaign_name,
  mc.status,
  mc.objective,
  SUM(mm.spend) AS total_spend,
  SUM(mm.impressions) AS total_impressions,
  SUM(mm.clicks) AS total_clicks,
  SUM(mm.conversions) AS total_conversions,
  SUM(mm.conv_value) AS total_revenue,
  SUM(mm.leads) AS total_leads,
  CASE WHEN SUM(mm.spend) > 0 THEN SUM(mm.conv_value)/SUM(mm.spend) ELSE 0 END AS roas,
  CASE WHEN SUM(mm.conversions) > 0 THEN SUM(mm.spend)/SUM(mm.conversions) ELSE 0 END AS cpa,
  CASE WHEN SUM(mm.impressions) > 0 THEN SUM(mm.clicks)::NUMERIC/SUM(mm.impressions)*100 ELSE 0 END AS ctr,
  -- Perfit
  SUM(mm.sent) AS total_sent,
  SUM(mm.opens) AS total_opens,
  SUM(mm.clicks_email) AS total_email_clicks,
  SUM(mm.revenue_attr) AS total_email_revenue
FROM marketing_campaigns mc
JOIN marketing_metrics mm ON mm.campaign_id = mc.id
GROUP BY mc.id, mc.source, mc.name, mc.status, mc.objective;
*/

// ============================================================
// HELPERS
// ============================================================
async function getLastSync(source) {
  const { rows } = await db.query(
    `SELECT last_date_synced FROM sync_log 
     WHERE source = $1 AND status IN ('success','partial')
     ORDER BY started_at DESC LIMIT 1`,
    [source]
  );
  return rows[0]?.last_date_synced || null;
}

async function startSyncLog(source) {
  const { rows } = await db.query(
    `INSERT INTO sync_log(source, status) VALUES($1,'running') RETURNING id`,
    [source]
  );
  return rows[0].id;
}

async function endSyncLog(id, data) {
  await db.query(`
    UPDATE sync_log SET
      status=$1, finished_at=NOW(), records_processed=$2,
      records_created=$3, records_updated=$4,
      last_date_synced=$5, error_message=$6,
      duration_ms=EXTRACT(EPOCH FROM (NOW()-started_at))*1000
    WHERE id=$7
  `, [data.status, data.records||0, data.created||0, data.updated||0, data.lastDate, data.error||null, id]);
}

// ============================================================
// JOB: SYNC META ADS
// Documentación: https://developers.facebook.com/docs/marketing-api
// ============================================================
export async function syncMetaAds() {
  const source = 'meta';
  const logId = await startSyncLog(source);

  const token = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID; // formato: act_XXXXXXXXX
  const lastSync = await getLastSync(source);

  // Por defecto: últimos 30 días. Si hay sync previo: desde ese día.
  const daysBack = parseInt(process.env.META_DAYS_BACK || '30');
  const dateFrom = lastSync
    ? new Date(lastSync).toISOString().split('T')[0]
    : new Date(Date.now() - 86400000 * daysBack).toISOString().split('T')[0];
  const dateTo = new Date().toISOString().split('T')[0];

  console.log(`[Meta] Sincronizando ${dateFrom} → ${dateTo}`);

  let totalCampaigns = 0, totalMetrics = 0;

  // Obtener canal Meta (crear si no existe)
  let { rows: [channel] } = await db.query(`SELECT id FROM channels WHERE type='other' AND name='Meta Ads'`);
  if (!channel) {
    const { rows: [c] } = await db.query(`INSERT INTO channels(name,type,active) VALUES('Meta Ads','other',true) RETURNING id`);
    channel = c;
  }

  // 1. Obtener todas las campañas
  let after = null;
  while (true) {
    const url = new URL(`https://graph.facebook.com/v19.0/${adAccountId}/campaigns`);
    url.searchParams.set('access_token', token);
    url.searchParams.set('fields', 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time');
    url.searchParams.set('limit', '100');
    if (after) url.searchParams.set('after', after);

    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.error) {
      throw new Error(`Meta API error: ${data.error.message}`);
    }

    for (const camp of (data.data || [])) {
      await db.query(`
        INSERT INTO marketing_campaigns (
          external_id, source, channel_id, name, status, objective,
          daily_budget, lifetime_budget, start_date, end_date, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (external_id, source) DO UPDATE SET
          status=EXCLUDED.status,
          name=EXCLUDED.name,
          daily_budget=EXCLUDED.daily_budget,
          updated_at=EXCLUDED.updated_at,
          synced_at=NOW()
      `, [
        camp.id, source, channel.id, camp.name, camp.status, camp.objective,
        camp.daily_budget ? camp.daily_budget / 100 : null,
        camp.lifetime_budget ? camp.lifetime_budget / 100 : null,
        camp.start_time ? camp.start_time.split('T')[0] : null,
        camp.stop_time ? camp.stop_time.split('T')[0] : null,
        camp.created_time, camp.updated_time,
      ]);
      totalCampaigns++;
    }

    after = data.paging?.cursors?.after;
    if (!data.paging?.next) break;
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`[Meta] ${totalCampaigns} campañas actualizadas`);

  // 2. Obtener insights (métricas) por campaña por día
  const { rows: campaigns } = await db.query(
    `SELECT id, external_id FROM marketing_campaigns WHERE source='meta'`
  );

  for (const camp of campaigns) {
    const url = new URL(`https://graph.facebook.com/v19.0/${camp.external_id}/insights`);
    url.searchParams.set('access_token', token);
    url.searchParams.set('level', 'campaign');
    url.searchParams.set('time_increment', '1'); // Un registro por día
    url.searchParams.set('time_range', JSON.stringify({ since: dateFrom, until: dateTo }));
    url.searchParams.set('fields', [
      'date_start','impressions','reach','clicks','spend',
      'cpm','cpc','ctr','frequency',
      'actions','action_values','video_30_sec_watched_actions',
      'cost_per_action_type',
    ].join(','));
    url.searchParams.set('limit', '90');

    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.error) {
      console.warn(`[Meta] Error insights campaña ${camp.external_id}:`, data.error.message);
      continue;
    }

    for (const ins of (data.data || [])) {
      // Extraer conversiones y revenue de actions
      const actions = ins.actions || [];
      const actionValues = ins.action_values || [];
      const getAction = (type) => actions.find(a => a.action_type === type)?.value || 0;
      const getActionVal = (type) => actionValues.find(a => a.action_type === type)?.value || 0;

      const conversions = parseInt(getAction('purchase')) + parseInt(getAction('offsite_conversion.fb_pixel_purchase'));
      const convValue = parseFloat(getActionVal('purchase')) + parseFloat(getActionVal('offsite_conversion.fb_pixel_purchase'));
      const leads = parseInt(getAction('lead')) + parseInt(getAction('offsite_conversion.fb_pixel_lead'));
      const videoViews = parseInt(getAction('video_30_sec_watched_actions') || 0);

      await db.query(`
        INSERT INTO marketing_metrics (
          campaign_id, source, date,
          impressions, reach, clicks, spend, cpm, cpc, ctr, frequency,
          conversions, conv_value, leads, video_views
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (campaign_id, date) DO UPDATE SET
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
          synced_at=NOW()
      `, [
        camp.id, source, ins.date_start,
        parseInt(ins.impressions) || 0,
        parseInt(ins.reach) || 0,
        parseInt(ins.clicks) || 0,
        parseFloat(ins.spend) || 0,
        parseFloat(ins.cpm) || 0,
        parseFloat(ins.cpc) || 0,
        parseFloat(ins.ctr) || 0,
        parseFloat(ins.frequency) || 0,
        conversions, convValue, leads, videoViews,
      ]);
      totalMetrics++;
    }

    await new Promise(r => setTimeout(r, 100));
  }

  await endSyncLog(logId, { status: 'success', records: totalCampaigns + totalMetrics, created: totalMetrics, updated: 0, lastDate: dateTo });
  console.log(`[Meta] ✓ ${totalCampaigns} campañas, ${totalMetrics} registros de métricas`);
}

// ============================================================
// JOB: SYNC PERFIT
// Documentación: https://api.perfit.com.ar/docs
// ============================================================
export async function syncPerfit() {
  const source = 'perfit';
  const logId = await startSyncLog(source);

  const apiKey = process.env.PERFIT_API_KEY;
  const account = process.env.PERFIT_ACCOUNT;
  const lastSync = await getLastSync(source);

  const daysBack = parseInt(process.env.PERFIT_DAYS_BACK || '30');
  const dateFrom = lastSync
    ? new Date(new Date(lastSync) - 86400000).toISOString().split('T')[0] // Retroceder 1 día para re-sync del último
    : new Date(Date.now() - 86400000 * daysBack).toISOString().split('T')[0];

  const headers = {
    'X-Auth-Token': apiKey,
    'Content-Type': 'application/json',
  };
  const baseUrl = `https://api.perfit.com.ar`;

  console.log(`[Perfit] Sincronizando desde ${dateFrom}`);

  let totalCampaigns = 0, totalMetrics = 0;

  // Obtener canal Perfit
  let { rows: [channel] } = await db.query(`SELECT id FROM channels WHERE type='other' AND name='Perfit'`);
  if (!channel) {
    const { rows: [c] } = await db.query(`INSERT INTO channels(name,type,active) VALUES('Perfit','other',true) RETURNING id`);
    channel = c;
  }

  // 1. Obtener campañas (mailings)
  let page = 1;
  while (true) {
    const res = await fetch(`${baseUrl}/mailings?page=${page}&limit=50`, { headers });
    if (!res.ok) throw new Error(`Perfit API error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const mailings = data.data || data.mailings || data || [];

    if (!Array.isArray(mailings) || !mailings.length) break;

    for (const m of mailings) {
      // Solo procesar campañas del período
      const sentAt = m.sentAt || m.sent_at || m.createdAt;
      if (sentAt && new Date(sentAt) < new Date(dateFrom)) continue;

      await db.query(`
        INSERT INTO marketing_campaigns (
          external_id, source, channel_id, name, status, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (external_id, source) DO UPDATE SET
          status=EXCLUDED.status,
          name=EXCLUDED.name,
          synced_at=NOW()
      `, [
        String(m.id), source, channel.id,
        m.name || m.subject || `Campaña ${m.id}`,
        m.status || 'sent',
        sentAt || new Date().toISOString(),
        sentAt || new Date().toISOString(),
      ]);
      totalCampaigns++;

      // 2. Obtener estadísticas de cada mailing
      const statsRes = await fetch(`${baseUrl}/mailings/${m.id}/stats`, { headers });
      if (!statsRes.ok) continue;
      const stats = await statsRes.json();

      // Obtener el campaign_id de nuestra DB
      const { rows: [camp] } = await db.query(
        `SELECT id FROM marketing_campaigns WHERE external_id=$1 AND source='perfit'`,
        [String(m.id)]
      );
      if (!camp) continue;

      const campaignDate = sentAt ? sentAt.split('T')[0] : new Date().toISOString().split('T')[0];

      await db.query(`
        INSERT INTO marketing_metrics (
          campaign_id, source, date,
          sent, delivered, opens, unique_opens,
          clicks_email, unique_clicks, unsubscribes,
          bounces_soft, bounces_hard, spam_reports
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (campaign_id, date) DO UPDATE SET
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
          synced_at=NOW()
      `, [
        camp.id, source, campaignDate,
        stats.sent || stats.total || 0,
        stats.delivered || 0,
        stats.opens || stats.opened || 0,
        stats.uniqueOpens || stats.unique_opens || 0,
        stats.clicks || 0,
        stats.uniqueClicks || stats.unique_clicks || 0,
        stats.unsubscribes || stats.unsubscribed || 0,
        stats.softBounces || stats.soft_bounces || 0,
        stats.hardBounces || stats.hard_bounces || 0,
        stats.spamComplaints || stats.spam || 0,
      ]);
      totalMetrics++;

      await new Promise(r => setTimeout(r, 150));
    }

    if (mailings.length < 50) break;
    page++;
  }

  await endSyncLog(logId, { status: 'success', records: totalCampaigns + totalMetrics, created: totalMetrics, updated: 0, lastDate: new Date().toISOString() });
  console.log(`[Perfit] ✓ ${totalCampaigns} campañas, ${totalMetrics} registros de métricas`);
}

// ============================================================
// ENDPOINTS API PARA MARKETING (agregar a worker.js)
// ============================================================
/*
Agregar estos endpoints en el worker.js existente:

// Métricas combinadas de marketing
GET /api/v1/marketing/overview?date_from=&date_to=

// Campañas Meta
GET /api/v1/marketing/meta/campaigns?status=&date_from=&date_to=

// Métricas Meta por campaña
GET /api/v1/marketing/meta/metrics?campaign_id=&date_from=&date_to=

// Resumen Meta
GET /api/v1/marketing/meta/summary?date_from=&date_to=

// Campañas Perfit
GET /api/v1/marketing/perfit/campaigns?date_from=&date_to=

// Métricas Perfit
GET /api/v1/marketing/perfit/metrics?campaign_id=&date_from=&date_to=

// Comparativa de canales
GET /api/v1/marketing/compare?date_from=&date_to=&compare_from=&compare_to=

Ejemplo de query para el endpoint /marketing/overview:

SELECT
  source,
  SUM(mm.spend) AS total_spend,
  SUM(mm.impressions) AS total_impressions,
  SUM(mm.clicks) AS total_clicks,
  SUM(mm.conversions) AS total_conversions,
  SUM(mm.conv_value) AS total_revenue,
  SUM(mm.leads) AS total_leads,
  SUM(mm.sent) AS total_sent,
  SUM(mm.opens) AS total_opens,
  SUM(mm.revenue_attr) AS email_revenue,
  CASE WHEN SUM(mm.spend) > 0 THEN SUM(mm.conv_value)/SUM(mm.spend) ELSE 0 END AS roas,
  CASE WHEN SUM(mm.impressions) > 0 THEN SUM(mm.clicks)::NUMERIC/SUM(mm.impressions)*100 ELSE 0 END AS ctr
FROM marketing_metrics mm
JOIN marketing_campaigns mc ON mc.id = mm.campaign_id
WHERE mm.date BETWEEN $1 AND $2
GROUP BY source;
*/

// ============================================================
// WORKFLOWS DE GITHUB ACTIONS — agregar a .github/workflows/
// ============================================================
/*
Crear archivo: .github/workflows/sync-marketing.yml

name: NexusOps Marketing Sync

on:
  schedule:
    - cron: '0 * /3 * * *'   # Cada 3 horas (Meta no necesita más frecuencia)
  workflow_dispatch:

jobs:
  sync-meta:
    name: Sync Meta Ads
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: jobs/package.json
      - run: cd jobs && npm install
      - run: cd jobs && node sync.js meta
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          META_ACCESS_TOKEN: ${{ secrets.META_ACCESS_TOKEN }}
          META_AD_ACCOUNT_ID: ${{ secrets.META_AD_ACCOUNT_ID }}

  sync-perfit:
    name: Sync Perfit
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: jobs/package.json
      - run: cd jobs && npm install
      - run: cd jobs && node sync.js perfit
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          PERFIT_API_KEY: ${{ secrets.PERFIT_API_KEY }}
          PERFIT_ACCOUNT: ${{ secrets.PERFIT_ACCOUNT }}
*/

// Entrypoint — agregar al switch de sync.js:
// else if (job === 'meta') await syncMetaAds();
// else if (job === 'perfit') await syncPerfit();

const job = process.argv[2];
(async () => {
  try {
    if (job === 'meta') await syncMetaAds();
    else if (job === 'perfit') await syncPerfit();
    else console.error('Job desconocido:', job);
  } catch (e) {
    console.error(`[${job}] ERROR:`, e.message);
    process.exit(1);
  } finally {
    await db.end();
  }
})();
