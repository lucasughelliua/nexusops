# sync-marketing.js completo

```js
import { Pool } from 'pg';

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function daysAgoISO(days) {
  return new Date(Date.now() - 86400000 * days)
    .toISOString()
    .split('T')[0];
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function int(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

async function fetchJson(url, options = {}, retries = 3) {
  let lastError;

  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      const text = await res.text();

      let data = {};

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!res.ok) {
        const msg =
          data?.error?.message ||
          data?.message ||
          text ||
          `HTTP ${res.status}`;

        if ((res.status === 429 || res.status >= 500) && i < retries) {
          await sleep(1000 * Math.pow(2, i));
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

async function startSyncLog(source) {
  try {
    const { rows } = await db.query(
      `
      INSERT INTO sync_log(source, status)
      VALUES($1, 'running')
      RETURNING id
    `,
      [source]
    );

    return rows[0].id;
  } catch {
    return null;
  }
}

async function endSyncLog(id, data) {
  if (!id) return;

  await db.query(
    `
    UPDATE sync_log
    SET
      status = $1,
      finished_at = NOW(),
      records_processed = $2,
      records_created = $3,
      records_updated = $4,
      last_date_synced = $5,
      error_message = $6
    WHERE id = $7
  `,
    [
      data.status,
      data.records || 0,
      data.created || 0,
      data.updated || 0,
      data.lastDate || null,
      data.error || null,
      id,
    ]
  );
}

async function getLastSync(source) {
  try {
    const { rows } = await db.query(
      `
      SELECT last_date_synced
      FROM sync_log
      WHERE source = $1
      AND status IN ('success', 'partial')
      ORDER BY started_at DESC
      LIMIT 1
    `,
      [source]
    );

    return rows[0]?.last_date_synced || null;
  } catch {
    return null;
  }
}

async function ensureChannel(name, type = 'other') {
  let { rows: [channel] } = await db.query(
    `
    SELECT id
    FROM channels
    WHERE name = $1
    AND type = $2
    LIMIT 1
  `,
    [name, type]
  );

  if (!channel) {
    const { rows: [created] } = await db.query(
      `
      INSERT INTO channels(name, type, active)
      VALUES($1, $2, true)
      RETURNING id
    `,
      [name, type]
    );

    channel = created;
  }

  return channel;
}

function metaUrl(path, params = {}) {
  const url = new URL(`https://graph.facebook.com/v19.0/${path}`);

  url.searchParams.set(
    'access_token',
    process.env.META_ACCESS_TOKEN
  );

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(
        k,
        typeof v === 'object'
          ? JSON.stringify(v)
          : String(v)
      );
    }
  }

  return url.toString();
}

async function fetchMetaPaged(path, params = {}) {
  let url = metaUrl(path, {
    limit: 100,
    ...params,
  });

  const all = [];

  while (url) {
    const data = await fetchJson(url);

    if (Array.isArray(data.data)) {
      all.push(...data.data);
    }

    url = data.paging?.next || null;

    if (url) {
      await sleep(200);
    }
  }

  return all;
}

function getAction(actions, names) {
  if (!Array.isArray(actions)) return 0;

  const arr = Array.isArray(names)
    ? names
    : [names];

  return arr.reduce((sum, name) => {
    const item = actions.find(
      (a) => a.action_type === name
    );

    return sum + num(item?.value);
  }, 0);
}

function parseMetaInsight(ins) {
  const actions = ins.actions || [];
  const actionValues = ins.action_values || [];

  const purchases = getAction(actions, [
    'purchase',
    'offsite_conversion.fb_pixel_purchase',
  ]);

  const purchaseValue = getAction(actionValues, [
    'purchase',
    'offsite_conversion.fb_pixel_purchase',
  ]);

  return {
    impressions: int(ins.impressions),
    reach: int(ins.reach),
    clicks: int(ins.clicks),
    spend: num(ins.spend),
    ctr: num(ins.ctr),
    cpc: num(ins.cpc),
    cpm: num(ins.cpm),
    leads: int(
      getAction(actions, [
        'lead',
        'offsite_conversion.fb_pixel_lead',
      ])
    ),
    purchases: int(purchases),
    purchase_value: num(purchaseValue),
  };
}

