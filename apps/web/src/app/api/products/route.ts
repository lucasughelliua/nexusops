import { NextRequest, NextResponse } from "next/server";

// Mock products data from all platforms (VTEX, MercadoLibre UA, MercadoLibre Sporta)
// Field names MUST match the `TopProduct` type in src/types/index.ts:
// { id, name, sku, channel, qty, revenue, pct }
const mockProducts = [
  { id: "1",  name: "Smartphone Samsung A14",  sku: "SAM-A14-128BK",   channel: "VTEX",                qty: 256, revenue: 1280000, pct: 18.5 },
  { id: "2",  name: "MacBook Air M2",           sku: "APL-MBA-M2-256",  channel: "MercadoLibre UA",      qty: 145, revenue: 2610000, pct: 15.2 },
  { id: "3",  name: "AirPods Pro 2da Gen",      sku: "APL-APP-2GEN",    channel: "MercadoLibre Sporta",  qty: 423, revenue: 1053000, pct: 12.8 },
  { id: "4",  name: "Samsung Galaxy Watch 6",   sku: "SAM-GW6-44MM",    channel: "VTEX",                qty: 189, revenue: 757500,  pct: 10.5 },
  { id: "5",  name: "iPad Air 5ta Gen",         sku: "APL-IPA-5G-64",   channel: "MercadoLibre UA",      qty: 102, revenue: 816000,  pct: 8.3 },
  { id: "6",  name: "Sony WH-1000XM4",          sku: "SNY-WH1000XM4",   channel: "MercadoLibre Sporta",  qty: 267, revenue: 440460,  pct: 7.2 },
  { id: "7",  name: "Nintendo Switch OLED",     sku: "NTD-SWITCH-OLED", channel: "VTEX",                qty: 156, revenue: 897600,  pct: 6.4 },
  { id: "8",  name: "Kindle Paperwhite 11va",   sku: "AMZ-KPW-11G",     channel: "MercadoLibre UA",      qty: 298, revenue: 536400,  pct: 5.3 },
  { id: "9",  name: "GoPro Hero 11 Black",      sku: "GPR-HERO11-BLK",  channel: "MercadoLibre Sporta",  qty: 78,  revenue: 468000,  pct: 4.1 },
  { id: "10", name: "DJI Mini 3 Fly More",      sku: "DJI-MINI3-FM",    channel: "VTEX",                qty: 45,  revenue: 540000,  pct: 3.8 },
  { id: "11", name: "Apple Watch SE",           sku: "APL-AWSE-40MM",   channel: "MercadoLibre UA",      qty: 134, revenue: 482400,  pct: 3.5 },
  { id: "12", name: "Cafetera Nespresso Vertuo",sku: "NSP-VRTL-PLUS",   channel: "VTEX",                qty: 87,  revenue: 348000,  pct: 2.9 },
  { id: "13", name: "Mochila Antirrobo USB",    sku: "MOC-ANTI-001",    channel: "MercadoLibre Sporta",  qty: 312, revenue: 280800,  pct: 2.6 },
  { id: "14", name: "Monitor LG 27' 4K",        sku: "LG-27UK850",      channel: "VTEX",                qty: 38,  revenue: 532000,  pct: 2.3 },
  { id: "15", name: "Teclado Mecánico RGB",     sku: "KBD-RGB-TKL",     channel: "MercadoLibre UA",      qty: 198, revenue: 237600,  pct: 1.9 },
];

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const channel = searchParams.get("channel") || "all";
    const offset = parseInt(searchParams.get("offset") || "0");
    // Default limit matches ProductTable's default pageSize (20) so the
    // whole mock catalog fits on a single page without breaking pagination.
    const limit = parseInt(searchParams.get("limit") || "20");

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
