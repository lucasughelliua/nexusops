import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { Platform, SyncStatus } from "@prisma/client";

/**
 * Canales soportados por el dashboard. Cada canal mapea a una plataforma de
 * integración y a un Account "contenedor" en la base de datos.
 */
export type ChannelKey =
  | "vtex"
  | "meli_1"
  | "meli_2"
  | "meta"
  | "google"
  | "perfit"
  | "kommo"
  | "tiendanube_ua"
  | "tiendanube_alaska"
  | "epresis";

export const ECOMMERCE_CHANNELS: ChannelKey[] = ["vtex", "meli_1", "meli_2", "tiendanube_ua", "tiendanube_alaska"];
export const MARKETING_CHANNELS: ChannelKey[] = ["meta", "google", "perfit", "kommo"];
export const LOGISTICS_CHANNELS: ChannelKey[] = ["epresis"];

export const CHANNEL_PLATFORM: Record<ChannelKey, Platform> = {
  vtex: Platform.VTEX,
  meli_1: Platform.MERCADO_LIBRE,
  meli_2: Platform.MERCADO_LIBRE,
  meta: Platform.META,
  google: Platform.GOOGLE_ADS,
  perfit: Platform.PERFIT,
  kommo: Platform.KOMMO_CRM,
  tiendanube_ua: Platform.TIENDANUBE,
  tiendanube_alaska: Platform.TIENDANUBE,
  epresis: Platform.EPRESIS,
};

export const CHANNEL_ACCOUNT_NAME: Record<ChannelKey, string> = {
  vtex: "VTEX",
  meli_1: "MercadoLibre UA",
  meli_2: "MercadoLibre Sporta",
  meta: "Meta Ads",
  google: "Google Ads",
  perfit: "Perfit",
  kommo: "Kommo CRM",
  tiendanube_ua: "Tiendanube UA",
  tiendanube_alaska: "Tiendanube Alaska",
  epresis: "Epresis",
};

const CONFIG_CRED_NAME = "config";

/**
 * Las credenciales/cuentas de integración requieren un userId real (FK).
 * El login está hardcodeado (TEST_USERS en auth.ts) pero auth.ts ahora
 * sincroniza un User real por email. Para que TODOS los admins compartan
 * la misma configuración de integraciones (son cuentas de la misma
 * empresa), usamos siempre el primer usuario ADMIN como dueño "de sistema"
 * de los Account de integraciones.
 */
let cachedOwnerId: string | null = null;

export async function getOrCreateOwnerUserId(): Promise<string> {
  if (cachedOwnerId) return cachedOwnerId;

  let owner = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });

  if (!owner) {
    owner = await prisma.user.create({
      data: {
        username: "system-integrations",
        pin: "0000",
        name: "Integraciones",
        role: "ADMIN",
      },
    });
  }

  cachedOwnerId = owner.id;
  return owner.id;
}

async function getOrCreateAccount(channel: ChannelKey): Promise<{ id: string; userId: string }> {
  const userId = await getOrCreateOwnerUserId();
  const name = CHANNEL_ACCOUNT_NAME[channel];

  let account = await prisma.account.findFirst({ where: { userId, name } });
  if (!account) {
    account = await prisma.account.create({
      data: { userId, name, description: `Integración ${name}` },
    });
  }
  return { id: account.id, userId };
}

export interface ChannelCredential {
  credentialId: string;
  accountId: string;
  userId: string;
  platform: Platform;
  config: Record<string, any>;
  syncStatus: SyncStatus;
  syncError: string | null;
  lastSyncAt: Date | null;
}

/**
 * Obtiene la credencial "config" (JSON desencriptado) de un canal, o null
 * si todavía no fue configurado.
 */
export async function getChannelCredential(channel: ChannelKey): Promise<ChannelCredential | null> {
  const platform = CHANNEL_PLATFORM[channel];
  const accountName = CHANNEL_ACCOUNT_NAME[channel];
  const userId = await getOrCreateOwnerUserId();

  const account = await prisma.account.findFirst({ where: { userId, name: accountName } });
  if (!account) return null;

  const cred = await prisma.credential.findFirst({
    where: { accountId: account.id, platform, name: CONFIG_CRED_NAME },
  });
  if (!cred) return null;

  try {
    const config = JSON.parse(decrypt(cred.value));
    return {
      credentialId: cred.id,
      accountId: account.id,
      userId,
      platform,
      config,
      syncStatus: cred.syncStatus,
      syncError: cred.syncError,
      lastSyncAt: cred.lastSyncAt,
    };
  } catch (error) {
    console.error(`No se pudo desencriptar la credencial del canal ${channel}:`, error);
    return null;
  }
}

/**
 * Devuelve solo el objeto de configuración (o null si no está configurado).
 * Atajo usado por los clientes de integración / capa de analytics.
 */
export async function getChannelConfig<T = Record<string, any>>(channel: ChannelKey): Promise<T | null> {
  const cred = await getChannelCredential(channel);
  return (cred?.config as T) ?? null;
}

/**
 * Crea o actualiza la configuración (JSON) de un canal. Hace merge con la
 * configuración existente para no perder tokens guardados previamente
 * (por ej. al guardar solo accountName/appKey/appToken de VTEX).
 */
