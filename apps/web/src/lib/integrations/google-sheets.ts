import axios, { AxiosInstance } from "axios";
import {
  IntegrationClient,
  IntegrationError,
  MetricsOptions,
  MetricData,
  CredentialValue,
} from "./types";
import { Platform } from "@prisma/client";

export interface GoogleSheetsCredentials {
  scriptUrl: string;
  token: string;
}

export interface GoogleAdsCampaign {
  id: string;
  name: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr: number;
  cpa: number;
  roas: number;
  status: string;
}

/**
 * Generates a consistent ID from a campaign name using a simple hash
 */
function generateCampaignId(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    const char = name.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `google_${Math.abs(hash).toString(16)}`;
}

/**
 * Safely converts value to number
 */
function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export class GoogleSheetsClient implements IntegrationClient {
  platform = Platform.GOOGLE_ADS;
  private scriptUrl: string;
  private token: string;
  private client: AxiosInstance;

  constructor(credentials: GoogleSheetsCredentials) {
    this.scriptUrl = credentials.scriptUrl;
    this.token = credentials.token;

    this.client = axios.create({
      timeout: 30000,
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get(this.scriptUrl, {
        params: { token: this.token },
      });

      return response.status === 200 && response.data?.ok === true;
    } catch (error) {
      throw new IntegrationError(
        this.platform,
        "Failed to connect to Google Sheets AppScript",
        axios.isAxiosError(error) ? error.response?.status : undefined,
        error
      );
    }
  }

  async validateCredentials(credentials: CredentialValue): Promise<boolean> {
    try {
      const client = new GoogleSheetsClient({
        scriptUrl: credentials.scriptUrl,
        token: credentials.token,
      });
      return await client.testConnection();
    } catch {
      return false;
    }
  }

  async getCampaigns(dateFrom?: Date, dateTo?: Date): Promise<GoogleAdsCampaign[]> {
    try {
      const response = await this.client.get(this.scriptUrl, {
        params: { token: this.token },
      });

      if (!response.data?.ok || !response.data?.data) {
        return [];
      }

      const campaigns = response.data.data as Array<{
        campaign_name?: string;
        spend?: unknown;
        clicks?: unknown;
        impressions?: unknown;
        conversions?: unknown;
        ctr?: unknown;
        cpa?: unknown;
        roas?: unknown;
      }>;

      return campaigns.map((c) => ({
        id: generateCampaignId(c.campaign_name || "unknown"),
        name: c.campaign_name || "Unknown Campaign",
        spend: toNumber(c.spend),
        clicks: toNumber(c.clicks),
        impressions: toNumber(c.impressions),
        conversions: toNumber(c.conversions),
        ctr: toNumber(c.ctr),
        cpa: toNumber(c.cpa),
        roas: toNumber(c.roas),
        status: "ACTIVE",
      }));
    } catch (error) {
      throw new IntegrationError(
        this.platform,
        "Failed to fetch Google Ads campaigns",
        axios.isAxiosError(error) ? error.response?.status : undefined,
        error
      );
    }
  }

  async getMetrics(options: MetricsOptions): Promise<MetricData[]> {
    const campaigns = await this.getCampaigns(options.startDate, options.endDate);

    const metrics: MetricData[] = [];

    for (const campaign of campaigns) {
      metrics.push({
        metricType: "spend",
        value: campaign.spend,
        date: new Date(),
        dimensions: { campaign: campaign.name },
      });

      metrics.push({
        metricType: "clicks",
        value: campaign.clicks,
        date: new Date(),
        dimensions: { campaign: campaign.name },
      });

      metrics.push({
        metricType: "impressions",
        value: campaign.impressions,
        date: new Date(),
        dimensions: { campaign: campaign.name },
      });

      metrics.push({
        metricType: "conversions",
        value: campaign.conversions,
        date: new Date(),
        dimensions: { campaign: campaign.name },
      });
    }

    return metrics;
  }
}

export function createGoogleSheetsClient(
  credentials: Record<string, string>
): GoogleSheetsClient {
  return new GoogleSheetsClient({
    scriptUrl: credentials.scriptUrl,
    token: credentials.token,
  });
}
