import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getChannelConfig } from "@/lib/integrations/credentials";
import axios from "axios";

/**
 * POST /api/logistics/register-webhook
 * Registra la URL de nuestro webhook en Epresis para recibir notificaciones automáticas.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const cfg = await getChannelConfig("epresis");
  if (!cfg) {
    return NextResponse.json({ error: "Credenciales de Epresis no configuradas" }, { status: 503 });
  }

  const creds = cfg as any;
  const baseURL = creds.apiUrl || "https://api.epresis.com";

  // URL pública de nuestro webhook
  const appUrl = process.env.NEXTAUTH_URL || "https://nexusops.up.railway.app";
  const webhookUrl = `${appUrl}/api/logistics/webhook`;

  try {
    const res = await axios.post(
      `${baseURL}/api/v2/integracion.json`,
      {
        api_token: creds.apiToken,
        url: webhookUrl,
        notificacion: true,
      },
      { timeout: 15000 }
    );

    return NextResponse.json({ ok: true, webhookUrl, response: res.data });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return NextResponse.json(
        { error: `Error de Epresis: ${error.response?.data?.message || error.message}`, status: error.response?.status },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: "Error de conexión" }, { status: 502 });
  }
}
