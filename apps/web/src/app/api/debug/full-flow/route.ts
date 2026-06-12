import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMetricsAnalytics } from "@/lib/analytics";
import { getPeriodRange } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    // Simular exactamente lo que hace el dashboard
    const dateRange = getPeriodRange("last30");

    console.log("[DEBUG FULL FLOW]", {
      dateRange,
      calculatedFromDate: dateRange.from,
      calculatedToDate: dateRange.to,
    });

    // Probar para cada canal
    const results: any = {
      dateRange,
      channels: {},
    };

    // VTEX
    try {
      const vtexMetrics = await getMetricsAnalytics(dateRange.from, dateRange.to, "vtex");
      results.channels.vtex = {
        orders: vtexMetrics.kpi?.orders,
        units: vtexMetrics.kpi?.units,
        revenue: vtexMetrics.kpi?.revenue,
        cancellations: vtexMetrics.kpi?.cancellations,
        sample_daily: vtexMetrics.daily?.slice(0, 3),
        breakdown: vtexMetrics.breakdown?.by_state,
      };
    } catch (e) {
      results.channels.vtex = {
        error: e instanceof Error ? e.message : String(e),
      };
    }

    // MeLi UA
    try {
      const meliMetrics = await getMetricsAnalytics(dateRange.from, dateRange.to, "meli_1");
      results.channels.meli_1 = {
        orders: meliMetrics.kpi?.orders,
        units: meliMetrics.kpi?.units,
        revenue: meliMetrics.kpi?.revenue,
        cancellations: meliMetrics.kpi?.cancellations,
        sample_daily: meliMetrics.daily?.slice(0, 3),
        breakdown: meliMetrics.breakdown?.by_state,
      };
    } catch (e) {
      results.channels.meli_1 = {
        error: e instanceof Error ? e.message : String(e),
      };
    }

    // All channels
    try {
      const allMetrics = await getMetricsAnalytics(dateRange.from, dateRange.to, "all");
      results.channels.all = {
        orders: allMetrics.kpi?.orders,
        units: allMetrics.kpi?.units,
        revenue: allMetrics.kpi?.revenue,
        cancellations: allMetrics.kpi?.cancellations,
        channel_breakdown: allMetrics.channels?.map(ch => ({
          name: ch.channel,
          orders: ch.orders,
          units: ch.units,
          revenue: ch.revenue,
        })),
      };
    } catch (e) {
      results.channels.all = {
        error: e instanceof Error ? e.message : String(e),
      };
    }

    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    });
  }
}
