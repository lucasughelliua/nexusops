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
  accessToken: string;
  businessAccountId: string;
  adAccountId?: string;
}

/**
 * Meta (Facebook/Instagram) Ads Integration Client
 */
export class MetaClient implements IntegrationClient {
  platform = Platform.META;
  private client: AxiosInstance;
  private accessToken: string;
  private businessAccountId: string;

  constructor(credentials: MetaCredentials) {
    this.accessToken = credentials.accessToken;
    this.businessAccountId = credentials.businessAccountId;

    this.client = axios.create({
      baseURL: "https://graph.instagram.com/v18.0",
      params: {
        access_token: credentials.accessToken,
      },
    });
  }

  /**
   * Test de conexión
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get(`/${this.businessAccountId}`);
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

  /**
   * Validar credenciales
   */
  async validateCredentials(creds: CredentialValue): Promise<boolean> {
    try {
      const credentials = this.parseCredentials(creds);
      const testClient = new MetaClient(credentials);
      return await testClient.testConnection();
    } catch {
      return false;
    }
  }

  /**
   * Obtener métricas
   */
  async getMetrics(options: MetricsOptions): Promise<MetricData[]> {
    const metrics: MetricData[] = [];

    try {
      // Obtener insights de ad accounts
      const insightsMetrics = await this.getInsights(options);
      metrics.push(...insightsMetrics);

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

  /**
   * Obtener insights de campañas/ads
   */
  private async getInsights(options: MetricsOptions): Promise<MetricData[]> {
    const metrics: MetricData[] = [];

    try {
      // GET /{business_account_id}/campaigns/insights
      const response = await this.client.get(
        `/${this.businessAccountId}/campaigns`,
        {
          params: {
            fields:
              "id,name,insights.date_start(${options.startDate.toISOString()}).date_stop(${options.endDate.toISOString()}){impressions,clicks,spend,actions}",
          },
        }
      );

      if (response.data?.data) {
        // Procesar datos de insights
        const campaigns = response.data.data;

        for (const campaign of campaigns) {
          if (campaign.insights?.data) {
            // Sumar métricas
            let totalImpressions = 0;
            let totalClicks = 0;
            let totalSpend = 0;

            for (const insight of campaign.insights.data) {
              totalImpressions += insight.impressions || 0;
              totalClicks += insight.clicks || 0;
              totalSpend += parseFloat(insight.spend || "0");
            }

            if (totalImpressions > 0) {
              metrics.push({
                metricType: "impressions",
                value: totalImpressions,
                date: new Date(),
                dimensions: { campaign_id: campaign.id, campaign_name: campaign.name },
                rawData: campaign.insights,
              });
            }

            if (totalClicks > 0) {
              metrics.push({
                metricType: "clicks",
                value: totalClicks,
                date: new Date(),
                dimensions: { campaign_id: campaign.id, campaign_name: campaign.name },
              });
            }

            if (totalSpend > 0) {
              metrics.push({
                metricType: "spend",
                value: totalSpend,
                date: new Date(),
                currency: "USD",
                dimensions: { campaign_id: campaign.id, campaign_name: campaign.name },
              });
            }
          }
        }
      }

      return metrics;
    } catch (error) {
      console.warn("Error fetching Meta insights:", error);
      return [];
    }
  }

  /**
   * Parse credentials
   */
  private parseCredentials(creds: CredentialValue): MetaCredentials {
    if (typeof creds === "string") {
      const parsed = JSON.parse(creds);
      return {
        accessToken: parsed.accessToken,
        businessAccountId: parsed.businessAccountId,
        adAccountId: parsed.adAccountId,
      };
    }

    return {
      accessToken: creds.accessToken as string,
      businessAccountId: creds.businessAccountId as string,
      adAccountId: creds.adAccountId as string,
    };
  }
}

/**
 * Factory para crear cliente Meta
 */
export function createMetaClient(credentials: CredentialValue): MetaClient {
  const creds =
    typeof credentials === "string" ? JSON.parse(credentials) : credentials;

  return new MetaClient({
    accessToken: creds.accessToken,
    businessAccountId: creds.businessAccountId,
    adAccountId: creds.adAccountId,
  });
}
