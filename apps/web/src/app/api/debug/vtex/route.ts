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

  try {
    const config = await getChannelConfig("vtex");
    if (!config) {
      return NextResponse.json({ message: "VTEX not configured", config: null });
    }

    // Test basic connection
    const client = createVTEXClient(config as any);
    const testConn = await client.testConnection();

    // Try to fetch orders for last 7 days
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

    let orders: any[] = [];
    let error: any = null;

    try {
      orders = await client.getOrders(from, to);
    } catch (e) {
      error = e instanceof Error ? { message: e.message, stack: e.stack } : e;
    }

    return NextResponse.json({
      config_exists: !!config,
      config_keys: Object.keys(config || {}),
      testConnection: testConn,
      orders_count: orders.length,
      sample_orders: orders.slice(0, 3),
      error,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    });
  }
}
