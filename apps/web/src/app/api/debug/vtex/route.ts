import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getChannelConfig } from "@/lib/integrations/credentials";
import { createVTEXClient } from "@/lib/integrations/vtex";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const days = parseInt(searchParams.get("days") || "7");

  try {
    const config = await getChannelConfig("vtex");
    if (!config) {
      return NextResponse.json({ message: "VTEX not configured", config: null });
    }

    // Test basic connection
    const client = createVTEXClient(config as any);
    const testConn = await client.testConnection();

    // Try to fetch orders for specified period
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    let orders: any[] = [];
    let error: any = null;
    let debugInfo: any = {
      from: from.toISOString(),
      to: to.toISOString(),
      fromISO_formatted: from.toISOString(),
      toISO_formatted: to.toISOString(),
    };

    try {
      orders = await client.getOrders(from, to);
    } catch (e) {
      error = e instanceof Error ? { message: e.message, stack: e.stack, cause: (e as any).cause } : e;
    }

    return NextResponse.json({
      config_exists: !!config,
      config_keys: Object.keys(config || {}),
      testConnection: testConn,
      days,
      debugInfo,
      orders_count: orders.length,
      orders_by_status: {
        pending: orders.filter(o => o.statusBucket === "pending").length,
        dispatched: orders.filter(o => o.statusBucket === "dispatched").length,
        in_transit: orders.filter(o => o.statusBucket === "in_transit").length,
        delivered: orders.filter(o => o.statusBucket === "delivered").length,
        delayed: orders.filter(o => o.statusBucket === "delayed").length,
        cancelled: orders.filter(o => o.statusBucket === "cancelled").length,
      },
      sample_orders: orders.slice(0, 3),
      error,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    });
  }
}
