import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getChannelConfig } from "@/lib/integrations/credentials";
import { createEpresisClient } from "@/lib/integrations/epresis";
import type { EpresisStats } from "@/lib/integrations/epresis";

/**
 * GET /api/logistics/stats
 * Obtiene estadísticas de logística desde Epresis
 *
 * Query params:
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD (opcional, default últimos 30 días)
 *   ?mock=true (fuerza datos mock para testing)
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const forceMock = searchParams.get("mock") === "true";

    // Si fuerza mock o no hay credenciales, retorna datos mock
    if (forceMock) {
      const mockStats = generateMockStats();
      return NextResponse.json({ stats: mockStats, isMock: true });
    }

    const epresisConfig = await getChannelConfig("epresis");

    // Si no hay config, retorna mock
    if (!epresisConfig) {
      const mockStats = generateMockStats();
      return NextResponse.json({ stats: mockStats, isMock: true });
    }

    // Crear cliente y obtener estadísticas reales
    const client = createEpresisClient(epresisConfig);
    const stats = await client.getStats();

    return NextResponse.json({ stats, isMock: stats.isMock ?? false });
  } catch (error) {
    console.error("Error fetching logistics stats:", error);

    // En caso de error, retorna mock en lugar de fallar
    const mockStats = generateMockStats();
    return NextResponse.json(
      { stats: mockStats, isMock: true, error: "Usando datos de ejemplo" },
      { status: 200 }
    );
  }
}

/**
 * Genera datos mock realistas de Epresis para testing
 */
function generateMockStats(): EpresisStats {
  const estados = [
    { estado: "Cancelaciones", cantidad: 10 },
    { estado: "Depósito", cantidad: 2 },
    { estado: "Devoluciones", cantidad: 118 },
    { estado: "Entrega EFECTIVA", cantidad: 663 },
    { estado: "Entrega Impuesto", cantidad: 44 },
    { estado: "Envío Impuesto", cantidad: 31 },
    { estado: "Pendiente", cantidad: 28 },
  ];

  const servicios = [
    { servicio: "Camioneta Fija", cantidad: 39 },
    { servicio: "Flex Same Day", cantidad: 602 },
    { servicio: "Butting en Camionceta", cantidad: 148 },
    { servicio: "Same Day Web", cantidad: 107 },
  ];

  const totalGuias = estados.reduce((sum, e) => sum + e.cantidad, 0);

  return {
    totalGuiasConfirmadas: totalGuias,
    totalGuiasPendientes: 0,
    estadoCounts: estados,
    servicioCounts: servicios,
    isMock: true,
  };
}
