import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getChannelConfig } from "@/lib/integrations/credentials";
import { createVTEXClient } from "@/lib/integrations/vtex";
import { getPeriodRange } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const dateRange = getPeriodRange("last30");

    // Convertir a Date objects igual que en analytics.ts
    const from = new Date(`${dateRange.from}T00:00:00Z`);
    const to = new Date(`${dateRange.to}T23:59:59Z`);

    const config = await getChannelConfig("vtex");
    if (!config) {
      return NextResponse.json({ message: "VTEX not configured" });
    }

    const client = createVTEXClient(config as any);

    // Obtener órdenes y contar cuántas
    const orders = await client.getOrders(from, to);

    return NextResponse.json({
      dateRange,
      dates_converted: {
        from: from.toISOString(),
        to: to.toISOString(),
        from_readable: from.toString(),
        to_readable: to.toString(),
      },
      vtex_config: {
        accountName: config.accountName,
        has_appKey: !!config.appKey,
        has_appToken: !!config.appToken,
      },
      results: {
        total_orders: orders.length,
        by_status: {
          pending: orders.filter(o => o.statusBucket === "pending").length,
          dispatched: orders.filter(o => o.statusBucket === "dispatched").length,
          in_transit: orders.filter(o => o.statusBucket === "in_transit").length,
          delivered: orders.filter(o => o.statusBucket === "delivered").length,
          delayed: orders.filter(o => o.statusBucket === "delayed").length,
          cancelled: orders.filter(o => o.statusBucket === "cancelled").length,
        },
        sample_orders: orders.slice(0, 5).map(o => ({
          id: o.id,
          date: o.date,
          status: o.status,
          statusBucket: o.statusBucket,
          total: o.total,
        })),
      },
      note: "Compare 'total_orders' with VTEX admin. If different, the date range or status filter might be wrong.",
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    });
  }
}
