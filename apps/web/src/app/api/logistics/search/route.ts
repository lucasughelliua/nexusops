import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getChannelConfig } from "@/lib/integrations/credentials";
import axios from "axios";

export type SearchType = "guia" | "remito" | "dni";

export interface TrackingEvent {
  fecha: string;
  hora: string | null;
  estado: string;
  receptor: string | null;
  fecha_pactada: string | null;
}

export interface SearchResult {
  status: "ok" | "not_found";
  searchType: SearchType;
  searchLabel: string;
  query: string;
  eventos?: TrackingEvent[];
}

function detectType(query: string): { type: SearchType; label: string } {
  const isAllDigits = /^\d+$/.test(query);
  if (isAllDigits && query.length >= 7 && query.length <= 8) {
    return { type: "dni", label: "DNI" };
  }
  if (isAllDigits) {
    return { type: "guia", label: "Nro de Envío" };
  }
  return { type: "remito", label: "Nro de Venta" };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 3) {
    return NextResponse.json({ error: "Ingresá al menos 3 caracteres" }, { status: 400 });
  }

  const { type, label } = detectType(q);
  const epresisConfig = await getChannelConfig("epresis");

  if (!epresisConfig) {
    return NextResponse.json(
      { error: "Integración con Epresis no configurada. Configurala en Administración → Integraciones." },
      { status: 503 }
    );
  }

  const creds = epresisConfig as any;
  const baseURL = creds.apiUrl || "https://epresis.seguimientodeenvios.ar";
  const api_token = creds.apiToken;

  const body: Record<string, string> = { api_token };

  if (type === "guia") {
    body.nro_guia = q;
  } else {
    // DNI y remito/nro de venta: buscar como remito
    body.remito = q;
  }

  try {
    const res = await axios.post(`${baseURL}/api/v2/seguimiento.json`, body, {
      timeout: 15000,
    });

    const data = res.data;

    if (data?.status === "ok" && data?.guia?.fechas?.length) {
      return NextResponse.json({
        status: "ok",
        searchType: type,
        searchLabel: label,
        query: q,
        eventos: data.guia.fechas as TrackingEvent[],
      } satisfies SearchResult);
    }

    return NextResponse.json({
      status: "not_found",
      searchType: type,
      searchLabel: label,
      query: q,
    } satisfies SearchResult);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const msg = error.response?.data?.message || error.message;
      if (status === 404) {
        return NextResponse.json({
          status: "not_found",
          searchType: type,
          searchLabel: label,
          query: q,
        } satisfies SearchResult);
      }
      return NextResponse.json(
        { error: `Error de Epresis (HTTP ${status}): ${msg}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: "Error de conexión con Epresis" }, { status: 502 });
  }
}
