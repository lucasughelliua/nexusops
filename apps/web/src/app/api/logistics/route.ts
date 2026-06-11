import { NextRequest, NextResponse } from "next/server";

// Mock logistics summary across all platforms
export async function GET(request: NextRequest) {
  try {
    const dispatched = 1240 + Math.floor(Math.random() * 60);
    const in_transit = 380 + Math.floor(Math.random() * 40);
    const delivered = 5180 + Math.floor(Math.random() * 100);
    const delayed = 95 + Math.floor(Math.random() * 20);
    const pending = 210 + Math.floor(Math.random() * 30);

    return NextResponse.json(
      {
        dispatched,
        in_transit,
        delivered,
        delayed,
        pending,
        avg_days: 2.4,
        on_time_rate: 91.5,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching logistics:", error);
    return NextResponse.json(
      { error: "Error fetching logistics" },
      { status: 500 }
    );
  }
}
