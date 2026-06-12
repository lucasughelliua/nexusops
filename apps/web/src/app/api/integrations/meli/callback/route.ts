import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import {
  ChannelKey,
  getChannelConfig,
  patchChannelConfig,
  setChannelSyncStatus,
} from "@/lib/integrations/credentials";

const ALLOWED_CHANNELS: ChannelKey[] = ["meli_1", "meli_2"];

/**
 * GET /api/integrations/meli/callback?code=...&state=meli_1|meli_2
 * Recibe el `code` de autorización de Mercado Libre, lo intercambia por
 * access/refresh tokens y los guarda encriptados en la configuración del
 * canal correspondiente.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const channel = params.get("state") as ChannelKey | null;

  // Obtener el origin correcto desde los headers (Railway usa x-forwarded-proto/host)
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:8080";
  const origin = `${proto}://${host}`;
  const adminUrl = new URL("/dashboard/admin", origin);
  adminUrl.searchParams.set("tab", "integraciones");

  if (!channel || !ALLOWED_CHANNELS.includes(channel)) {
    adminUrl.searchParams.set("meli_error", "Canal inválido");
    return NextResponse.redirect(adminUrl.toString());
  }

  if (params.get("error") || !code) {
    adminUrl.searchParams.set("meli_error", params.get("error_description") || "Autorización cancelada");
    return NextResponse.redirect(adminUrl.toString());
  }

  const config = await getChannelConfig<{ clientId?: string; clientSecret?: string }>(channel);
  if (!config?.clientId || !config?.clientSecret) {
    adminUrl.searchParams.set("meli_error", "Faltan Client ID / Client Secret guardados para este canal");
    return NextResponse.redirect(adminUrl.toString());
  }

  const redirectUri = `${origin}/api/integrations/meli/callback`;

  try {
    const tokenResponse = await axios.post(
      "https://api.mercadolibre.com/oauth/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      }
    );

    const { access_token, refresh_token, expires_in, user_id } = tokenResponse.data;
    const expiresAt = new Date(Date.now() + (expires_in ?? 21600) * 1000).toISOString();

    let nickname: string | undefined;
    try {
      const meResponse = await axios.get(`https://api.mercadolibre.com/users/${user_id}`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      nickname = meResponse.data?.nickname;
    } catch {
      // el nickname es solo informativo, no bloquea la conexión
    }

    const patch: Record<string, any> = {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt,
    };
    if (user_id) patch.sellerId = String(user_id);
    if (nickname) patch.nickname = nickname;

    await patchChannelConfig(channel, patch);
    await setChannelSyncStatus(channel, "SUCCESS");

    adminUrl.searchParams.set("meli_success", channel);
    return NextResponse.redirect(adminUrl.toString());
  } catch (error) {
    const message = axios.isAxiosError(error)
      ? JSON.stringify(error.response?.data ?? error.message)
      : error instanceof Error
      ? error.message
      : String(error);
    await setChannelSyncStatus(channel, "ERROR", message);
    adminUrl.searchParams.set("meli_error", "No se pudo conectar con Mercado Libre");
    return NextResponse.redirect(adminUrl.toString());
  }
}
