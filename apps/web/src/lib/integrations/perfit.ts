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
  status: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  launchDate: string | null;
}

export interface PerfitEmailStats {
  totals: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    unsubscribed: number;
    open_rate: number;
    click_rate: number;
  };
  campaigns: PerfitCampaign[];
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

  async getEmailStats(dateFrom?: Date, dateTo?: Date): Promise<PerfitEmailStats> {
    const fromMs = dateFrom?.getTime() ?? 0;
    const toMs = dateTo?.getTime() ?? Date.now();

    const allCampaigns: PerfitCampaign[] = [];
    let offset = 0;
    const limit = 100;

    // Paginar hasta cubrir el rango de fechas pedido
    while (true) {
      const response = await this.client.get("/campaigns", {
        params: { limit, offset, sortBy: "launchDate", sortDir: "desc" },
      });

      const data: any[] = response.data?.data ?? [];
      if (data.length === 0) break;

      let pastRange = false;
      for (const c of data) {
        if (c.state !== "SENT" || !c.launchDate || !c.metrics) continue;

        const launchMs = new Date(c.launchDate).getTime();
        if (launchMs > toMs) continue;
        if (launchMs < fromMs) { pastRange = true; break; }

        const m = c.metrics;
        const sent = m.sent ?? 0;
        const bounced = m.bounced ?? 0;
        allCampaigns.push({
          id: String(c.id),
          name: c.name,
          status: c.state,
          sent,
          delivered: sent - bounced,
          opened: m.opened ?? 0,
          clicked: m.clicked ?? 0,
          unsubscribed: m.unsubscribed ?? 0,
          launchDate: c.launchDate,
        });
      }

      if (pastRange || data.length < limit) break;
      offset += limit;
    }

    const totSent = allCampaigns.reduce((s, c) => s + c.sent, 0);
    const totDelivered = allCampaigns.reduce((s, c) => s + c.delivered, 0);
    const totOpened = allCampaigns.reduce((s, c) => s + c.opened, 0);
    const totClicked = allCampaigns.reduce((s, c) => s + c.clicked, 0);
    const totUnsub = allCampaigns.reduce((s, c) => s + c.unsubscribed, 0);

    return {
      totals: {
        sent: totSent,
        delivered: totDelivered,
        opened: totOpened,
        clicked: totClicked,
        unsubscribed: totUnsub,
        open_rate: totSent > 0 ? Number(((totOpened / totSent) * 100).toFixed(1)) : 0,
        click_rate: totSent > 0 ? Number(((totClicked / totSent) * 100).toFixed(1)) : 0,
      },
      campaigns: allCampaigns,
    };
  }

  async getCampaigns(dateFrom?: Date, dateTo?: Date): Promise<PerfitCampaign[]> {
    const stats = await this.getEmailStats(dateFrom, dateTo);
    return stats.campaigns;
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
      value: c.sent,
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
