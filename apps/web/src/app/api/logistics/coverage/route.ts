import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import axios from "axios";

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyVzkowj9Sz2EfZfgIxjmKidE9miNdOOF43GHy1-cCC60CVVZ6IMO0pI7HZs-Jhm0fy/exec";

/**
 * GET /api/logistics/coverage?cp=XXXX
 * Consulta cobertura desde Google Apps Script y parsea la respuesta HTML.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const cp = request.nextUrl.searchParams.get("cp")?.trim();
  if (!cp) return NextResponse.json({ error: "Se requiere el parámetro cp" }, { status: 400 });
  if (!/^\d{4}$/.test(cp)) {
    return NextResponse.json({ error: "El CP debe tener exactamente 4 dígitos" }, { status: 400 });
  }

  try {
    const res = await axios.get(SCRIPT_URL, {
      params: { cp },
      timeout: 15000,
      maxRedirects: 10,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/json,*/*",
      },
    });

    const raw = String(res.data ?? "");

    // Si devuelve JSON puro
    if (typeof res.data === "object" && res.data !== null) {
      const d = res.data as any;
      const cobertura = d.cobertura ?? d.tiene_cobertura ?? d.result ?? d.ok ?? null;
      if (cobertura !== null) {
        return NextResponse.json({ cp, cobertura: Boolean(cobertura), localidad: d.localidad ?? null, provincia: d.provincia ?? null });
      }
    }

    // Parsear HTML: extraer texto visible y buscar señales clave
    // Quitar tags HTML
    const text = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();

    // Buscar frases negativas primero (más específicas)
    const noPatterns = [
      "no tiene cobertura", "sin cobertura", "no cubre", "no disponible",
      "no hay cobertura", "fuera de zona", "no aplica",
    ];
    const siPatterns = [
      "tiene cobertura", "con cobertura", "si tiene", "sí tiene",
      "disponible", "cubre", "zona cubierta", "cobertura disponible",
    ];

    let cobertura: boolean | null = null;
    let localidad: string | null = null;
    let provincia: string | null = null;

    for (const p of noPatterns) {
      if (text.includes(p)) { cobertura = false; break; }
    }
    if (cobertura === null) {
      for (const p of siPatterns) {
        if (text.includes(p)) { cobertura = true; break; }
      }
    }

    // Intentar extraer localidad/provincia del HTML con regex simples
    const localidadMatch = raw.match(/localidad[:\s"'>]+([^<"',\n]{2,40})/i);
    const provinciaMatch  = raw.match(/provincia[:\s"'>]+([^<"',\n]{2,40})/i);
    if (localidadMatch) localidad = localidadMatch[1].trim();
    if (provinciaMatch)  provincia  = provinciaMatch[1].trim();

    // Si no encontramos nada claro, devolver el texto plano para debug
    if (cobertura === null) {
      // Último intento: el script puede retornar solo "SI" o "NO"
      const trimmed = text.trim();
      if (trimmed === "si" || trimmed === "sí" || trimmed === "true") cobertura = true;
      else if (trimmed === "no" || trimmed === "false") cobertura = false;
    }

    return NextResponse.json({ cp, cobertura, localidad, provincia });
  } catch (err: any) {
    return NextResponse.json(
      { error: "No se pudo consultar la planilla", detail: err?.message },
      { status: 502 }
    );
  }
}
