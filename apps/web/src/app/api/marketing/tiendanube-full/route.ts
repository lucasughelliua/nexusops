import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getChannelConfig } from "@/lib/integrations/credentials";
import {
  createTiendanubeClient,
  type TiendanubeOrder,
  type TiendanubeStats,
} from "@/lib/integrations/tiendanube";

/** Mock orders generator */
function mockOrders(): TiendanubeOrder[] {
  const now = new Date();
  const orders: TiendanubeOrder[] = [];

  for (let i = 0; i < 15; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const createdAt = new Date(
      now.getTime() - daysAgo * 24 * 60 * 60 * 1000
    );

    orders.push({
      id: `order-${1000 + i}`,
      number: String(5000 + i),
      status: ["pending", "processing", "completed", "cancelled"][
        Math.floor(Math.random() * 4)
      ],
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString(),
      total: 15000 + Math.random() * 85000,
      subtotal: 12000 + Math.random() * 68000,
      items_count: Math.floor(1 + Math.random() * 5),
      customer_name: [
        "Juan García",
        "María López",
        "Carlos Martínez",
        "Ana Rodríguez",
        "Fernando González",
      ][Math.floor(Math.random() * 5)],
      payment_status: ["pending", "paid", "failed"][
        Math.floor(Math.random() * 3)
      ],
    });
  }

  return orders.sort(
    (a, b) =>
      new Date(b.created_at).getTime() -
      new Date(a.created_at).getTime()
  );
}

/** Mock stats generator */
function mockStats(orders: TiendanubeOrder[]): TiendanubeStats {
  const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
  return {
    totalOrders: orders.length,
    totalRevenue,
    totalCustomers: Math.floor(orders.length * 0.85),
    avgOrderValue:
      orders.length > 0 ? totalRevenue / orders.length : 0,
    lastOrderDate:
      orders.length > 0
        ? orders[0].created_at
        : undefined,
  };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "Unauthorized" },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  let dateFrom: Date | undefined;
  let dateTo: Date | undefined;

  if (fromStr && toStr) {
    dateFrom = new Date(fromStr + "T00:00:00Z");
    dateTo = new Date(toStr + "T23:59:59Z");
  } else {
    // Default: last 30 days
    dateTo = new Date();
    dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  try {
    const config = await getChannelConfig("tiendanube");

    let orders: TiendanubeOrder[];
    let stats: TiendanubeStats;

    if (config) {
      const client = createTiendanubeClient(config);
      orders = await client.getOrders(dateFrom, dateTo, 100);
      stats = await client.getStats(dateFrom, dateTo);
    } else {
      orders = mockOrders();
      stats = mockStats(orders);
    }

    return NextResponse.json(
      {
        orders,
        stats,
        isMock: !config,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("Error fetching Tiendanube data:", error);
    // Return mock on error
    const orders = mockOrders();
    const stats = mockStats(orders);

    return NextResponse.json(
      {
        orders,
        stats,
        isMock: true,
        error: error?.message,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
