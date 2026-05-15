import pg from 'pg';

const { Pool } = pg;

const SOURCE = process.argv[2] || 'all';
const DAYS_BACK = Number(process.env.SYNC_DAYS_BACK || 45);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

main()
  .then(() => {
    console.log('[sync] Finalizado OK');
    process.exit(0);
  })
  .catch(error => {
    console.error('[sync] ERROR FATAL:', error.message);
    console.error(error);
    process.exit(1);
  });

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Falta DATABASE_URL');
  }

  const client = await pool.connect();

  try {
    await ensureMarketingTable(client);

    const sources = SOURCE === 'all'
      ? ['google_ads', 'perfit', 'kommo']
      : [SOURCE];

    const results = [];

    for (const source of sources) {
      if (source === 'google_ads') {
        results.push(await syncGoogleAdsFromSheet(client));
      } else if (source === 'perfit') {
        results.push(await syncPerfit(client));
      } else if (source === 'kommo') {
        results.push(await syncKommo(client));
      } else {
        throw new Error(`Fuente desconocida: ${source}`);
      }
    }

    console.log('[sync] Resultados:', JSON.stringify(results, null, 2));

  } finally {
    client.release();
    await pool.end();
  }
}

async function ensureMarketingTable(client) {
  await client.query(`
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
  `);

  await client.query(`
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
  `);
}

