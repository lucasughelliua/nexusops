/*
  NexusOps - sync marketing unificado
  Ejecutar:
    node sync-marketing.js google_ads
    node sync-marketing.js perfit
    node sync-marketing.js kommo
    node sync-marketing.js meta_ads
    node sync-marketing.js all

  Requiere:
    npm i pg googleapis
*/

const { Pool } = require('pg');
const { google } = require('googleapis');

const TZ = 'America/Argentina/Buenos_Aires';
const pool = new Pool({
  connectionString: requiredEnv('DATABASE_URL'),
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
});

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) throw new Error(`Falta ${name}`);
  return value;
}

function optionalEnv(name, fallback = '') {
  return process.env[name] && String(process.env[name]).trim() ? String(process.env[name]).trim() : fallback;
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  let s = String(value)
    .trim()
    .replace(/\s/g, '')
    .replace(/[$%xX]/g, '')
    .replace(/[^0-9,.-]/g, '');

  if (!s || s === '-' || s === '.' || s === ',') return 0;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    // 1.234,56 => 1234.56 | 1,234.56 => 1234.56
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    s = s.replace(',', '.');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function toISODate(value) {
  if (!value) return null;
  const s = String(value).trim();

  const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymd) return `${ymd[1]}-${String(ymd[2]).padStart(2, '0')}-${String(ymd[3]).padStart(2, '0')}`;

  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function dateInBAFromUnix(ts) {
  const d = new Date(Number(ts) * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function first(row, names) {
  for (const name of names) {
    const key = normalizeHeader(name);
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return '';
}

function campaignKey(source, campaignId, campaignName) {
  return String(campaignId || campaignName || source).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') || source;
}

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_daily (
      date date NOT NULL,
      source text NOT NULL,
      campaign_key text NOT NULL,
      campaign_id text,
      campaign_name text,
      spend numeric DEFAULT 0,
      impressions bigint DEFAULT 0,
      reach bigint DEFAULT 0,
      clicks bigint DEFAULT 0,
      conversions numeric DEFAULT 0,
      revenue numeric DEFAULT 0,
      leads bigint DEFAULT 0,
      emails_sent bigint DEFAULT 0,
      emails_delivered bigint DEFAULT 0,
      opens bigint DEFAULT 0,
      bounces bigint DEFAULT 0,
      unsubscribes bigint DEFAULT 0,
      raw jsonb DEFAULT '{}'::jsonb,
      updated_at timestamptz DEFAULT now(),
      PRIMARY KEY (date, source, campaign_key)
    );

    CREATE INDEX IF NOT EXISTS idx_marketing_daily_source_date
      ON marketing_daily (source, date DESC);

    CREATE TABLE IF NOT EXISTS sync_status (
      source text PRIMARY KEY,
      ok boolean NOT NULL DEFAULT false,
      rows_imported integer NOT NULL DEFAULT 0,
      message text,
      started_at timestamptz,
      finished_at timestamptz DEFAULT now()
    );
  `);
}

async function setStatus(source, ok, rows, message, startedAt) {
  await pool.query(
    `INSERT INTO sync_status (source, ok, rows_imported, message, started_at, finished_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (source) DO UPDATE SET
       ok = EXCLUDED.ok,
       rows_imported = EXCLUDED.rows_imported,
       message = EXCLUDED.message,
       started_at = EXCLUDED.started_at,
       finished_at = now()`,
    [source, ok, rows, String(message || '').slice(0, 1000), startedAt]
  );
}

async function upsertRows(rows) {
  if (!rows.length) return 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let imported = 0;
    for (const r of rows) {
      if (!r.date || !r.source) continue;
      const cKey = r.campaign_key || campaignKey(r.source, r.campaign_id, r.campaign_name);
      await client.query(
        `INSERT INTO marketing_daily (
          date, source, campaign_key, campaign_id, campaign_name,
          spend, impressions, reach, clicks, conversions, revenue, leads,
          emails_sent, emails_delivered, opens, bounces, unsubscribes,
          raw, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,$8,$9,$10,$11,$12,
          $13,$14,$15,$16,$17,
          $18::jsonb, now()
        )
        ON CONFLICT (date, source, campaign_key) DO UPDATE SET
          campaign_id = EXCLUDED.campaign_id,
          campaign_name = EXCLUDED.campaign_name,
          spend = EXCLUDED.spend,
          impressions = EXCLUDED.impressions,
          reach = EXCLUDED.reach,
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
          updated_at = now()`,
        [
          r.date,
          r.source,
          cKey,
          r.campaign_id || null,
          r.campaign_name || null,
          parseNumber(r.spend),
          Math.round(parseNumber(r.impressions)),
          Math.round(parseNumber(r.reach)),
          Math.round(parseNumber(r.clicks)),
          parseNumber(r.conversions),
          parseNumber(r.revenue),
          Math.round(parseNumber(r.leads)),
          Math.round(parseNumber(r.emails_sent)),
          Math.round(parseNumber(r.emails_delivered)),
          Math.round(parseNumber(r.opens)),
          Math.round(parseNumber(r.bounces)),
          Math.round(parseNumber(r.unsubscribes)),
          JSON.stringify(r.raw || {}),
        ]
      );
      imported++;
    }
    await client.query('COMMIT');
    return imported;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

function parseGoogleServiceAccount() {
  const raw = requiredEnv('GOOGLE_SERVICE_ACCOUNT_JSON');
  let json;
  try {
    json = JSON.parse(raw);
  } catch (_) {
    // Permite guardar el JSON en base64 si GitHub rompe comillas/saltos de línea.
    json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  }
  if (!json.client_email || !json.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no parece ser un JSON válido de Service Account: faltan client_email/private_key');
  }
  json.private_key = json.private_key.replace(/\\n/g, '\n');
  return json;
}

async function syncGoogleAds() {
  const credentials = parseGoogleServiceAccount();
  const spreadsheetId = requiredEnv('GOOGLE_SHEET_ID');
  const sheetName = optionalEnv('GOOGLE_SHEET_NAME', 'ga4_marketing');
  const range = optionalEnv('GOOGLE_SHEET_RANGE', `${sheetName}!A:Z`);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const values = res.data.values || [];
  if (values.length < 2) throw new Error('[google_ads] El Sheet no tiene filas de datos');

  const headers = values[0].map(normalizeHeader);
  const rows = values.slice(1).map((arr) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = arr[i]));
    return obj;
  });

  const normalized = rows
    .map((row) => {
      const date = toISODate(first(row, ['date', 'fecha', 'day', 'dia', 'date_start']));
      const campaignId = first(row, ['campaign_id', 'id_campana', 'campaign id']);
      const campaignName = first(row, ['campaign_name', 'campaign', 'campana', 'campaña', 'nombre_campana']);
      if (!date) return null;
      return {
        date,
        source: 'google_ads',
        campaign_id: campaignId || null,
        campaign_name: campaignName || 'Google Ads',
        spend: first(row, ['cost', 'costo', 'spend', 'inversion', 'inversión', 'investment']),
        impressions: first(row, ['impressions', 'impresiones']),
        clicks: first(row, ['clicks', 'clics']),
        conversions: first(row, ['conversions', 'conversiones', 'conv']),
        revenue: first(row, ['revenue', 'purchase_revenue', 'conversion_value', 'valor_conversiones', 'ingresos']),
        leads: first(row, ['leads', 'lead']),
        raw: row,
      };
    })
    .filter(Boolean);

  if (!normalized.length) throw new Error('[google_ads] No se pudo mapear ninguna fila real del Sheet. Revisar columnas Fecha/Campaña/Costo/Clics.');
  return upsertRows(normalized);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}: ${text.slice(0, 500)}`);
  }
  return json;
}

async function syncPerfit() {
  const account = requiredEnv('PERFIT_ACCOUNT');
  const apiKey = requiredEnv('PERFIT_API_KEY');
  const days = Number(optionalEnv('PERFIT_DAYS_BACK', '30'));
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let url = `https://api.myperfit.com/v2/${encodeURIComponent(account)}/activity?view=full&filters.timestamp.gt=${encodeURIComponent(from)}`;
  const events = [];

  for (let page = 0; page < 50 && url; page++) {
    const json = await fetchJson(url, { headers: { Authentication: apiKey, Accept: 'application/json' } });
    const data = Array.isArray(json?.data) ? json.data : [];
    events.push(...data);
    url = json?.paging?.next || '';
  }

  if (!events.length) {
    throw new Error('[perfit] No se importaron eventos reales desde /activity. No voy a insertar ceros falsos.');
  }

  const map = new Map();
  for (const ev of events) {
    const type = String(ev.track_type || ev.type || ev.event || '').toLowerCase();
    const timestamp = ev.timestamp || ev.date || ev.created || ev.created_at;
    const date = toISODate(timestamp);
    if (!date) continue;

    const mailing = ev.mailing || ev.mail || ev.campaign || ev.message || {};
    const campaignId = String(mailing.id || ev.mailing_id || ev.campaign_id || 'perfit_activity');
    const campaignName = String(mailing.name || mailing.subject || ev.subject || 'Perfit Activity');
    const key = `${date}|${campaignId}|${campaignName}`;

    if (!map.has(key)) {
      map.set(key, {
        date,
        source: 'perfit',
        campaign_id: campaignId,
        campaign_name: campaignName,
        emails_sent: 0,
        emails_delivered: 0,
        opens: 0,
        clicks: 0,
        bounces: 0,
        unsubscribes: 0,
        raw: { sample: ev },
      });
    }

    const row = map.get(key);
    if (type.includes('sent')) row.emails_sent += 1;
    else if (type.includes('delivered') || type.includes('delivery')) row.emails_delivered += 1;
    else if (type.includes('open')) row.opens += 1;
    else if (type.includes('click')) row.clicks += 1;
    else if (type.includes('bounce') || type.includes('rejected')) row.bounces += 1;
    else if (type.includes('unsub') || type.includes('desus')) row.unsubscribes += 1;
  }

  const rows = [...map.values()];
  if (!rows.length) throw new Error('[perfit] Llegaron eventos pero no se pudieron agrupar por fecha/campaña. Revisar raw.');
  return upsertRows(rows);
}

async function syncKommo() {
  const subdomainRaw = requiredEnv('KOMMO_SUBDOMAIN').replace(/^https?:\/\//, '').replace(/\.kommo\.com.*$/, '');
  const token = requiredEnv('KOMMO_ACCESS_TOKEN');
  const days = Number(optionalEnv('KOMMO_DAYS_BACK', '30'));
  const fromUnix = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  const toUnix = Math.floor(Date.now() / 1000);

  const leads = [];
  for (let page = 1; page <= 100; page++) {
    const url = new URL(`https://${subdomainRaw}.kommo.com/api/v4/leads`);
    url.searchParams.set('limit', '250');
    url.searchParams.set('page', String(page));
    url.searchParams.set('filter[created_at][from]', String(fromUnix));
    url.searchParams.set('filter[created_at][to]', String(toUnix));
    const json = await fetchJson(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    const batch = json?._embedded?.leads || [];
    leads.push(...batch);
    if (!json?._links?.next?.href || batch.length === 0) break;
  }

  if (!leads.length) throw new Error('[kommo] No se importaron leads reales. Revisar token/subdomain/filtros.');

  const map = new Map();
  for (const lead of leads) {
    const createdAt = lead.created_at || lead.updated_at || lead.closed_at;
    if (!createdAt) continue;
    const date = dateInBAFromUnix(createdAt);
    const pipeline = lead.pipeline_id ? `pipeline_${lead.pipeline_id}` : 'pipeline_unknown';
    const status = lead.status_id ? `status_${lead.status_id}` : 'status_unknown';
    const campaignId = `${pipeline}_${status}`;
    const campaignName = `Kommo ${pipeline} / ${status}`;
    const key = `${date}|${campaignId}`;

    if (!map.has(key)) {
      map.set(key, {
        date,
        source: 'kommo',
        campaign_id: campaignId,
        campaign_name: campaignName,
        leads: 0,
        revenue: 0,
        conversions: 0,
        raw: { sample: lead },
      });
    }
    const row = map.get(key);
    row.leads += 1;
    row.revenue += parseNumber(lead.price || 0);
    if (lead.closed_at) row.conversions += 1;
  }

  return upsertRows([...map.values()]);
}

async function syncMetaAds() {
  const accessToken = requiredEnv('META_ACCESS_TOKEN');
  let adAccountId = requiredEnv('META_AD_ACCOUNT_ID');
  if (!adAccountId.startsWith('act_')) adAccountId = `act_${adAccountId}`;
  const apiVersion = optionalEnv('META_API_VERSION', 'v20.0');
  const days = Number(optionalEnv('META_DAYS_BACK', '30'));

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);
  const fields = [
    'date_start',
    'campaign_id',
    'campaign_name',
    'spend',
    'impressions',
    'reach',
    'clicks',
    'actions',
    'action_values',
  ].join(',');

  let url = `https://graph.facebook.com/${apiVersion}/${adAccountId}/insights?level=campaign&time_increment=1&fields=${fields}&time_range[since]=${since}&time_range[until]=${until}&limit=500&access_token=${encodeURIComponent(accessToken)}`;
  const rows = [];

  for (let page = 0; page < 50 && url; page++) {
    const json = await fetchJson(url);
    for (const item of json.data || []) {
      const actions = Array.isArray(item.actions) ? item.actions : [];
      const values = Array.isArray(item.action_values) ? item.action_values : [];
      const actionValue = (names) => actions
        .filter((a) => names.includes(a.action_type))
        .reduce((sum, a) => sum + parseNumber(a.value), 0);
      const valueAmount = (names) => values
        .filter((a) => names.includes(a.action_type))
        .reduce((sum, a) => sum + parseNumber(a.value), 0);

      rows.push({
        date: item.date_start,
        source: 'meta_ads',
        campaign_id: item.campaign_id,
        campaign_name: item.campaign_name,
        spend: item.spend,
        impressions: item.impressions,
        reach: item.reach,
        clicks: item.clicks,
        conversions: actionValue(['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase']),
        leads: actionValue(['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead']),
        revenue: valueAmount(['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase']),
        raw: item,
      });
    }
    url = json.paging?.next || '';
  }

  if (!rows.length) throw new Error('[meta_ads] No se importaron filas reales.');
  return upsertRows(rows);
}

async function runSource(source) {
  const startedAt = new Date();
  console.log(`[${source}] inicio`);
  try {
    let rows = 0;
    if (source === 'google_ads') rows = await syncGoogleAds();
    else if (source === 'perfit') rows = await syncPerfit();
    else if (source === 'kommo' || source === 'kommo_crm') rows = await syncKommo();
    else if (source === 'meta_ads' || source === 'meta') rows = await syncMetaAds();
    else throw new Error(`Source no soportado: ${source}`);

    await setStatus(source, true, rows, `OK - ${rows} filas importadas`, startedAt);
    console.log(`[${source}] OK - ${rows} filas importadas`);
    return rows;
  } catch (err) {
    await setStatus(source, false, 0, err.message, startedAt).catch(() => {});
    console.error(`[${source}] ERROR FATAL: ${err.message}`);
    throw err;
  }
}

async function main() {
  await ensureTables();
  const arg = process.argv[2] || 'all';
  const sources = arg === 'all' ? ['meta_ads', 'google_ads', 'perfit', 'kommo'] : [arg];
  let total = 0;
  for (const source of sources) total += await runSource(source);
  await pool.end();
  console.log(`Sync completo. Total filas: ${total}`);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
