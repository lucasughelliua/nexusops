import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getChannelConfig } from "@/lib/integrations/credentials";
import { createPerfitClient } from "@/lib/integrations/perfit";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  let dateFrom: Date;
  let dateTo: Date;

  if (fromStr && toStr) {
    dateFrom = new Date(fromStr + "T00:00:00-03:00");
    dateTo = new Date(toStr + "T23:59:59-03:00");
  } else {
    dateTo = new Date();
    dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  const config = await getChannelConfig("perfit");
  if (!config) {
    return NextResponse.json(
      { totals: null, campaigns: [], isMock: false, error: "Perfit no configurado" },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const client = createPerfitClient(config);
    const { totals, campaigns } = await client.getEmailStats(dateFrom, dateTo);

    return NextResponse.json(
      { totals, campaigns, isMock: false },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("Error fetching Perfit data:", error);
    return NextResponse.json(
      { totals: null, campaigns: [], isMock: false, error: error?.message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
