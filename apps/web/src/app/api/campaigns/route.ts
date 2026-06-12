import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createIntegrationClient } from "@/lib/integrations";
import { getChannelConfig, setChannelSyncStatus } from "@/lib/integrations/credentials";
import { CHANNEL_PLATFORM } from "@/lib/integrations/credentials";
import { MOCK_CAMPAIGNS } from "./mock";

interface Campaign {
  id: string;
  channel: string;
  channelKey: string;
  name: string;
  spend: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  leads?: number;
  status: string;
  roi?: number;
  roas?: number;
  cpc?: number;
  cpm?: number;
  ctr?: number;
  conversionRate?: number;
}

/**
 * GET /api/campaigns
 * Traer campañas de Meta, Perfit, Google Ads y Kommo
 * Query params: channel=meta|perfit|google|kommo (optional, default: all)
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const channel = request.nextUrl.searchParams.get("channel");
  const campaigns: Campaign[] = [];

  const channels = channel
    ? [channel as string]
    : ["meta", "perfit", "google"];

  for (const ch of channels) {
    try {
      let config: any = null;
      let channelLabel = "";
      let platform;

      switch (ch) {
        case "meta":
          config = await getChannelConfig("meta");
          channelLabel = "Meta Ads";
          platform = CHANNEL_PLATFORM["meta"];
          break;
        case "perfit":
          config = await getChannelConfig("perfit");
          channelLabel = "Perfit";
          platform = CHANNEL_PLATFORM["perfit"];
          break;
        case "google":
          config = await getChannelConfig("google");
          channelLabel = "Google Ads";
          platform = CHANNEL_PLATFORM["google"];
          break;
      }

      // Si hay credenciales configuradas, traer datos reales
      if (config && platform) {
        try {
          const client = createIntegrationClient(platform, config);

          if (ch === "meta") {
            const metaClient = client as any;
            const metaCampaigns = await metaClient.getCampaigns();
            campaigns.push(
              ...metaCampaigns.map((c: any) => ({
                id: c.id,
                channel: channelLabel,
                channelKey: "meta",
                name: c.name,
                spend: c.spend,
                impressions: c.impressions,
                clicks: c.clicks,
                conversions: c.conversions,
                status: c.status,
                cpc: c.cpc,
                cpm: c.cpm,
                ctr: c.ctr,
                conversionRate: c.conversionRate,
              }))
            );
          } else if (ch === "perfit") {
            const perfitClient = client as any;
            const perfitCampaigns = await perfitClient.getCampaigns();
            campaigns.push(
              ...perfitCampaigns.map((c: any) => ({
                id: c.id,
                channel: channelLabel,
                channelKey: "perfit",
                name: c.name,
                spend: c.spent,
                leads: c.leads,
                roi: c.roi,
                roas: c.roas,
                status: c.status,
              }))
            );
          } else if (ch === "google") {
            const googleClient = client as any;
            const metrics = await googleClient.getMetrics({
              startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              endDate: new Date(),
            });
            // Parse mock data from Google Sheets
            campaigns.push(
              ...MOCK_CAMPAIGNS.google.map((c: any) => ({
                ...c,
                channel: channelLabel,
                channelKey: "google",
              }))
            );
          }
        } catch (error: any) {
          console.warn(`Error fetching real ${ch} campaigns:`, error);
          // Guardamos el error para que se vea en la pestaña Integraciones
          const message =
            error?.originalError?.response?.data?.error?.message ||
            error?.response?.data?.error?.message ||
            error?.message ||
            String(error);
          await setChannelSyncStatus(ch as any, "ERROR", `Error al traer campañas: ${message}`);
          // Fallback to mock data
          const mockData = (MOCK_CAMPAIGNS as any)[ch] || [];
          campaigns.push(
            ...mockData.map((c: any) => ({
              ...c,
              channel: channelLabel,
              channelKey: ch,
            }))
          );
        }
      } else {
        // Sin credenciales, usar mock data
        const mockData = (MOCK_CAMPAIGNS as any)[ch] || [];
        campaigns.push(
          ...mockData.map((c: any) => ({
            ...c,
            channel: channelLabel,
            channelKey: ch,
          }))
        );
      }
    } catch (error) {
      console.warn(`Error fetching ${ch} campaigns:`, error);
    }
  }

  return NextResponse.json({
    campaigns,
    total: campaigns.length,
  });
}
