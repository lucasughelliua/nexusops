// ============================================================
// JOB: SYNC PERFIT
// ============================================================

export async function syncPerfit() {
  const source = 'perfit';
  const logId = await startSyncLog(source);

  const apiKey = process.env.PERFIT_API_KEY?.trim();
  const account = process.env.PERFIT_ACCOUNT?.trim();

  if (!apiKey) {
    throw new Error('Falta PERFIT_API_KEY en GitHub Secrets');
  }

  if (!account) {
    throw new Error('Falta PERFIT_ACCOUNT en GitHub Secrets');
  }

  const lastSync = await getLastSync(source);

  const daysBack = parseInt(process.env.PERFIT_DAYS_BACK || '30');

  const dateFrom = lastSync
    ? new Date(new Date(lastSync) - 86400000)
        .toISOString()
        .split('T')[0]
    : new Date(Date.now() - 86400000 * daysBack)
        .toISOString()
        .split('T')[0];

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const baseUrl = `https://api.myperfit.com/v2/${account}`;

  console.log('[Perfit] API key cargada:', !!apiKey);
  console.log('[Perfit] Account:', account);
  console.log('[Perfit] Base URL:', baseUrl);
  console.log(`[Perfit] Sincronizando desde ${dateFrom}`);

  let totalCampaigns = 0;
  let totalMetrics = 0;

  // Obtener canal Perfit
  let {
    rows: [channel],
  } = await db.query(
    `SELECT id FROM channels WHERE type='other' AND name='Perfit'`
  );

  if (!channel) {
    const {
      rows: [c],
    } = await db.query(`
      INSERT INTO channels(name,type,active)
      VALUES('Perfit','other',true)
      RETURNING id
    `);

    channel = c;
  }

  // ============================================================
  // OBTENER MAILINGS
  // ============================================================

  let page = 1;

  while (true) {
    const url = `${baseUrl}/mailings?offset=${(page - 1) * 50}&limit=50`;

    console.log('[Perfit] Fetch:', url);

    const res = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const errorText = await res.text();

      throw new Error(
        `Perfit API error: ${res.status} ${errorText}`
      );
    }

    const data = await res.json();

    console.log(
      '[Perfit] Respuesta recibida:',
      JSON.stringify(data).slice(0, 500)
    );

    const mailings =
      data.data ||
      data.mailings ||
      data.items ||
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
        m.created_at;

      if (sentAt && new Date(sentAt) < new Date(dateFrom)) {
        continue;
      }

      // ========================================================
      // GUARDAR CAMPAÑA
      // ========================================================

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
        VALUES ($1,$2,$3,$4,$5,$6,$7)

        ON CONFLICT (external_id, source)
        DO UPDATE SET
          status=EXCLUDED.status,
          name=EXCLUDED.name,
          synced_at=NOW()
      `, [
        String(m.id),
        source,
        channel.id,
        m.name || m.subject || `Campaña ${m.id}`,
        m.status || 'sent',
        sentAt || new Date().toISOString(),
        sentAt || new Date().toISOString(),
      ]);

      totalCampaigns++;

      // ========================================================
      // STATS DEL MAILING
      // ========================================================

      const statsUrl = `${baseUrl}/mailings/${m.id}/stats`;

      console.log('[Perfit] Stats:', statsUrl);

      const statsRes = await fetch(statsUrl, {
        method: 'GET',
        headers,
      });

      if (!statsRes.ok) {
        console.warn(
          `[Perfit] Error stats ${m.id}:`,
          statsRes.status
        );
        continue;
      }

      const stats = await statsRes.json();

      const {
        rows: [camp],
      } = await db.query(`
        SELECT id
        FROM marketing_campaigns
        WHERE external_id=$1
        AND source='perfit'
      `, [String(m.id)]);

      if (!camp) continue;

      const campaignDate = sentAt
        ? sentAt.split('T')[0]
        : new Date().toISOString().split('T')[0];

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
          unique_clicks,
          unsubscribes,
          bounces_soft,
          bounces_hard,
          spam_reports
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
        )

        ON CONFLICT (campaign_id, date)
        DO UPDATE SET
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
        camp.id,
        source,
        campaignDate,
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

      await new Promise((r) => setTimeout(r, 150));
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
    lastDate: new Date().toISOString(),
  });

  console.log(
    `[Perfit] ✓ ${totalCampaigns} campañas, ${totalMetrics} registros de métricas`
  );
}
