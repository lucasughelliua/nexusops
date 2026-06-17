import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getChannelConfig } from "@/lib/integrations/credentials";
import axios from "axios";

/**
 * GET /api/logistics/constancia?tracking=...
 * Descarga la constancia electrónica de entrega de un envío de Epresis.
 * Solo disponible cuando el estado es "Entrega Efectiva" o similar.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const tracking = request.nextUrl.searchParams.get("tracking")?.trim();
  if (!tracking) return NextResponse.json({ error: "Parámetro tracking requerido" }, { status: 400 });

  const cfg = await getChannelConfig("epresis");
  if (!cfg) return NextResponse.json({ error: "Epresis no configurado" }, { status: 503 });

  const creds = cfg as any;
  const raw: string | undefined = creds.apiUrl?.trim();
  const CORRECT = "https://epresis.seguimientodeenvios.ar";
  const wrong = raw && !raw.includes("epresis.seguimientodeenvios.ar");
  const baseURL = !raw || wrong ? CORRECT : raw;

  try {
    // Intentar obtener la constancia como PDF o URL
    const res = await axios.get(`${baseURL}/api/v1/public/constancia.json`, {
      params: { api_token: creds.apiToken, tracking },
      timeout: 15000,
      responseType: "arraybuffer",
    });

    const contentType = res.headers["content-type"] ?? "application/pdf";

    if (contentType.includes("application/json")) {
      // Respuesta JSON — puede ser una URL de descarga
      const text = Buffer.from(res.data).toString("utf-8");
      const json = JSON.parse(text);
      if (json?.url) {
        return NextResponse.json({ url: json.url });
      }
      return NextResponse.json(json);
    }

    // Es un binario (PDF o imagen) — lo devolvemos directamente
    return new NextResponse(res.data, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="constancia-${tracking}.pdf"`,
      },
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 404) {
        return NextResponse.json(
          { error: "La constancia aún no está disponible para este envío" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `Error de Epresis (HTTP ${status}): ${error.message}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: "Error de conexión" }, { status: 502 });
  }
}
