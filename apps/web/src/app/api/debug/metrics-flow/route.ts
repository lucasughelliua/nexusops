import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getChannelConfig } from "@/lib/integrations/credentials";
import { createVTEXClient } from "@/lib/integrations/vtex";
import { createMercadoLibreClient } from "@/lib/integrations/mercado-libre";
import { CHANNEL_ACCOUNT_NAME } from "@/lib/integrations/credentials";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    // Simular el flujo exacto de getMetricsAnalytics para 30 días
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const results: any = {
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      channels: {},
    };

    // Probar VTEX
    try {
      const vtexConfig = await getChannelConfig("vtex");
      if (vtexConfig) {
        const vtexClient = createVTEXClient(vtexConfig as any);
        const vtexOrders = await vtexClient.getOrders(from, to);
        results.channels.vtex = {
          config_exists: true,
          orders_count: vtexOrders.length,
          status_breakdown: {
            pending: vtexOrders.filter(o => o.statusBucket === "pending").length,
            dispatched: vtexOrders.filter(o => o.statusBucket === "dispatched").length,
            in_transit: vtexOrders.filter(o => o.statusBucket === "in_transit").length,
            delivered: vtexOrders.filter(o => o.statusBucket === "delivered").length,
            delayed: vtexOrders.filter(o => o.statusBucket === "delayed").length,
            cancelled: vtexOrders.filter(o => o.statusBucket === "cancelled").length,
          },
          sample: vtexOrders.slice(0, 2),
          error: null,
        };
      } else {
        results.channels.vtex = { config_exists: false, error: "No config" };
      }
    } catch (e) {
      results.channels.vtex = {
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      };
    }

    // Probar MeLi UA
    try {
      const meliConfig = await getChannelConfig("meli_1");
      if (meliConfig) {
        const meliClient = createMercadoLibreClient(
          { ...meliConfig, channelKey: "meli_1", channelLabel: CHANNEL_ACCOUNT_NAME["meli_1"] },
          async () => {}
        );
        const meliOrders = await meliClient.getOrders(from, to);
        results.channels.meli_1 = {
          config_exists: true,
          orders_count: meliOrders.length,
          status_breakdown: {
            pending: meliOrders.filter(o => o.statusBucket === "pending").length,
            dispatched: meliOrders.filter(o => o.statusBucket === "dispatched").length,
            in_transit: meliOrders.filter(o => o.statusBucket === "in_transit").length,
            delivered: meliOrders.filter(o => o.statusBucket === "delivered").length,
            delayed: meliOrders.filter(o => o.statusBucket === "delayed").length,
            cancelled: meliOrders.filter(o => o.statusBucket === "cancelled").length,
          },
          sample: meliOrders.slice(0, 2),
          error: null,
        };
      } else {
        results.channels.meli_1 = { config_exists: false, error: "No config" };
      }
    } catch (e) {
      results.channels.meli_1 = {
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      };
    }

    // Probar MeLi Sporta
    try {
      const meliConfig = await getChannelConfig("meli_2");
      if (meliConfig) {
        const meliClient = createMercadoLibreClient(
          { ...meliConfig, channelKey: "meli_2", channelLabel: CHANNEL_ACCOUNT_NAME["meli_2"] },
          async () => {}
        );
        const meliOrders = await meliClient.getOrders(from, to);
        results.channels.meli_2 = {
          config_exists: true,
          orders_count: meliOrders.length,
          status_breakdown: {
            pending: meliOrders.filter(o => o.statusBucket === "pending").length,
            dispatched: meliOrders.filter(o => o.statusBucket === "dispatched").length,
            in_transit: meliOrders.filter(o => o.statusBucket === "in_transit").length,
            delivered: meliOrders.filter(o => o.statusBucket === "delivered").length,
            delayed: meliOrders.filter(o => o.statusBucket === "delayed").length,
            cancelled: meliOrders.filter(o => o.statusBucket === "cancelled").length,
          },
          sample: meliOrders.slice(0, 2),
          error: null,
        };
      } else {
        results.channels.meli_2 = { config_exists: false, error: "No config" };
      }
    } catch (e) {
      results.channels.meli_2 = {
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      };
    }

    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    });
  }
}
