import axios, { AxiosInstance } from "axios";
import {
  IntegrationClient,
  IntegrationError,
  MetricsOptions,
  MetricData,
  CredentialValue,
} from "./types";
import { Platform } from "@prisma/client";

interface EpresisCredentials {
  apiToken: string;
  apiUrl?: string; // defaults to production
}

export interface EpresisShipment {
  nro_guia: string;
  remito?: string;
  estado: string;
  fecha: string;
  hora?: string;
  servicio?: string;
  receptor?: string;
  total_value?: number;
}

export interface EpresisStats {
  totalGuiasConfirmadas: number;
  totalGuiasPendientes: number;
  estadoCounts: { estado: string; cantidad: number }[];
  servicioCounts: { servicio: string; cantidad: number }[];
  isMock: boolean;
}

/**
 * Epresis Integration Client
 * Conecta con la API de Epresis para tracking de envíos
 * Documentación: https://epresis.seguimientodeenvios.ar/docs/index.html
 */
export class EpresisClient implements IntegrationClient {
  platform = Platform.EPRESIS;
  private client: AxiosInstance;
  private apiToken: string;

  constructor(credentials: EpresisCredentials | CredentialValue) {
    const creds = credentials as any;
    this.apiToken = creds.apiToken;

    // Ignorar apiUrl si parece ser el sitio web (no la API)
    const rawUrl: string | undefined = creds.apiUrl;
    const isWebsite = rawUrl && !rawUrl.includes("api.epresis") && rawUrl.includes("epresis.seguimientodeenvios");
    const baseURL = (!rawUrl || isWebsite) ? "https://api.epresis.com" : rawUrl;

    this.client = axios.create({
      baseURL,
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
      // Seguir redirects manteniendo el método (evita POST→GET en 301/302)
      maxRedirects: 5,
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      // dummy-test.json es el endpoint oficial de health check de Epresis
      await this.client.post("/api/v2/dummy-test.json", { api_token: this.apiToken });
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          throw new IntegrationError(
            this.platform,
            "Epresis API token inválido o expirado",
            error.response?.status,
            error
          );
        }
        throw new IntegrationError(
          this.platform,
          `Failed to connect to Epresis: ${error.response?.data?.message || error.response?.statusText || error.message}`,
          error.response?.status,
          error
        );
      }
      throw new IntegrationError(this.platform, "Failed to connect to Epresis", undefined, error);
    }
  }

  /**
   * Validar credenciales
   */
  async validateCredentials(creds: CredentialValue): Promise<boolean> {
    try {
      const credentials = creds as any;
      const testClient = new EpresisClient(credentials);
      return await testClient.testConnection();
    } catch {
      return false;
    }
  }

  /**
   * Obtener estadísticas de envíos agregadas
   * En un caso real, tendríamos un endpoint de estadísticas o haríamos query de múltiples guías.
   * Por ahora, retornamos datos mock con la estructura esperada.
   */
  async getStats(dateFrom?: Date, dateTo?: Date): Promise<EpresisStats> {
    // La API de Epresis no expone un endpoint directo de estadísticas
    // En producción, deberíamos:
    // 1. Consultar un endpoint de búsqueda que retorne múltiples guías
    // 2. O tener acceso a un endpoint de reportes/estadísticas
    // 3. O hacer caching de datos previamente sincronizados
    //
    // Por ahora, retornamos estructura mock para pruebas
    return this.generateMockStats();
  }

  /**
   * Obtener métricas según MetricsOptions
   */
  async getMetrics(options: MetricsOptions): Promise<MetricData[]> {
    const stats = await this.getStats(options.startDate, options.endDate);

    return [
      {
        metricType: "total_guias_confirmadas",
        value: stats.totalGuiasConfirmadas,
        date: new Date(),
      },
      {
        metricType: "total_guias_pendientes",
        value: stats.totalGuiasPendientes,
        date: new Date(),
      },
    ];
  }

  /**
   * Generar datos mock realistas de Epresis
   * Basados en el screenshot del usuario
   */
  private generateMockStats(): EpresisStats {
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
}

/**
 * Factory para crear cliente de Epresis
 */
export function createEpresisClient(credentials: CredentialValue): EpresisClient {
  return new EpresisClient(credentials as any);
}
