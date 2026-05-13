/**
 * NexusOps — Jobs de sincronización incremental
 * Ejecutar en GitHub Actions (cron gratuito)
 * 
 * Variables de entorno necesarias en GitHub Secrets:
 * DATABASE_URL, VTEX_ACCOUNT, VTEX_APP_KEY, VTEX_APP_TOKEN,
 * ML1_ACCESS_TOKEN, ML1_REFRESH_TOKEN, ML1_CLIENT_ID, ML1_CLIENT_SECRET, ML1_SELLER_ID,
 * ML2_ACCESS_TOKEN, ML2_REFRESH_TOKEN, ML2_CLIENT_ID, ML2_CLIENT_SECRET, ML2_SELLER_ID,
 * KOMMO_SUBDOMAIN, KOMMO_ACCESS_TOKEN, KOMMO_REFRESH_TOKEN,
 * LOGISTICS_API_URL, LOGISTICS_API_KEY,
 * SHEETS_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_JSON
 */

import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================================
// UTILS
// ============================================================
async function getLastSync(source) {
  const { rows } = await db.query(
    `SELECT last_date_synced, last_id_synced FROM sync_log 
     WHERE source = $1 AND status IN ('success','partial')
     ORDER BY started_at DESC LIMIT 1`,
    [source]
  );
  return rows[0] || { last_date_synced: null, last_id_synced: null };
}

async function startSyncLog(source) {
  const { rows } = await db.query(
    `INSERT INTO sync_log(source, status) VALUES($1,'running') RETURNING id`,
    [source]
  );
  return rows[0].id;
}

async function endSyncLog(id, { status, records, created, updated, lastId, lastDate, error }) {
  await db.query(`
    UPDATE sync_log SET
      status=$1, finished_at=NOW(), records_processed=$2,
      records_created=$3, records_updated=$4,
      last_id_synced=$5, last_date_synced=$6,
      error_message=$7,
      duration_ms=EXTRACT(EPOCH FROM (NOW()-started_at))*1000
    WHERE id=$8
  `, [status, records, created, updated, lastId, lastDate, error, id]);
}

async function upsertOrder(order) {
  const { rows } = await db.query(`
    INSERT INTO orders (
      external_id, channel_id, source, status, payment_status, shipping_status,
      total_amount, discount_amount, net_amount, shipping_amount,
      items_count, customer_name, customer_email,
      customer_province, customer_city,
      is_canceled, is_returned, raw_data, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    ON CONFLICT (external_id, source) DO UPDATE SET
      status=EXCLUDED.status,
      payment_status=EXCLUDED.payment_status,
      shipping_status=EXCLUDED.shipping_status,
      total_amount=EXCLUDED.total_amount,
      net_amount=EXCLUDED.net_amount,
      is_canceled=EXCLUDED.is_canceled,
      is_returned=EXCLUDED.is_returned,
      updated_at=EXCLUDED.updated_at,
      synced_at=NOW()
    RETURNING id, (xmax = 0) AS is_insert
  `, [
    order.external_id, order.channel_id, order.source,
    order.status, order.payment_status, order.shipping_status,
    order.total_amount, order.discount_amount || 0, order.net_amount, order.shipping_amount || 0,
    order.items_count || 1,
    order.customer_name, order.customer_email,
    order.customer_province, order.customer_city,
    order.is_canceled || false, order.is_returned || false,
    JSON.stringify(order.raw_data || {}),
    order.created_at, order.updated_at
  ]);
  return rows[0];
}

async function upsertOrderItems(orderId, items) {
  if (!items?.length) return;
  for (const item of items) {
    await db.query(`
      INSERT INTO order_items (order_id, external_id, sku, product_name, category, quantity, unit_price, total_price)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT DO NOTHING
    `, [orderId, item.external_id, item.sku, item.product_name, item.category, item.quantity, item.unit_price, item.total_price]);
  }
}

