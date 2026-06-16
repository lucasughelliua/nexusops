import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getChannelConfig } from "@/lib/integrations/credentials";
import { createGoogleSheetsClient } from "@/lib/integrations/google-sheets";
import type { GoogleAdsCampaign } from "@/lib/integrations/google-sheets";

/**
 * Mock data generators — used when credentials are not configured
 */
function mockCampaigns(): GoogleAdsCampaign[] {
  return [
    {
      id: "google_1",
      name: "Search — Conversiones Generales",
      spend: 145000,
      impressions: 287000,
      clicks: 8640,
      conversions: 285,
      ctr: 3.01,
      cpa: 508.77,
      roas: 2.45,
      status: "ACTIVE",
    },
    {
      id: "google_2",
      name: "Display — Remarketing",
      spend: 52000,
      impressions: 580000,
      clicks: 1856,
      conversions: 145,
      ctr: 0.32,
      cpa: 358.62,
      roas: 3.15,
      status: "ACTIVE",
    },
    {
      id: "google_3",
      name: "Shopping — Top Productos",
      spend: 98000,
      impressions: 156000,
      clicks: 4680,
      conversions: 198,
      ctr: 3.0,
      cpa: 495.96,
      roas: 2.85,
      status: "ACTIVE",
    },
    {
      id: "google_4",
      name: "Video — YouTube Awareness",
      spend: 67000,
      impressions: 342000,
      clicks: 2048,
      conversions: 87,
      ctr: 0.6,
      cpa: 770.12,
      roas: 1.95,
      status: "PAUSED",
    },
  ];
}

const CACHE_MS = 5 * 60 * 1000; // 5 minutes
let cachedData: {
  data: any;
  expires: number;
} | null = null;

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
    // Check cache
    if (cachedData && cachedData.expires > Date.now()) {
      return NextResponse.json(cachedData.data, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const config = await getChannelConfig("google");

    let campaigns: GoogleAdsCampaign[];
    let isMock = false;

    if (config && config.scriptUrl && config.token) {
      try {
        const client = createGoogleSheetsClient(config);
        campaigns = await client.getCampaigns(dateFrom, dateTo);
      } catch (error) {
        console.error("Error fetching from Google Sheets, falling back to mock:", error);
        campaigns = mockCampaigns();
        isMock = true;
      }
    } else {
      campaigns = mockCampaigns();
      isMock = true;
    }

    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
    const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
    const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
    const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
    const avgCTR =
      totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgCPA =
      totalConversions > 0 ? totalSpend / totalConversions : 0;
    const avgROAS =
      totalSpend > 0 ? campaigns.reduce((s, c) => s + c.roas * c.spend, 0) / totalSpend : 0;

    const responseData = {
      campaigns,
      summary: {
        totalSpend,
        totalImpressions,
        totalClicks,
        totalConversions,
        avgCTR,
        avgCPA,
        avgROAS,
      },
      isMock,
    };

    // Cache for 5 minutes
    cachedData = {
      data: responseData,
      expires: Date.now() + CACHE_MS,
    };

    return NextResponse.json(responseData, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    console.error("Error fetching Google Sheets data:", error);
    // Return mock on error
    const campaigns = mockCampaigns();

    return NextResponse.json(
      {
        campaigns,
        summary: {
          totalSpend: campaigns.reduce((s, c) => s + c.spend, 0),
          totalImpressions: campaigns.reduce((s, c) => s + c.impressions, 0),
          totalClicks: campaigns.reduce((s, c) => s + c.clicks, 0),
          totalConversions: campaigns.reduce((s, c) => s + c.conversions, 0),
          avgCTR: 0,
          avgCPA: 0,
          avgROAS: 0,
        },
        isMock: true,
        error: error?.message,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
