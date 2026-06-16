import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getChannelConfig } from "@/lib/integrations/credentials";
import { createKommoClient } from "@/lib/integrations/kommo";
import type { KommoStats } from "@/lib/integrations/kommo";

function emptyStats(): KommoStats {
  return {
    total: 0,
    new_leads: 0,
    won: 0,
    lost: 0,
    open: 0,
    total_value: 0,
    won_value: 0,
    avg_deal_value: 0,
    conversion_rate: 0,
    pipelines: [],
    leads_by_status: [],
  };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  let dateFrom: Date | undefined;
  let dateTo: Date | undefined;

  if (fromStr && toStr) {
    dateFrom = new Date(fromStr + "T00:00:00-03:00");
    dateTo = new Date(toStr + "T23:59:59-03:00");
  } else {
    dateTo = new Date();
    dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  try {
    const config = await getChannelConfig("kommo");

    if (!config) {
      return NextResponse.json(
        { stats: emptyStats(), isMock: true, error: null },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const client = createKommoClient(config);
    const stats = await client.getStats(dateFrom, dateTo);

    return NextResponse.json(
      { stats, isMock: false },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("Error fetching Kommo full data:", error);
    const message =
      error?.originalError?.response?.data?.title ||
      error?.message ||
      String(error);
    return NextResponse.json(
      { stats: emptyStats(), isMock: true, error: message },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
