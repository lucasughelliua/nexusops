import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getChannelConfig } from "@/lib/integrations/credentials";
import axios from "axios";

export type SearchType = "guia" | "remito" | "dni" | "tn" | "vtex" | "ml";

export interface ShipmentResult {
  id: string;
  nroGuia: string | null;
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
  eventos: any;
  fechaCreacion: string | null;
  fechaEntrega: string | null;
  source: "db" | "epresis";
}

function detectType(q: string): { type: SearchType; label: string } {
  const t = q.trim();
  // ML: empieza con ML seguido de letras y dígitos
  if (/^ML[A-Z]/i.test(t)) return { type: "ml", label: "Pedido MercadoLibre" };
  // VTEX: formato con guión y sufijo numérico
  if (/^\d{7,}-\d+$/.test(t)) return { type: "vtex", label: "Pedido VTEX" };
  // TN: número de 8+ dígitos largo (TN usa IDs largos tipo 1234567890)
  if (/^\d{8,}$/.test(t)) return { type: "tn", label: "Pedido TiendaNube" };
  // DNI: 7-8 dígitos
  if (/^\d{7,8}$/.test(t)) return { type: "dni", label: "DNI" };
  // Número puro (6 o menos dígitos) → nro_guia
  if (/^\d+$/.test(t)) return { type: "guia", label: "Nro de Envío" };
  // Alfanumérico → remito
  return { type: "remito", label: "Nro de Venta" };
}

async function fetchFromEpresis(q: string, type: SearchType): Promise<ShipmentResult | null> {
  const cfg = await getChannelConfig("epresis");
  if (!cfg) return null;

  const creds = cfg as any;
  const baseURL = creds.apiUrl || "https://api.epresis.com";
  const body: any = { api_token: creds.apiToken };

  if (type === "guia") body.nro_guia = q;
  else body.remito = q; // dni y remito se buscan como remito

  try {
    const res = await axios.post(`${baseURL}/api/v2/seguimiento.json`, body, { timeout: 12000 });
    if (res.data?.status === "ok" && res.data?.guia?.fechas?.length) {
      const eventos = res.data.guia.fechas;
      const ultimo = eventos[eventos.length - 1];
      return {
        id: `epresis-${q}`,
        nroGuia: type === "guia" ? q : null,
        remito: type !== "guia" ? q : null,
        estado: ultimo?.estado ?? "DESCONOCIDO",
        servicio: null,
        destinatario: null,
        dni: type === "dni" ? q : null,
        localidad: null,
        provincia: null,
        tiendanubeOrderId: null,
        vtexOrderId: null,
        mlOrderId: null,
        productos: null,
        eventos,
        fechaCreacion: eventos[0]?.fecha ?? null,
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
 * Soporta: nro_guia, remito, DNI, pedido TN/VTEX/ML.
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
      eventos: s.eventos,
      fechaCreacion: s.fechaCreacion?.toISOString() ?? null,
      fechaEntrega: s.fechaEntrega?.toISOString() ?? null,
      source: "db",
    }));
    return NextResponse.json({ results, searchType: type, searchLabel: label, query: q, total: results.length });
  }

  // 2. Fallback: consultar Epresis en tiempo real
  const epresisResult = await fetchFromEpresis(q, type);
  if (epresisResult) {
    return NextResponse.json({ results: [epresisResult], searchType: type, searchLabel: label, query: q, total: 1 });
  }

  return NextResponse.json({ results: [], searchType: type, searchLabel: label, query: q, total: 0 });
}
