import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getChannelConfig } from "@/lib/integrations/credentials";
import { createMetaClient } from "@/lib/integrations/meta";
import type { MetaCampaign, MetaAdSet, MetaAd, MetaPageInsights } from "@/lib/integrations/meta";

/** Mock data generators — used when credentials are not configured */
function mockCampaigns(): MetaCampaign[] {
  const base = 420000 + Math.round(Math.random() * 60000);
  return [
    { id: "c1", name: "Conversiones — Catálogo completo", status: "ACTIVE", spend: Math.round(base * 0.32), impressions: 345000, clicks: 5775, conversions: 105, ctr: 1.67, cpc: 18.7, cpm: 17.5, conversionRate: 1.82 },
    { id: "c2", name: "Retargeting — Carritos abandonados", status: "ACTIVE", spend: Math.round(base * 0.22), impressions: 207000, clicks: 4375, conversions: 90, ctr: 2.11, cpc: 21.2, cpm: 23.3, conversionRate: 2.06 },
    { id: "c3", name: "Prospecting — Lookalike 1%", status: "ACTIVE", spend: Math.round(base * 0.28), impressions: 391000, clicks: 4725, conversions: 60, ctr: 1.21, cpc: 24.9, cpm: 30.1, conversionRate: 1.27 },
    { id: "c4", name: "Branding — Awareness Q2", status: "PAUSED", spend: Math.round(base * 0.18), impressions: 207000, clicks: 2625, conversions: 45, ctr: 1.27, cpc: 28.9, cpm: 36.5, conversionRate: 1.71 },
  ];
}

function mockAdSets(): MetaAdSet[] {
  return [
    { id: "as1", name: "Intereses — Aventura", status: "ACTIVE", campaignId: "c1", campaignName: "Conversiones — Catálogo completo", spend: 68000, impressions: 115000, clicks: 1925, conversions: 35, ctr: 1.67, cpc: 35.3, cpm: 591, conversionRate: 1.82 },
    { id: "as2", name: "Lookalike 1% Compradores", status: "ACTIVE", campaignId: "c3", campaignName: "Prospecting — Lookalike 1%", spend: 58000, impressions: 130333, clicks: 1575, conversions: 20, ctr: 1.21, cpc: 36.8, cpm: 445, conversionRate: 1.27 },
    { id: "as3", name: "Retargeting — Visitas 30d", status: "ACTIVE", campaignId: "c2", campaignName: "Retargeting — Carritos abandonados", spend: 48000, impressions: 69000, clicks: 1458, conversions: 30, ctr: 2.11, cpc: 32.9, cpm: 696, conversionRate: 2.06 },
    { id: "as4", name: "18-35 Mujeres", status: "ACTIVE", campaignId: "c1", campaignName: "Conversiones — Catálogo completo", spend: 43000, impressions: 115000, clicks: 1925, conversions: 35, ctr: 1.67, cpc: 22.3, cpm: 374, conversionRate: 1.82 },
    { id: "as5", name: "Intereses — Deportes", status: "PAUSED", campaignId: "c4", campaignName: "Branding — Awareness Q2", spend: 38000, impressions: 103500, clicks: 1313, conversions: 23, ctr: 1.27, cpc: 29.0, cpm: 367, conversionRate: 1.75 },
  ];
}

function mockAds(): MetaAd[] {
  return [
    { id: "a1", name: "Video — Verano 2024", status: "ACTIVE", adSetId: "as1", adSetName: "Intereses — Aventura", campaignId: "c1", spend: 38000, impressions: 65000, clicks: 1085, conversions: 20, ctr: 1.67, cpc: 35.0, cpm: 585 },
    { id: "a2", name: "Carrusel — Top 5 Productos", status: "ACTIVE", adSetId: "as1", adSetName: "Intereses — Aventura", campaignId: "c1", spend: 30000, impressions: 50000, clicks: 840, conversions: 15, ctr: 1.68, cpc: 35.7, cpm: 600 },
    { id: "a3", name: "Imagen estática — Oferta", status: "ACTIVE", adSetId: "as2", adSetName: "Lookalike 1% Compradores", campaignId: "c3", spend: 28000, impressions: 62000, clicks: 750, conversions: 9, ctr: 1.21, cpc: 37.3, cpm: 452 },
    { id: "a4", name: "Retargeting — Carrito", status: "ACTIVE", adSetId: "as3", adSetName: "Retargeting — Visitas 30d", campaignId: "c2", spend: 25000, impressions: 35000, clicks: 738, conversions: 15, ctr: 2.11, cpc: 33.9, cpm: 714 },
    { id: "a5", name: "Story — Descuento 20%", status: "ACTIVE", adSetId: "as4", adSetName: "18-35 Mujeres", campaignId: "c1", spend: 22000, impressions: 58000, clicks: 975, conversions: 17, ctr: 1.68, cpc: 22.6, cpm: 379 },
  ];
}

function mockPage(): MetaPageInsights {
  return {
    fbFollowers: 24800,
    fbPageLikes: 23500,
    igFollowers: 18300,
    igMediaCount: 412,
    igUsername: "universoaventura",
    fbPageName: "Universo Aventura",
  };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  let dateFrom: Date | undefined;
  let dateTo: Date | undefined;

  if (fromStr && toStr) {
    dateFrom = new Date(fromStr + "T00:00:00-03:00");
    dateTo = new Date(toStr + "T23:59:59-03:00");
  } else {
    // Default: last 30 days
    dateTo = new Date();
    dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  try {
    const config = await getChannelConfig("meta");

    let campaigns: MetaCampaign[];
    let adsets: MetaAdSet[];
    let ads: MetaAd[];
    let page: MetaPageInsights;

    if (config) {
      const client = createMetaClient(config);
      [campaigns, adsets, ads, page] = await Promise.all([
        client.getCampaigns(dateFrom, dateTo),
        client.getAdSets(dateFrom, dateTo),
        client.getAds(dateFrom, dateTo),
        client.getPageInsights(),
      ]);
    } else {
      campaigns = mockCampaigns();
      adsets = mockAdSets();
      ads = mockAds();
      page = mockPage();
    }

    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
    const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
    const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
    const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
    const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const avgROAS = 0; // Would need revenue data

    return NextResponse.json(
      {
        campaigns,
        adsets,
        ads,
        page,
        summary: {
          totalSpend,
          totalImpressions,
          totalClicks,
          totalConversions,
          avgCTR,
          avgCPC,
          avgROAS,
        },
        isMock: !config,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("Error fetching Meta full data:", error);
    // Return mock on error
    const campaigns = mockCampaigns();
    const adsets = mockAdSets();
    const ads = mockAds();
    const page = mockPage();

    return NextResponse.json(
      {
        campaigns,
        adsets,
        ads,
        page,
        summary: {
          totalSpend: campaigns.reduce((s, c) => s + c.spend, 0),
          totalImpressions: campaigns.reduce((s, c) => s + c.impressions, 0),
          totalClicks: campaigns.reduce((s, c) => s + c.clicks, 0),
          totalConversions: campaigns.reduce((s, c) => s + c.conversions, 0),
          avgCTR: 0,
          avgCPC: 0,
          avgROAS: 0,
        },
        isMock: true,
        error: error?.message,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
