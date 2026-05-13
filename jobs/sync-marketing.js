/**
 * NexusOps Marketing Intelligence
 * Jobs completos: Meta Ads Full + Meta Organic + Perfit
 *
 * Requiere Node 20+
 * Secrets:
 * DATABASE_URL
 * META_ACCESS_TOKEN
 * META_AD_ACCOUNT_ID = act_XXXXXXXXX
 * META_PAGE_ID opcional
 * META_IG_USER_ID opcional
 * PERFIT_API_KEY
 * PERFIT_ACCOUNT
 */

import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function daysAgoISO(days) {
  return new Date(Date.now() - 86400000 * days).toISOString().split('T')[0];
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
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

      if (!res.ok) {
        const msg = data?.error?.message || data?.message || text || `HTTP ${res.status}`;
        if ((res.status === 429 || res.status >= 500) && i < retries) {
          await sleep(1000 * Math.pow(2, i));
          continue;
        }
        throw new Error(`${res.status} ${msg}`);
      }

      if (data?.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
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
  try {
    const { rows } = await db.query(
      `SELECT last_date_synced
       FROM sync_log
       WHERE source = $1 AND status IN ('success','partial')
       ORDER BY started_at DESC
       LIMIT 1`,
      [source]
    );
    return rows[0]?.last_date_synced || null;
  } catch {
    return null;
  }
}

async function startSyncLog(source) {
  try {
    const { rows } = await db.query(
      `INSERT INTO sync_log(source, status) VALUES($1,'running') RETURNING id`,
      [source]
    );
    return rows[0].id;
  } catch {
    console.warn(`[${source}] sync_log no disponible, continúo sin log DB`);
    return null;
  }
}

async function endSyncLog(id, data) {
  if (!id) return;
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
  `, [
    data.status,
    data.records || 0,
    data.created || 0,
    data.updated || 0,
    data.lastDate || null,
    data.error || null,
    id
  ]);
}

async function ensureChannel(name, type = 'other') {
  let { rows: [channel] } = await db.query(
    `SELECT id FROM channels WHERE name=$1 AND type=$2 LIMIT 1`,
    [name, type]
  );

  if (!channel) {
    const { rows: [c] } = await db.query(
      `INSERT INTO channels(name,type,active) VALUES($1,$2,true) RETURNING id`,
      [name, type]
    );
    channel = c;
  }

  return channel;
}

function metaUrl(path, params = {}) {
  const url = new URL(`https://graph.facebook.com/v19.0/${path}`);
  url.searchParams.set('access_token', process.env.META_ACCESS_TOKEN);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
  }
  return url.toString();
}

async function fetchMetaPaged(path, params = {}) {
  let url = metaUrl(path, { limit: 100, ...params });
  const all = [];

  while (url) {
    const data = await fetchJson(url);
    if (Array.isArray(data.data)) all.push(...data.data);
    url = data.paging?.next || null;
    if (url) await sleep(200);
  }

  return all;
}

function getAction(actions, names) {
  if (!Array.isArray(actions)) return 0;
  const arr = Array.isArray(names) ? names : [names];
  return arr.reduce((sum, name) => {
    const item = actions.find((a) => a.action_type === name);
    return sum + num(item?.value);
  }, 0);
}

