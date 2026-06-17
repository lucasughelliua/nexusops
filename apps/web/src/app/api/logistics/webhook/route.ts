import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getChannelConfig } from "@/lib/integrations/credentials";
import axios from "axios";

/**
 * POST /api/logistics/webhook
 * Receptor de notificaciones de Epresis.
 * Payload esperado: { usuario, token, estado, codigo_estado, remito, guia }
 *
 * Cuando Epresis cambia el estado de un envío, POST-ea a esta URL.
 * Actualizamos el estado en nuestra BD y, si existe, también traemos
 * el historial completo de eventos vía /api/v2/seguimiento.json.
 */
export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { estado, codigo_estado, remito, guia } = body;
  if (!estado || (!remito && !guia)) {
    return NextResponse.json({ error: "Payload incompleto" }, { status: 400 });
  }

  const nroGuia = guia != null ? String(guia) : undefined;
  const remitoStr = remito != null ? String(remito) : undefined;

  // Buscar el envío en BD
  const where: any = {};
  if (nroGuia) where.nroGuia = nroGuia;
  else if (remitoStr) where.remito = remitoStr;

  let shipment = await prisma.shipment.findFirst({ where });

  // Traer historial actualizado de Epresis
  let eventos: any[] = [];
  try {
    const epresisConfig = await getChannelConfig("epresis");
    if (epresisConfig) {
      const creds = epresisConfig as any;
      const baseURL = creds.apiUrl || "https://api.epresis.com";
      const reqBody: any = { api_token: creds.apiToken };
      if (nroGuia) reqBody.nro_guia = nroGuia;
      else if (remitoStr) reqBody.remito = remitoStr;

      const res = await axios.post(`${baseURL}/api/v2/seguimiento.json`, reqBody, { timeout: 10000 });
      if (res.data?.status === "ok" && res.data?.guia?.fechas) {
        eventos = res.data.guia.fechas;
      }
    }
  } catch {
    // Si falla el fetch del historial, solo actualizamos el estado
    if (shipment?.eventos) {
      eventos = shipment.eventos as any[];
    }
    // Append new event
    const newEvent = { fecha: new Date().toLocaleDateString("es-AR"), hora: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }), estado, receptor: null, fecha_pactada: null };
    if (!eventos.find((e: any) => e.estado === estado)) {
      eventos.push(newEvent);
    }
  }

  // Determinar fechaEntrega si el estado es de entrega efectiva
  const ESTADOS_ENTREGA = ["entregada", "entrega efectiva", "entregado"];
  const isEntregado = ESTADOS_ENTREGA.some(e => estado.toLowerCase().includes(e));

  if (shipment) {
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        estado,
        codigoEstado: codigo_estado ?? shipment.codigoEstado,
        eventos: eventos.length ? eventos : (shipment.eventos ?? undefined),
        fechaEntrega: isEntregado && !shipment.fechaEntrega ? new Date() : shipment.fechaEntrega,
        importSource: shipment.importSource,
      },
    });
  } else {
    // Nuevo envío que no conocíamos – crearlo
    await prisma.shipment.create({
      data: {
        nroGuia: nroGuia ?? null,
        remito: remitoStr ?? null,
        estado,
        codigoEstado: codigo_estado ?? null,
        eventos: eventos.length ? eventos : [],
        fechaEntrega: isEntregado ? new Date() : null,
        importSource: "webhook",
      },
    });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
