import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ChannelKey, getChannelConfig } from "@/lib/integrations/credentials";

const ALLOWED_CHANNELS: ChannelKey[] = ["meli_1", "meli_2"];

/**
 * GET /api/integrations/meli/connect?channel=meli_1|meli_2
 * Redirige al usuario al flujo de autorización OAuth de Mercado Libre.
 * Requiere que el canal ya tenga guardado un `clientId` (App ID de la
 * aplicación de Mercado Libre) vía /api/integrations.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const channel = request.nextUrl.searchParams.get("channel") as ChannelKey | null;
  if (!channel || !ALLOWED_CHANNELS.includes(channel)) {
    return NextResponse.json({ message: "Canal inválido" }, { status: 400 });
  }

  const config = await getChannelConfig<{ clientId?: string }>(channel);
  if (!config?.clientId) {
    return NextResponse.json(
      { message: "Primero guardá el Client ID de la aplicación de Mercado Libre para este canal" },
      { status: 400 }
    );
  }

  const redirectUri = `${request.nextUrl.origin}/api/integrations/meli/callback`;
  const authUrl = new URL("https://auth.mercadolibre.com.ar/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", channel);

  return NextResponse.redirect(authUrl.toString());
}