function parseMetaInsight(ins) {
  const actions = ins.actions || [];
  const actionValues = ins.action_values || [];

  const outboundClicks = Array.isArray(ins.outbound_clicks)
    ? getAction(ins.outbound_clicks, ['outbound_click'])
    : int(ins.outbound_clicks);

  const video25 = getAction(actions, ['video_view']);
  const video50 = getAction(actions, ['video_p50_watched_actions']);
  const video75 = getAction(actions, ['video_p75_watched_actions']);
  const video95 = getAction(actions, ['video_p95_watched_actions']);
  const video100 = getAction(actions, ['video_p100_watched_actions', 'video_complete_watched_actions']);

  const purchases = getAction(actions, ['purchase', 'offsite_conversion.fb_pixel_purchase']);
  const purchaseValue = getAction(actionValues, ['purchase', 'offsite_conversion.fb_pixel_purchase']);

  const leads = getAction(actions, ['lead', 'offsite_conversion.fb_pixel_lead']);
  const addToCart = getAction(actions, ['add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart']);
  const checkout = getAction(actions, ['initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout']);
  const viewContent = getAction(actions, ['view_content', 'offsite_conversion.fb_pixel_view_content']);
  const searchEvents = getAction(actions, ['search', 'offsite_conversion.fb_pixel_search']);
  const completeRegistration = getAction(actions, ['complete_registration', 'offsite_conversion.fb_pixel_complete_registration']);

  return {
    impressions: int(ins.impressions),
    reach: int(ins.reach),
    frequency: num(ins.frequency),
    clicks: int(ins.clicks),
    unique_clicks: int(ins.unique_clicks),
    inline_link_clicks: int(ins.inline_link_clicks),
    outbound_clicks: int(outboundClicks),
    landing_page_views: getAction(actions, ['landing_page_view']),
    spend: num(ins.spend),
    cpm: num(ins.cpm),
    cpc: num(ins.cpc),
    ctr: num(ins.ctr),
    unique_ctr: num(ins.unique_ctr),
    purchases: int(purchases),
    purchase_value: num(purchaseValue),
    leads: int(leads),
    add_to_cart: int(addToCart),
    initiate_checkout: int(checkout),
    view_content: int(viewContent),
    search_events: int(searchEvents),
    complete_registration: int(completeRegistration),
    conversions: int(purchases + leads),
    conv_value: num(purchaseValue),
    video_views: int(video25),
    video_p25: int(video25),
    video_p50: int(video50),
    video_p75: int(video75),
    video_p95: int(video95),
    video_p100: int(video100),
  };
}