// ============================================================
// JOB 1: SYNC VTEX
// ============================================================
export async function syncVTEX() {
  const source = 'vtex';
  const logId = await startSyncLog(source);
  const last = await getLastSync(source);

  const account = process.env.VTEX_ACCOUNT;
  const appKey = process.env.VTEX_APP_KEY;
  const appToken = process.env.VTEX_APP_TOKEN;
  const headers = { 'X-VTEX-API-AppKey': appKey, 'X-VTEX-API-AppToken': appToken };

  // Obtener channel_id de VTEX
  const { rows: [channel] } = await db.query(`SELECT id FROM channels WHERE type='vtex' LIMIT 1`);
  if (!channel) throw new Error('Canal VTEX no configurado');

  const daysBack = parseInt(process.env.VTEX_DAYS_BACK || '1');
const fromDate = last.last_date_synced
    ? new Date(last.last_date_synced).toISOString()
    : new Date(Date.now() - 86400000 * daysBack).toISOString();

  let page = 1;
  let totalProcessed = 0, totalCreated = 0, totalUpdated = 0;
  let lastDate = fromDate;

  console.log(`[VTEX] Sincronizando desde ${fromDate}`);

  while (true) {
    const url = `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders?` +
      `f_createdIn=${encodeURIComponent(fromDate)}_${encodeURIComponent(new Date().toISOString())}` +
      `&orderBy=createdIn,asc&page=${page}&per_page=50`;

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`VTEX API error: ${res.status}`);

    const data = await res.json();
    const orders = data.list || [];

    if (!orders.length) break;

    for (const o of orders) {
      // Detalle completo de la orden
      await new Promise(r => setTimeout(r, 400));
      const detailRes = await fetch(
        `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders/${o.orderId}`,
        { headers }
      );
      const detail = await detailRes.json();

      const normalized = {
        external_id: detail.orderId,
        channel_id: channel.id,
        source: 'vtex',
        status: detail.status,
        payment_status: detail.paymentData?.transactions?.[0]?.payments?.[0]?.status || null,
        shipping_status: detail.packageAttachment?.packages?.[0]?.trackingIsDelivered ? 'delivered' : 'processing',
        total_amount: detail.value / 100,
        discount_amount: (detail.totals?.find(t => t.id === 'Discounts')?.value || 0) / -100,
        net_amount: detail.value / 100,
        shipping_amount: (detail.totals?.find(t => t.id === 'Shipping')?.value || 0) / 100,
        items_count: detail.items?.length || 0,
        customer_name: detail.clientProfileData?.firstName + ' ' + detail.clientProfileData?.lastName,
        customer_email: detail.clientProfileData?.email,
        customer_province: detail.shippingData?.address?.state,
        customer_city: detail.shippingData?.address?.city,
        is_canceled: detail.status === 'canceled',
        created_at: detail.creationDate,
        updated_at: detail.lastChange,
        raw_data: { status: detail.status, origin: detail.origin },
      };

      const { id: orderId, is_insert } = await upsertOrder(normalized);

      const items = (detail.items || []).map(item => ({
        external_id: item.uniqueId,
        sku: item.refId || item.id,
        product_name: item.name,
        category: item.additionalInfo?.categories?.[0]?.name,
        quantity: item.quantity,
        unit_price: item.price / 100,
        total_price: (item.price * item.quantity) / 100,
      }));
      await upsertOrderItems(orderId, items);

      if (is_insert) totalCreated++; else totalUpdated++;
      totalProcessed++;
      lastDate = detail.creationDate;
    }

    console.log(`[VTEX] Página ${page}: ${orders.length} órdenes`);
    if (orders.length < 50 || page >= data.paging?.pages) break;
    page++;
    await new Promise(r => setTimeout(r, 800)); // Rate limiting
  }

  await endSyncLog(logId, { status: 'success', records: totalProcessed, created: totalCreated, updated: totalUpdated, lastDate });
  console.log(`[VTEX] ✓ ${totalProcessed} órdenes. Creadas: ${totalCreated}, Actualizadas: ${totalUpdated}`);
}

