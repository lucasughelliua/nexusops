import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getChannelConfig } from "@/lib/integrations/credentials";
import { prisma } from "@/lib/db";
import axios from "axios";

function epresisBase(creds: any): string {
  const raw: string | undefined = creds.apiUrl?.trim();
  const CORRECT = "https://epresis.seguimientodeenvios.ar";
  return !raw || !raw.includes("epresis.seguimientodeenvios.ar") ? CORRECT : raw;
}

function classifyEstado(estado: string) {
  const e = estado.toLowerCase();
  if (e.includes("entregad") || e.includes("efectiva")) return "entregado";
  if (e.includes("devoluci") || e.includes("devuelt"))   return "devolucion";
  if (e.includes("cancelac") || e.includes("cancelad")) return "cancelado";
  return "en_transito";
}

/**
 * POST /api/logistics/sync
 * Sincroniza envíos de Epresis para un rango de fechas.
 * Intenta el endpoint de listado de Epresis; si no existe, devuelve error claro.
 *
 * Body: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const cfg = await getChannelConfig("epresis");
  if (!cfg) return NextResponse.json({ error: "Epresis no configurado" }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const { from, to } = body as { from?: string; to?: string };
  if (!from || !to) return NextResponse.json({ error: "Se requieren 'from' y 'to' (YYYY-MM-DD)" }, { status: 400 });

  const creds = cfg as any;
  const baseURL = epresisBase(creds);

  // Intentamos el endpoint de listado de Epresis (v2)
  // Epresis puede exponer algo como /api/v2/listado.json con filtros de fecha
  const LISTADO_ENDPOINTS = [
    "/api/v2/listado.json",
    "/api/v2/guias.json",
    "/api/v2/envios.json",
    "/api/v1/public/listado.json",
  ];

  let rawShipments: any[] = [];
  let usedEndpoint = "";
  let endpointError = "";

  for (const ep of LISTADO_ENDPOINTS) {
    try {
      const res = await axios.post(`${baseURL}${ep}`, {
        api_token: creds.apiToken,
        fecha_desde: from,
        fecha_hasta: to,
      }, { timeout: 20000 });

      if (res.data?.status === "ok") {
        // Puede venir como data.guias, data.envios, data.listado, o directamente un array
        rawShipments = res.data.guias ?? res.data.envios ?? res.data.listado ?? res.data.data ?? [];
        usedEndpoint = ep;
        break;
      }
    } catch (err: any) {
      // 404 = endpoint no existe, continuamos; otro error = anotamos y seguimos
      const status = err?.response?.status;
      if (status !== 404) {
        endpointError = `${ep}: ${err?.response?.data?.message || err.message}`;
      }
    }
  }

  if (!usedEndpoint) {
    return NextResponse.json({
      error: "Epresis no expone un endpoint de listado por fechas. Usá la importación CSV o registrá el webhook para sincronización automática.",
      detail: endpointError || "Todos los endpoints retornaron 404",
      noEndpoint: true,
    }, { status: 422 });
  }

  if (!rawShipments.length) {
    return NextResponse.json({ synced: 0, message: "Sin envíos en el período indicado" });
  }

  // Mapear y upsert cada shipment
  let synced = 0;
  for (const s of rawShipments) {
    const nroGuia = s.nro_guia ?? s.guia ?? s.tracking ?? null;
    const remito  = s.remito ?? s.nro_venta ?? null;
    if (!nroGuia && !remito) continue;

    const estado = s.estado ?? s.ultimo_estado ?? "DESCONOCIDO";
    const ENTREGADO_KEYWORDS = ["entregad", "efectiva"];
    const isEntregado = ENTREGADO_KEYWORDS.some(k => estado.toLowerCase().includes(k));

    try {
      const existing = await prisma.shipment.findFirst({
        where: nroGuia ? { nroGuia } : { remito: remito! },
        select: { id: true },
      });

      const updateData = {
        estado,
        codigoEstado: s.codigo_estado ?? undefined,
        servicio: s.servicio ?? undefined,
        eventos: s.historico ?? s.eventos ?? undefined,
        fechaEntrega: isEntregado && s.fecha_entrega ? new Date(s.fecha_entrega) : undefined,
        importSource: "epresis_sync",
      };

      if (existing) {
        await prisma.shipment.update({ where: { id: existing.id }, data: updateData });
      } else {
        await prisma.shipment.create({
          data: {
            nroGuia,
            remito,
            estado,
            codigoEstado: s.codigo_estado ?? null,
            servicio: s.servicio ?? null,
            destinatario: s.destinatario ?? s.receptor ?? null,
            dni: s.dni ?? null,
            direccion: s.direccion ?? null,
            localidad: s.localidad ?? null,
            provincia: s.provincia ?? null,
            cp: s.cp ?? null,
            eventos: s.historico ?? s.eventos ?? [],
            fechaCreacion: s.fecha_creacion ? new Date(s.fecha_creacion) : new Date(from),
            fechaEntrega: isEntregado && s.fecha_entrega ? new Date(s.fecha_entrega) : null,
            importSource: "epresis_sync",
          },
        });
      }
      synced++;
    } catch {}
  }

  return NextResponse.json({ synced, total: rawShipments.length, endpoint: usedEndpoint });
}
