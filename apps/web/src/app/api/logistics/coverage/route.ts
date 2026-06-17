import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import axios from "axios";

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyVzkowj9Sz2EfZfgIxjmKidE9miNdOOF43GHy1-cCC60CVVZ6IMO0pI7HZs-Jhm0fy/exec";

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
        return NextResponse.json({ cp, cobertura: Boolean(cob) });
      }
    }

    // Extraer texto visible limpio
    const text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    let cobertura: boolean | null = null;

    // Buscar frases completas primero (más confiables)
    if (text.includes("tiene cobertura") || text.includes("con cobertura") || text.includes("si tiene")) {
      cobertura = true;
    } else if (text.includes("no tiene cobertura") || text.includes("sin cobertura") || text.includes("no cubre") || text.includes("no aplica")) {
      cobertura = false;
    }

    // Si no encontramos, buscar palabras sueltas en contexto
    if (cobertura === null) {
      // Buscar "si" o "no" que aparezcan solos (word boundaries)
      const siMatch = /\bsi\b|\bsí\b/.test(text);
      const noMatch = /\bno\b/.test(text);

      if (noMatch && !siMatch) {
        cobertura = false;
      } else if (siMatch && !noMatch) {
        cobertura = true;
      }
    }

    // Último intento: buscar en un pedazo pequeño que probablemente contenga el resultado
    if (cobertura === null) {
      // Buscar los últimos 500 caracteres donde debería estar la respuesta
      const tail = text.slice(-500);
      if (/\bsi\b|\bsí\b/.test(tail) && !/\bno\b/.test(tail)) {
        cobertura = true;
      } else if (/\bno\b/.test(tail) && !/\bsi\b|\bsí\b/.test(tail)) {
        cobertura = false;
      }
    }

    return NextResponse.json({ cp, cobertura });
  } catch (err: any) {
    return NextResponse.json(
      { error: "No se pudo consultar el servicio de cobertura", detail: err?.message },
      { status: 502 }
    );
  }
}
