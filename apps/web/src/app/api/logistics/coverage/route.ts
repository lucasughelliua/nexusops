import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import axios from "axios";

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyVzkowj9Sz2EfZfgIxjmKidE9miNdOOF43GHy1-cCC60CVVZ6IMO0pI7HZs-Jhm0fy/exec";

/**
 * GET /api/logistics/coverage?cp=XXXX
 * Consulta si un código postal tiene cobertura en la planilla de Google Sheets.
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
      // Google Apps Script puede redirigir
      maxRedirects: 5,
    });

    // El script puede devolver JSON o texto plano
    const data = res.data;

    if (typeof data === "object") {
      return NextResponse.json(data);
    }

    // Texto plano: intentar interpretar
    const text = String(data).toLowerCase().trim();
    const tiene = text.includes("si") || text.includes("sí") || text.includes("true") || text.includes("1") || text.includes("cobertura");
    return NextResponse.json({ cp, cobertura: tiene, raw: String(data) });
  } catch (err: any) {
    return NextResponse.json(
      { error: "No se pudo consultar la planilla", detail: err?.message },
      { status: 502 }
    );
  }
}