async function syncMetaStructure() {
  const token = process.env.META_ACCESS_TOKEN?.trim();
  const adAccountId = process.env.META_AD_ACCOUNT_ID?.trim();

  if (!token) throw new Error('Falta META_ACCESS_TOKEN');
  if (!adAccountId) throw new Error('Falta META_AD_ACCOUNT_ID');

  const channel = await ensureChannel('Meta Ads', 'other');

  console.log('[Meta] Sincronizando campañas...');
  const campaigns = await fetchMetaPaged(`${adAccountId}/campaigns`, {
    fields: [
      'id','name','status','effective_status','objective',
      'daily_budget','lifetime_budget','start_time','stop_time',
      'created_time','updated_time'
    ].join(',')
  });

  for (const c of campaigns) {
    await db.query(`
      INSERT INTO marketing_campaigns (
        external_id, source, channel_id, name, status, objective,
        daily_budget, lifetime_budget, start_date, end_date, created_at, updated_at
      )
      VALUES ($1,'meta',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (external_id, source) DO UPDATE SET
        name=EXCLUDED.name,
        status=EXCLUDED.status,
        objective=EXCLUDED.objective,
        daily_budget=EXCLUDED.daily_budget,
        lifetime_budget=EXCLUDED.lifetime_budget,
        start_date=EXCLUDED.start_date,
        end_date=EXCLUDED.end_date,
        updated_at=EXCLUDED.updated_at,
        synced_at=NOW()
    `, [
      c.id, channel.id, c.name, c.effective_status || c.status, c.objective,
      c.daily_budget ? num(c.daily_budget) / 100 : null,
      c.lifetime_budget ? num(c.lifetime_budget) / 100 : null,
      c.start_time ? c.start_time.split('T')[0] : null,
      c.stop_time ? c.stop_time.split('T')[0] : null,
      c.created_time || null,
      c.updated_time || null
    ]);
  }

  console.log(`[Meta] Campañas: ${campaigns.length}`);

  console.log('[Meta] Sincronizando adsets...');
  const adsets = await fetchMetaPaged(`${adAccountId}/adsets`, {
    fields: [
      'id','campaign_id','name','status','effective_status',
      'optimization_goal','billing_event','bid_strategy',
      'daily_budget','lifetime_budget','start_time','end_time',
      'created_time','updated_time'
    ].join(',')
  });

  for (const a of adsets) {
    await db.query(`
      INSERT INTO meta_adsets (
        external_id, campaign_external_id, name, status, effective_status,
        optimization_goal, billing_event, bid_strategy, daily_budget,
        lifetime_budget, start_time, end_time, created_time, updated_time, raw
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (external_id) DO UPDATE SET
        campaign_external_id=EXCLUDED.campaign_external_id,
        name=EXCLUDED.name,
        status=EXCLUDED.status,
        effective_status=EXCLUDED.effective_status,
        optimization_goal=EXCLUDED.optimization_goal,
        billing_event=EXCLUDED.billing_event,
        bid_strategy=EXCLUDED.bid_strategy,
        daily_budget=EXCLUDED.daily_budget,
        lifetime_budget=EXCLUDED.lifetime_budget,
        start_time=EXCLUDED.start_time,
        end_time=EXCLUDED.end_time,
        updated_time=EXCLUDED.updated_time,
        raw=EXCLUDED.raw,
        synced_at=NOW()
    `, [
      a.id, a.campaign_id, a.name, a.status, a.effective_status,
      a.optimization_goal, a.billing_event, a.bid_strategy,
      a.daily_budget ? num(a.daily_budget) / 100 : null,
      a.lifetime_budget ? num(a.lifetime_budget) / 100 : null,
      a.start_time || null, a.end_time || null,
      a.created_time || null, a.updated_time || null,
      JSON.stringify(a)
    ]);
  }

  console.log(`[Meta] Adsets: ${adsets.length}`);

  console.log('[Meta] Sincronizando ads...');
  const ads = await fetchMetaPaged(`${adAccountId}/ads`, {
    fields: [
      'id','campaign_id','adset_id','name','status','effective_status',
      'creative{id,name,title,body,object_type,thumbnail_url,image_url,instagram_permalink_url,effective_object_story_id}',
      'created_time','updated_time'
    ].join(',')
  });

  for (const ad of ads) {
    const cr = ad.creative || {};

    if (cr.id) {
      await db.query(`
        INSERT INTO meta_ad_creatives (
          external_id, name, title, body, object_type,
          thumbnail_url, image_url, instagram_permalink_url,
          effective_object_story_id, raw
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (external_id) DO UPDATE SET
          name=EXCLUDED.name,
          title=EXCLUDED.title,
          body=EXCLUDED.body,
          object_type=EXCLUDED.object_type,
          thumbnail_url=EXCLUDED.thumbnail_url,
          image_url=EXCLUDED.image_url,
          instagram_permalink_url=EXCLUDED.instagram_permalink_url,
          effective_object_story_id=EXCLUDED.effective_object_story_id,
          raw=EXCLUDED.raw,
          synced_at=NOW()
      `, [
        cr.id, cr.name || null, cr.title || null, cr.body || null,
        cr.object_type || null, cr.thumbnail_url || null, cr.image_url || null,
        cr.instagram_permalink_url || null, cr.effective_object_story_id || null,
        JSON.stringify(cr)
      ]);
    }

    await db.query(`
      INSERT INTO meta_ads (
        external_id, campaign_external_id, adset_external_id,
        creative_external_id, name, status, effective_status,
        created_time, updated_time, raw
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (external_id) DO UPDATE SET
        campaign_external_id=EXCLUDED.campaign_external_id,
        adset_external_id=EXCLUDED.adset_external_id,
        creative_external_id=EXCLUDED.creative_external_id,
        name=EXCLUDED.name,
        status=EXCLUDED.status,
        effective_status=EXCLUDED.effective_status,
        updated_time=EXCLUDED.updated_time,
        raw=EXCLUDED.raw,
        synced_at=NOW()
    `, [
      ad.id, ad.campaign_id, ad.adset_id, cr.id || null,
      ad.name, ad.status, ad.effective_status,
      ad.created_time || null, ad.updated_time || null,
      JSON.stringify(ad)
    ]);
  }

  console.log(`[Meta] Ads: ${ads.length}`);

  return { campaigns: campaigns.length, adsets: adsets.length, ads: ads.length };
}

