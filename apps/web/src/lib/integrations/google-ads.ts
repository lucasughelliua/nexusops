import axios from "axios";
import {
  IntegrationClient,
  IntegrationError,
  MetricsOptions,
  MetricData,
  CredentialValue,
} from "./types";
import { Platform } from "@prisma/client";

interface GoogleAdsCredentials {
  sheetsUrl: string;
  apiKey: string;
}

export interface GoogleAdsCampaign {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpc: number;
  cpm: number;
  roi: number;
}

export class GoogleAdsClient implements IntegrationClient {
  platform = Platform.GOOGLE_ADS;
  private sheetsUrl: string;
  private apiKey: string;
  private spreadsheetId: string;

  constructor(credentials: GoogleAdsCredentials) {
    this.sheetsUrl = credentials.sheetsUrl;
    this.apiKey = credentials.apiKey;
    // Extraer spreadsheet ID de la URL
    const match = credentials.sheetsUrl.match(/\/spreadsheets\/d\/([^\/]+)/);
    this.spreadsheetId = match ? match[1] : "";
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.spreadsheetId) {
        throw new Error("Invalid Google Sheets URL");
      }

      const response = await axios.get(
        `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}`,
        {
          params: { key: this.apiKey },
        }
      );

      return response.status === 200;
    } catch (error) {
      throw new IntegrationError(
        this.platform,
        "Failed to connect to Google Sheets",
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
    try {
      if (!this.spreadsheetId) {
        return [];
      }

      // Leer datos de la primer sheet (Google Ads campaigns)
      const response = await axios.get(
        `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/A1:H100`,
        {
          params: { key: this.apiKey },
        }
      );

      const rows = response.data?.values || [];
      const metrics: MetricData[] = [];

      // Saltear header (fila 0) y procesar filas
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;

        const spend = parseFloat(row[2] || "0");
        metrics.push({
          metricType: "campaign_spend",
          value: spend,
          date: new Date(),
          dimensions: {
            campaign: row[0],
            platform: "google_ads",
          },
        });
      }

      return metrics;
    } catch (error) {
      console.warn("Error fetching Google Ads metrics:", error);
      return [];
    }
  }

  private parseCredentials(creds: CredentialValue): GoogleAdsCredentials {
    const parsed = typeof creds === "string" ? JSON.parse(creds) : creds;
    return {
      sheetsUrl: parsed.sheetsUrl,
      apiKey: parsed.apiKey,
    };
  }
}

export function createGoogleAdsClient(credentials: CredentialValue): GoogleAdsClient {
  const creds = typeof credentials === "string" ? JSON.parse(credentials) : credentials;
  return new GoogleAdsClient({
    sheetsUrl: creds.sheetsUrl,
    apiKey: creds.apiKey,
  });
}
