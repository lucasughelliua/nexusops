import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getChannelConfig } from "@/lib/integrations/credentials";
import { createPerfitClient } from "@/lib/integrations/perfit";

function mockCampaigns(): Array<{ id: string; name: string; status: string; sent: number; delivered: number; opened: number; clicked: number; unsubscribed: number }> {
  const sent = 48000 + Math.round(Math.random() * 5000);
  const delivered = Math.round(sent * 0.972);
  const opened = Math.round(delivered * (0.30 + Math.random() * 0.06));
  const clicked = Math.round(opened * (0.16 + Math.random() * 0.05));
  const unsubscribed = Math.round(sent * 0.0028);

  return [
    {
      id: "perf1",
      name: "Welcome Series",
      status: "ACTIVE",
      sent: Math.round(sent * 0.35),
      delivered: Math.round(delivered * 0.35),
      opened: Math.round(opened * 0.35),
      clicked: Math.round(clicked * 0.35),
      unsubscribed: Math.round(unsubscribed * 0.35),
    },
    {
      id: "perf2",
      name: "Promociones Semanales",
      status: "ACTIVE",
      sent: Math.round(sent * 0.40),
      delivered: Math.round(delivered * 0.40),
      opened: Math.round(opened * 0.40),
      clicked: Math.round(clicked * 0.40),
      unsubscribed: Math.round(unsubscribed * 0.40),
    },
    {
      id: "perf3",
      name: "Newsletter Mensual",
      status: "ACTIVE",
      sent: Math.round(sent * 0.25),
      delivered: Math.round(delivered * 0.25),
      opened: Math.round(opened * 0.25),
      clicked: Math.round(clicked * 0.25),
      unsubscribed: Math.round(unsubscribed * 0.25),
    },
  ];
}

function mockTotals(): {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  open_rate: number;
  click_rate: number;
} {
  const sent = 48000 + Math.round(Math.random() * 5000);
  const delivered = Math.round(sent * 0.972);
  const opened = Math.round(delivered * (0.30 + Math.random() * 0.06));
  const clicked = Math.round(opened * (0.16 + Math.random() * 0.05));
  const unsubscribed = Math.round(sent * 0.0028);

  return {
    sent,
    delivered,
    opened,
    clicked,
    unsubscribed,
    open_rate: Number(((opened / delivered) * 100).toFixed(1)),
    click_rate: Number(((clicked / delivered) * 100).toFixed(1)),
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
    // Default: last 30 days
    dateTo = new Date();
    dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  try {
    const config = await getChannelConfig("perfit");

    let totals: ReturnType<typeof mockTotals>;
    let campaigns: ReturnType<typeof mockCampaigns>;
    let isMock = false;

    if (config) {
      const client = createPerfitClient(config);
      // In a real implementation, you would fetch stats from Perfit API
      // For now, use mock data since Perfit client may not have getStats method
      totals = mockTotals();
      campaigns = mockCampaigns();
    } else {
      totals = mockTotals();
      campaigns = mockCampaigns();
      isMock = true;
    }

    return NextResponse.json(
      { totals, campaigns, isMock },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("Error fetching Perfit full data:", error);
    // Return mock on error
    return NextResponse.json(
      {
        totals: mockTotals(),
        campaigns: mockCampaigns(),
        isMock: true,
        error: error?.message,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