async function syncMetaInsightsLevel(level, dateFrom, dateTo) {
  const adAccountId = process.env.META_AD_ACCOUNT_ID?.trim();

  const fields = [
    'date_start','campaign_id','campaign_name','adset_id','adset_name','ad_id','ad_name',
    'impressions','reach','frequency','clicks','unique_clicks','inline_link_clicks',
    'outbound_clicks','spend','cpm','cpc','ctr','unique_ctr',
    'actions','action_values'
  ].join(',');

  console.log(`[Meta] Insights ${level}: ${dateFrom} → ${dateTo}`);

  const rows = await fetchMetaPaged(`${adAccountId}/insights`, {
    level,
    time_increment: 1,
    time_range: { since: dateFrom, until: dateTo },
    fields,
    limit: 100
  });

  for (const ins of rows) {
    const p = parseMetaInsight(ins);
    const entityId =
      level === 'campaign' ? ins.campaign_id :
      level === 'adset' ? ins.adset_id :
      level === 'ad' ? ins.ad_id :
      adAccountId;

    const entityName =
      level === 'campaign' ? ins.campaign_name :
      level === 'adset' ? ins.adset_name :
      level === 'ad' ? ins.ad_name :
      'Ad Account';

    await db.query(`
      INSERT INTO meta_insights_daily (
        level, entity_external_id, entity_name,
        campaign_external_id, adset_external_id, ad_external_id,
        date,
        impressions, reach, frequency, clicks, unique_clicks,
        inline_link_clicks, outbound_clicks, landing_page_views,
        spend, cpm, cpc, ctr, unique_ctr,
        purchases, purchase_value, leads, add_to_cart,
        initiate_checkout, view_content, search_events,
        complete_registration, conversions, conv_value,
        video_views, video_p25, video_p50, video_p75, video_p95, video_p100,
        raw
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,$12,$13,$14,$15,
        $16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
        $31,$32,$33,$34,$35,$36,$37
      )
      ON CONFLICT (level, entity_external_id, date) DO UPDATE SET
        entity_name=EXCLUDED.entity_name,
        campaign_external_id=EXCLUDED.campaign_external_id,
        adset_external_id=EXCLUDED.adset_external_id,
        ad_external_id=EXCLUDED.ad_external_id,
        impressions=EXCLUDED.impressions,
        reach=EXCLUDED.reach,
        frequency=EXCLUDED.frequency,
        clicks=EXCLUDED.clicks,
        unique_clicks=EXCLUDED.unique_clicks,
        inline_link_clicks=EXCLUDED.inline_link_clicks,
        outbound_clicks=EXCLUDED.outbound_clicks,
        landing_page_views=EXCLUDED.landing_page_views,
        spend=EXCLUDED.spend,
        cpm=EXCLUDED.cpm,
        cpc=EXCLUDED.cpc,
        ctr=EXCLUDED.ctr,
        unique_ctr=EXCLUDED.unique_ctr,
        purchases=EXCLUDED.purchases,
        purchase_value=EXCLUDED.purchase_value,
        leads=EXCLUDED.leads,
        add_to_cart=EXCLUDED.add_to_cart,
        initiate_checkout=EXCLUDED.initiate_checkout,
        view_content=EXCLUDED.view_content,
        search_events=EXCLUDED.search_events,
        complete_registration=EXCLUDED.complete_registration,
        conversions=EXCLUDED.conversions,
        conv_value=EXCLUDED.conv_value,
        video_views=EXCLUDED.video_views,
        video_p25=EXCLUDED.video_p25,
        video_p50=EXCLUDED.video_p50,
        video_p75=EXCLUDED.video_p75,
        video_p95=EXCLUDED.video_p95,
        video_p100=EXCLUDED.video_p100,
        raw=EXCLUDED.raw,
        synced_at=NOW()
    `, [
      level, entityId, entityName,
      ins.campaign_id || null, ins.adset_id || null, ins.ad_id || null,
      ins.date_start,
      p.impressions, p.reach, p.frequency, p.clicks, p.unique_clicks,
      p.inline_link_clicks, p.outbound_clicks, p.landing_page_views,
      p.spend, p.cpm, p.cpc, p.ctr, p.unique_ctr,
      p.purchases, p.purchase_value, p.leads, p.add_to_cart,
      p.initiate_checkout, p.view_content, p.search_events,
      p.complete_registration, p.conversions, p.conv_value,
      p.video_views, p.video_p25, p.video_p50, p.video_p75, p.video_p95, p.video_p100,
      JSON.stringify(ins)
    ]);

    if (level === 'campaign' && ins.campaign_id) {
      const { rows: [camp] } = await db.query(
        `SELECT id FROM marketing_campaigns WHERE external_id=$1 AND source='meta'`,
        [ins.campaign_id]
      );

      if (camp) {
        await db.query(`
          INSERT INTO marketing_metrics (
            campaign_id, source, date,
            impressions, reach, clicks, unique_clicks, inline_link_clicks,
            outbound_clicks, landing_page_views, spend, cpm, cpc, ctr,
            unique_ctr, frequency, conversions, conv_value,
            purchases, purchase_value, leads, add_to_cart,
            initiate_checkout, view_content, search_events,
            complete_registration, video_views, video_p25,
            video_p50, video_p75, video_p95, video_p100
          )
          VALUES (
            $1,'meta',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
            $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31
          )
          ON CONFLICT (campaign_id, date) DO UPDATE SET
            impressions=EXCLUDED.impressions,
            reach=EXCLUDED.reach,
            clicks=EXCLUDED.clicks,
            unique_clicks=EXCLUDED.unique_clicks,
            inline_link_clicks=EXCLUDED.inline_link_clicks,
            outbound_clicks=EXCLUDED.outbound_clicks,
            landing_page_views=EXCLUDED.landing_page_views,
            spend=EXCLUDED.spend,
            cpm=EXCLUDED.cpm,
            cpc=EXCLUDED.cpc,
            ctr=EXCLUDED.ctr,
            unique_ctr=EXCLUDED.unique_ctr,
            frequency=EXCLUDED.frequency,
            conversions=EXCLUDED.conversions,
            conv_value=EXCLUDED.conv_value,
            purchases=EXCLUDED.purchases,
            purchase_value=EXCLUDED.purchase_value,
            leads=EXCLUDED.leads,
            add_to_cart=EXCLUDED.add_to_cart,
            initiate_checkout=EXCLUDED.initiate_checkout,
            view_content=EXCLUDED.view_content,
            search_events=EXCLUDED.search_events,
            complete_registration=EXCLUDED.complete_registration,
            video_views=EXCLUDED.video_views,
            video_p25=EXCLUDED.video_p25,
            video_p50=EXCLUDED.video_p50,
            video_p75=EXCLUDED.video_p75,
            video_p95=EXCLUDED.video_p95,
            video_p100=EXCLUDED.video_p100,
            synced_at=NOW()
        `, [
          camp.id, ins.date_start,
          p.impressions, p.reach, p.clicks, p.unique_clicks, p.inline_link_clicks,
          p.outbound_clicks, p.landing_page_views, p.spend, p.cpm, p.cpc, p.ctr,
          p.unique_ctr, p.frequency, p.conversions, p.conv_value,
          p.purchases, p.purchase_value, p.leads, p.add_to_cart,
          p.initiate_checkout, p.view_content, p.search_events,
          p.complete_registration, p.video_views, p.video_p25,
          p.video_p50, p.video_p75, p.video_p95, p.video_p100
        ]);
      }
    }
  }

  console.log(`[Meta] Insights ${level}: ${rows.length} filas`);
  return rows.length;
}

