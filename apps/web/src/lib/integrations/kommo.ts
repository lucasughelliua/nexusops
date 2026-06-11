import axios, { AxiosInstance } from "axios";
import {
  IntegrationClient,
  IntegrationError,
  MetricsOptions,
  MetricData,
  CredentialValue,
} from "./types";
import { Platform } from "@prisma/client";

interface KommoCredentials {
  subdomain: string;
  accessToken: string;
}

export interface KommoCampaign {
  id: string;
  name: string;
  budget: number;
  spent: number;
  leads: number;
  conversions: number;
  status: "active" | "paused";
}

export class KommoClient implements IntegrationClient {
  platform = Platform.KOMMO_CRM;
  private client: AxiosInstance;

  constructor(credentials: KommoCredentials) {
    this.client = axios.create({
      baseURL: `https://${credentials.subdomain}.kommo.com/api/v4`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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
        "Failed to connect to Kommo",
        axios.isAxiosError(error) ? error.response?.status : undefined,
        error
      );
    }
  }

  async validateCredentials(creds: CredentialValue): Promise<boolean> {
    try {
      const credentials = this.parseCredentials(creds);
      const testClient = new KommoClient(credentials);
      return await testClient.testConnection();
    } catch {
      return false;
    }
  }

  async getMetrics(options: MetricsOptions): Promise<MetricData[]> {
    try {
      const response = await this.client.get("/leads", {
        params: {
          limit: 100,
        },
      });

      const leads = response.data?._embedded?.leads || [];
      return [
        {
          metricType: "crm_leads",
          value: leads.length,
          date: new Date(),
          rawData: leads,
        },
      ];
    } catch (error) {
      console.warn("Error fetching Kommo metrics:", error);
      return [];
    }
  }

  private parseCredentials(creds: CredentialValue): KommoCredentials {
    const parsed = typeof creds === "string" ? JSON.parse(creds) : creds;
    return {
      subdomain: parsed.subdomain,
      accessToken: parsed.accessToken,
    };
  }
}

export function createKommoClient(credentials: CredentialValue): KommoClient {
  const creds = typeof credentials === "string" ? JSON.parse(credentials) : credentials;
  return new KommoClient({
    subdomain: creds.subdomain,
    accessToken: creds.accessToken,
  });
}
