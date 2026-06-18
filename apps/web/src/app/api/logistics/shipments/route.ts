import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getChannelConfig } from "@/lib/integrations/credentials";
import axios from "axios";

export type SearchType = "guia" | "remito" | "dni" | "tn" | "vtex" | "ml";

export interface TrackingEvent {
  estado_codigo?: string;
  estado: string;
  detalles?: string;
  receptor_nombre?: string;
  receptor_fecha_hora?: string;
  // legacy fields from old API
  fecha?: string;
  hora?: string;
  receptor?: string;
  fecha_pactada?: string;
  dni?: string | null;
}

export interface ShipmentResult {
  id: string;
  nroGuia: string | null;
  guiaAgente: string | null;  // nro de guía interno del transportista (Epresis)
  remito: string | null;
  estado: string;
  servicio: string | null;
  destinatario: string | null;
  dni: string | null;
  localidad: string | null;
  provincia: string | null;
  tiendanubeOrderId: string | null;
  vtexOrderId: string | null;
  mlOrderId: string | null;
  productos: any;
  eventos: TrackingEvent[];
  fechaCreacion: string | null;
  fechaEntrega: string | null;
  source: "db" | "epresis";
}

/**
 * Detección de tipo de búsqueda.
 *
 * Reglas ajustadas al comportamiento real de PAAQ/Epresis:
 * - VTEX sin guión: 8 dígitos numéricos puros (ej: 31533900). PAAQ los recibe como "remito".
 * - DNI / CUIT: Epresis lo interpreta como CUIT. 7 dígitos (DNI viejo) o 11 dígitos (CUIT).
 * - PAAQ tracking: 9–10 dígitos (ej: 455164805).
 * - Remito / nro de venta: alfanumérico o 8 dígitos.
 */
function detectType(q: string): { type: SearchType; label: string } {
  const t = q.trim();
  // ML: nro de venta empieza con 20000 (ej: 20000135479898009)
  if (/^20000\d+$/.test(t))        return { type: "ml",   label: "Pedido MercadoLibre" };
  // VTEX: número largo + guión + dígitos (ej: 1639990689180-01)
  if (/^\d{8,}-\d{1,4}$/.test(t)) return { type: "vtex", label: "Pedido VTEX" };
  // DNI: exactamente 8 dígitos (PAAQ lo interpreta como DNI/CUIT)
  if (/^\d{8}$/.test(t))           return { type: "dni",  label: "DNI" };
  // PAAQ tracking: 9 o más dígitos
  if (/^\d{9,}$/.test(t))          return { type: "guia", label: "Nro de Seguimiento" };
  // Número corto → nro de seguimiento
  if (/^\d+$/.test(t))             return { type: "guia", label: "Nro de Seguimiento" };
  return { type: "remito", label: "Nro de Venta" };
}

function epresisBaseURL(creds: any): string {
  const raw: string | undefined = creds.apiUrl?.trim();
  const CORRECT = "https://epresis.seguimientodeenvios.ar";
  const wrong = raw && !raw.includes("epresis.seguimientodeenvios.ar");
  return !raw || wrong ? CORRECT : raw;
}

/**
 * Busca por nro de tracking/guía en el endpoint público de Epresis.
 * GET /api/v1/public/tracking.json?api_token=...&tracking=...
 */
async function fetchByTracking(tracking: string, creds: any): Promise<ShipmentResult | null> {
  const baseURL = epresisBaseURL(creds);
  try {
    const res = await axios.get(`${baseURL}/api/v1/public/tracking.json`, {
      params: { api_token: creds.apiToken, tracking },
      timeout: 12000,
    });

    if (res.data?.status !== "ok") return null;
    const data = res.data.data ?? res.data;
    const guiaAgente: string | null = data.guia_agente ?? null;
    const historico: any[] = data.tracker?.historico ?? [];
    if (!historico.length) return null;

    const ultimo = historico[historico.length - 1];
    const estadoActual = ultimo?.estado ?? "DESCONOCIDO";
    const ENTREGADO_ESTADOS = ["entrega efectiva", "entregad", "entregada"];
    const isEntregado = ENTREGADO_ESTADOS.some(e => estadoActual.toLowerCase().includes(e));

    return {
      id: `epresis-${tracking}`,
      nroGuia: tracking,
      guiaAgente,
      remito: null,
      estado: estadoActual,
      servicio: null,
      destinatario: historico[0]?.receptor_nombre?.trim() || null,
      dni: null,
      localidad: null,
      provincia: null,
      tiendanubeOrderId: null,
      vtexOrderId: null,
      mlOrderId: null,
      productos: null,
      eventos: historico,
      fechaCreacion: historico[0]?.receptor_fecha_hora ?? null,
      fechaEntrega: isEntregado ? (ultimo?.receptor_fecha_hora ?? null) : null,
      source: "epresis",
    };
  } catch {
    return null;
  }
}

/**
 * Busca en Epresis por remito, guia_agente o cuit según el tipo.
 * POST /api/v2/seguimiento.json
 *
 * Campos que usa PAAQ:
 * - cuit:        DNI o CUIT del comprador
 * - guia_agente: nro de pedido VTEX o MercadoLibre
 * - remito:      nro de venta interno
 */