async function syncMetaBreakdowns(dateFrom, dateTo) {
  const adAccountId = process.env.META_AD_ACCOUNT_ID?.trim();
  const breakdowns = [
    'age',
    'gender',
    'country',
    'region',
    'publisher_platform',
    'platform_position',
    'device_platform',
    'impression_device'
  ];

  const fields = [
    'date_start','campaign_id','campaign_name',
    'impressions','reach','clicks','spend','actions','action_values'
  ].join(',');

  let total = 0;

  for (const b of breakdowns) {
    try {
      console.log(`[Meta] Breakdown ${b}`);
      const rows = await fetchMetaPaged(`${adAccountId}/insights`, {
        level: 'campaign',
        time_increment: 1,
        time_range: { since: dateFrom, until: dateTo },
        breakdowns: b,
        fields,
        limit: 100
      });

      for (const ins of rows) {
        const p = parseMetaInsight(ins);
        const value = ins[b] || 'unknown';

        await db.query(`
          INSERT INTO meta_insights_breakdowns (
            level, entity_external_id, date, breakdown_type, breakdown_value,
            impressions, reach, clicks, spend, purchases, purchase_value, leads, raw
          )
          VALUES ('campaign',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (level, entity_external_id, date, breakdown_type, breakdown_value)
          DO UPDATE SET
            impressions=EXCLUDED.impressions,
            reach=EXCLUDED.reach,
            clicks=EXCLUDED.clicks,
            spend=EXCLUDED.spend,
            purchases=EXCLUDED.purchases,
            purchase_value=EXCLUDED.purchase_value,
            leads=EXCLUDED.leads,
            raw=EXCLUDED.raw,
            synced_at=NOW()
        `, [
          ins.campaign_id,
          ins.date_start,
          b,
          String(value),
          p.impressions,
          p.reach,
          p.clicks,
          p.spend,
          p.purchases,
          p.purchase_value,
          p.leads,
          JSON.stringify(ins)
        ]);

        total++;
      }

      await sleep(300);
    } catch (e) {
      console.warn(`[Meta] Breakdown ${b} no disponible: ${e.message}`);
    }
  }

  return total;
}

