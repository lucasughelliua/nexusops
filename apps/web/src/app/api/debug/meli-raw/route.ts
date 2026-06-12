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
    const cutoff30 = now - 30 * 24 * 60 * 60 * 1000;

    // 1) Conteo usando date_created (lo que hace getOrders actualmente)
    const fromISO = new Date(cutoff30).toISOString();
    const toISO = new Date(now).toISOString();

    const byCreated = await client.client.get("/orders/search", {
      params: {
        seller: sellerId,
        "order.date_created.from": fromISO,
        "order.date_created.to": toISO,
        status: "all",
        sort: "date_desc",
        limit: 1,
        offset: 0,
      },
    });

    // 2) Conteo usando date_closed
    const byClosed = await client.client.get("/orders/search", {
      params: {
        seller: sellerId,
        "order.date_closed.from": fromISO,
        "order.date_closed.to": toISO,
        status: "all",
        sort: "date_desc",
        limit: 1,
        offset: 0,
      },
    });

    // 3) Conteo sin filtro de fecha pero con status paid/confirmed (para comparar)
    const byStatusAll = await client.client.get("/orders/search", {
      params: {
        seller: sellerId,
        "order.date_created.from": fromISO,
        "order.date_created.to": toISO,
        sort: "date_desc",
        limit: 1,
        offset: 0,
      },
    });

    // 4) Traer una muestra de órdenes para ver campos de fecha disponibles
    const sample = await client.client.get("/orders/search", {
      params: {
        seller: sellerId,
        "order.date_created.from": fromISO,
        "order.date_created.to": toISO,
        status: "all",
        sort: "date_desc",
        limit: 5,
        offset: 0,
      },
    });

    return NextResponse.json({
      sellerId,
      date_range: { fromISO, toISO },
      counts: {
        by_date_created_status_all: byCreated.data?.paging,
        by_date_closed_status_all: byClosed.data?.paging,
        by_date_created_no_status_filter: byStatusAll.data?.paging,
      },
      sample_orders: (sample.data?.results ?? []).map((o: any) => ({
        id: o.id,
        status: o.status,
        date_created: o.date_created,
        date_closed: o.date_closed,
        last_updated: o.last_updated,
        shipping_status: o.shipping?.status,
        total_amount: o.total_amount,
      })),
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
