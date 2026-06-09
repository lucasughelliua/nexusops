import { Platform } from "@prisma/client";
import { CredentialValue, IntegrationClient, MetricsOptions, MetricData } from "./types";
import { createVTEXClient } from "./vtex";
import { createMercadoLibreClient } from "./mercado-libre";
import { createMetaClient } from "./meta";
import { createGoogleAdsClient } from "./google-ads";
import { createKommoClient } from "./kommo-crm";
import { createPerfitClient } from "./perfit";

/**
 * Factory para crear clientes de integración según plataforma
 */
export function createIntegrationClient(
  platform: Platform,
  credentials: CredentialValue
): IntegrationClient {
  switch (platform) {
    case Platform.VTEX:
      return createVTEXClient(credentials);
    case Platform.MERCADO_LIBRE:
      return createMercadoLibreClient(credentials);
    case Platform.META:
      return createMetaClient(credentials);
    case Platform.GOOGLE_ADS:
      return createGoogleAdsClient(credentials);
    case Platform.KOMMO_CRM:
      return createKommoClient(credentials);
    case Platform.PERFIT:
      return createPerfitClient(credentials);
    case Platform.GOOGLE_SHEETS:
      throw new Error("Google Sheets is not a real integration client");
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Obtener métricas desde múltiples plataformas
 */
export async function getMultipleMetrics(
  integrations: Array<{ platform: Platform; client: IntegrationClient }>,
  options: MetricsOptions
): Promise<Map<Platform, MetricData[]>> {
  const results = new Map<Platform, MetricData[]>();

  for (const { platform, client } of integrations) {
    try {
      const metrics = await client.getMetrics(options);
      results.set(platform, metrics);
    } catch (error) {
      console.error(`Error fetching metrics from ${platform}:`, error);
      results.set(platform, []);
    }
  }

  return results;
}

// Re-export types
export type { IntegrationClient, MetricsOptions, MetricData, CredentialValue };
export { IntegrationError } from "./types";
