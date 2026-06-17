import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getChannelConfig } from "@/lib/integrations/credentials";
import axios from "axios";

function epresisBase(creds: any): string {
  const raw: string | undefined = creds.apiUrl?.trim();
  const CORRECT = "https://epresis.seguimientodeenvios.ar";
  return !raw || !raw.includes("epresis.seguimientodeenvios.ar") ? CORRECT : raw;
}

/**
 * GET /api/logistics/constancia?tracking=...&guiaAgente=...
 * Descarga la constancia electrónica de entrega.
 * Prueba múltiples endpoints hasta obtener respuesta válida.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const tracking    = request.nextUrl.searchParams.get("tracking")?.trim();
  const guiaAgente  = request.nextUrl.searchParams.get("guiaAgente")?.trim();

  if (!tracking && !guiaAgente) {
    return NextResponse.json({ error: "Se requiere tracking o guiaAgente" }, { status: 400 });
  }

  const cfg = await getChannelConfig("epresis");
  if (!cfg) return NextResponse.json({ error: "Epresis no configurado" }, { status: 503 });

  const creds  = cfg as any;
  const baseURL = epresisBase(creds);
  const token   = creds.apiToken;

  // Candidatos de endpoint en orden de probabilidad
  // Epresis no documenta públicamente el endpoint de constancia,
  // probamos las variantes más comunes de su API v1/v2.
  type Attempt = { method: "get" | "post"; path: string; params?: any; body?: any };
  const attempts: Attempt[] = [];

  if (tracking) {
    attempts.push(
      { method: "get",  path: "/api/v1/public/constancia.json",  params: { api_token: token, tracking } },
      { method: "get",  path: "/api/v1/public/pod.json",         params: { api_token: token, tracking } },
      { method: "post", path: "/api/v2/constancia.json",         body:   { api_token: token, nro_guia: tracking } },
      { method: "post", path: "/api/v2/comprobante.json",        body:   { api_token: token, nro_guia: tracking } },
    );
  }
  if (guiaAgente) {
    attempts.push(
      { method: "get",  path: "/api/v1/public/constancia.json",  params: { api_token: token, guia_agente: guiaAgente } },
      { method: "post", path: "/api/v2/constancia.json",         body:   { api_token: token, guia_agente: guiaAgente } },
    );
  }

  for (const attempt of attempts) {
    try {
      const res = attempt.method === "get"
        ? await axios.get(`${baseURL}${attempt.path}`, { params: attempt.params, timeout: 15000, responseType: "arraybuffer" })
        : await axios.post(`${baseURL}${attempt.path}`, attempt.body, { timeout: 15000, responseType: "arraybuffer" });

      const contentType = String(res.headers["content-type"] ?? "");

      if (contentType.includes("application/json") || contentType.includes("text/")) {
        const text = Buffer.from(res.data as ArrayBuffer).toString("utf-8");
        try {
          const json = JSON.parse(text);
          if (json?.url) return NextResponse.json({ url: json.url });
          if (json?.status === "ok" && json?.data?.url) return NextResponse.json({ url: json.data.url });
          if (json?.error || json?.status === "error") continue; // intento siguiente
          return NextResponse.json(json);
        } catch {
          // text plano — puede ser una URL directa
          const trimmed = text.trim();
          if (trimmed.startsWith("http")) return NextResponse.json({ url: trimmed });
        }
      }

      // Es un binario (PDF / imagen)
      return new NextResponse(res.data as ArrayBuffer, {
        headers: {
          "Content-Type": contentType || "application/pdf",
          "Content-Disposition": `attachment; filename="constancia-${tracking ?? guiaAgente}.pdf"`,
        },
      });
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404 || status === 405) continue; // probar siguiente
      // Error distinto a "no encontrado" — lo reportamos
      return NextResponse.json(
        { error: `Error de Epresis (${status ?? "red"}): ${err?.response?.data ? Buffer.from(err.response.data).toString().slice(0, 200) : err.message}` },
        { status: 502 }
      );
    }
  }

  return NextResponse.json(
    { error: "La constancia electrónica no está disponible en este momento. Verificá que el envío esté entregado o consultá directamente en el portal de Epresis." },
    { status: 404 }
  );
}
