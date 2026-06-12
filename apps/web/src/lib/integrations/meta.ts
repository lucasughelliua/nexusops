import axios, { AxiosInstance } from "axios";
import {
  IntegrationClient,
  IntegrationError,
  MetricsOptions,
  MetricData,
  CredentialValue,
} from "./types";
import { Platform } from "@prisma/client";

interface MetaCredentials {
  adAccountId: string;
  accessToken: string;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpc: number;
  cpm: number;
  ctr: number;
  conversionRate: number;
}

export class MetaClient implements IntegrationClient {
  platform = Platform.META;
  private client: AxiosInstance;
  private adAccountId: string;

  constructor(credentials: MetaCredentials) {
    // Limpiar el Ad Account ID - soporta varios formatos
    let id = credentials.adAccountId.trim();
    id = id.replace(/^act[_=]/, ""); // Remover "act_" o "act=" del inicio
    this.adAccountId = id;

    this.client = axios.create({
      baseURL: "https://graph.instagram.com/v18.0",
      params: {
        access_token: credentials.accessToken,
      },
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get(`/act_${this.adAccountId}`, {
        params: { fields: "id,name" },
      });
      return response.status === 200;
    } catch (error) {
      throw new IntegrationError(
        this.platform,
        "Failed to connect to Meta",
        axios.isAxiosError(error) ? error.response?.status : undefined,
        error
      );
    }
  }

  async getCampaigns(dateFrom?: Date, dateTo?: Date): Promise<MetaCampaign[]> {
    try {
      const params: Record<string, any> = {
        fields: "id,name,status,insights.date_preset(lifetime){spend,impressions,clicks,actions}",
      };

      if (dateFrom && dateTo) {
        params.effective_status = ["ACTIVE", "PAUSED"];
        params.time_range = {
          since: dateFrom.toISOString().split("T")[0],
          until: dateTo.toISOString().split("T")[0],
        };
      }

      const response = await this.client.get(`/act_${this.adAccountId}/campaigns`, {
        params,
      });

      const campaigns: MetaCampaign[] = [];

      if (response.data?.data) {
        for (const campaign of response.data.data) {
          const insights = campaign.insights?.data?.[0] || {};
          const spend = parseFloat(insights.spend || "0");
          const impressions = parseInt(insights.impressions || "0");
          const clicks = parseInt(insights.clicks || "0");
          const conversions = parseInt(
            insights.actions?.find((a: any) => a.action_type === "purchase")?.value || "0"
          );

          campaigns.push({
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            spend,
            impressions,
            clicks,
            conversions,
            cpc: clicks > 0 ? spend / clicks : 0,
            cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
            ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
            conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
          });
        }
      }

      return campaigns;
    } catch (error) {
      throw new IntegrationError(
        this.platform,
        "Failed to fetch Meta campaigns",
        axios.isAxiosError(error) ? error.response?.status : undefined,
        error
      );
    }
  }

  async validateCredentials(creds: CredentialValue): Promise<boolean> {
    try {
      const credentials = this.parseCredentials(creds);
      const testClient = new MetaClient(credentials);
      return await testClient.testConnection();
    } catch {
      return false;
    }
  }

  async getMetrics(options: MetricsOptions): Promise<MetricData[]> {
    const campaigns = await this.getCampaigns(options.startDate, options.endDate);
    return campaigns.map((c) => ({
      metricType: "campaign_spend",
      value: c.spend,
      date: new Date(),
      dimensions: {
        campaignId: c.id,
        campaignName: c.name,
        platform: "meta",
      },
      rawData: c,
    }));
  }

  private parseCredentials(creds: CredentialValue): MetaCredentials {
    const parsed = typeof creds === "string" ? JSON.parse(creds) : creds;
    return {
      adAccountId: parsed.adAccountId,
      accessToken: parsed.accessToken,
    };
  }
}

export function createMetaClient(credentials: CredentialValue): MetaClient {
  const creds = typeof credentials === "string" ? JSON.parse(credentials) : credentials;
  return new MetaClient({
    adAccountId: creds.adAccountId,
    accessToken: creds.accessToken,
  });
}
