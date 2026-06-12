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
  subdomain: string;
  apiKey: string;
}

export interface PerfitCampaign {
  id: string;
  name: string;
  status: "active" | "paused" | "completed" | "archived";
  budget: number;
  spent: number;
  leads: number;
  costPerLead: number;
  roi: number;
  roas: number;
}

export class PerfitClient implements IntegrationClient {
  platform = Platform.PERFIT;
  private client: AxiosInstance;
  private account: string;

  constructor(credentials: PerfitCredentials) {
    this.account = credentials.subdomain;
    this.client = axios.create({
      baseURL: `https://api.myperfit.com/v2/${credentials.subdomain}`,
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get("/contacts", { params: { limit: 1 } });
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

  async getCampaigns(dateFrom?: Date, dateTo?: Date): Promise<PerfitCampaign[]> {
    try {
      const params: Record<string, any> = {
        limit: 100,
      };

      if (dateFrom && dateTo) {
        params.date_from = dateFrom.toISOString().split("T")[0];
        params.date_to = dateTo.toISOString().split("T")[0];
      }

      const response = await this.client.get("/campaigns", { params });

      const list = Array.isArray(response.data?.campaigns)
        ? response.data.campaigns
        : Array.isArray(response.data)
          ? response.data
          : [];

      return list.map((c: any) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        budget: parseFloat(c.budget || "0"),
        spent: parseFloat(c.spent || "0"),
        leads: parseInt(c.leads || "0"),
        costPerLead: parseFloat(c.cost_per_lead || "0"),
        roi: parseFloat(c.roi || "0"),
        roas: parseFloat(c.roas || "0"),
      }));
    } catch (error) {
      // El endpoint de campañas puede no existir para todas las cuentas;
      // no rompemos el dashboard por esto, sólo devolvemos vacío.
      console.warn("Error fetching Perfit campaigns:", error);
      return [];
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
    const campaigns = await this.getCampaigns(options.startDate, options.endDate);
    return campaigns.map((c) => ({
      metricType: "campaign_spend",
      value: c.spent,
      date: new Date(),
      dimensions: {
        campaignId: c.id,
        campaignName: c.name,
        platform: "perfit",
      },
      rawData: c,
    }));
  }

  private parseCredentials(creds: CredentialValue): PerfitCredentials {
    const parsed = typeof creds === "string" ? JSON.parse(creds) : creds;
    return {
      subdomain: parsed.subdomain,
      apiKey: parsed.apiKey,
    };
  }
}

export function createPerfitClient(credentials: CredentialValue): PerfitClient {
  const creds = typeof credentials === "string" ? JSON.parse(credentials) : credentials;
  return new PerfitClient({
    subdomain: creds.subdomain,
    apiKey: creds.apiKey,
  });
}
