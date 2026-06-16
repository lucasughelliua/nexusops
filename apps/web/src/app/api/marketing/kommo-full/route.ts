import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getChannelConfig } from "@/lib/integrations/credentials";
import { createKommoClient } from "@/lib/integrations/kommo";
import type { KommoStats } from "@/lib/integrations/kommo";

function mockStats(): KommoStats {
  const new_leads = 170 + Math.round(Math.random() * 30);
  const won = Math.round(new_leads * (0.42 + Math.random() * 0.08));
  const lost = Math.round(new_leads * (0.18 + Math.random() * 0.06));
  const open = Math.max(0, new_leads - won - lost);
  const won_value = won * (45000 + Math.round(Math.random() * 15000));
  const total_value = new_leads * (32000 + Math.round(Math.random() * 8000));

  return {
    total: new_leads,
    new_leads,
    won,
    lost,
    open,
    total_value,
    won_value,
    avg_deal_value: new_leads > 0 ? total_value / new_leads : 0,
    conversion_rate: new_leads > 0 ? (won / new_leads) * 100 : 0,
    pipelines: [
      {
        id: 1,
        name: "Pipeline Principal",
        statuses: [
          { id: 101, name: "Nuevo", type: 0 },
          { id: 102, name: "Contactado", type: 0 },
          { id: 103, name: "Propuesta enviada", type: 0 },
          { id: 104, name: "Negociación", type: 0 },
          { id: 142, name: "Ganado", type: 142 },
          { id: 143, name: "Perdido", type: 143 },
        ],
      },
    ],
    leads_by_status: [
      { statusName: "Nuevo", pipelineName: "Pipeline Principal", count: Math.round(new_leads * 0.25), value: Math.round(total_value * 0.20) },
      { statusName: "Contactado", pipelineName: "Pipeline Principal", count: Math.round(new_leads * 0.20), value: Math.round(total_value * 0.18) },
      { statusName: "Propuesta enviada", pipelineName: "Pipeline Principal", count: Math.round(new_leads * 0.15), value: Math.round(total_value * 0.15) },
      { statusName: "Negociación", pipelineName: "Pipeline Principal", count: Math.round(open * 0.4), value: Math.round(total_value * 0.12) },
      { statusName: "Ganado", pipelineName: "Pipeline Principal", count: won, value: won_value },
      { statusName: "Perdido", pipelineName: "Pipeline Principal", count: lost, value: 0 },
    ],
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

    let stats: KommoStats;
    let isMock = false;

    if (config) {
      const client = createKommoClient(config);
      stats = await client.getStats(dateFrom, dateTo);
    } else {
      stats = mockStats();
      isMock = true;
    }

    return NextResponse.json(
      { stats, isMock },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("Error fetching Kommo full data:", error);
    return NextResponse.json(
      { stats: mockStats(), isMock: true, error: error?.message },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
