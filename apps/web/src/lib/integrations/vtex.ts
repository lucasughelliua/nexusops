import axios, { AxiosInstance } from "axios";
import {
  IntegrationClient,
  IntegrationError,
  MetricsOptions,
  MetricData,
  CredentialValue,
} from "./types";
import { Platform } from "@prisma/client";

interface VTEXCredentials {
  accountName: string;
  appKey: string;
  appToken: string;
}

/**
 * VTEX Integration Client
 * Conecta con VTEX API v2
 */
export class VTEXClient implements IntegrationClient {
  platform = Platform.VTEX;
  private client: AxiosInstance;
  private accountName: string;

  constructor(credentials: VTEXCredentials) {
    this.accountName = credentials.accountName;

    // Crear instancia de axios con autenticación
    this.client = axios.create({
      baseURL: `https://${credentials.accountName}.myvtex.com/api`,
      headers: {
        "X-VTEX-API-AppKey": credentials.appKey,
        "X-VTEX-API-AppToken": credentials.appToken,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Test de conexión - verifica credenciales
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get("/catalog/pvt/configuration");
      return response.status === 200;
    } catch (error) {
      throw new IntegrationError(
        this.platform,
        "Failed to connect to VTEX",
        axios.isAxiosError(error) ? error.response?.status : undefined,
        error
      );
    }
  }

  /**
   * Validar credenciales
   */
  async validateCredentials(creds: CredentialValue): Promise<boolean> {
    try {
      const credentials = this.parseCredentials(creds);
      const testClient = new VTEXClient(credentials);
      return await testClient.testConnection();
    } catch {
      return false;
    }
  }

  /**
   * Obtener métricas desde VTEX
   */
  async getMetrics(options: MetricsOptions): Promise<MetricData[]> {
    const metrics: MetricData[] = [];

    try {
      // Obtener órdenes
      const ordersMetrics = await this.getOrdersMetrics(options);
      metrics.push(...ordersMetrics);

      // Obtener datos de clientes
      const customersMetrics = await this.getCustomersMetrics(options);
      metrics.push(...customersMetrics);

      // Obtener datos de tráfico/analytics
      const trafficMetrics = await this.getTrafficMetrics(options);
      metrics.push(...trafficMetrics);

      return metrics;
    } catch (error) {
      throw new IntegrationError(
        this.platform,
        `Failed to fetch metrics: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        error
      );
    }
  }

  /**
   * Obtener métricas de órdenes
   */
  private async getOrdersMetrics(options: MetricsOptions): Promise<MetricData[]> {
    const metrics: MetricData[] = [];

    try {
      // Esta es una simplificación. En producción, se implementaría con datos reales
      // desde el endpoint de órdenes y estadísticas de VTEX

      // GET /order-metrics/pvt/orders
      const response = await this.client.get("/order-metrics/pvt/orders", {
        params: {
          createdAfter: options.startDate.toISOString(),
          createdBefore: options.endDate.toISOString(),
          // pagination...
        },
      });

      if (response.data) {
        // Procesar datos de órdenes
        const stats = this.calculateOrderStats(response.data);
        metrics.push(...stats);
      }

      return metrics;
    } catch (error) {
      console.warn("Error fetching orders metrics:", error);
      return [];
    }
  }

  /**
   * Obtener métricas de clientes
   */
  private async getCustomersMetrics(
    options: MetricsOptions
  ): Promise<MetricData[]> {
    const metrics: MetricData[] = [];

    try {
      // GET /customer/pvt/customers
      const response = await this.client.get("/customer/pvt/customers", {
        params: {
          limit: 100,
        },
      });

      if (response.data?.customerSearch) {
        // Contar clientes nuevos vs recurrentes
        metrics.push({
          metricType: "customers_total",
          value: response.data.customerSearch?.length || 0,
          date: new Date(),
        });
      }

      return metrics;
    } catch (error) {
      console.warn("Error fetching customers metrics:", error);
      return [];
    }
  }

  /**
   * Obtener métricas de tráfico
   * (Nota: VTEX Analytics requiere acceso a Google Analytics o integraciones específicas)
   */
  private async getTrafficMetrics(
    options: MetricsOptions
  ): Promise<MetricData[]> {
    // Esto depende de si VTEX está conectado con Google Analytics
    // Por ahora, retornamos array vacío
    return [];
  }

  /**
   * Calcular estadísticas de órdenes
   */
  private calculateOrderStats(ordersData: any): MetricData[] {
    const metrics: MetricData[] = [];

    // Ejemplo de procesamiento
    if (ordersData.length > 0) {
      const totalValue = ordersData.reduce(
        (sum: number, order: any) => sum + (order.value || 0),
        0
      );

      metrics.push({
        metricType: "revenue",
        value: totalValue / 100, // VTEX usa centavos
        date: new Date(),
        currency: "BRL",
        rawData: ordersData,
      });

      metrics.push({
        metricType: "orders_total",
        value: ordersData.length,
        date: new Date(),
        rawData: ordersData,
      });
    }

    return metrics;
  }

  /**
   * Parse credentials from JSON string
   */
  private parseCredentials(creds: CredentialValue): VTEXCredentials {
    if (typeof creds === "string") {
      const parsed = JSON.parse(creds);
      return {
        accountName: parsed.accountName,
        appKey: parsed.appKey,
        appToken: parsed.appToken,
      };
    }

    return {
      accountName: creds.accountName as string,
      appKey: creds.appKey as string,
      appToken: creds.appToken as string,
    };
  }
}

/**
 * Factory para crear cliente VTEX
 */
export function createVTEXClient(credentials: CredentialValue): VTEXClient {
  const creds =
    typeof credentials === "string" ? JSON.parse(credentials) : credentials;

  return new VTEXClient({
    accountName: creds.accountName,
    appKey: creds.appKey,
    appToken: creds.appToken,
  });
}
