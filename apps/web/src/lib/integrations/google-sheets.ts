import axios from "axios";
import { Platform } from "@prisma/client";
import type { IntegrationClient, IntegrationError as IEType, MetricsOptions, MetricData, CredentialValue } from "./types";
import { IntegrationError } from "./types";

// Public Google Sheet with GA4 campaign data
const SHEET_ID = "1ldZHPTpoiN6OgyMy4zY2GYiYnNj9X6cgIk5Gqv8G40g";
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

// Columns: date(0) campaign(1) source_medium(2) sessions(3) users(4) new_users(5)
//          engaged_sessions(6) engagement_rate(7) avg_session_duration(8)
//          purchases(9) purchase_revenue(10) total_revenue(11) page_views(12)

export interface GoogleAdsCampaign {
  id: string;
  name: string;
  sessions: number;
  conversions: number;
  revenue: number;
  conv_rate: number;
  status: string;
}

export interface GoogleAdsStats {
  campaigns: GoogleAdsCampaign[];
  totals: {
    sessions: number;
    conversions: number;
    revenue: number;
    conv_rate: number;
  };
}

export interface GoogleSheetsCredentials {
  scriptUrl?: string;
  token?: string;
}

function isGooglePaid(sourceMedium: string): boolean {
  const s = sourceMedium.toLowerCase().trim();
  return (
    (s.startsWith("google") && s.includes("cpc")) ||
    s.startsWith("google ads")
  );
}

function generateId(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) { h = (Math.imul(31, h) + name.charCodeAt(i)) | 0; }
  return `google_${Math.abs(h).toString(16)}`;
}

function toNum(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

// Parse a CSV line handling quoted fields
function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { cols.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cols.push(cur);
  return cols;
}

// Convert Date (ART-aware) to YYYYMMDD int for comparison with sheet dates
function toDateInt(date: Date): number {
  // Subtract 3h to convert UTC → ART, then read YYYYMMDD
  const art = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return parseInt(art.toISOString().slice(0, 10).replace(/-/g, ""));
}

export async function fetchGoogleAdsStats(dateFrom: Date, dateTo: Date): Promise<GoogleAdsStats> {
  const res = await axios.get<string>(SHEET_CSV_URL, {
    responseType: "text",
    timeout: 20_000,
  });

  const lines = res.data.replace(/\r/g, "").split("\n");
  const fromInt = toDateInt(dateFrom);
  const toInt = toDateInt(dateTo);

  const map = new Map<string, { sessions: number; conversions: number; revenue: number }>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCsvLine(line);
    if (cols.length < 11) continue;

    const dateInt = parseInt(cols[0]);
    if (isNaN(dateInt) || dateInt < fromInt || dateInt > toInt) continue;

    const campaign = cols[1].trim();
    if (!campaign || campaign.startsWith("(")) continue;

    const sourceMedium = cols[2].trim();
    if (!isGooglePaid(sourceMedium)) continue;

    const sessions = toNum(cols[3]);
    const purchases = toNum(cols[9]);
    const revenue = toNum(cols[10]);

    const prev = map.get(campaign) ?? { sessions: 0, conversions: 0, revenue: 0 };
    map.set(campaign, {
      sessions: prev.sessions + sessions,
      conversions: prev.conversions + purchases,
      revenue: prev.revenue + revenue,
    });
  }

  const campaigns: GoogleAdsCampaign[] = [...map.entries()]
    .map(([name, d]) => ({
      id: generateId(name),
      name,
      sessions: Math.round(d.sessions),
      conversions: Math.round(d.conversions),
      revenue: Math.round(d.revenue),
      conv_rate: d.sessions > 0 ? Math.round((d.conversions / d.sessions) * 10000) / 100 : 0,
      status: "ACTIVE",
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const totSessions = campaigns.reduce((s, c) => s + c.sessions, 0);
  const totConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const totRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);

  return {
    campaigns,
    totals: {
      sessions: totSessions,
      conversions: totConversions,
      revenue: totRevenue,
      conv_rate: totSessions > 0 ? Math.round((totConversions / totSessions) * 10000) / 100 : 0,
    },
  };
}

// ── Legacy class kept for /api/campaigns compatibility ──────────────────────

export class GoogleSheetsClient implements IntegrationClient {
  platform = Platform.GOOGLE_ADS;

  constructor(_credentials: GoogleSheetsCredentials) {}

  async testConnection(): Promise<boolean> {
    try {
      await axios.get(SHEET_CSV_URL, { timeout: 10_000 });
      return true;
    } catch (error) {
      throw new IntegrationError(Platform.GOOGLE_ADS, "Cannot reach Google Sheet", undefined, error);
    }
  }

  async validateCredentials(_creds: CredentialValue): Promise<boolean> {
    return this.testConnection().catch(() => false);
  }

  async getMetrics(_options: MetricsOptions): Promise<MetricData[]> {
    return [];
  }
}

export function createGoogleSheetsClient(_credentials: Record<string, string>): GoogleSheetsClient {
  return new GoogleSheetsClient({});
}