// ============================================================
// JOB 2: SYNC MERCADO LIBRE (genérico para ambas cuentas)
// ============================================================
async function refreshMLToken(creds) {
  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
    }),
  });
  if (!res.ok) throw new Error('Error renovando token ML: ' + await res.text());
  return res.json();
}

async function syncMeliAccount(accountLabel) {
  const source = `meli_${accountLabel}`;
  const logId = await startSyncLog(source);
  const last = await getLastSync(source);

  const prefix = `ML${accountLabel.toUpperCase()}`;
  let accessToken = process.env[`${prefix}_ACCESS_TOKEN`];
  const sellerId = process.env[`${prefix}_SELLER_ID`];

  // Verificar expiración y refrescar
  const { rows: [cred] } = await db.query(
    `SELECT expires_at, extra FROM api_credentials ac
     JOIN channels c ON c.id = ac.channel_id
     WHERE c.type='mercadolibre' AND c.external_id=$1`,
    [sellerId]
  );

  if (cred?.expires_at && new Date(cred.expires_at) < new Date(Date.now() + 300000)) {
    console.log(`[${source}] Refrescando token...`);
    const newToken = await refreshMLToken({
      clientId: process.env[`${prefix}_CLIENT_ID`],
      clientSecret: process.env[`${prefix}_CLIENT_SECRET`],
      refreshToken: process.env[`${prefix}_REFRESH_TOKEN`],
    });
    accessToken = newToken.access_token;
    await db.query(`
      UPDATE api_credentials SET access_token=$1, expires_at=NOW()+INTERVAL '6 hours'
      WHERE channel_id=(SELECT id FROM channels WHERE external_id=$2)
    `, [accessToken, sellerId]);
  }

  const { rows: [channel] } = await db.query(
    `SELECT id FROM channels WHERE type='mercadolibre' AND external_id=$1`,
    [sellerId]
  );
  if (!channel) throw new Error(`Canal ${source} no configurado`);

  const fromDate = last.last_date_synced
    ? new Date(last.last_date_synced).toISOString()
    : new Date(Date.now() - 86400000).toISOString();

  const headers = { Authorization: `Bearer ${accessToken}` };
  let offset = 0, totalProcessed = 0, totalCreated = 0, totalUpdated = 0, lastDate = fromDate;

  console.log(`[${source}] Sincronizando desde ${fromDate}`);

  while (true) {
    const url = `https://api.mercadolibre.com/orders/search?seller=${sellerId}` +
      `&order.date_created.from=${fromDate}&sort=date_asc&offset=${offset}&limit=50`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      if (res.status === 401) {
        // Crear alerta de token vencido
        await db.query(`INSERT INTO alerts(type,severity,message,detail) VALUES('token_expired','critical',$1,$2)`,
          [`Token ${source} vencido`, `Renovar en panel de ML`]);
      }
      throw new Error(`ML API error: ${res.status}`);
    }

    const data = await res.json();
    const orders = data.results || [];
    if (!orders.length) break;

    for (const o of orders) {
      // Detalle + ítems
      const [detailRes, itemsRes] = await Promise.all([
        fetch(`https://api.mercadolibre.com/orders/${o.id}`, { headers }),
        fetch(`https://api.mercadolibre.com/orders/${o.id}/order-items`, { headers }),
      ]);
      const [detail, itemsData] = await Promise.all([detailRes.json(), itemsRes.json()]);

      const normalized = {
        external_id: String(o.id),
        channel_id: channel.id,
        source,
        status: o.status,
        payment_status: o.payments?.[0]?.status || null,
        shipping_status: o.shipping?.status || null,
        total_amount: o.total_amount,
        discount_amount: 0,
        net_amount: o.paid_amount || o.total_amount,
        items_count: o.order_items?.length || 0,
        customer_name: o.buyer?.nickname,
        customer_province: detail.shipping?.receiver_address?.state?.name,
        customer_city: detail.shipping?.receiver_address?.city?.name,
        is_canceled: o.status === 'cancelled',
        created_at: o.date_created,
        updated_at: o.date_last_updated,
        raw_data: { status: o.status },
      };

      const { id: orderId, is_insert } = await upsertOrder(normalized);

      const items = (itemsData.order_items || o.order_items || []).map(item => ({
        external_id: String(item.item?.id || ''),
        sku: item.item?.seller_sku || item.item?.id,
        product_name: item.item?.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.full_unit_price * item.quantity,
      }));
      await upsertOrderItems(orderId, items);

      if (is_insert) totalCreated++; else totalUpdated++;
      totalProcessed++;
      lastDate = o.date_created;
    }

    offset += 50;
    if (orders.length < 50) break;
    await new Promise(r => setTimeout(r, 200));
  }

  await endSyncLog(logId, { status: 'success', records: totalProcessed, created: totalCreated, updated: totalUpdated, lastDate });
  console.log(`[${source}] ✓ ${totalProcessed} órdenes.`);
}

