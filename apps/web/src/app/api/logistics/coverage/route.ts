import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import axios from "axios";

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyVzkowj9Sz2EfZfgIxjmKidE9miNdOOF43GHy1-cCC60CVVZ6IMO0pI7HZs-Jhm0fy/exec";

/**
 * GET /api/logistics/coverage?cp=XXXX
 * Consulta cobertura desde Google Apps Script.
 * Con &debug=1 devuelve el texto visible del HTML para diagnosticar.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const cp = request.nextUrl.searchParams.get("cp")?.trim();
  const debug = request.nextUrl.searchParams.get("debug") === "1";

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
        "User-Agent": "Mozilla/5.0 (compatible)",
        "Accept": "text/html,application/json,*/*",
      },
    });

    const raw = String(res.data ?? "");

    // JSON puro
    if (typeof res.data === "object" && res.data !== null) {
      const d = res.data as any;
      const cob = d.cobertura ?? d.tiene_cobertura ?? d.result ?? d.ok ?? null;
      if (cob !== null) {
        return NextResponse.json({ cp, cobertura: Boolean(cob), localidad: d.localidad ?? null, provincia: d.provincia ?? null });
      }
    }

    // Extraer texto visible (sin tags HTML)
    const text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    if (debug) {
      return NextResponse.json({ cp, text: text.slice(0, 2000), rawLength: raw.length });
    }

    let cobertura: boolean | null = null;
    let localidad: string | null = null;
    let provincia: string | null = null;

    // Patrones negativos (más específicos primero)
    const noPatterns = [
      "no tiene cobertura", "sin cobertura", "no cubre", "no disponible",
      "no hay cobertura", "fuera de zona", "no aplica", "no se encuentra",
      "no encontrado", "cp no", "no registrado",
    ];
    // Patrones positivos
    const siPatterns = [
      "tiene cobertura", "con cobertura", "si tiene", "sí tiene",
      "disponible", "cubre el cp", "zona cubierta", "cobertura disponible",
      "cobertura: si", "cobertura: sí", "cobertura:si",
    ];

    for (const p of noPatterns) {
      if (text.includes(p)) { cobertura = false; break; }
    }
    if (cobertura === null) {
      for (const p of siPatterns) {
        if (text.includes(p)) { cobertura = true; break; }
      }
    }

    // Intentar extraer localidad/provincia
    const localidadMatch = raw.match(/localidad[:\s"'>]+([^<"',\n]{2,40})/i);
    const provinciaMatch  = raw.match(/provincia[:\s"'>]+([^<"',\n]{2,40})/i);
    if (localidadMatch) localidad = localidadMatch[1].trim();
    if (provinciaMatch)  provincia  = provinciaMatch[1].trim();

    // Último intento: el texto visible podría ser solo "SI" / "NO" o contener el CP
    if (cobertura === null) {
      // Buscar "si" o "no" como palabras aisladas cerca del CP en el texto
      const cpIdx = text.indexOf(cp);
      const nearby = cpIdx >= 0 ? text.slice(Math.max(0, cpIdx - 50), cpIdx + 100) : text.slice(0, 300);
      if (/\bsi\b|\bsí\b|\btrue\b|\b1\b/.test(nearby)) cobertura = true;
      else if (/\bno\b|\bfalse\b|\b0\b/.test(nearby)) cobertura = false;

      // Si el texto es muy corto, puede ser la respuesta directa
      if (cobertura === null && text.length < 50) {
        if (/\bsi\b|\bsí\b|\btrue\b/.test(text)) cobertura = true;
        else if (/\bno\b|\bfalse\b/.test(text)) cobertura = false;
      }
    }

    return NextResponse.json({ cp, cobertura, localidad, provincia });
  } catch (err: any) {
    return NextResponse.json(
      { error: "No se pudo consultar el servicio de cobertura", detail: err?.message },
      { status: 502 }
    );
  }
}