export async function syncMetaOrganic() {
  const token = process.env.META_ACCESS_TOKEN?.trim();
  const pageId = process.env.META_PAGE_ID?.trim();
  const igUserId = process.env.META_IG_USER_ID?.trim();

  if (!token) throw new Error('Falta META_ACCESS_TOKEN');

  const date = todayISO();
  let total = 0;

  if (pageId) {
    try {
      const page = await fetchJson(metaUrl(`${pageId}`, {
        fields: 'fan_count,followers_count,engagement,talking_about_count'
      }));

      await db.query(`
        INSERT INTO meta_organic_daily (
          source, entity_external_id, date,
          followers, fans, engagement, interactions, raw
        )
        VALUES ('facebook_page',$1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (source, entity_external_id, date) DO UPDATE SET
          followers=EXCLUDED.followers,
          fans=EXCLUDED.fans,
          engagement=EXCLUDED.engagement,
          interactions=EXCLUDED.interactions,
          raw=EXCLUDED.raw,
          synced_at=NOW()
      `, [
        pageId,
        date,
        int(page.followers_count),
        int(page.fan_count),
        int(page.engagement?.count),
        int(page.talking_about_count),
        JSON.stringify(page)
      ]);
      total++;
      console.log('[Meta Organic] Facebook Page OK');
    } catch (e) {
      console.warn('[Meta Organic] Facebook no disponible:', e.message);
    }
  }

  if (igUserId) {
    try {
      const ig = await fetchJson(metaUrl(`${igUserId}`, {
        fields: 'followers_count,follows_count,media_count,name,username'
      }));

      let insights = {};
      try {
        insights = await fetchJson(metaUrl(`${igUserId}/insights`, {
          metric: 'impressions,reach,profile_views,website_clicks',
          period: 'day'
        }));
      } catch (e) {
        console.warn('[Meta Organic] IG insights parciales/no disponibles:', e.message);
      }

      const values = {};
      for (const metric of insights.data || []) {
        values[metric.name] = int(metric.values?.at(-1)?.value);
      }

      await db.query(`
        INSERT INTO meta_organic_daily (
          source, entity_external_id, date,
          followers, impressions, reach, profile_views, website_clicks, posts, raw
        )
        VALUES ('instagram',$1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (source, entity_external_id, date) DO UPDATE SET
          followers=EXCLUDED.followers,
          impressions=EXCLUDED.impressions,
          reach=EXCLUDED.reach,
          profile_views=EXCLUDED.profile_views,
          website_clicks=EXCLUDED.website_clicks,
          posts=EXCLUDED.posts,
          raw=EXCLUDED.raw,
          synced_at=NOW()
      `, [
        igUserId,
        date,
        int(ig.followers_count),
        values.impressions || 0,
        values.reach || 0,
        values.profile_views || 0,
        values.website_clicks || 0,
        int(ig.media_count),
        JSON.stringify({ profile: ig, insights })
      ]);
      total++;
      console.log('[Meta Organic] Instagram OK');
    } catch (e) {
      console.warn('[Meta Organic] Instagram no disponible:', e.message);
    }
  }

  return total;
}

