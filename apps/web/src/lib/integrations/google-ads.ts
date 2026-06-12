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
  apiKey?: string;
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
  private apiKey?: string;
  private spreadsheetId: string;
  private csvUrl: string;

  constructor(credentials: GoogleAdsCredentials) {
    this.sheetsUrl = credentials.sheetsUrl;
    this.apiKey = credentials.apiKey || undefined;

    // Si ya es una URL de CSV directa, usarla tal cual
    if (this.sheetsUrl.includes("/export?format=csv") || this.sheetsUrl.includes("?output=csv")) {
      this.csvUrl = this.sheetsUrl;
      this.spreadsheetId = "direct"; // Marcador de URL directa
    } else {
      // Extraer spreadsheet ID de la URL regular
      const match = this.sheetsUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      this.spreadsheetId = match ? match[1] : "";
      this.csvUrl = this.spreadsheetId
        ? `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}/export?format=csv`
        : "";
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.csvUrl) {
        throw new Error("Invalid Google Sheets URL");
      }

      // Descargar CSV directamente sin API Key
      const response = await axios.get(this.csvUrl);

      return response.status === 200 && response.data.length > 0;
    } catch (error) {
      throw new IntegrationError(
        this.platform,
        "Failed to connect to Google Sheets. Asegúrate que el sheet sea público o compartido.",
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
      if (!this.csvUrl) {
        return [];
      }

      // Descargar CSV sin API Key
      const response = await axios.get(this.csvUrl);
      const csv = response.data;

      const metrics: MetricData[] = [];
      const rows = csv.split("\n");

      // Saltear header (fila 0) y procesar filas
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.trim().length === 0) continue;

        const cols = this.parseCSVRow(row);
        if (cols.length < 2) continue;

        const spend = parseFloat(cols[1]?.replace(/[^\d.-]/g, "") || "0");
        metrics.push({
          metricType: "campaign_spend",
          value: spend,
          date: new Date(),
          dimensions: {
            campaign: cols[0],
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

  private parseCSVRow(row: string): string[] {
    const result: string[] = [];
    let current = "";
    let insideQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      const nextChar = row[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === "," && !insideQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  private parseCredentials(creds: CredentialValue): GoogleAdsCredentials {
    const parsed = typeof creds === "string" ? JSON.parse(creds) : creds;
    return {
      sheetsUrl: parsed.sheetsUrl,
      apiKey: parsed.apiKey || undefined,
    };
  }
}

export function createGoogleAdsClient(credentials: CredentialValue): GoogleAdsClient {
  const creds = typeof credentials === "string" ? JSON.parse(credentials) : credentials;
  return new GoogleAdsClient({
    sheetsUrl: creds.sheetsUrl,
    apiKey: creds.apiKey || undefined,
  });
}