// ============================================================
// JOB 3: SYNC KOMMO CRM
// ============================================================
export async function syncKommo() {
  const source = 'kommo';
  const logId = await startSyncLog(source);
  const last = await getLastSync(source);

  const subdomain = process.env.KOMMO_SUBDOMAIN;
  const token = process.env.KOMMO_ACCESS_TOKEN;
  const headers = { Authorization: `Bearer ${token}` };

  const updatedSince = last.last_date_synced
    ? Math.floor(new Date(last.last_date_synced).getTime() / 1000)
    : Math.floor(Date.now() / 1000) - 86400 * 7;

  let page = 1, totalProcessed = 0, lastDate = null;

  while (true) {
    const url = `https://${subdomain}.kommo.com/api/v4/leads?updated_at[from]=${updatedSince}` +
      `&page=${page}&limit=50&with=contacts,pipeline`;

    const res = await fetch(url, { headers });
    if (res.status === 204) break; // No hay más datos
    if (!res.ok) throw new Error(`Kommo API error: ${res.status}`);

    const data = await res.json();
    const leads = data._embedded?.leads || [];
    if (!leads.length) break;

    for (const lead of leads) {
      const pipelineStage = lead._embedded?.pipeline_stage;
      await db.query(`
        INSERT INTO leads (
          external_id, status, pipeline_id, pipeline_stage, stage_order,
          name, estimated_value, assigned_to, campaign_source,
          created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TO_TIMESTAMP($10),TO_TIMESTAMP($11))
        ON CONFLICT (external_id) DO UPDATE SET
          status=EXCLUDED.status,
          pipeline_stage=EXCLUDED.pipeline_stage,
          estimated_value=EXCLUDED.estimated_value,
          updated_at=EXCLUDED.updated_at
      `, [
        String(lead.id),
        lead.status_id === 142 ? 'won' : lead.status_id === 143 ? 'lost' : 'open',
        lead.pipeline_id,
        pipelineStage?.name || `Stage ${lead.status_id}`,
        pipelineStage?.order || 0,
        lead.name,
        lead.price || 0,
        lead.responsible_user_id ? String(lead.responsible_user_id) : null,
        lead._embedded?.tags?.[0]?.name || null,
        lead.created_at,
        lead.updated_at,
      ]);
      totalProcessed++;
      lastDate = new Date(lead.updated_at * 1000).toISOString();
    }

    page++;
    if (leads.length < 50) break;
    await new Promise(r => setTimeout(r, 200));
  }

  await endSyncLog(logId, { status: 'success', records: totalProcessed, created: totalProcessed, updated: 0, lastDate });
  console.log(`[Kommo] ✓ ${totalProcessed} leads sincronizados`);
}