export async function syncMetaFull() {
  const source = 'meta_full';
  const logId = await startSyncLog(source);

  try {
    const lastSync = await getLastSync(source);
    const daysBack = parseInt(process.env.META_DAYS_BACK || '30', 10);
    const dateFrom = lastSync
      ? new Date(new Date(lastSync) - 86400000).toISOString().split('T')[0]
      : daysAgoISO(daysBack);
    const dateTo = todayISO();

    const structure = await syncMetaStructure();
    const campaignRows = await syncMetaInsightsLevel('campaign', dateFrom, dateTo);
    const adsetRows = await syncMetaInsightsLevel('adset', dateFrom, dateTo);
    const adRows = await syncMetaInsightsLevel('ad', dateFrom, dateTo);
    const breakdownRows = await syncMetaBreakdowns(dateFrom, dateTo);
    const organicRows = await syncMetaOrganic();

    const records =
      structure.campaigns +
      structure.adsets +
      structure.ads +
      campaignRows +
      adsetRows +
      adRows +
      breakdownRows +
      organicRows;

    await endSyncLog(logId, {
      status: 'success',
      records,
      created: records,
      updated: 0,
      lastDate: dateTo
    });

    console.log(`[Meta Full] ✓ registros: ${records}`);
  } catch (e) {
    await endSyncLog(logId, {
      status: 'error',
      error: e.message,
      lastDate: todayISO()
    });
    throw e;
  }
}

export async function syncMetaAds() {
  return syncMetaFull();
}

