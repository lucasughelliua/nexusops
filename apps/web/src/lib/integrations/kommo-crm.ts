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
  domain: string;
  apiKey: string;
}

/**
 * Kommo CRM Integration Client
 */
export class KommoClient implements IntegrationClient {
  platform = Platform.KOMMO_CRM;
  private client: AxiosInstance;
  private domain: string;

  constructor(credentials: KommoCredentials) {
    this.domain = credentials.domain;

    this.client = axios.create({
      baseURL: `https://${credentials.domain}.kommo.com/api/v4`,
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
    const metrics: MetricData[] = [];

    try {
      // Obtener leads
      const leadsMetrics = await this.getLeadsMetrics(options);
      metrics.push(...leadsMetrics);

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

  private async getLeadsMetrics(options: MetricsOptions): Promise<MetricData[]> {
    const metrics: MetricData[] = [];

    try {
      // GET /leads
      const response = await this.client.get("/leads", {
        params: {
          limit: 100,
          "with[lead_source]": 1,
        },
      });

      if (response.data?._embedded?.leads) {
        const leads = response.data._embedded.leads;

        metrics.push({
          metricType: "leads_total",
          value: leads.length,
          date: new Date(),
          rawData: leads,
        });

        // Contar leads ganados (cerrados como éxito)
        const wonLeads = leads.filter(
          (lead: any) => lead.status_id === 142 // Status de ganado
        ).length;

        if (wonLeads > 0) {
          metrics.push({
            metricType: "leads_won",
            value: wonLeads,
            date: new Date(),
          });
        }
      }

      return metrics;
    } catch (error) {
      console.warn("Error fetching Kommo leads:", error);
      return [];
    }
  }

  private parseCredentials(creds: CredentialValue): KommoCredentials {
    if (typeof creds === "string") {
      const parsed = JSON.parse(creds);
      return {
        domain: parsed.domain,
        apiKey: parsed.apiKey,
      };
    }

    return {
      domain: creds.domain as string,
      apiKey: creds.apiKey as string,
    };
  }
}

export function createKommoClient(credentials: CredentialValue): KommoClient {
  const creds =
    typeof credentials === "string" ? JSON.parse(credentials) : credentials;

  return new KommoClient({
    domain: creds.domain,
    apiKey: creds.apiKey,
  });
}
