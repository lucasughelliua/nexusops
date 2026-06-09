import axios, { AxiosInstance } from "axios";
import {
  IntegrationClient,
  IntegrationError,
  MetricsOptions,
  MetricData,
  CredentialValue,
} from "./types";
import { Platform } from "@prisma/client";

interface PerfitCredentials {
  apiKey: string;
}

/**
 * Perfit Integration Client
 */
export class PerfitClient implements IntegrationClient {
  platform = Platform.PERFIT;
  private client: AxiosInstance;

  constructor(credentials: PerfitCredentials) {
    this.client = axios.create({
      baseURL: "https://api.perfit.com.br/v1",
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get("/account");
      return response.status === 200;
    } catch (error) {
      throw new IntegrationError(
        this.platform,
        "Failed to connect to Perfit",
        axios.isAxiosError(error) ? error.response?.status : undefined,
        error
      );
    }
  }

  async validateCredentials(creds: CredentialValue): Promise<boolean> {
    try {
      const credentials = this.parseCredentials(creds);
      const testClient = new PerfitClient(credentials);
      return await testClient.testConnection();
    } catch {
      return false;
    }
  }

  async getMetrics(options: MetricsOptions): Promise<MetricData[]> {
    const metrics: MetricData[] = [];

    try {
      // Obtener métricas de campaña
      const campaignMetrics = await this.getCampaignMetrics(options);
      metrics.push(...campaignMetrics);

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
      // GET /campaigns
      const response = await this.client.get("/campaigns", {
        params: {
          limit: 100,
          period: {
            from: options.startDate.toISOString().split("T")[0],
            to: options.endDate.toISOString().split("T")[0],
          },
        },
      });

      if (response.data?.campaigns) {
        const campaigns = response.data.campaigns;

        for (const campaign of campaigns) {
          const stats = campaign.stats;

          if (stats?.sent) {
            metrics.push({
              metricType: "emails_sent",
              value: stats.sent,
              date: new Date(),
              dimensions: { campaign_name: campaign.name },
            });
          }

          if (stats?.opens) {
            metrics.push({
              metricType: "emails_opened",
              value: stats.opens,
              date: new Date(),
              dimensions: { campaign_name: campaign.name },
            });

            // Calcular open rate
            if (stats.sent > 0) {
              const openRate = (stats.opens / stats.sent) * 100;
              metrics.push({
                metricType: "open_rate",
                value: openRate,
                date: new Date(),
                dimensions: { campaign_name: campaign.name },
              });
            }
          }

          if (stats?.clicks) {
            metrics.push({
              metricType: "clicks",
              value: stats.clicks,
              date: new Date(),
              dimensions: { campaign_name: campaign.name },
            });
          }
        }
      }

      return metrics;
    } catch (error) {
      console.warn("Error fetching Perfit metrics:", error);
      return [];
    }
  }

  private parseCredentials(creds: CredentialValue): PerfitCredentials {
    if (typeof creds === "string") {
      const parsed = JSON.parse(creds);
      return {
        apiKey: parsed.apiKey,
      };
    }

    return {
      apiKey: creds.apiKey as string,
    };
  }
}

export function createPerfitClient(credentials: CredentialValue): PerfitClient {
  const creds =
    typeof credentials === "string" ? JSON.parse(credentials) : credentials;

  return new PerfitClient({
    apiKey: creds.apiKey,
  });
}
