import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parse } from "csv-parse/sync";

// Mapeo flexible de nombres de columnas del CSV al modelo interno
const COL_MAP: Record<string, string[]> = {
  nroGuia:    ["nro_guia","nroguia","guia","nro guia","numero guia","guide","nro. guia"],
  remito:     ["remito","nro_remito","nro venta","nro de venta","pedido","order","referencia","ref"],
  estado:     ["estado","status","state","estado actual"],
  servicio:   ["servicio","service","tipo servicio","tipo_servicio"],
  destinatario:["destinatario","nombre","recipient","cliente","customer","destinatorio"],
  dni:        ["dni","cuit","documento","doc","nro doc","nro. doc"],
  direccion:  ["direccion","calle","address","domicilio"],
  localidad:  ["localidad","ciudad","city","localidad destino"],
  provincia:  ["provincia","province","prov"],
  cp:         ["cp","codigo postal","postal","postal code","cod postal"],
  fechaCreacion:["fecha_creacion","fecha creacion","fecha","date","created_at","fecha alta","f. creacion"],
  fechaEntrega: ["fecha_entrega","fecha entrega","entregado","f. entrega","fecha de entrega"],
  tiendanubeOrderId: ["tiendanube","tiendanube_id","tn_order","tn order","id tiendanube"],
  vtexOrderId:       ["vtex","vtex_id","vtex_order","vtex order","id vtex"],
  mlOrderId:         ["mercadolibre","ml_order","ml order","id ml","ml id","meli"],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/\s+/g, " ");
}

function mapColumns(headers: string[]): Record<string, number> {
  const normalized = headers.map(normalizeHeader);
  const mapping: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(COL_MAP)) {
    for (const alias of aliases) {
      const idx = normalized.indexOf(alias);
      if (idx !== -1) {
        mapping[field] = idx;
        break;
      }
    }
  }
  return mapping;
}

function parseDate(val: string | undefined): Date | null {
  if (!val) return null;
  // Intenta dd/mm/yyyy, yyyy-mm-dd, dd-mm-yyyy
  const clean = val.trim();
  const dmY = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmY) {
    const [, d, m, y] = dmY;
    return new Date(`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}T00:00:00Z`);
  }
  const iso = clean.match(/^\d{4}-\d{2}-\d{2}/);
  if (iso) return new Date(clean);
  return null;
}

const ESTADOS_ENTREGA = ["entregada","entrega efectiva","entregado","ent"];

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });

  const text = await file.text();

  let records: string[][];
  try {
    records = parse(text, {
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
    }) as string[][];
  } catch {
    return NextResponse.json({ error: "No se pudo parsear el CSV. Verificá el formato." }, { status: 422 });
  }

  if (records.length < 2) {
    return NextResponse.json({ error: "El archivo no tiene filas de datos" }, { status: 422 });
  }

  const headers = records[0];
  const colMap = mapColumns(headers);

  if (!colMap.nroGuia && !colMap.remito) {
    return NextResponse.json({
      error: "No se encontraron columnas de identificación (nro_guia o remito). Columnas detectadas: " + headers.join(", "),
    }, { status: 422 });
  }

  const get = (row: string[], field: string): string | undefined => {
    const idx = colMap[field];
    return idx != null ? (row[idx] ?? "").trim() || undefined : undefined;
  };

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    const nroGuia  = get(row, "nroGuia") || null;
    const remito   = get(row, "remito") || null;

    if (!nroGuia && !remito) { skipped++; continue; }

    const estado      = get(row, "estado") || "DESCONOCIDO";
    const isEntregado = ESTADOS_ENTREGA.some(e => estado.toLowerCase().includes(e));

    const data = {
      nroGuia,
      remito,
      estado,
      servicio:          get(row, "servicio") || null,
      destinatario:      get(row, "destinatario") || null,
      dni:               get(row, "dni") || null,
      direccion:         get(row, "direccion") || null,
      localidad:         get(row, "localidad") || null,
      provincia:         get(row, "provincia") || null,
      cp:                get(row, "cp") || null,
      fechaCreacion:     parseDate(get(row, "fechaCreacion")),
      fechaEntrega:      parseDate(get(row, "fechaEntrega")) ?? (isEntregado ? new Date() : null),
      tiendanubeOrderId: get(row, "tiendanubeOrderId") || null,
      vtexOrderId:       get(row, "vtexOrderId") || null,
      mlOrderId:         get(row, "mlOrderId") || null,
      importSource:      "csv" as const,
    };

    // Upsert por nroGuia si existe, si no por remito
    if (nroGuia) {
      const existing = await prisma.shipment.findUnique({ where: { nroGuia } });
      if (existing) {
        await prisma.shipment.update({ where: { nroGuia }, data });
        updated++;
      } else {
        await prisma.shipment.create({ data });
        inserted++;
      }
    } else {
      // Sin nroGuia: buscar por remito
      const existing = await prisma.shipment.findFirst({ where: { remito: remito! } });
      if (existing) {
        await prisma.shipment.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.shipment.create({ data });
        inserted++;
      }
    }
  }

  return NextResponse.json({ ok: true, inserted, updated, skipped, total: records.length - 1 });
}
