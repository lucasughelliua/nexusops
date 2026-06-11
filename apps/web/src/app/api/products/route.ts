import { NextRequest, NextResponse } from "next/server";
import { getTopProductsAnalytics } from "@/lib/analytics";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const channel = searchParams.get("channel") || "all";
    const offset = parseInt(searchParams.get("offset") || "0");
    // Default limit matches ProductTable's default pageSize (20)
    const limit = parseInt(searchParams.get("limit") || "20");
    const statusFilterRaw = searchParams.get("status_filter");
    const statusFilter = statusFilterRaw ? statusFilterRaw.split(",") : undefined;

    const data = await getTopProductsAnalytics(channel, offset, limit, { statusFilter });

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      { error: "Error fetching products" },
      { status: 500 }
    );
  }
}
