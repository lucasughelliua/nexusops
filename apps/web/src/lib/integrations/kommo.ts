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

export interface KommoLead {
  id: number;
  name: string;
  price: number;
  status_id: number;
  pipeline_id: number;
  created_at: number;
  updated_at: number;
  responsible_user_id: number;
}

export interface KommoPipeline {
  id: number;
  name: string;
  statuses: {
    id: number;
    name: string;
    type: number; // 142=won, 143=lost
  }[];
}

export interface KommoStats {
  total: number;
  new_leads: number;
  won: number;
  lost: number;
  open: number;
  total_value: number;
  won_value: number;
  avg_deal_value: number;
  conversion_rate: number;
  pipelines: KommoPipeline[];
  leads_by_status: {
    statusName: string;
    pipelineName: string;
    count: number;
    value: number;
  }[];
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

  async getLeads(dateFrom?: Date, dateTo?: Date): Promise<KommoLead[]> {
    try {
      const params: Record<string, any> = { limit: 250 };

      if (dateFrom) {
        params["filter[created_at][from]"] = Math.floor(dateFrom.getTime() / 1000);
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        params["filter[created_at][to]"] = Math.floor(end.getTime() / 1000);
      }

      const response = await this.client.get("/leads", { params });
      const leads: KommoLead[] = response.data?._embedded?.leads || [];
      return leads;
    } catch (error) {
      throw new IntegrationError(
        this.platform,
        "Failed to fetch Kommo leads",
        axios.isAxiosError(error) ? error.response?.status : undefined,
        error
      );
    }
  }

  async getPipelines(): Promise<KommoPipeline[]> {
    try {
      const response = await this.client.get("/pipelines");
      const raw: any[] = response.data?._embedded?.pipelines || [];

      return raw.map((p: any) => ({
        id: p.id,
        name: p.name,
        statuses: (p._embedded?.statuses || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          type: s.type ?? 0,
        })),
      }));
    } catch (error) {
      throw new IntegrationError(
        this.platform,
        "Failed to fetch Kommo pipelines",
        axios.isAxiosError(error) ? error.response?.status : undefined,
        error
      );
    }
  }

  async getStats(dateFrom?: Date, dateTo?: Date): Promise<KommoStats> {
    const [leads, pipelines] = await Promise.all([
      this.getLeads(dateFrom, dateTo),
      this.getPipelines(),
    ]);

    // Build status lookup: status_id -> { name, type, pipeline }
    const statusMap = new Map<
      number,
      { name: string; type: number; pipelineName: string; pipelineId: number }
    >();
    for (const pipeline of pipelines) {
      for (const status of pipeline.statuses) {
        statusMap.set(status.id, {
          name: status.name,
          type: status.type,
          pipelineName: pipeline.name,
          pipelineId: pipeline.id,
        });
      }
    }

    let won = 0;
    let lost = 0;
    let won_value = 0;
    let total_value = 0;

    const byStatus = new Map<
      number,
      { statusName: string; pipelineName: string; count: number; value: number }
    >();

    for (const lead of leads) {
      const info = statusMap.get(lead.status_id);
      const isWon = info?.type === 142;
      const isLost = info?.type === 143;

      if (isWon) {
        won++;
        won_value += lead.price || 0;
      } else if (isLost) {
        lost++;
      }
      total_value += lead.price || 0;

      const key = lead.status_id;
      const existing = byStatus.get(key);
      if (existing) {
        existing.count++;
        existing.value += lead.price || 0;
      } else {
        byStatus.set(key, {
          statusName: info?.name || `Status ${lead.status_id}`,
          pipelineName: info?.pipelineName || "",
          count: 1,
          value: lead.price || 0,
        });
      }
    }

    const total = leads.length;
    const open = total - won - lost;

    return {
      total,
      new_leads: total,
      won,
      lost,
      open: Math.max(0, open),
      total_value,
      won_value,
      avg_deal_value: total > 0 ? total_value / total : 0,
      conversion_rate: total > 0 ? (won / total) * 100 : 0,
      pipelines,
      leads_by_status: Array.from(byStatus.values()).sort((a, b) => b.count - a.count),
    };
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
