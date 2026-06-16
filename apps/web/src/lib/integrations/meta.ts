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

export interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversionRate: number;
}

export interface MetaAd {
  id: string;
  name: string;
  status: string;
  adSetId: string;
  adSetName: string;
  campaignId: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpm: number;
  thumbnailUrl?: string;
}

export interface MetaPageInsights {
  fbFollowers: number;
  fbPageLikes: number;
  igFollowers: number;
  igMediaCount: number;
  igUsername: string;
  fbPageName: string;
}

/** Build the insights field string for a given date range */
function buildInsightsField(
  metrics: string,
  dateFrom?: Date,
  dateTo?: Date
): string {
  if (dateFrom && dateTo) {
    const since = dateFrom.toISOString().split("T")[0];
    const until = dateTo.toISOString().split("T")[0];
    return `insights.time_range({'since':'${since}','until':'${until}'}){${metrics}}`;
  }
  return `insights.date_preset(maximum){${metrics}}`;
}

/** Parse actions array for purchase conversions */
function parseConversions(actions?: { action_type: string; value: string }[]): number {
  if (!actions) return 0;
  const hit = actions.find(
    (a) => a.action_type === "purchase" || a.action_type === "omni_purchase"
  );
  return hit ? parseInt(hit.value || "0") : 0;
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
      baseURL: "https://graph.facebook.com/v18.0",
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
      const insightsField = buildInsightsField(
        "spend,impressions,clicks,actions",
        dateFrom,
        dateTo
      );

      const params: Record<string, any> = {
        fields: `id,name,status,${insightsField}`,
        effective_status: JSON.stringify(["ACTIVE", "PAUSED"]),
      };

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
          const conversions = parseConversions(insights.actions);

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

  async getAdSets(dateFrom?: Date, dateTo?: Date): Promise<MetaAdSet[]> {
    try {
      const insightsField = buildInsightsField(
        "spend,impressions,clicks,actions,ctr,cpc,cpm",
        dateFrom,
        dateTo
      );

      const params: Record<string, any> = {
        fields: `id,name,status,campaign_id,campaign{name},${insightsField}`,
        effective_status: JSON.stringify(["ACTIVE", "PAUSED"]),
        limit: 200,
      };

      const response = await this.client.get(`/act_${this.adAccountId}/adsets`, {
        params,
      });

      const adsets: MetaAdSet[] = [];

      if (response.data?.data) {
        for (const adset of response.data.data) {
          const insights = adset.insights?.data?.[0] || {};
          const spend = parseFloat(insights.spend || "0");
          const impressions = parseInt(insights.impressions || "0");
          const clicks = parseInt(insights.clicks || "0");
          const conversions = parseConversions(insights.actions);
          const ctr = parseFloat(insights.ctr || "0");
          const cpc = parseFloat(insights.cpc || "0");
          const cpm = parseFloat(insights.cpm || "0");

          adsets.push({
            id: adset.id,
            name: adset.name,
            status: adset.status,
            campaignId: adset.campaign_id || "",
            campaignName: adset.campaign?.name || "",
            spend,
            impressions,
            clicks,
            conversions,
            ctr: ctr > 0 ? ctr : impressions > 0 ? (clicks / impressions) * 100 : 0,
            cpc: cpc > 0 ? cpc : clicks > 0 ? spend / clicks : 0,
            cpm: cpm > 0 ? cpm : impressions > 0 ? (spend / impressions) * 1000 : 0,
            conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
          });
        }
      }

      return adsets;
    } catch (error) {
      throw new IntegrationError(
        this.platform,
        "Failed to fetch Meta ad sets",
        axios.isAxiosError(error) ? error.response?.status : undefined,
        error
      );
    }
  }

  async getAds(dateFrom?: Date, dateTo?: Date): Promise<MetaAd[]> {
    try {
      const insightsField = buildInsightsField(
        "spend,impressions,clicks,actions,ctr,cpc,cpm",
        dateFrom,
        dateTo
      );

      const params: Record<string, any> = {
        fields: `id,name,status,adset_id,adset{name},campaign_id,creative{thumbnail_url},${insightsField}`,
        effective_status: JSON.stringify(["ACTIVE", "PAUSED"]),
        limit: 200,
      };

      const response = await this.client.get(`/act_${this.adAccountId}/ads`, {
        params,
      });

      const ads: MetaAd[] = [];

      if (response.data?.data) {
        for (const ad of response.data.data) {
          const insights = ad.insights?.data?.[0] || {};
          const spend = parseFloat(insights.spend || "0");
          const impressions = parseInt(insights.impressions || "0");
          const clicks = parseInt(insights.clicks || "0");
          const conversions = parseConversions(insights.actions);
          const ctr = parseFloat(insights.ctr || "0");
          const cpc = parseFloat(insights.cpc || "0");
          const cpm = parseFloat(insights.cpm || "0");

          ads.push({
            id: ad.id,
            name: ad.name,
            status: ad.status,
            adSetId: ad.adset_id || "",
            adSetName: ad.adset?.name || "",
            campaignId: ad.campaign_id || "",
            spend,
            impressions,
            clicks,
            conversions,
            ctr: ctr > 0 ? ctr : impressions > 0 ? (clicks / impressions) * 100 : 0,
            cpc: cpc > 0 ? cpc : clicks > 0 ? spend / clicks : 0,
            cpm: cpm > 0 ? cpm : impressions > 0 ? (spend / impressions) * 1000 : 0,
            thumbnailUrl: ad.creative?.thumbnail_url,
          });
        }
      }

      return ads;
    } catch (error) {
      throw new IntegrationError(
        this.platform,
        "Failed to fetch Meta ads",
        axios.isAxiosError(error) ? error.response?.status : undefined,
        error
      );
    }
  }

  async getPageInsights(): Promise<MetaPageInsights> {
    const empty: MetaPageInsights = {
      fbFollowers: 0,
      fbPageLikes: 0,
      igFollowers: 0,
      igMediaCount: 0,
      igUsername: "",
      fbPageName: "",
    };

    try {
      const pagesRes = await this.client.get("/me/accounts", {
        params: { fields: "name,fan_count,followers_count" },
      });

      const pages: any[] = pagesRes.data?.data || [];
      if (pages.length === 0) return empty;

      const page = pages[0];
      const result: MetaPageInsights = {
        ...empty,
        fbPageName: page.name || "",
        fbPageLikes: parseInt(page.fan_count || "0"),
        fbFollowers: parseInt(page.followers_count || page.fan_count || "0"),
      };

      // Try to get associated IG business account
      try {
        const igRes = await this.client.get(`/${page.id}`, {
          params: {
            fields:
              "instagram_business_account{id,name,username,followers_count,media_count}",
          },
        });
        const ig = igRes.data?.instagram_business_account;
        if (ig) {
          result.igFollowers = parseInt(ig.followers_count || "0");
          result.igMediaCount = parseInt(ig.media_count || "0");
          result.igUsername = ig.username || "";
        }
      } catch {
        // IG account not available — keep zeros
      }

      return result;
    } catch {
      return empty;
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
