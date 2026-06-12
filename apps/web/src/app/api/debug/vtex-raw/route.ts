import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getChannelConfig } from "@/lib/integrations/credentials";
import { createVTEXClient } from "@/lib/integrations/vtex";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = await getChannelConfig("vtex");
    if (!config) {
      return NextResponse.json({ message: "VTEX not configured" });
    }

    const client: any = createVTEXClient(config as any);

    const now = Date.now();
    const cutoff30 = now - 30 * 24 * 60 * 60 * 1000;

    const raw: any[] = [];
    let page = 1;
    const maxPages = 15;

    while (page <= maxPages) {
      const response = await client.client.get("/oms/pvt/orders", {
        params: { per_page: 100, page },
      });
      const data = response.data;
      const list: any[] = data?.list ?? [];
      raw.push(...list);

      const totalPages = data?.paging?.pages ?? 1;
      if (page >= totalPages || list.length === 0) break;
      page++;
    }

    // Analizar usando creationDate vs lastChange
    let byCreation30 = 0;
    let byLastChange30 = 0;
    let byAuthorizedDate30 = 0;
    const statuses: Record<string, number> = {};
    const sampleFields = raw[0] ? Object.keys(raw[0]) : [];

    for (const o of raw) {
      const creation = new Date(o.creationDate).getTime();
      const lastChange = o.lastChange ? new Date(o.lastChange).getTime() : null;
      const authorized = o.authorizedDate ? new Date(o.authorizedDate).getTime() : null;

      if (creation >= cutoff30) byCreation30++;
      if (lastChange && lastChange >= cutoff30) byLastChange30++;
      if (authorized && authorized >= cutoff30) byAuthorizedDate30++;

      statuses[o.status] = (statuses[o.status] ?? 0) + 1;
    }

    return NextResponse.json({
      total_fetched: raw.length,
      pages_fetched: page,
      sample_fields_available: sampleFields,
      counts_last_30_days: {
        by_creationDate: byCreation30,
        by_lastChange: byLastChange30,
        by_authorizedDate: byAuthorizedDate30,
      },
      status_breakdown_all_fetched: statuses,
      oldest_order_creationDate: raw[raw.length - 1]?.creationDate,
      newest_order_creationDate: raw[0]?.creationDate,
      sample_order_full: raw[0],
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    });
  }
}
