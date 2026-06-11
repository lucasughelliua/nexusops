import { NextRequest, NextResponse } from "next/server";

type RouteParams = {
  params: {
    channel: string;
  };
};

function generateMeta() {
  const spend = Math.round(420000 + Math.random() * 60000);
  const impressions = Math.round(1150000 + Math.random() * 250000);
  const clicks = Math.round(17500 + Math.random() * 3000);
  const conversions = Math.round(300 + Math.random() * 60);
  const revenue = Math.round(1950000 + Math.random() * 350000);
  const leads = Math.round(conversions * 1.4);

  return {
    totals: {
      spend,
      impressions,
      clicks,
      ctr: Number(((clicks / impressions) * 100).toFixed(2)),
      conversions,
      leads,
      revenue,
      roas: Number((revenue / spend).toFixed(2)),
      cpa: Number((spend / conversions).toFixed(2)),
      cpm: Number(((spend / impressions) * 1000).toFixed(2)),
    },
    campaigns: [
      { id: "c1", name: "Conversiones — Catálogo completo", status: "ACTIVE", spend: Math.round(spend * 0.32), impressions: Math.round(impressions * 0.30), clicks: Math.round(clicks * 0.33), conversions: Math.round(conversions * 0.35), roas: 4.8 },
      { id: "c2", name: "Retargeting — Carritos abandonados", status: "ACTIVE", spend: Math.round(spend * 0.22), impressions: Math.round(impressions * 0.18), clicks: Math.round(clicks * 0.25), conversions: Math.round(conversions * 0.30), roas: 6.1 },
      { id: "c3", name: "Prospecting — Lookalike 1%", status: "ACTIVE", spend: Math.round(spend * 0.28), impressions: Math.round(impressions * 0.34), clicks: Math.round(clicks * 0.27), conversions: Math.round(conversions * 0.20), roas: 3.2 },
      { id: "c4", name: "Branding — Awareness Q2", status: "PAUSED", spend: Math.round(spend * 0.18), impressions: Math.round(impressions * 0.18), clicks: Math.round(clicks * 0.15), conversions: Math.round(conversions * 0.15), roas: 1.9 },
    ],
  };
}

function generatePerfit() {
  const sent = 48000 + Math.round(Math.random() * 5000);
  const delivered = Math.round(sent * 0.972);
  const opened = Math.round(delivered * (0.30 + Math.random() * 0.06));
  const clicked = Math.round(opened * (0.16 + Math.random() * 0.05));
  const unsubscribed = Math.round(sent * 0.0028);

  return {
    totals: {
      sent,
      delivered,
      opened,
      clicked,
      unsubscribed,
      open_rate: Number(((opened / delivered) * 100).toFixed(1)),
      click_rate: Number(((clicked / delivered) * 100).toFixed(1)),
    },
  };
}

function generateGoogle() {
  const spend = Math.round(260000 + Math.random() * 40000);
  const impressions = Math.round(390000 + Math.random() * 60000);
  const clicks = Math.round(9200 + Math.random() * 1800);
  const conversions = Math.round(135 + Math.random() * 35);
  const revenue = Math.round(920000 + Math.random() * 180000);

  return {
    totals: {
      spend,
      clicks,
      impressions,
      conversions,
      revenue,
      roas: Number((revenue / spend).toFixed(2)),
    },
  };
}

function generateKommo() {
  const new_leads = 170 + Math.round(Math.random() * 30);
  const won_leads = Math.round(new_leads * (0.42 + Math.random() * 0.08));
  const lost_leads = Math.round(new_leads * (0.18 + Math.random() * 0.06));
  const open_leads = Math.max(0, new_leads - won_leads - lost_leads);

  return {
    totals: {
      new_leads,
      open_leads,
      won_leads,
      lost_leads,
      revenue: Math.round(1350000 + Math.random() * 250000),
      conversion_rate: Number(((won_leads / new_leads) * 100).toFixed(1)),
    },
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { channel } = params;

    let data;
    switch (channel) {
      case "meta":
        data = generateMeta();
        break;
      case "perfit":
        data = generatePerfit();
        break;
      case "google":
        data = generateGoogle();
        break;
      case "kommo":
        data = generateKommo();
        break;
      default:
        return NextResponse.json({ error: "Unknown channel" }, { status: 404 });
    }

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error fetching marketing data:", error);
    return NextResponse.json(
      { error: "Error fetching marketing data" },
      { status: 500 }
    );
  }
}
