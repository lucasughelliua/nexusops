import { NextRequest, NextResponse } from "next/server";

// Mock products data from all platforms
const mockProducts = [
  { id: "1", name: "Smartphone Samsung A14", channel: "VTEX", units: 256, revenue: 1280000, percent: 18.5 },
  { id: "2", name: "MacBook Air M2", channel: "MercadoLibre UA", units: 145, revenue: 2610000, percent: 15.2 },
  { id: "3", name: "AirPods Pro", channel: "MercadoLibre Sporta", units: 423, revenue: 1053000, percent: 12.8 },
  { id: "4", name: "Samsung Galaxy Watch", channel: "VTEX", units: 189, revenue: 757500, percent: 10.5 },
  { id: "5", name: "iPad Air", channel: "MercadoLibre UA", units: 102, revenue: 816000, percent: 8.3 },
  { id: "6", name: "Sony WH-1000XM4", channel: "MercadoLibre Sporta", units: 267, revenue: 440460, percent: 7.2 },
  { id: "7", name: "Nintendo Switch", channel: "VTEX", units: 156, revenue: 897600, percent: 6.4 },
  { id: "8", name: "Kindle Paperwhite", channel: "MercadoLibre UA", units: 298, revenue: 536400, percent: 5.3 },
  { id: "9", name: "GoPro Hero 11", channel: "MercadoLibre Sporta", units: 78, revenue: 468000, percent: 4.1 },
  { id: "10", name: "DJI Mini 3", channel: "VTEX", units: 45, revenue: 540000, percent: 3.8 },
];

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const channel = searchParams.get("channel") || "all";
    const offset = parseInt(searchParams.get("offset") || "0");
    const limit = 10;

    // Filter by channel if needed
    let filtered = mockProducts;
    if (channel !== "all") {
      const channelMap: Record<string, string> = {
        vtex: "VTEX",
        meli_1: "MercadoLibre UA",
        meli_2: "MercadoLibre Sporta",
      };
      filtered = mockProducts.filter((p) => p.channel === channelMap[channel]);
    }

    // Paginate
    const products = filtered.slice(offset, offset + limit);

    return NextResponse.json(
      {
        products,
        total: filtered.length,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      { error: "Error fetching products" },
      { status: 500 }
    );
  }
}
