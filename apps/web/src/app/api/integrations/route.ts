import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import {
  ChannelKey,
  ECOMMERCE_CHANNELS,
  MARKETING_CHANNELS,
  saveChannelConfig,
  setChannelSyncStatus,
  getAllChannelStatuses,
} from "@/lib/integrations/credentials";
import { clearChannelCache } from "@/lib/analytics";
import { createVTEXClient } from "@/lib/integrations/vtex";
import { createMercadoLibreClient } from "@/lib/integrations/mercado-libre";
import { createMetaClient } from "@/lib/integrations/meta";
import { createGoogleAdsClient } from "@/lib/integrations/google-ads";
import { createPerfitClient } from "@/lib/integrations/perfit";
import { createKommoClient } from "@/lib/integrations/kommo";
import { createEpresisClient } from "@/lib/integrations/epresis";
import { IntegrationError } from "@/lib/integrations/types";
import axios from "axios";

const ALL_CHANNELS: ChannelKey[] = [...ECOMMERCE_CHANNELS, ...MARKETING_CHANNELS];

const bodySchema = z.object({
  channel: z.enum(ALL_CHANNELS as [ChannelKey, ...ChannelKey[]]),
  config: z.record(z.string(), z.any()),
});

/**
 * GET /api/integrations
 * Estado de configuración/sincronización de todos los canales (e-commerce
 * + marketing), para la pestaña "Integraciones" del panel de admin.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const channels = await getAllChannelStatuses();
  return NextResponse.json({ channels });
}

/**
 * POST /api/integrations
 * Guarda (con merge) la configuración de un canal y, si hay credenciales
 * suficientes, prueba la conexión real contra la plataforma.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Validation failed", errors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { channel, config } = parsed.data;
  const saved = await saveChannelConfig(channel, config);

  // Limpiar el cache de este canal para asegurar que próximas solicitudes
  // traigan datos frescos
  clearChannelCache(channel);

  // Probar conexión real si ya hay credenciales suficientes.
  let tested = false;
  let success = false;
  let testError: string | undefined;

  try {
    if (channel === "vtex" && saved.config.accountName && saved.config.appKey && saved.config.appToken) {
      tested = true;
      const client = createVTEXClient(saved.config as any);
      success = await client.testConnection();
    } else if ((channel === "meli_1" || channel === "meli_2") && saved.config.accessToken) {
      tested = true;
      const client = createMercadoLibreClient(saved.config as any);
      success = await client.testConnection();
    } else if (channel === "meta" && saved.config.adAccountId && saved.config.accessToken) {
      tested = true;
      const client = createMetaClient(saved.config as any);
      success = await client.testConnection();
    } else if (channel === "google" && saved.config.sheetsUrl) {
      tested = true;
      const client = createGoogleAdsClient(saved.config as any);
      success = await client.testConnection();
    } else if (channel === "perfit" && saved.config.subdomain && saved.config.apiKey) {
      tested = true;
      const client = createPerfitClient(saved.config as any);
      success = await client.testConnection();
    } else if (channel === "kommo" && saved.config.subdomain && saved.config.accessToken) {
      tested = true;
      const client = createKommoClient(saved.config as any);
      success = await client.testConnection();
    } else if (channel === "epresis" && saved.config.apiToken) {
      tested = true;
      const client = createEpresisClient(saved.config as any);
      success = await client.testConnection();
    }
  } catch (error) {
    tested = true;
    success = false;
    testError = error instanceof Error ? error.message : String(error);

    // Si es un error de integración con un axios error adentro, sumamos
    // el status/body de la respuesta para poder diagnosticar sin tener
    // que armar endpoints de debug aparte.
    if (error instanceof IntegrationError && axios.isAxiosError(error.originalError)) {
      const ax = error.originalError;
      const status = ax.response?.status;
      const data = ax.response?.data;
      const dataStr = typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data)?.slice(0, 300);
      testError = `${testError} (HTTP ${status ?? "?"}: ${dataStr ?? ax.message})`;
    }
  }

  if (tested) {
    await setChannelSyncStatus(channel, success ? "SUCCESS" : "ERROR", success ? null : testError ?? "Connection test failed");
  }

  const channels = await getAllChannelStatuses();
  return NextResponse.json({ tested, success, channels, testError: testError ?? undefined });
}
