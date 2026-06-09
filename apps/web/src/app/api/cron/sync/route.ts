import { NextRequest, NextResponse } from "next/server";
import { syncService } from "@/lib/sync-service";

/**
 * POST /api/cron/sync
 * Sincronizar todas las métricas (llamado por Vercel Cron cada 15 minutos)
 *
 * Vercel Cron configuration (vercel.json):
 * {
 *   "crons": [{
 *     "path": "/api/cron/sync",
 *     "schedule": "*/15 * * * *"  // Cada 15 minutos
 *   }]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Verificar secret para seguridad
    const authHeader = request.headers.get("authorization");
    const expectedSecret = process.env.CRON_SECRET || "test-secret";

    if (process.env.NODE_ENV === "production") {
      if (authHeader !== `Bearer ${expectedSecret}`) {
        return NextResponse.json(
          { message: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    console.log("[CRON] Starting synchronization at", new Date().toISOString());

    // Ejecutar sincronización global
    const startTime = Date.now();
    await syncService.syncAll();
    const duration = Date.now() - startTime;

    console.log(`[CRON] Synchronization completed in ${duration}ms`);

    return NextResponse.json(
      {
        message: "Sync completed successfully",
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[CRON] Sync error:", error);

    return NextResponse.json(
      {
        message: "Sync failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/sync (para testing)
 */
export async function GET(request: NextRequest) {
  // Solo en desarrollo
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  try {
    console.log("[CRON-TEST] Starting test sync");

    const startTime = Date.now();
    await syncService.syncAll();
    const duration = Date.now() - startTime;

    console.log(`[CRON-TEST] Sync completed in ${duration}ms`);

    return NextResponse.json(
      {
        message: "Test sync completed",
        duration: `${duration}ms`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[CRON-TEST] Error:", error);

    return NextResponse.json(
      {
        message: "Test sync failed",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