async function fetchByRemito(q: string, type: SearchType, creds: any): Promise<ShipmentResult | null> {
  const baseURL = epresisBaseURL(creds);

  // VTEX: Epresis busca sin el guión (ej: 1639990689180-01 → 1639990689180)
  const vtexClean = type === "vtex" ? q.replace(/-\d+$/, "") : q;

  let body: any;
  if (type === "dni") {
    body = { api_token: creds.apiToken, cuit: q };
  } else if (type === "vtex" || type === "ml") {
    body = { api_token: creds.apiToken, guia_agente: vtexClean };
  } else if (type === "remito") {
    body = { api_token: creds.apiToken, guia_agente: q };
  } else {
    body = { api_token: creds.apiToken, remito: q };
  }
  try {
    const res = await axios.post(`${baseURL}/api/v2/seguimiento.json`, body, { timeout: 12000 });
    if (res.data?.status === "ok" && res.data?.guia?.fechas?.length) {
      const guia = res.data.guia;
      const eventos = guia.fechas;
      const ultimo = eventos[eventos.length - 1];
      // Extraer nro de guía PAAQ del response para poder generar constancia
      const guiaAgente: string | null =
        guia.nro_guia ?? guia.guia_agente ?? guia.tracking ?? guia.nro ?? null;
      return {
        id: `epresis-${q}`,
        nroGuia: guiaAgente,
        guiaAgente,
        remito: q,
        estado: ultimo?.estado ?? "DESCONOCIDO",
        servicio: guia.servicio ?? null,
        destinatario: guia.destinatario ?? guia.receptor ?? null,
        dni: type === "dni" ? q : null,
        localidad: guia.localidad ?? null,
        provincia: guia.provincia ?? null,
        tiendanubeOrderId: null,
        vtexOrderId: type === "vtex" ? q : null,
        mlOrderId: type === "ml" ? q : null,
        productos: null,
        eventos,
        fechaCreacion: eventos[0]?.fecha ?? guia.fecha_creacion ?? null,
        fechaEntrega: null,
        source: "epresis",
      };
    }
  } catch {}
  return null;
}

/**
 * GET /api/logistics/shipments?q=...
 * Busca primero en la BD local, luego en Epresis como fallback.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) {
    return NextResponse.json({ error: "Ingresá al menos 3 caracteres" }, { status: 400 });
  }

  const { type, label } = detectType(q);

  // 1. Buscar en BD local
  const whereConditions: any[] = [];
  if (type === "guia")   whereConditions.push({ nroGuia: q });
  if (type === "remito") whereConditions.push({ remito: q });
  if (type === "dni")    whereConditions.push({ dni: q }, { remito: q });
  if (type === "tn")     whereConditions.push({ tiendanubeOrderId: q }, { remito: q });
  if (type === "vtex")   whereConditions.push({ vtexOrderId: q }, { remito: q });
  if (type === "ml")     whereConditions.push({ mlOrderId: q }, { remito: q });

  const dbResults = await prisma.shipment.findMany({
    where: { OR: whereConditions },
    orderBy: { fechaCreacion: "desc" },
    take: 20,
  });

  if (dbResults.length > 0) {
    const results: ShipmentResult[] = dbResults.map(s => ({
      id: s.id,
      nroGuia: s.nroGuia,
      guiaAgente: null,
      remito: s.remito,
      estado: s.estado,
      servicio: s.servicio,
      destinatario: s.destinatario,
      dni: s.dni,
      localidad: s.localidad,
      provincia: s.provincia,
      tiendanubeOrderId: s.tiendanubeOrderId,
      vtexOrderId: s.vtexOrderId,
      mlOrderId: s.mlOrderId,
      productos: s.productos,
      eventos: (s.eventos as unknown as TrackingEvent[]) ?? [],
      fechaCreacion: s.fechaCreacion?.toISOString() ?? null,
      fechaEntrega: s.fechaEntrega?.toISOString() ?? null,
      source: "db",
    }));
    return NextResponse.json({ results, searchType: type, searchLabel: label, query: q, total: results.length });
  }

  // 2. Fallback: consultar Epresis en tiempo real
  const cfg = await getChannelConfig("epresis");
  if (cfg) {
    const creds = cfg as any;
    let epresisResult: ShipmentResult | null = null;

    if (type === "guia") {
      epresisResult = await fetchByTracking(q, creds);
    } else if (type === "dni" || type === "remito" || type === "vtex" || type === "ml") {
      epresisResult = await fetchByRemito(q, type, creds);
      // Si no tenemos guiaAgente del POST, intentar extraerlo de los eventos
      if (epresisResult && !epresisResult.guiaAgente && epresisResult.eventos && epresisResult.eventos.length > 0) {
        // Buscar en eventos algún número que parezca un nro de seguimiento PAAQ (9+ dígitos)
        for (const evento of epresisResult.eventos) {
          const codigo = (evento as any).estado_codigo || (evento as any).codigo || "";
          if (/^\d{9,}$/.test(String(codigo))) {
            const tracked = await fetchByTracking(String(codigo), creds);
            if (tracked) {
              epresisResult = { ...tracked, remito: q, vtexOrderId: type === "vtex" ? q : null, mlOrderId: type === "ml" ? q : null };
            }
            break;
          }
        }
      }
    }

    if (epresisResult) {
      return NextResponse.json({ results: [epresisResult], searchType: type, searchLabel: label, query: q, total: 1 });
    }
  }

  return NextResponse.json({ results: [], searchType: type, searchLabel: label, query: q, total: 0 });
}
