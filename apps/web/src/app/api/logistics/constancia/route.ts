import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getChannelConfig } from "@/lib/integrations/credentials";
import axios from "axios";

/**
 * GET /api/logistics/constancia?guiaAgente=...
 * Descarga la constancia electrónica de Epresis y la proxea al browser.
 * Usa el api_token almacenado para autenticar, evitando login manual.
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

  const cfg = await getChannelConfig("epresis");
  const apiToken = (cfg as any)?.apiToken ?? null;

  // URL de la constancia — intentar con api_token como parámetro
  const base = "https://epresis.seguimientodeenvios.ar/guias/remito/imprimir-guia";
  const params = new URLSearchParams({ url: "constancia_electronica", guia_id: guiaAgente });
  if (apiToken) params.set("api_token", apiToken);
  const constanciaUrl = `${base}?${params.toString()}`;

  try {
    const res = await axios.get(constanciaUrl, {
      responseType: "arraybuffer",
      timeout: 20000,
      maxRedirects: 10,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/pdf,*/*",
      },
    });

    const contentType = String(res.headers["content-type"] ?? "application/pdf");
    const isPdf = contentType.includes("pdf");

    // Si devuelve HTML (login page) sin el token, falló la auth
    if (!isPdf && contentType.includes("html")) {
      // Fallback: devolver la URL para que el usuario la abra manualmente
      return NextResponse.json(
        { error: "Epresis requiere autenticación para la constancia.", url: constanciaUrl },
        { status: 401 }
      );
    }

    return new NextResponse(res.data, {
      status: 200,
      headers: {
        "Content-Type": isPdf ? "application/pdf" : contentType,
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
