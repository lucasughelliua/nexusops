import { NextRequest, NextResponse } from "next/server";

// Mock live orders feed across all platforms
const CHANNELS = ["VTEX", "MercadoLibre UA", "MercadoLibre Sporta"];

const STATUSES = [
  "payment_approved",
  "invoiced",
  "ready_for_handling",
  "handling",
  "shipped",
  "delivered",
  "cancelled",
];
const STATUS_WEIGHTS = [0.18, 0.14, 0.14, 0.12, 0.16, 0.21, 0.05];

function pickWeighted<T>(items: T[], weights: number[]): T {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += weights[i];
    if (r <= acc) return items[i];
  }
  return items[items.length - 1];
}

function generateOrders(limit: number) {
  const now = Date.now();
  const orders = [];

  for (let i = 0; i < limit; i++) {
    // Spread orders over the last ~8 hours, weighted towards "more recent"
    const minutesAgo = Math.floor(Math.pow(Math.random(), 1.6) * 480);
    const items = Math.floor(Math.random() * 4) + 1;
    const unitPrice = 4000 + Math.random() * 60000;

    orders.push({
      id: `${100000 + Math.floor(Math.random() * 899999)}-${Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase()}`,
      created_at: new Date(now - minutesAgo * 60000).toISOString(),
      channel: CHANNELS[Math.floor(Math.random() * CHANNELS.length)],
      status: pickWeighted(STATUSES, STATUS_WEIGHTS),
      revenue: Math.round(unitPrice * items),
      items,
    });
  }

  return orders.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 1000);

    const orders = generateOrders(limit);

    return NextResponse.json(
      { orders, total: orders.length },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json(
      { error: "Error fetching orders" },
      { status: 500 }
    );
  }
}
