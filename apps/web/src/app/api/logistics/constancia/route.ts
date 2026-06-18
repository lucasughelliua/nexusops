import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import axios, { AxiosInstance } from "axios";
import * as http from "http";
import * as https from "https";

/**
 * GET /api/logistics/constancia?guiaAgente=...
 * Descarga la constancia electrónica de Epresis.
 * Usa credenciales preconfiguradas para login automático.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const guiaAgente = request.nextUrl.searchParams.get("guiaAgente")?.trim();
  if (!guiaAgente) {
    return NextResponse.json(
      { error: "Se requiere guiaAgente para generar la constancia" },
      { status: 400 }
    );
  }

  const EPRESIS_USER = process.env.EPRESIS_USER || "lucasughelli";
  const EPRESIS_PASS = process.env.EPRESIS_PASS || "Lughelli01@";
  const EPRESIS_BASE = "https://epresis.seguimientodeenvios.ar";

  try {
    // Crear cliente axios que mantenga cookies automáticamente
    const jar = new http.Agent();
    const httpsJar = new https.Agent();

    const client: AxiosInstance = axios.create({
      httpAgent: jar,
      httpsAgent: httpsJar,
      withCredentials: true,
      maxRedirects: 10,
    });

    // 1. Login en Epresis
    const loginRes = await client.post(
      `${EPRESIS_BASE}/login`,
      new URLSearchParams({
        email: EPRESIS_USER,
        password: EPRESIS_PASS,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (compatible)",
          "Referer": EPRESIS_BASE,
        },
      }
    );

    // 2. Descargar constancia usando la misma sesión
    const constanciaRes = await client.get(
      `${EPRESIS_BASE}/guias/remito/imprimir-guia?url=constancia_electronica&guia_id=${encodeURIComponent(guiaAgente)}`,
      {
        responseType: "arraybuffer",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible)",
          "Referer": EPRESIS_BASE,
        },
      }
    );

    // Verificar que sea PDF (primeros bytes: %PDF)
    const buffer = Buffer.from(constanciaRes.data);
    const isPdf = buffer.slice(0, 4).toString() === "%PDF";

    if (!isPdf) {
      return NextResponse.json(
        { error: "La respuesta no es un PDF válido" },
        { status: 502 }
      );
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="constancia_${guiaAgente}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("Error descargando constancia:", err.message);
    return NextResponse.json(
      { error: "No se pudo descargar la constancia", detail: err?.message },
      { status: 502 }
    );
  }
}
