import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getChannelConfig } from "@/lib/integrations/credentials";
import { createMercadoLibreClient } from "@/lib/integrations/mercado-libre";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const channelParam = (request.nextUrl.searchParams.get("channel") ?? "meli_1") as "meli_1" | "meli_2";

  try {
    const config = await getChannelConfig(channelParam);
    if (!config) {
      return NextResponse.json({ message: `${channelParam} not configured` });
    }

    const client: any = createMercadoLibreClient(config as any);
    await client.ensureFreshToken?.();
    const sellerId = await client.getSellerId();

    const now = Date.now();

    // Distintas estrategias de rango de fechas para "últimos 30 días"
    const ranges: Record<string, { from: string; to: string }> = {
      // A) Rango actual de producción: días calendario en UTC
      utc_days: { from: "2026-05-14T00:00:00Z", to: "2026-06-12T23:59:59Z" },
      // B) Días calendario en horario Argentina (-03:00)
      argentina_days: { from: "2026-05-13T03:00:00Z", to: "2026-06-13T02:59:59Z" },
      // C) Ventana deslizante exacta (ahora - 30 días)
      sliding_now: { from: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(), to: new Date(now).toISOString() },
      // D) 31 días calendario en UTC (por si admin incluye un día extra)
      utc_31days: { from: "2026-05-13T00:00:00Z", to: "2026-06-12T23:59:59Z" },
    };

    const results: Record<string, any> = {};

    for (const [key, range] of Object.entries(ranges)) {
      try {
        const byCreated = await client.client.get("/orders/search", {
          params: {
            seller: sellerId,
            "order.date_created.from": range.from,
            "order.date_created.to": range.to,
            status: "all",
            sort: "date_desc",
            limit: 1,
            offset: 0,
          },
        });

        const byClosed = await client.client.get("/orders/search", {
          params: {
            seller: sellerId,
            "order.date_closed.from": range.from,
            "order.date_closed.to": range.to,
            status: "all",
            sort: "date_desc",
            limit: 1,
            offset: 0,
          },
        });

        results[key] = {
          range,
          total_by_date_created: byCreated.data?.paging?.total,
          total_by_date_closed: byClosed.data?.paging?.total,
        };
      } catch (e: any) {
        results[key] = { error: e?.message };
      }
    }

    return NextResponse.json({
      sellerId,
      target_admin: { sales: 2189, units: 2237 },
      results,
      note: "Compara cada total con 2189 (ventas reportadas por MeLi)",
    });
  } catch (error: any) {
    return NextResponse.json({
      error: {
        message: error?.message,
        response_data: error?.response?.data,
        response_status: error?.response?.status,
      },
    });
  }
}