// ============================================================
// JOB 4: SYNC LOGÍSTICA
// ============================================================
export async function syncLogistics() {
  const source = 'logistics';
  const logId = await startSyncLog(source);
  const last = await getLastSync(source);

  const apiUrl = process.env.LOGISTICS_API_URL;
  const apiKey = process.env.LOGISTICS_API_KEY;

  const fromDate = last.last_date_synced || new Date(Date.now() - 86400000 * 3).toISOString();

  // Solo actualizar envíos no finalizados (en tránsito, pending, delayed)
  const { rows: openShipments } = await db.query(`
    SELECT s.id, s.external_id, s.tracking_number, o.external_id as order_ext_id
    FROM shipments s
    JOIN orders o ON o.id = s.order_id
    WHERE s.status NOT IN ('delivered','returned') AND s.status IS NOT NULL
    LIMIT 200
  `);

  let updated = 0;

  for (const shipment of openShipments) {
    try {
      const res = await fetch(`${apiUrl}/tracking/${shipment.tracking_number}`, {
        headers: { 'X-API-Key': apiKey },
      });
      if (!res.ok) continue;
      const data = await res.json();

      const isDelayed = data.delay_days > 0;
      await db.query(`
        UPDATE shipments SET
          status=$1, is_delayed=$2, delay_days=$3,
          actual_delivery=$4, updated_at=NOW()
        WHERE id=$5
      `, [data.status, isDelayed, data.delay_days || 0, data.delivered_at || null, shipment.id]);

      // Alerta si demora > 5 días hábiles
      if (data.delay_days >= 5) {
        await db.query(`
          INSERT INTO alerts(type,severity,message,detail)
          VALUES('shipment_delay','high',$1,$2)
          ON CONFLICT DO NOTHING
        `, [
          `Envío ${shipment.tracking_number} demorado ${data.delay_days} días`,
          `Orden: ${shipment.order_ext_id}`,
        ]);
      }
      updated++;
    } catch (e) {
      console.warn(`[Logistics] Error tracking ${shipment.tracking_number}:`, e.message);
    }
    await new Promise(r => setTimeout(r, 100));
  }

  await endSyncLog(logId, { status: 'success', records: updated, created: 0, updated, lastDate: new Date().toISOString() });
  console.log(`[Logistics] ✓ ${updated} envíos actualizados`);
}

