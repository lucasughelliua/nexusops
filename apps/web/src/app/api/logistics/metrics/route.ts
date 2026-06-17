import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Clasificadores de estado
const ENTREGADO_KEYWORDS = ["entregad", "entrega efectiva", "entrega impuest"];
const EN_TRANSITO_KEYWORDS = ["transit", "programac", "picking", "envío impuest", "envio impuest"];
const DEVOLUCION_KEYWORDS = ["devoluci", "devuelt"];
const CANCELADO_KEYWORDS = ["cancelac", "cancelad"];

function classify(estado: string): "entregado" | "en_transito" | "devolucion" | "cancelado" | "pendiente" | "otro" {
  const e = estado.toLowerCase();
  if (ENTREGADO_KEYWORDS.some(k => e.includes(k))) return "entregado";
  if (DEVOLUCION_KEYWORDS.some(k => e.includes(k))) return "devolucion";
  if (CANCELADO_KEYWORDS.some(k => e.includes(k))) return "cancelado";
  if (EN_TRANSITO_KEYWORDS.some(k => e.includes(k))) return "en_transito";
  if (e.includes("pendiente") || e.includes("deposito") || e.includes("depósito")) return "pendiente";
  return "otro";
}

function isDelayed(shipment: any): boolean {
  // Si tiene fechaPactada y no está entregado y la fecha pactada ya pasó
  if (!shipment.fechaPactada) return false;
  if (classify(shipment.estado) === "entregado") return false;
  return new Date(shipment.fechaPactada) < new Date();
}

/**
 * GET /api/logistics/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD&servicio=...&estado=...
 * Calcula métricas de envíos desde la BD local.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const from    = sp.get("from");
  const to      = sp.get("to");
  const servicio = sp.get("servicio");
  const estado  = sp.get("estado");

  const where: any = {};

  if (from || to) {
    where.fechaCreacion = {};
    if (from) where.fechaCreacion.gte = new Date(`${from}T00:00:00Z`);
    if (to)   where.fechaCreacion.lte = new Date(`${to}T23:59:59Z`);
  }
  if (servicio) where.servicio = { contains: servicio, mode: "insensitive" };
  if (estado)   where.estado   = { contains: estado,   mode: "insensitive" };

  const all = await prisma.shipment.findMany({ where, select: {
    id: true, estado: true, servicio: true, fechaCreacion: true,
    fechaEntrega: true, fechaPactada: true, localidad: true, provincia: true,
  }});

  const total = all.length;
  const counts = { entregado: 0, en_transito: 0, devolucion: 0, cancelado: 0, pendiente: 0, otro: 0 };
  let demorados = 0;
  const byServicio: Record<string, number> = {};
  const byEstado: Record<string, number> = {};
  const byProvincia: Record<string, number> = {};
  let sumDiasEntrega = 0;
  let countConDias = 0;

  for (const s of all) {
    const cat = classify(s.estado);
    counts[cat]++;
    if (isDelayed(s)) demorados++;

    byServicio[s.servicio ?? "Sin servicio"] = (byServicio[s.servicio ?? "Sin servicio"] ?? 0) + 1;
    byEstado[s.estado] = (byEstado[s.estado] ?? 0) + 1;
    byProvincia[s.provincia ?? "Sin provincia"] = (byProvincia[s.provincia ?? "Sin provincia"] ?? 0) + 1;

    if (s.fechaCreacion && s.fechaEntrega) {
      const dias = (s.fechaEntrega.getTime() - s.fechaCreacion.getTime()) / (1000 * 60 * 60 * 24);
      if (dias >= 0 && dias <= 60) {
        sumDiasEntrega += dias;
        countConDias++;
      }
    }
  }

  const tasaEntrega = total > 0 ? Math.round((counts.entregado / total) * 100) : 0;
  const promedioDiasEntrega = countConDias > 0 ? Math.round(sumDiasEntrega / countConDias * 10) / 10 : null;

  // Listas ordenadas
  const servicioList = Object.entries(byServicio)
    .map(([servicio, cantidad]) => ({ servicio, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  const estadoList = Object.entries(byEstado)
    .map(([estado, cantidad]) => ({ estado, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  const provinciaList = Object.entries(byProvincia)
    .map(([provincia, cantidad]) => ({ provincia, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 15);

  // Servicios únicos disponibles (para filtro)
  const serviciosDisponibles = await prisma.shipment.findMany({
    where: { servicio: { not: null } },
    select: { servicio: true },
    distinct: ["servicio"],
  }).then(r => r.map(x => x.servicio!).filter(Boolean).sort());

  return NextResponse.json({
    total,
    entregados: counts.entregado,
    enTransito: counts.en_transito,
    devoluciones: counts.devolucion,
    cancelados: counts.cancelado,
    pendientes: counts.pendiente,
    demorados,
    tasaEntrega,
    promedioDiasEntrega,
    byServicio: servicioList,
    byEstado: estadoList,
    byProvincia: provinciaList,
    serviciosDisponibles,
    hasData: total > 0,
  });
}
