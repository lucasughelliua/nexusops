import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createIntegrationClient } from "@/lib/integrations";
import { getChannelConfig } from "@/lib/integrations/credentials";
import { CHANNEL_PLATFORM } from "@/lib/integrations/credentials";

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
    : ["meta", "perfit", "google", "kommo"];

  for (const ch of channels) {
    try {
      // Mapear nombre del canal a configuración
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
        case "kommo":
          config = await getChannelConfig("kommo");
          channelLabel = "Kommo CRM";
          platform = CHANNEL_PLATFORM["kommo"];
          break;
      }

      if (!config || !platform) continue;

      const client = createIntegrationClient(platform, config);

      // Traer campañas según plataforma
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
      }
    } catch (error) {
      console.warn(`Error fetching ${ch} campaigns:`, error);
      continue;
    }
  }

  return NextResponse.json({
    campaigns,
    total: campaigns.length,
  });
}
