import axios, { AxiosInstance } from "axios";
import {
  IntegrationClient,
  IntegrationError,
  MetricsOptions,
  MetricData,
  CredentialValue,
} from "./types";
import { Platform } from "@prisma/client";

interface GoogleAdsCredentials {
  customerId: string;
  accessToken: string;
  developerToken: string;
}

/**
 * Google Ads Integration Client
 */
export class GoogleAdsClient implements IntegrationClient {
  platform = Platform.GOOGLE_ADS;
  private client: AxiosInstance;

  constructor(credentials: GoogleAdsCredentials) {
    this.client = axios.create({
      baseURL: "https://googleads.googleapis.com/v13",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "developer-token": credentials.developerToken,
        "Content-Type": "application/json",
      },
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test con un simple GET de campaigns
      const response = await this.client.post("/customers/search", {
        query: "SELECT customer.id LIMIT 1",
      });
      return response.status === 200;
    } catch (error) {
      throw new IntegrationError(
        this.platform,
        "Failed to connect to Google Ads",
        axios.isAxiosError(error) ? error.response?.status : undefined,
        error
      );
    }
  }

  async validateCredentials(creds: CredentialValue): Promise<boolean> {
    try {
      const credentials = this.parseCredentials(creds);
      const testClient = new GoogleAdsClient(credentials);
      return await testClient.testConnection();
    } catch {
      return false;
    }
  }

  async getMetrics(options: MetricsOptions): Promise<MetricData[]> {
    const metrics: MetricData[] = [];

    try {
      // Obtener métricas de campañas
      const campaignsMetrics = await this.getCampaignMetrics(options);
      metrics.push(...campaignsMetrics);

      return metrics;
    } catch (error) {
      throw new IntegrationError(
        this.platform,
        `Failed to fetch metrics: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        error
      );
    }
  }

  private async getCampaignMetrics(
    options: MetricsOptions
  ): Promise<MetricData[]> {
    const metrics: MetricData[] = [];

    try {
      // Query GAQL para obtener métricas de campañas
      const query = `
        SELECT campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros
        FROM campaign
        WHERE campaign.status = 'ENABLED'
      `;

      const response = await this.client.post("/customers/search", {
        query,
      });

      if (response.data?.results) {
        for (const result of response.data.results) {
          const metrics_data = result.campaign?.metrics;
          if (metrics_data) {
            metrics.push({
              metricType: "impressions",
              value: parseInt(metrics_data.impressions) || 0,
              date: new Date(),
              dimensions: { campaign_name: result.campaign.name },
            });

            metrics.push({
              metricType: "clicks",
              value: parseInt(metrics_data.clicks) || 0,
              date: new Date(),
              dimensions: { campaign_name: result.campaign.name },
            });

            metrics.push({
              metricType: "spend",
              value: (metrics_data.cost_micros || 0) / 1000000,
              date: new Date(),
              currency: "USD",
              dimensions: { campaign_name: result.campaign.name },
            });
          }
        }
      }

      return metrics;
    } catch (error) {
      console.warn("Error fetching Google Ads metrics:", error);
      return [];
    }
  }

  private parseCredentials(creds: CredentialValue): GoogleAdsCredentials {
    if (typeof creds === "string") {
      const parsed = JSON.parse(creds);
      return {
        customerId: parsed.customerId,
        accessToken: parsed.accessToken,
        developerToken: parsed.developerToken,
      };
    }

    return {
      customerId: creds.customerId as string,
      accessToken: creds.accessToken as string,
      developerToken: creds.developerToken as string,
    };
  }
}

export function createGoogleAdsClient(
  credentials: CredentialValue
): GoogleAdsClient {
  const creds =
    typeof credentials === "string" ? JSON.parse(credentials) : credentials;

  return new GoogleAdsClient({
    customerId: creds.customerId,
    accessToken: creds.accessToken,
    developerToken: creds.developerToken,
  });
}
