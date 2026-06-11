import { NextRequest, NextResponse } from "next/server";
import { getMetricsAnalytics } from "@/lib/analytics";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dateFrom = searchParams.get("date_from") || "2024-05-10";
    const dateTo = searchParams.get("date_to") || "2024-06-10";
    const channel = searchParams.get("channel") || "all";

    const data = await getMetricsAnalytics(dateFrom, dateTo, channel);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error fetching metrics:", error);
    return NextResponse.json(
      { error: "Error fetching metrics" },
      { status: 500 }
    );
  }
}
