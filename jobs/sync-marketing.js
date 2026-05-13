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
