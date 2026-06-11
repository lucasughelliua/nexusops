import { NextRequest, NextResponse } from "next/server";
import { getLiveOrdersAnalytics } from "@/lib/analytics";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const channel = searchParams.get("channel") || "all";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 1000);

    const data = await getLiveOrdersAnalytics(channel, limit);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json(
      { error: "Error fetching orders" },
      { status: 500 }
    );
  }
}
