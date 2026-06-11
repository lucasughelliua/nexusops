import { NextRequest, NextResponse } from "next/server";
import { getLogisticsAnalytics } from "@/lib/analytics";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const channel = searchParams.get("channel") || "all";

    const data = await getLogisticsAnalytics(channel);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error fetching logistics:", error);
    return NextResponse.json(
      { error: "Error fetching logistics" },
      { status: 500 }
    );
  }
}
