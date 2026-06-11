import { NextRequest, NextResponse } from "next/server";

// Mock data generation for all platforms
function generateMetricsData(dateFrom: string, dateTo: string, channel: string) {
  const channels = channel === "all"
    ? ["vtex", "meli_1", "meli_2"]
    : [channel];

  // Platform multipliers for variation
  const platformMultipliers: Record<string, number> = {
    vtex: 2.5,
    meli_1: 1.8,
    meli_2: 1.2,
  };

  const baseRevenue = 100000;
  const baseOrders = 300;
  const baseUnits = 450;

  let totalRevenue = 0;
  let totalOrders = 0;
  let totalUnits = 0;

  channels.forEach((ch) => {
    totalRevenue += baseRevenue * platformMultipliers[ch];
    totalOrders += baseOrders * platformMultipliers[ch];
    totalUnits += baseUnits * platformMultipliers[ch];
  });

  // Generate daily data
  const startDate = new Date(dateFrom);
  const endDate = new Date(dateTo);
  const daily = [];

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    let dayRevenue = 0;
    let dayOrders = 0;

    channels.forEach((ch) => {
      dayRevenue += baseRevenue * platformMultipliers[ch] * (0.8 + Math.random() * 0.4);
      dayOrders += baseOrders * platformMultipliers[ch] * (0.8 + Math.random() * 0.4);
    });

    daily.push({
      date: dateStr,
      revenue: Math.floor(dayRevenue),
      orders: Math.floor(dayOrders),
    });
  }

  // Generate heatmap data (day x hour)
  // `day` MUST be numeric (0=Dom … 6=Sáb) to match the HeatmapCell type and
  // the lookup key used by the HeatMap component (`${day}-${hour}`).
  const heatmap = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const isPeakHour = hour >= 9 && hour <= 23;
      const isWeekend = day === 0 || day === 6; // Dom=0, Sáb=6
      const base = isPeakHour ? 50 : 8;
      const weekendBoost = isWeekend && isPeakHour ? 1.3 : 1;
      heatmap.push({
        day,
        hour,
        value: Math.floor((base + Math.random() * 80) * weekendBoost),
      });
    }
  }

  // Channel summary with all required fields
  const totalRevenue30 = totalRevenue * 30;
  const totalOrders30 = totalOrders * 30;
  const totalUnits30 = totalUnits * 30;
  const avgTicket = totalRevenue30 / totalOrders30;

  const channelMap: Record<string, string> = {
    vtex: "VTEX",
    meli_1: "MercadoLibre UA",
    meli_2: "MercadoLibre Sporta",
  };

  const colorMap: Record<string, string> = {
    vtex: "#ef4444",
    meli_1: "#f59e0b",
    meli_2: "#14b8a6",
  };

  const channelSummaries = channels.map((ch) => {
    const chRevenue = Math.floor(baseRevenue * platformMultipliers[ch] * 30);
    const chOrders = Math.floor(baseOrders * platformMultipliers[ch] * 30);
    return {
      channel: channelMap[ch],
      revenue: chRevenue,
      orders: chOrders,
      color: colorMap[ch],
      pct_revenue: (chRevenue / totalRevenue30) * 100,
      avg_ticket: chRevenue / chOrders,
    };
  });

  return {
    kpi: {
      revenue: Math.floor(totalRevenue30),
      orders: Math.floor(totalOrders30),
      units: Math.floor(totalUnits30),
      avg_ticket: Math.round(avgTicket * 100) / 100,
      conversion: 2.8,
      cancellations: Math.floor(totalOrders30 * 0.02),
      compare: {
        revenue_delta: 12.5,
        orders_delta: 8.3,
      },
    },
    daily,
    heatmap,
    channels: channelSummaries,
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dateFrom = searchParams.get("date_from") || "2024-05-10";
    const dateTo = searchParams.get("date_to") || "2024-06-10";
    const channel = searchParams.get("channel") || "all";

    const data = generateMetricsData(dateFrom, dateTo, channel);

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
