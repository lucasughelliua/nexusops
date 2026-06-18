import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import axios from "axios";
import https from "https";

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

  const EPRESIS_USER = process.env.EPRESIS_USER;
  const EPRESIS_PASS = process.env.EPRESIS_PASS;

  if (!EPRESIS_USER || !EPRESIS_PASS) {
    return NextResponse.json(
      { error: "Credenciales de Epresis no configuradas en el servidor" },
      { status: 500 }
    );
  }
  const EPRESIS_BASE = "https://epresis.seguimientodeenvios.ar";

  try {
    console.log("=== CONSTANCIA REQUEST ===");
    console.log("guiaAgente:", guiaAgente);
    console.log("EPRESIS_USER:", EPRESIS_USER);

    // Crear cliente axios con manejo automático de cookies
    const client = axios.create({
      baseURL: EPRESIS_BASE,
      withCredentials: true,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    // 1. Intentar login en Epresis
    console.log("Attempting login...");
    try {
      const loginRes = await client.post(
        "/login",
        new URLSearchParams({
          email: EPRESIS_USER,
          password: EPRESIS_PASS,
        }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": EPRESIS_BASE,
            "Origin": EPRESIS_BASE,
          },
          maxRedirects: 5,
        }
      );
      console.log("Login status:", loginRes.status);
      console.log("Login response headers:", Object.keys(loginRes.headers));
    } catch (loginErr: any) {
      console.log("Login error (continuing anyway):", loginErr.response?.status, loginErr.message);
    }

    // 2. Descargar constancia (con cookies guardadas del login)
    console.log("Attempting to download constancia...");
    const constanciaUrl = `/guias/remito/imprimir-guia?url=constancia_electronica&guia_id=${encodeURIComponent(guiaAgente)}`;
    console.log("URL:", constanciaUrl);

    const constanciaRes = await client.get(constanciaUrl, {
      headers: {
        "Referer": `${EPRESIS_BASE}/login`,
        "Accept": "application/pdf,*/*",
      },
      responseType: "arraybuffer",
      maxRedirects: 5,
      validateStatus: () => true, // No lanzar error en ningún status
    });

    console.log("Constancia status:", constanciaRes.status);
    console.log("Constancia content-type:", constanciaRes.headers["content-type"]);

    // Validar respuesta
    if (!constanciaRes.data || constanciaRes.status >= 400) {
      const bodyPreview = typeof constanciaRes.data === "string"
        ? constanciaRes.data.slice(0, 500)
        : Buffer.from(constanciaRes.data).toString().slice(0, 500);

      console.log("Constancia error response body:", bodyPreview);

      if (constanciaRes.status === 401 || constanciaRes.status === 302) {
        return NextResponse.json(
          { error: "Constancia requiere autenticación", loginRequired: true, url: `${EPRESIS_BASE}/guias/remito/imprimir-guia?url=constancia_electronica&guia_id=${encodeURIComponent(guiaAgente)}` },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: "No se pudo descargar la constancia", status: constanciaRes.status },
        { status: 502 }
      );
    }

    // Verificar si es PDF
    const bufferData = Buffer.from(constanciaRes.data);
    const isPdf = bufferData.slice(0, 4).toString() === "%PDF";
    console.log("Is PDF:", isPdf, "Size:", bufferData.length);

    if (!isPdf) {
      console.warn("Response is not PDF. First 200 chars:", bufferData.slice(0, 200).toString());
      return NextResponse.json(
        { error: "La respuesta no es un PDF válido" },
        { status: 502 }
      );
    }

    console.log("PDF descargado exitosamente, size:", bufferData.length);

    return new NextResponse(bufferData, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="constancia_${guiaAgente}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("Error descargando constancia:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response body:", typeof err.response.data === "string" ? err.response.data.slice(0, 200) : err.response.data);
    }
    return NextResponse.json(
      { error: "No se pudo descargar la constancia", detail: err?.message },
      { status: 502 }
    );
  }
}