async function syncGoogleAdsFromSheet(client) {
  const url = process.env.GOOGLE_SHEETS_WEBAPP_URL;
  const token = process.env.GOOGLE_SHEETS_WEBAPP_TOKEN;

  if (!url) throw new Error('[google_ads] Falta GOOGLE_SHEETS_WEBAPP_URL');
  if (!token) throw new Error('[google_ads] Falta GOOGLE_SHEETS_WEBAPP_TOKEN');

  const endpoint = `${url}?token=${encodeURIComponent(token)}`;

  console.log('[google_ads] Leyendo Sheet desde Apps Script');

  const response = await fetch(endpoint);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`[google_ads] HTTP ${response.status}: ${text}`);
  }

  const payload = await response.json();

  if (!payload.ok) {
    throw new Error(`[google_ads] Error del Sheet: ${payload.error || 'Error desconocido'}`);
  }

  const rows = Array.isArray(payload.rows) ? payload.rows : [];

  if (!rows.length) {
    throw new Error('[google_ads] El Sheet no devolvió filas reales');
  }

  const grouped = new Map();

  for (const row of rows) {
    const rawDate = pick(row, ['date', 'fecha', 'day', 'dia']);
    if (!rawDate) continue;

    const date = normalizeDate(rawDate);
    const campaignId = pick(row, ['campaign_id', 'id_campana', 'id_campaign', 'campaignid']);
    const campaignName = pick(row, ['campaign_name', 'campaign', 'campana', 'campaña', 'nombre_campana']);

    const campaignKey = makeCampaignKey(campaignId, campaignName || 'Google Ads');
    const key = `${date}|google_ads|${campaignKey}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        date,
        source: 'google_ads',
        campaign_key: campaignKey,
        campaign_id: campaignId || null,
        campaign_name: campaignName || 'Google Ads',
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
        unsubscribes: 0,
        raw: []
      });
    }

    const item = grouped.get(key);

    item.spend += parseNumber(pick(row, ['spend', 'cost', 'costo', 'inversion', 'inversión']));
    item.impressions += parseInteger(pick(row, ['impressions', 'impresiones']));
    item.clicks += parseInteger(pick(row, ['clicks', 'clics']));
    item.conversions += parseNumber(pick(row, ['conversions', 'conversiones', 'compras']));
    item.revenue += parseNumber(pick(row, ['revenue', 'conversion_value', 'valor_conversion', 'ingresos', 'ventas', 'purchase_revenue']));
    item.leads += parseInteger(pick(row, ['leads', 'formularios', 'contactos']));
    item.raw.push(row);
  }

  let inserted = 0;

  for (const item of grouped.values()) {
    await upsertMarketing(client, item);
    inserted++;
  }

  if (inserted === 0) {
    throw new Error('[google_ads] No se insertó ninguna fila válida. Revisar columnas de fecha/campaña.');
  }

  console.log(`[google_ads] Filas insertadas/actualizadas: ${inserted}`);

  return {
    source: 'google_ads',
    rows: inserted
  };
}

async function syncPerfit(client) {
  const account = process.env.PERFIT_ACCOUNT;
  const apiKey = process.env.PERFIT_API_KEY;

  if (!account) throw new Error('[perfit] Falta PERFIT_ACCOUNT');
  if (!apiKey) throw new Error('[perfit] Falta PERFIT_API_KEY');

  const from = unixSecondsDaysAgo(DAYS_BACK);
  const to = unixSecondsNow();

  const baseUrl = `https://api.myperfit.com/v2/${encodeURIComponent(account)}`;
  const endpoint = `${baseUrl}/activity?limit=1000&from=${from}&to=${to}`;

  console.log('[perfit] Leyendo actividad');

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`[perfit] HTTP ${response.status}: ${text}`);
  }

  const payload = await response.json();

  const rows =
    payload.data ||
    payload.results ||
    payload.activity ||
    payload.items ||
    [];

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('[perfit] No se recibieron eventos reales. No se insertan ceros falsos.');
  }

  const grouped = new Map();

  for (const row of rows) {
    const eventDate = getPerfitEventDate(row);
    const date = dateToBuenosAires(eventDate);

    const campaignId =
      row.campaignId ||
      row.campaign_id ||
      row.mailingId ||
      row.mailing_id ||
      row.id ||
      null;

    const campaignName =
      row.campaignName ||
      row.campaign_name ||
      row.mailingName ||
      row.mailing_name ||
      row.subject ||
      'Perfit';

    const campaignKey = makeCampaignKey(campaignId, campaignName);
    const key = `${date}|perfit|${campaignKey}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        date,
        source: 'perfit',
        campaign_key: campaignKey,
        campaign_id: campaignId ? String(campaignId) : null,
        campaign_name: campaignName,
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
        unsubscribes: 0,
        raw: []
      });
    }

    const item = grouped.get(key);
    const type = String(row.type || row.event || row.eventType || row.activity || '').toLowerCase();

    if (type.includes('sent') || type.includes('send') || type.includes('envio') || type.includes('enviado')) {
      item.emails_sent += 1;
    }

    if (type.includes('delivered') || type.includes('entregado')) {
      item.emails_delivered += 1;
    }

    if (type.includes('open') || type.includes('apertura') || type.includes('opened')) {
      item.opens += 1;
    }

    if (type.includes('click')) {
      item.clicks += 1;
    }

    if (type.includes('bounce') || type.includes('rebote')) {
      item.bounces += 1;
    }

    if (type.includes('unsubscribe') || type.includes('baja') || type.includes('unsuscribe')) {
      item.unsubscribes += 1;
    }

    item.raw.push(row);
  }

  let inserted = 0;

  for (const item of grouped.values()) {
    await upsertMarketing(client, item);
    inserted++;
  }

  if (inserted === 0) {
    throw new Error('[perfit] No se insertó ninguna fila válida.');
  }

  console.log(`[perfit] Filas insertadas/actualizadas: ${inserted}`);

  return {
    source: 'perfit',
    rows: inserted
  };
}

async function syncKommo(client) {
  const subdomain = normalizeKommoSubdomain(process.env.KOMMO_SUBDOMAIN);
  const accessToken = process.env.KOMMO_ACCESS_TOKEN;

  if (!subdomain) throw new Error('[kommo] Falta KOMMO_SUBDOMAIN');
  if (!accessToken) throw new Error('[kommo] Falta KOMMO_ACCESS_TOKEN');

  const from = unixSecondsDaysAgo(DAYS_BACK);
  const to = unixSecondsNow();

  let page = 1;
  let totalRows = 0;
  const grouped = new Map();

  while (true) {
    const endpoint =
      `https://${subdomain}.kommo.com/api/v4/leads` +
      `?limit=250&page=${page}` +
      `&filter[created_at][from]=${from}` +
      `&filter[created_at][to]=${to}`;

    console.log(`[kommo] Leyendo leads página ${page}`);

    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`[kommo] HTTP ${response.status}: ${text}`);
    }

    const payload = await response.json();

    const leads =
      payload._embedded && Array.isArray(payload._embedded.leads)
        ? payload._embedded.leads
        : [];

    if (!leads.length) break;

    for (const lead of leads) {
      totalRows++;

      const createdAt = lead.created_at
        ? new Date(Number(lead.created_at) * 1000)
        : new Date();

      const date = dateToBuenosAires(createdAt);

      const pipelineId = lead.pipeline_id ? String(lead.pipeline_id) : 'sin_pipeline';
      const statusId = lead.status_id ? String(lead.status_id) : 'sin_status';
      const campaignKey = `pipeline_${pipelineId}_status_${statusId}`;
      const key = `${date}|kommo|${campaignKey}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          date,
          source: 'kommo',
          campaign_key: campaignKey,
          campaign_id: campaignKey,
          campaign_name: `Kommo pipeline ${pipelineId} status ${statusId}`,
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
          unsubscribes: 0,
          raw: []
        });
      }

      const item = grouped.get(key);
      item.leads += 1;
      item.revenue += Number(lead.price || 0);
      item.raw.push(lead);
    }

    if (!payload._links || !payload._links.next || !payload._links.next.href) {
      break;
    }

    page++;
  }

  if (totalRows === 0) {
    throw new Error('[kommo] No se recibieron leads reales. No se insertan ceros falsos.');
  }

  let inserted = 0;

  for (const item of grouped.values()) {
    await upsertMarketing(client, item);
    inserted++;
  }

  console.log(`[kommo] Leads leídos: ${totalRows}`);
  console.log(`[kommo] Filas insertadas/actualizadas: ${inserted}`);

  return {
    source: 'kommo',
    rows: inserted,
    leads: totalRows
  };
}

async function upsertMarketing(client, item) {
  await client.query(
    `
    INSERT INTO marketing_daily (
      date,
      source,
      campaign_key,
      campaign_id,
      campaign_name,
      spend,
      impressions,
      clicks,
      conversions,
      revenue,
      leads,
      emails_sent,
      emails_delivered,
      opens,
      bounces,
      unsubscribes,
      raw,
      updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16,
      $17::jsonb,
      NOW()
    )
    ON CONFLICT (date, source, campaign_key)
    DO UPDATE SET
      campaign_id = EXCLUDED.campaign_id,
      campaign_name = EXCLUDED.campaign_name,
      spend = EXCLUDED.spend,
      impressions = EXCLUDED.impressions,
      clicks = EXCLUDED.clicks,
      conversions = EXCLUDED.conversions,
      revenue = EXCLUDED.revenue,
      leads = EXCLUDED.leads,
      emails_sent = EXCLUDED.emails_sent,
      emails_delivered = EXCLUDED.emails_delivered,
      opens = EXCLUDED.opens,
      bounces = EXCLUDED.bounces,
      unsubscribes = EXCLUDED.unsubscribes,
      raw = EXCLUDED.raw,
      updated_at = NOW()
    `,
    [
      item.date,
      item.source,
      item.campaign_key || 'default',
      item.campaign_id || null,
      item.campaign_name || item.source,

      safeNumber(item.spend),
      safeInteger(item.impressions),
      safeInteger(item.clicks),
      safeNumber(item.conversions),
      safeNumber(item.revenue),
      safeInteger(item.leads),

      safeInteger(item.emails_sent),
      safeInteger(item.emails_delivered),
      safeInteger(item.opens),
      safeInteger(item.bounces),
      safeInteger(item.unsubscribes),

      JSON.stringify(item.raw || [])
    ]
  );
}

function pick(obj, keys) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') {
      return obj[key];
    }
  }

  return null;
}

function parseInteger(value) {
  return Math.round(parseNumber(value));
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return 0;

  let str = String(value)
    .trim()
    .replace(/\s/g, '')
    .replace(/\$/g, '')
    .replace(/ARS/gi, '')
    .replace(/USD/gi, '')
    .replace(/%/g, '');

  const hasComma = str.includes(',');
  const hasDot = str.includes('.');

  if (hasComma && hasDot) {
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');

    if (lastComma > lastDot) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    str = str.replace(',', '.');
  } else if (hasDot && !hasComma) {
    const parts = str.split('.');
    const last = parts[parts.length - 1];

    if (last.length === 3 && parts.length > 1) {
      str = str.replace(/\./g, '');
    }
  }

  str = str.replace(/[^\d.-]/g, '');

  const number = Number(str);

  return Number.isFinite(number) ? number : 0;
}

function normalizeDate(value) {
  const str = String(value || '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  const match = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  if (match) {
    const [, day, month, year] = match;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const parsed = new Date(str);

  if (!Number.isNaN(parsed.getTime())) {
    return dateToBuenosAires(parsed);
  }

  throw new Error(`Fecha inválida: ${value}`);
}

function dateToBuenosAires(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function makeCampaignKey(id, name) {
  if (id !== null && id !== undefined && String(id).trim() !== '') {
    return String(id).trim();
  }

  return String(name || 'default')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 120) || 'default';
}

function safeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function safeInteger(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function unixSecondsNow() {
  return Math.floor(Date.now() / 1000);
}

function unixSecondsDaysAgo(days) {
  return Math.floor((Date.now() - Number(days) * 24 * 60 * 60 * 1000) / 1000);
}

function getPerfitEventDate(row) {
  const possible =
    row.date ||
    row.created ||
    row.createdAt ||
    row.created_at ||
    row.timestamp ||
    row.time ||
    row.eventDate ||
    row.event_date;

  if (!possible) return new Date();

  if (typeof possible === 'number') {
    return possible > 1000000000000
      ? new Date(possible)
      : new Date(possible * 1000);
  }

  return new Date(possible);
}

function normalizeKommoSubdomain(value) {
  if (!value) return '';

  return String(value)
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\.kommo\.com.*$/, '')
    .replace(/\/.*$/, '');
}