export async function syncMetaFull() {
  const source = 'meta';
  const logId = await startSyncLog(source);

  try {
    const adAccountId = process.env.META_AD_ACCOUNT_ID?.trim();

    if (!adAccountId) {
      throw new Error('Falta META_AD_ACCOUNT_ID');
    }

    const lastSync = await getLastSync(source);

    const dateFrom = lastSync
      ? new Date(new Date(lastSync) - 86400000)
          .toISOString()
          .split('T')[0]
      : daysAgoISO(30);

    const dateTo = todayISO();

    console.log(`[Meta] Sync desde ${dateFrom}`);

    const channel = await ensureChannel('Meta Ads');

    const campaigns = await fetchMetaPaged(
      `${adAccountId}/campaigns`,
      {
        fields: [
          'id',
          'name',
          'status',
          'objective',
          'daily_budget',
          'lifetime_budget',
          'created_time',
          'updated_time',
        ].join(','),
      }
    );

    console.log(`[Meta] Campañas: ${campaigns.length}`);

    for (const c of campaigns) {
      await db.query(
        `
        INSERT INTO marketing_campaigns (
          external_id,
          source,
          channel_id,
          name,
          status,
          objective,
          daily_budget,
          lifetime_budget,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          'meta',
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9
        )
        ON CONFLICT (external_id, source)
        DO UPDATE SET
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          objective = EXCLUDED.objective,
          daily_budget = EXCLUDED.daily_budget,
          lifetime_budget = EXCLUDED.lifetime_budget,
          updated_at = EXCLUDED.updated_at,
          synced_at = NOW()
      `,
        [
          c.id,
          channel.id,
          c.name,
          c.status,
          c.objective,
          c.daily_budget
            ? num(c.daily_budget) / 100
            : null,
          c.lifetime_budget
            ? num(c.lifetime_budget) / 100
            : null,
          c.created_time || null,
          c.updated_time || null,
        ]
      );
    }

    const insights = await fetchMetaPaged(
      `${adAccountId}/insights`,
      {
        level: 'campaign',
        time_increment: 1,
        time_range: {
          since: dateFrom,
          until: dateTo,
        },
        fields: [
          'date_start',
          'campaign_id',
          'campaign_name',
          'impressions',
          'reach',
          'clicks',
          'spend',
          'ctr',
          'cpc',
          'cpm',
          'actions',
          'action_values',
        ].join(','),
      }
    );

    console.log(`[Meta] Insights: ${insights.length}`);

    for (const ins of insights) {
      const p = parseMetaInsight(ins);

      const { rows: [camp] } = await db.query(
        `
        SELECT id
        FROM marketing_campaigns
        WHERE external_id = $1
        AND source = 'meta'
        LIMIT 1
      `,
        [ins.campaign_id]
      );

      if (!camp) continue;

      await db.query(
        `
        INSERT INTO marketing_metrics (
          campaign_id,
          source,
          date,
          impressions,
          reach,
          clicks,
          spend,
          ctr,
          cpc,
          cpm,
          leads,
          purchases,
          purchase_value
        )
        VALUES (
          $1,
          'meta',
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12
        )
        ON CONFLICT (campaign_id, date)
        DO UPDATE SET
          impressions = EXCLUDED.impressions,
          reach = EXCLUDED.reach,
          clicks = EXCLUDED.clicks,
          spend = EXCLUDED.spend,
          ctr = EXCLUDED.ctr,
          cpc = EXCLUDED.cpc,
          cpm = EXCLUDED.cpm,
          leads = EXCLUDED.leads,
          purchases = EXCLUDED.purchases,
          purchase_value = EXCLUDED.purchase_value,
          synced_at = NOW()
      `,
        [
          camp.id,
          ins.date_start,
          p.impressions,
          p.reach,
          p.clicks,
          p.spend,
          p.ctr,
          p.cpc,
          p.cpm,
          p.leads,
          p.purchases,
          p.purchase_value,
        ]
      );
    }

    await endSyncLog(logId, {
      status: 'success',
      records: campaigns.length + insights.length,
      created: insights.length,
      updated: 0,
      lastDate: dateTo,
    });

    console.log('[Meta] Sync completo');
  } catch (e) {
    await endSyncLog(logId, {
      status: 'error',
      error: e.message,
      lastDate: todayISO(),
    });

    throw e;
  }
}

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

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const baseUrl = `https://api.myperfit.com/v2/${account}`;

  console.log('[Perfit] API key cargada:', !!apiKey);
  console.log('[Perfit] Account:', account);
  console.log(`[Perfit] Sincronizando desde ${dateFrom}`);

  async function fetchPerfitCampaigns(page) {
    const offset = (page - 1) * 50;

    const endpoints = [
      `${baseUrl}/campaigns?offset=${offset}&limit=50`,
      `${baseUrl}/messages?offset=${offset}&limit=50`,
      `${baseUrl}/mailings?offset=${offset}&limit=50`,
      `${baseUrl}/broadcasts?offset=${offset}&limit=50`,
      `${baseUrl}/emails?offset=${offset}&limit=50`,
    ];

    let lastError = null;

    for (const url of endpoints) {
      try {
        console.log('[Perfit] Probando endpoint:', url);

        const data = await fetchJson(
          url,
          { method: 'GET', headers },
          2
        );

        return { data, url };
      } catch (e) {
        lastError = e;
        console.warn('[Perfit] Endpoint inválido:', url, e.message);
      }
    }

    throw lastError || new Error('No se encontró endpoint válido');
  }

  async function fetchPerfitStats(id) {
    const endpoints = [
      `${baseUrl}/campaigns/${id}/stats`,
      `${baseUrl}/campaigns/${id}/statistics`,
      `${baseUrl}/messages/${id}/stats`,
      `${baseUrl}/mailings/${id}/stats`,
      `${baseUrl}/broadcasts/${id}/stats`,
      `${baseUrl}/emails/${id}/stats`,
    ];

    for (const url of endpoints) {
      try {
        console.log('[Perfit] Stats endpoint:', url);

        const data = await fetchJson(
          url,
          { method: 'GET', headers },
          1
        );

        return data;
      } catch (e) {
        console.warn('[Perfit] Stats endpoint inválido:', url, e.message);
      }
    }

    return {};
  }

  let totalCampaigns = 0;
  let totalMetrics = 0;

  const channel = await ensureChannel('Perfit', 'other');

  let page = 1;

  while (true) {
    const { data, url } = await fetchPerfitCampaigns(page);

    console.log('[Perfit] Endpoint usado:', url);

    const mailings =
      data.data ||
      data.campaigns ||
      data.messages ||
      data.items ||
      data.results ||
      data ||
      [];

    if (!Array.isArray(mailings) || !mailings.length) {
      console.log('[Perfit] No hay más campañas');
      break;
    }

    for (const m of mailings) {
      const sentAt =
        m.sentAt ||
        m.sent_at ||
        m.createdAt ||
        m.created_at ||
        m.scheduleDate ||
        m.date;

      if (sentAt && new Date(sentAt) < new Date(dateFrom)) {
        continue;
      }

      await db.query(`
        INSERT INTO marketing_campaigns (
          external_id,
          source,
          channel_id,
          name,
          status,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          'perfit',
          $2,
          $3,
          $4,
          $5,
          $6
        )
        ON CONFLICT (external_id, source)
        DO UPDATE SET
          status = EXCLUDED.status,
          name = EXCLUDED.name,
          updated_at = EXCLUDED.updated_at,
          synced_at = NOW()
      `, [
        String(m.id),
        channel.id,
        m.name ||
        m.subject ||
        `Campaña ${m.id}`,
        m.status ||
        m.state ||
        'sent',
        sentAt || new Date().toISOString(),
        sentAt || new Date().toISOString(),
      ]);

      totalCampaigns++;

      const stats = await fetchPerfitStats(m.id);

      const { rows: [camp] } = await db.query(`
        SELECT id
        FROM marketing_campaigns
        WHERE external_id = $1
        AND source = 'perfit'
      `, [String(m.id)]);

      if (!camp) continue;

      const campaignDate = sentAt
        ? sentAt.split('T')[0]
        : todayISO();

      const sent = int(
        stats.sent ||
        stats.total ||
        stats.recipients ||
        stats.emailsSent
      );

      const delivered = int(
        stats.delivered ||
        stats.deliveries ||
        Math.max(
          0,
          sent - int(stats.hardBounces || stats.hard_bounces)
        )
      );

      const opens = int(
        stats.opens ||
        stats.opened ||
        stats.totalOpens
      );

      const uniqueOpens = int(
        stats.uniqueOpens ||
        stats.unique_opens ||
        stats.openedUnique
      );

      const clicks = int(
        stats.clicks ||
        stats.totalClicks
      );

      const uniqueClicks = int(
        stats.uniqueClicks ||
        stats.unique_clicks ||
        stats.clickedUnique
      );

      const unsubscribes = int(
        stats.unsubscribes ||
        stats.unsubscribed ||
        stats.removed
      );

      const softBounces = int(
        stats.softBounces ||
        stats.soft_bounces
      );

      const hardBounces = int(
        stats.hardBounces ||
        stats.hard_bounces
      );

      const spamReports = int(
        stats.spamComplaints ||
        stats.spam ||
        stats.spam_reports
      );

      const revenueAttr = num(
        stats.revenue ||
        stats.revenue_attr ||
        stats.salesAmount
      );

      await db.query(`
        INSERT INTO marketing_metrics (
          campaign_id,
          source,
          date,
          sent,
          delivered,
          opens,
          unique_opens,
          clicks_email,
          unique_clicks_email,
          unsubscribes,
          bounces_soft,
          bounces_hard,
          spam_reports,
          revenue_attr
        )
        VALUES (
          $1,
          'perfit',
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13
        )
        ON CONFLICT (campaign_id, date)
        DO UPDATE SET
          sent = EXCLUDED.sent,
          delivered = EXCLUDED.delivered,
          opens = EXCLUDED.opens,
          unique_opens = EXCLUDED.unique_opens,
          clicks_email = EXCLUDED.clicks_email,
          unique_clicks_email = EXCLUDED.unique_clicks_email,
          unsubscribes = EXCLUDED.unsubscribes,
          bounces_soft = EXCLUDED.bounces_soft,
          bounces_hard = EXCLUDED.bounces_hard,
          spam_reports = EXCLUDED.spam_reports,
          revenue_attr = EXCLUDED.revenue_attr,
          synced_at = NOW()
      `, [
        camp.id,
        campaignDate,
        sent,
        delivered,
        opens,
        uniqueOpens,
        clicks,
        uniqueClicks,
        unsubscribes,
        softBounces,
        hardBounces,
        spamReports,
        revenueAttr,
      ]);

      totalMetrics++;

      console.log(
        `[Perfit] Campaña procesada: ${m.name || m.subject || m.id}`
      );

      await sleep(150);
    }

    if (mailings.length < 50) {
      break;
    }

    page++;
  }

  await endSyncLog(logId, {
    status: 'success',
    records: totalCampaigns + totalMetrics,
    created: totalMetrics,
    updated: 0,
    lastDate: todayISO(),
  });

  console.log(
    `[Perfit] ✓ ${totalCampaigns} campañas, ${totalMetrics} métricas`
  );
}

const job = process.argv[2];

(async () => {
  try {
    if (job === 'meta' || job === 'meta_full') {
      await syncMetaFull();
    } else if (job === 'perfit') {
      await syncPerfit();
    } else {
      throw new Error(`Job inválido: ${job}`);
    }
  } catch (e) {
    console.error(`[${job}] ERROR:`, e.message);
    process.exit(1);
  } finally {
    await db.end();
  }
})();
```
