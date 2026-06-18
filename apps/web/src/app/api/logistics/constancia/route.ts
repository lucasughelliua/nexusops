import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
    // 1. Login en Epresis
    const loginRes = await fetch(`${EPRESIS_BASE}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (compatible)",
      },
      body: new URLSearchParams({
        email: EPRESIS_USER,
        password: EPRESIS_PASS,
      }).toString(),
      redirect: "manual", // no seguir redirecciones automáticas
    });

    // Extraer cookies del login
    const setCookieHeader = loginRes.headers.get("set-cookie");
    if (!setCookieHeader) {
      return NextResponse.json(
        { error: "No se pudo autenticar con Epresis" },
        { status: 401 }
      );
    }

    // 2. Descargar constancia usando la sesión
    const constanciaRes = await fetch(
      `${EPRESIS_BASE}/guias/remito/imprimir-guia?url=constancia_electronica&guia_id=${encodeURIComponent(guiaAgente)}`,
      {
        method: "GET",
        headers: {
          Cookie: setCookieHeader.split(";")[0], // usar la primera cookie
          "User-Agent": "Mozilla/5.0 (compatible)",
        },
      }
    );

    if (!constanciaRes.ok) {
      return NextResponse.json(
        { error: "No se pudo descargar la constancia", status: constanciaRes.status },
        { status: 502 }
      );
    }

    const buffer = await constanciaRes.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="constancia_${guiaAgente}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "No se pudo descargar la constancia", detail: err?.message },
      { status: 502 }
    );
  }
}