export async function saveChannelConfig(
  channel: ChannelKey,
  config: Record<string, any>,
  options: { merge?: boolean } = { merge: true }
): Promise<ChannelCredential> {
  const platform = CHANNEL_PLATFORM[channel];
  const { id: accountId, userId } = await getOrCreateAccount(channel);

  const existing = await prisma.credential.findFirst({
    where: { accountId, platform, name: CONFIG_CRED_NAME },
  });

  let finalConfig = config;
  if (existing && options.merge !== false) {
    try {
      const previous = JSON.parse(decrypt(existing.value));
      finalConfig = { ...previous, ...config };
    } catch {
      // valor previo corrupto/no parseable -> lo reemplazamos directamente
    }
  }

  const value = encrypt(JSON.stringify(finalConfig));

  let credentialId: string;
  if (existing) {
    const updated = await prisma.credential.update({
      where: { id: existing.id },
      data: { value, syncStatus: "PENDING", syncError: null },
    });
    credentialId = updated.id;
  } else {
    const created = await prisma.credential.create({
      data: {
        accountId,
        userId,
        platform,
        type: "config",
        name: CONFIG_CRED_NAME,
        value,
        syncStatus: "PENDING",
      },
    });
    credentialId = created.id;
  }

  return {
    credentialId,
    accountId,
    userId,
    platform,
    config: finalConfig,
    syncStatus: "PENDING",
    syncError: null,
    lastSyncAt: null,
  };
}

/**
 * Actualiza únicamente el estado de sincronización (usado por la capa de
 * analytics luego de probar la conexión / traer datos).
 */
export async function setChannelSyncStatus(
  channel: ChannelKey,
  status: SyncStatus,
  error?: string | null
): Promise<void> {
  const cred = await getChannelCredential(channel);
  if (!cred) return;

  await prisma.credential.update({
    where: { id: cred.credentialId },
    data: {
      syncStatus: status,
      syncError: error ?? null,
      lastSyncAt: status === "SUCCESS" ? new Date() : cred.lastSyncAt,
      syncCount: status === "SUCCESS" ? { increment: 1 } : undefined,
    },
  });
}

/**
 * Mezcla nuevos campos en el JSON de configuración existente sin pisar el
 * resto (ej: refrescar accessToken/refreshToken/expiresAt de Mercado Libre).
 */
export async function patchChannelConfig(channel: ChannelKey, patch: Record<string, any>): Promise<void> {
  const cred = await getChannelCredential(channel);
  if (!cred) return;

  const merged = { ...cred.config, ...patch };
  await prisma.credential.update({
    where: { id: cred.credentialId },
    data: { value: encrypt(JSON.stringify(merged)) },
  });
}

export interface ChannelStatus {
  channel: ChannelKey;
  platform: Platform;
  accountName: string;
  configured: boolean;
  syncStatus: SyncStatus | null;
  syncError: string | null;
  lastSyncAt: string | null;
  summary: Record<string, string>;
}

/**
 * Oculta valores sensibles para mostrar en la UI (solo muestra los últimos
 * caracteres de tokens/keys).
 */
function mask(value?: string | null): string {
  if (!value) return "—";
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

function summarizeConfig(channel: ChannelKey, config: Record<string, any>): Record<string, string> {
  switch (channel) {
    case "vtex":
      return {
        "Cuenta VTEX": config.accountName || "—",
        "App Key": mask(config.appKey),
        "App Token": mask(config.appToken),
      };
    case "meli_1":
    case "meli_2":
      return {
        Vendedor: config.nickname || "—",
        "Seller ID": config.sellerId || "—",
        "Client ID": config.clientId ? mask(String(config.clientId)) : "—",
        Token: config.accessToken ? "Conectado ✓" : "Sin conectar",
        "Vence": config.expiresAt ? new Date(config.expiresAt).toLocaleString("es-AR") : "—",
      };
    case "meta":
      return {
        "Ad Account ID": config.adAccountId || "—",
        Token: mask(config.accessToken),
      };
    case "google":
      return {
        "AppScript URL": config.scriptUrl ? "Conectado ✓" : "—",
        Token: config.token ? mask(config.token) : "—",
      };
    case "perfit":
      return { "API Key": mask(config.apiKey) };
    case "kommo":
      return {
        Subdominio: config.subdomain || "—",
        Token: mask(config.accessToken),
      };
    case "tiendanube_ua":
    case "tiendanube_alaska":
      return {
        Subdominio: config.subdomain || "—",
        Token: config.apiToken ? "Conectado ✓" : "Sin conectar",
      };
    case "epresis":
      return {
        "API Token": mask(config.apiToken),
        "API URL": config.apiUrl || "epresis.seguimientodeenvios.ar",
      };
    default:
      return {};
  }
}

export async function getAllChannelStatuses(): Promise<ChannelStatus[]> {
  const userId = await getOrCreateOwnerUserId();
  const channels = [...ECOMMERCE_CHANNELS, ...MARKETING_CHANNELS, ...LOGISTICS_CHANNELS];

  const result: ChannelStatus[] = [];
  for (const channel of channels) {
    const platform = CHANNEL_PLATFORM[channel];
    const accountName = CHANNEL_ACCOUNT_NAME[channel];

    const account = await prisma.account.findFirst({
      where: { userId, name: accountName },
      include: {
        credentials: {
          where: { platform, name: CONFIG_CRED_NAME },
        },
      },
    });

    const cred = account?.credentials?.[0];
    let summary: Record<string, string> = {};
    if (cred) {
      try {
        const config = JSON.parse(decrypt(cred.value));
        summary = summarizeConfig(channel, config);
      } catch {
        summary = {};
      }
    }

    result.push({
      channel,
      platform,
      accountName,
      configured: !!cred,
      syncStatus: cred?.syncStatus ?? null,
      syncError: cred?.syncError ?? null,
      lastSyncAt: cred?.lastSyncAt ? cred.lastSyncAt.toISOString() : null,
      summary,
    });
  }

  return result;
}