// ============================================================
// JOB 5: IMPORTAR GOOGLE SHEETS (histórico)
// ============================================================
export async function importGoogleSheets() {
  const source = 'sheets';
  const logId = await startSyncLog(source);

  // Verificar si ya se importó para no repetir
  const { rows: [lastImport] } = await db.query(
    `SELECT id FROM sync_log WHERE source='sheets' AND status='success' LIMIT 1`
  );
  // Comentar la siguiente línea si querés forzar reimportación
  // if (lastImport) { console.log('[Sheets] Ya importado. Skipping.'); return; }

  const { GoogleAuth } = await import('google-auth-library');
  const { google } = await import('googleapis');

  const auth = new GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;

  // Obtener encabezados para mapear columnas dinámicamente
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Ventas!A1:Z1',
  });
  const headers = headerRes.data.values[0].map(h => h.toLowerCase().trim());

  // Mapeo flexible de columnas (adaptar según tu sheet)
  const col = name => headers.indexOf(name);
  const COLS = {
    orderId:     col('order_id') >= 0 ? col('order_id') : col('id'),
    channel:     col('canal') >= 0 ? col('canal') : col('channel'),
    total:       col('total') >= 0 ? col('total') : col('monto'),
    status:      col('estado') >= 0 ? col('estado') : col('status'),
    date:        col('fecha') >= 0 ? col('fecha') : col('date'),
    province:    col('provincia') >= 0 ? col('provincia') : col('province'),
    product:     col('producto') >= 0 ? col('producto') : col('product'),
    sku:         col('sku'),
    qty:         col('cantidad') >= 0 ? col('cantidad') : col('qty'),
    unitPrice:   col('precio_unitario') >= 0 ? col('precio_unitario') : col('unit_price'),
  };

  // Obtener canal "sheets" o crear uno
  let { rows: [sheetChannel] } = await db.query(`SELECT id FROM channels WHERE type='other' AND name='Histórico Sheets'`);
  if (!sheetChannel) {
    const { rows: [created] } = await db.query(
      `INSERT INTO channels(name,type) VALUES('Histórico Sheets','other') RETURNING id`
    );
    sheetChannel = created;
  }

  // Leer en lotes de 1000 filas
  let processed = 0, created = 0, startRow = 2;

  while (true) {
    const range = `Ventas!A${startRow}:Z${startRow + 999}`;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = res.data.values || [];
    if (!rows.length) break;

    for (const row of rows) {
      if (!row[COLS.orderId]) continue;

      const totalAmount = parseFloat(String(row[COLS.total] || '0').replace(/[$,.]/g, '').replace(',', '.')) || 0;
      const dateRaw = row[COLS.date];
      let createdAt;
      try {
        // Soporta DD/MM/YYYY, YYYY-MM-DD, Excel serial
        if (!isNaN(dateRaw)) {
          createdAt = new Date((parseInt(dateRaw) - 25569) * 86400000).toISOString();
        } else {
          const [d, m, y] = dateRaw.includes('/') ? dateRaw.split('/') : dateRaw.split('-');
          createdAt = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`).toISOString();
        }
      } catch { continue; }

      const normalized = {
        external_id: String(row[COLS.orderId]),
        channel_id: sheetChannel.id,
        source: 'sheets',
        status: row[COLS.status] || 'invoiced',
        total_amount: totalAmount,
        net_amount: totalAmount,
        is_canceled: (row[COLS.status] || '').toLowerCase().includes('cancel'),
        customer_province: row[COLS.province] || null,
        created_at: createdAt,
        updated_at: createdAt,
      };

      const { id: orderId, is_insert } = await upsertOrder(normalized);

      // Ítem si hay info de producto
      if (COLS.product >= 0 && row[COLS.product]) {
        const qty = parseInt(row[COLS.qty] || '1') || 1;
        const unitPrice = parseFloat(String(row[COLS.unitPrice] || '0').replace(/[$,.]/g, '')) || totalAmount / qty;
        await upsertOrderItems(orderId, [{
          sku: row[COLS.sku] || null,
          product_name: row[COLS.product],
          quantity: qty,
          unit_price: unitPrice,
          total_price: totalAmount,
        }]);
      }

      if (is_insert) created++;
      processed++;
    }

    console.log(`[Sheets] Procesadas ${processed} filas...`);
    startRow += 1000;
    if (rows.length < 1000) break;
  }

  await endSyncLog(logId, { status: 'success', records: processed, created, updated: processed - created, lastDate: new Date().toISOString() });
  console.log(`[Sheets] ✓ ${processed} registros importados (${created} nuevos)`);
}

// ============================================================
// JOB 6: CALCULAR MÉTRICAS AGREGADAS (corre cada hora)
// ============================================================
export async function calculateMetrics() {
  const { rows: channels } = await db.query(`SELECT id FROM channels WHERE active=true`);
  const today = new Date().toISOString().split('T')[0];
  const currentHour = new Date().getHours();

  for (const channel of channels) {
    const { rows } = await db.query(`
      SELECT
        SUM(o.total_amount) AS total_revenue,
        SUM(o.net_amount) AS net_revenue,
        COUNT(*) AS orders_count,
        AVG(o.total_amount) AS avg_ticket,
        SUM(oi.quantity) AS units_sold,
        COUNT(*) FILTER (WHERE o.is_canceled) AS cancellations,
        COUNT(*) FILTER (WHERE o.is_returned) AS returns
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.channel_id = $1
        AND o.created_at::DATE = $2
        AND EXTRACT(HOUR FROM o.created_at) <= $3
    `, [channel.id, today, currentHour]);

    const m = rows[0];
    await db.query(`
      INSERT INTO metrics_snapshots (
        channel_id, date, hour, total_revenue, net_revenue,
        orders_count, avg_ticket, units_sold, cancellations, returns
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (channel_id, date, hour) DO UPDATE SET
        total_revenue=EXCLUDED.total_revenue,
        net_revenue=EXCLUDED.net_revenue,
        orders_count=EXCLUDED.orders_count,
        avg_ticket=EXCLUDED.avg_ticket,
        units_sold=EXCLUDED.units_sold,
        cancellations=EXCLUDED.cancellations,
        returns=EXCLUDED.returns,
        calculated_at=NOW()
    `, [
      channel.id, today, currentHour,
      m.total_revenue || 0, m.net_revenue || 0,
      m.orders_count || 0, m.avg_ticket || 0,
      m.units_sold || 0, m.cancellations || 0, m.returns || 0,
    ]);
  }
  console.log(`[Metrics] ✓ Snapshots calculados para ${channels.length} canales`);
}

// ============================================================
// JOB 7: EVALUACIÓN DE ALERTAS (corre cada 15 min)
// ============================================================
export async function evaluateAlerts() {
  // 1. Caída de ventas: canal sin órdenes en 3+ horas en horario comercial
  const hour = new Date().getHours();
  if (hour >= 9 && hour <= 21) {
    const { rows } = await db.query(`
      SELECT c.id, c.name FROM channels c
      WHERE c.active = true
        AND NOT EXISTS (
          SELECT 1 FROM orders o
          WHERE o.channel_id = c.id
            AND o.created_at >= NOW() - INTERVAL '3 hours'
        )
    `);
    for (const ch of rows) {
      await db.query(`
        INSERT INTO alerts(type,severity,message,detail,channel_id)
        SELECT 'sales_drop','critical',$1,$2,$3
        WHERE NOT EXISTS (
          SELECT 1 FROM alerts
          WHERE type='sales_drop' AND channel_id=$3
            AND resolved=false AND created_at >= NOW()-INTERVAL '4 hours'
        )
      `, [`${ch.name}: sin ventas en 3+ horas`, `Hora: ${hour}:00`, ch.id]);
    }
  }

  // 2. Spike de cancelaciones (>15%)
  const { rows: cancelStats } = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE is_canceled) * 100.0 / NULLIF(COUNT(*), 0) AS cancel_pct
    FROM orders WHERE created_at >= CURRENT_DATE
  `);
  if (cancelStats[0]?.cancel_pct > 15) {
    await db.query(`
      INSERT INTO alerts(type,severity,message)
      VALUES('high_cancellations','high',$1)
    `, [`Cancelaciones: ${parseFloat(cancelStats[0].cancel_pct).toFixed(1)}% hoy (umbral: 15%)`]);
  }

  // 3. Sync fallida 2+ veces seguidas
  const { rows: failedSyncs } = await db.query(`
    SELECT source FROM sync_log
    WHERE status='error' AND started_at >= NOW()-INTERVAL '2 hours'
    GROUP BY source HAVING COUNT(*) >= 2
  `);
  for (const s of failedSyncs) {
    await db.query(`
      INSERT INTO alerts(type,severity,message)
      VALUES('sync_failed','critical',$1)
    `, [`Sync ${s.source} fallida 2+ veces en 2 horas`]);
  }

  console.log('[Alerts] ✓ Evaluación completada');
}

// ============================================================
// ENTRYPOINT — determina qué job correr según argumento
// ============================================================
const job = process.argv[2];
(async () => {
  try {
    if (job === 'vtex') await syncVTEX();
    else if (job === 'meli_1') await syncMeliAccount('1');
    else if (job === 'meli_2') await syncMeliAccount('2');
    else if (job === 'kommo') await syncKommo();
    else if (job === 'logistics') await syncLogistics();
    else if (job === 'sheets') await importGoogleSheets();
    else if (job === 'metrics') await calculateMetrics();
    else if (job === 'alerts') await evaluateAlerts();
    else if (job === 'all') {
      await Promise.all([syncVTEX(), syncMeliAccount('1'), syncMeliAccount('2')]);
      await calculateMetrics();
      await evaluateAlerts();
    }
    else console.error('Job desconocido:', job);
  } catch (e) {
    console.error(`[${job}] ERROR:`, e.message);
    process.exit(1);
  } finally {
    await db.end();
  }
})();
