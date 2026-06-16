import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchGoogleAdsStats } from "@/lib/integrations/google-sheets";

const CACHE_MS = 5 * 60 * 1000;
let cache: { data: any; expires: number } | null = null;
let cacheKey = "";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const fromStr = sp.get("from");
  const toStr = sp.get("to");

  let dateFrom: Date;
  let dateTo: Date;

  if (fromStr && toStr) {
    dateFrom = new Date(fromStr + "T00:00:00-03:00");
    dateTo = new Date(toStr + "T23:59:59-03:00");
  } else {
    dateTo = new Date();
    dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  const key = `${dateFrom.toISOString()}_${dateTo.toISOString()}`;
  if (cache && cache.expires > Date.now() && cacheKey === key) {
    return NextResponse.json(cache.data, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const stats = await fetchGoogleAdsStats(dateFrom, dateTo);
    const data = { ...stats, isMock: false };
    cache = { data, expires: Date.now() + CACHE_MS };
    cacheKey = key;
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("Error fetching Google Sheets data:", error);
    return NextResponse.json(
      { campaigns: [], totals: null, isMock: false, error: error?.message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