export async function syncPerfit() {
  const source = 'perfit';
  const logId = await startSyncLog(source);

  const apiKey = process.env.PERFIT_API_KEY?.trim();
  const account = process.env.PERFIT_ACCOUNT?.trim();

  if (!apiKey) throw new Error('Falta PERFIT_API_KEY en GitHub Secrets');
  if (!account) throw new Error('Falta PERFIT_ACCOUNT en GitHub Secrets');

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

  let totalCampaigns = 0;
  let totalMetrics = 0;

  const channel = await ensureChannel('Perfit', 'other');

  let page = 1;

  while (true) {
    const url = `${baseUrl}/campaigns?offset=${(page - 1) * 50}&limit=50`;
    console.log('[Perfit] Fetch:', url);

    const data = await fetchJson(url, { method: 'GET', headers }, 3);
    const mailings = data.data || data.mailings || data.items || data.results || data || [];

    if (!Array.isArray(mailings) || !mailings.length) {
      console.log('[Perfit] No hay más campañas');
      break;
    }

    for (const m of mailings) {
      const sentAt = m.sentAt || m.sent_at || m.createdAt || m.created_at || m.scheduleDate;
      if (sentAt && new Date(sentAt) < new Date(dateFrom)) continue;

      await db.query(`
        INSERT INTO marketing_campaigns (
          external_id, source, channel_id, name, status, created_at, updated_at
        )
        VALUES ($1,'perfit',$2,$3,$4,$5,$6)
        ON CONFLICT (external_id, source) DO UPDATE SET
          status=EXCLUDED.status,
          name=EXCLUDED.name,
          updated_at=EXCLUDED.updated_at,
          synced_at=NOW()
      `, [
        String(m.id),
        channel.id,
        m.name || m.subject || `Campaña ${m.id}`,
        m.status || m.state || 'sent',
        sentAt || new Date().toISOString(),
        sentAt || new Date().toISOString(),
      ]);

      totalCampaigns++;

      const statsUrl = `${baseUrl}/campaigns/${m.id}/stats`;
      let stats = {};
      try {
        stats = await fetchJson(statsUrl, { method: 'GET', headers }, 2);
      } catch (e) {
        console.warn(`[Perfit] Stats no disponible mailing ${m.id}: ${e.message}`);
      }

      const { rows: [camp] } = await db.query(
        `SELECT id FROM marketing_campaigns WHERE external_id=$1 AND source='perfit'`,
        [String(m.id)]
      );

      if (!camp) continue;

      const campaignDate = sentAt
        ? sentAt.split('T')[0]
        : todayISO();

      const sent = int(stats.sent || stats.total || stats.recipients || stats.emailsSent);
      const delivered = int(stats.delivered || stats.deliveries || Math.max(0, sent - int(stats.hardBounces || stats.hard_bounces)));
      const opens = int(stats.opens || stats.opened || stats.totalOpens);
      const uniqueOpens = int(stats.uniqueOpens || stats.unique_opens || stats.openedUnique);
      const clicks = int(stats.clicks || stats.totalClicks);
      const uniqueClicks = int(stats.uniqueClicks || stats.unique_clicks || stats.clickedUnique);
      const unsubscribes = int(stats.unsubscribes || stats.unsubscribed || stats.removed);
      const softBounces = int(stats.softBounces || stats.soft_bounces);
      const hardBounces = int(stats.hardBounces || stats.hard_bounces);
      const spamReports = int(stats.spamComplaints || stats.spam || stats.spam_reports);
      const revenueAttr = num(stats.revenue || stats.revenue_attr || stats.salesAmount);

      await db.query(`
        INSERT INTO marketing_metrics (
          campaign_id, source, date,
          sent, delivered, opens, unique_opens,
          clicks_email, unique_clicks_email, unsubscribes,
          bounces_soft, bounces_hard, spam_reports, revenue_attr
        )
        VALUES ($1,'perfit',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (campaign_id, date) DO UPDATE SET
          sent=EXCLUDED.sent,
          delivered=EXCLUDED.delivered,
          opens=EXCLUDED.opens,
          unique_opens=EXCLUDED.unique_opens,
          clicks_email=EXCLUDED.clicks_email,
          unique_clicks_email=EXCLUDED.unique_clicks_email,
          unsubscribes=EXCLUDED.unsubscribes,
          bounces_soft=EXCLUDED.bounces_soft,
          bounces_hard=EXCLUDED.bounces_hard,
          spam_reports=EXCLUDED.spam_reports,
          revenue_attr=EXCLUDED.revenue_attr,
          synced_at=NOW()
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
      await sleep(150);
    }

    if (mailings.length < 50) break;
    page++;
  }

  await endSyncLog(logId, {
    status: 'success',
    records: totalCampaigns + totalMetrics,
    created: totalMetrics,
    updated: 0,
    lastDate: todayISO(),
  });

  console.log(`[Perfit] ✓ ${totalCampaigns} campañas, ${totalMetrics} registros de métricas`);
}

const job = process.argv[2];

(async () => {
  try {
    if (job === 'meta' || job === 'meta_full') await syncMetaFull();
    else if (job === 'meta_organic') await syncMetaOrganic();
    else if (job === 'perfit') await syncPerfit();
    else {
      console.error('Job desconocido:', job);
      process.exit(1);
    }
  } catch (e) {
    console.error(`[${job}] ERROR:`, e.message);
    process.exit(1);
  } finally {
    await db.end();
  }
})();
