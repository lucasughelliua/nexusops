import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const metricsQuerySchema = z.object({
  accountId: z.string().optional(),
  platform: z.string().optional(),
  metricType: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.string().transform(Number).optional(),
});

/**
 * GET /api/metrics
 * Obtener métricas con filtros
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const queryData = {
      accountId: searchParams.get("accountId") || undefined,
      platform: searchParams.get("platform") || undefined,
      metricType: searchParams.get("metricType") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      limit: searchParams.get("limit") || "1000",
    };

    const validatedQuery = metricsQuerySchema.safeParse(queryData);

    if (!validatedQuery.success) {
      return NextResponse.json(
        {
          message: "Validation failed",
          errors: validatedQuery.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      accountId,
      platform,
      metricType,
      startDate,
      endDate,
      limit = 1000,
    } = validatedQuery.data;

    // Build where clause
    const where: any = {
      userId: session.user.id,
    };

    if (accountId) {
      where.accountId = accountId;
    }

    if (platform) {
      where.platform = platform;
    }

    if (metricType) {
      where.metricType = metricType;
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = new Date(startDate);
      }
      if (endDate) {
        where.date.lte = new Date(endDate);
      }
    }

    // Get metrics
    const metrics = await prisma.metric.findMany({
      where,
      include: {
        account: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        date: "desc",
      },
      take: Math.min(limit, 5000), // Max 5000 records
    });

    // Group metrics by date and type for easier visualization
    const groupedByDate = new Map<string, Map<string, number>>();

    for (const metric of metrics) {
      const dateStr = metric.date.toISOString().split("T")[0];

      if (!groupedByDate.has(dateStr)) {
        groupedByDate.set(dateStr, new Map());
      }

      const dateMetrics = groupedByDate.get(dateStr)!;
      const key = `${metric.platform}-${metric.metricType}`;

      const current = dateMetrics.get(key) || 0;
      dateMetrics.set(key, current + metric.value);
    }

    // Convert to array format for charts
    const chartData = Array.from(groupedByDate.entries()).map(
      ([date, metricsMap]) => {
        const obj: any = { date };

        for (const [key, value] of metricsMap.entries()) {
          obj[key] = value;
        }

        return obj;
      }
    );

    // Calculate summary statistics
    const summary = {
      totalRecords: metrics.length,
      uniquePlatforms: [...new Set(metrics.map((m) => m.platform))],
      uniqueMetricTypes: [...new Set(metrics.map((m) => m.metricType))],
      dateRange: {
        start: metrics.length > 0 ? metrics[metrics.length - 1].date : null,
        end: metrics.length > 0 ? metrics[0].date : null,
      },
      metrics: {
        // Calculate aggregates by metric type
        ...Object.fromEntries(
          [...new Set(metrics.map((m) => m.metricType))].map((type) => [
            type,
            {
              sum: metrics
                .filter((m) => m.metricType === type)
                .reduce((sum, m) => sum + m.value, 0),
              avg:
                metrics
                  .filter((m) => m.metricType === type)
                  .reduce((sum, m) => sum + m.value, 0) /
                metrics.filter((m) => m.metricType === type).length,
              max: Math.max(
                ...metrics
                  .filter((m) => m.metricType === type)
                  .map((m) => m.value)
              ),
              min: Math.min(
                ...metrics
                  .filter((m) => m.metricType === type)
                  .map((m) => m.value)
              ),
            },
          ])
        ),
      },
    };

    return NextResponse.json(
      {
        metrics,
        chartData,
        summary,
        count: metrics.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching metrics:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
