import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getChannelConfig } from "@/lib/integrations/credentials";
import axios from "axios";

export type SearchType = "guia" | "remito";

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
 * Detección de tipo de búsqueda - SIMPLIFICADO
 *
 * Solo dos tipos:
 * - "guia": Número de seguimiento PAAQ (9+ dígitos)
 * - "remito": Número de venta / pedido (cualquier otra cosa)
 */
function detectType(q: string): { type: SearchType; label: string } {
  const t = q.trim();
  // PAAQ tracking: 9 o más dígitos puros = número de seguimiento
  if (/^\d{9,}$/.test(t)) {
    return { type: "guia", label: "Nro de Seguimiento PAAQ" };
  }
  // Todo lo demás = número de venta (VTEX, ML, remito, etc)
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

  let body: any;
  if (type === "remito") {
    // Para números de venta: intentar como guia_agente (puede ser VTEX, ML, etc)
    body = { api_token: creds.apiToken, guia_agente: q };
  } else {
    // Para número de seguimiento PAAQ
    body = { api_token: creds.apiToken, remito: q };
  }

  try {
    const res = await axios.post(`${baseURL}/api/v2/seguimiento.json`, body, { timeout: 12000 });
    console.log("Epresis response status:", res.data?.status);
    console.log("Epresis guia fields:", {
      guia_agente: res.data?.guia?.guia_agente,
      nro_guia: res.data?.guia?.nro_guia,
      tracking: res.data?.guia?.tracking,
      nro: res.data?.guia?.nro,
    });

    if (res.data?.status === "ok" && res.data?.guia?.fechas?.length) {
      const guia = res.data.guia;
      const eventos = guia.fechas;
      const ultimo = eventos[eventos.length - 1];

      // Extraer número de seguimiento PAAQ (debe ser 9+ dígitos puros)
      // Buscar solo números sin guiones ni caracteres especiales
      let guiaAgente: string | null = null;

      // Intentar en orden: guia_agente, nro_guia, tracking, nro
      const candidates = [
        guia.guia_agente,
        guia.nro_guia,
        guia.tracking,
        guia.nro,
      ];

      for (const candidate of candidates) {
        if (!candidate) continue;
        const str = String(candidate);
        // Extraer solo los dígitos (eliminar guiones y otros caracteres)
        const onlyDigits = str.replace(/\D/g, "");
        if (onlyDigits.length >= 9 && /^\d{9,}$/.test(onlyDigits)) {
          guiaAgente = onlyDigits;
          console.log("guiaAgente encontrado:", onlyDigits, "desde:", candidate);
          break;
        }
      }

      // Si no encontró en campos principales, buscar en eventos
      if (!guiaAgente && eventos && eventos.length > 0) {
        console.log("Buscando en eventos...");
        for (const evento of eventos) {
          const codigo = (evento as any).estado_codigo || (evento as any).codigo || "";
          const onlyDigits = String(codigo).replace(/\D/g, "");
          if (onlyDigits.length >= 9 && /^\d{9,}$/.test(onlyDigits)) {
            guiaAgente = onlyDigits;
            console.log("guiaAgente encontrado en evento:", onlyDigits);
            break;
          }
        }
      }

      if (!guiaAgente) {
        console.warn("No se encontró guiaAgente de 9+ dígitos. Usando fallback...");
      }
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

  // Si hay en BD, usarlo como base pero consultar Epresis para actualizar guiaAgente
  if (dbResults.length > 0) {
    const dbResult = dbResults[0];
    if (dbResult.guiaAgente) {
      // Ya tiene guiaAgente, devolver como está
      const result: ShipmentResult = {
        id: dbResult.id,
        nroGuia: dbResult.nroGuia,
        guiaAgente: dbResult.guiaAgente,
        remito: dbResult.remito,
        estado: dbResult.estado,
        servicio: dbResult.servicio,
        destinatario: dbResult.destinatario,
        dni: dbResult.dni,
        localidad: dbResult.localidad,
        provincia: dbResult.provincia,
        tiendanubeOrderId: dbResult.tiendanubeOrderId,
        vtexOrderId: dbResult.vtexOrderId,
        mlOrderId: dbResult.mlOrderId,
        productos: dbResult.productos,
        eventos: (dbResult.eventos as unknown as TrackingEvent[]) ?? [],
        fechaCreacion: dbResult.fechaCreacion?.toISOString() ?? null,
        fechaEntrega: dbResult.fechaEntrega?.toISOString() ?? null,
        source: "db",
      };
      return NextResponse.json({ results: [result], searchType: type, searchLabel: label, query: q, total: 1 });
    }
  }

  // 2. Consultar Epresis en tiempo real
  const cfg = await getChannelConfig("epresis");
  if (cfg) {
    const creds = cfg as any;
    let epresisResult: ShipmentResult | null = null;

    if (type === "guia") {
      // Búsqueda directa por número de seguimiento PAAQ
      epresisResult = await fetchByTracking(q, creds);
    } else if (type === "remito") {
      // Búsqueda por número de venta (VTEX, ML, etc)
      epresisResult = await fetchByRemito(q, "remito", creds);
    }

    if (epresisResult) {
      // Actualizar en BD si existe
      if (epresisResult.guiaAgente && dbResults.length > 0) {
        const dbResult = dbResults[0];
        try {
          await prisma.shipment.update({
            where: { id: dbResult.id },
            data: { guiaAgente: epresisResult.guiaAgente },
          });
        } catch {}
      }
      return NextResponse.json({ results: [epresisResult], searchType: type, searchLabel: label, query: q, total: 1 });
    }
  }

  // Si tiene en BD sin guiaAgente y no pudo consultar Epresis
  if (dbResults.length > 0) {
    const result: ShipmentResult = {
      id: dbResults[0].id,
      nroGuia: dbResults[0].nroGuia,
      guiaAgente: dbResults[0].guiaAgente ?? null,
      remito: dbResults[0].remito,
      estado: dbResults[0].estado,
      servicio: dbResults[0].servicio,
      destinatario: dbResults[0].destinatario,
      dni: dbResults[0].dni,
      localidad: dbResults[0].localidad,
      provincia: dbResults[0].provincia,
      tiendanubeOrderId: dbResults[0].tiendanubeOrderId,
      vtexOrderId: dbResults[0].vtexOrderId,
      mlOrderId: dbResults[0].mlOrderId,
      productos: dbResults[0].productos,
      eventos: (dbResults[0].eventos as unknown as TrackingEvent[]) ?? [],
      fechaCreacion: dbResults[0].fechaCreacion?.toISOString() ?? null,
      fechaEntrega: dbResults[0].fechaEntrega?.toISOString() ?? null,
      source: "db",
    };
    return NextResponse.json({ results: [result], searchType: type, searchLabel: label, query: q, total: 1 });
  }

  return NextResponse.json({ results: [], searchType: type, searchLabel: label, query: q, total: 0 });
}
