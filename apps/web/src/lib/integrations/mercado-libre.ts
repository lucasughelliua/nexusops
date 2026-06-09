import axios, { AxiosInstance } from "axios";
import {
  IntegrationClient,
  IntegrationError,
  MetricsOptions,
  MetricData,
  CredentialValue,
} from "./types";
import { Platform } from "@prisma/client";

interface MercadoLibreCredentials {
  accessToken: string;
  userId?: string;
  refreshToken?: string;
}

/**
 * Mercado Libre Integration Client
 * Conecta con Mercado Libre API
 */
export class MercadoLibreClient implements IntegrationClient {
  platform = Platform.MERCADO_LIBRE;
  private client: AxiosInstance;
  private accessToken: string;

  constructor(credentials: MercadoLibreCredentials) {
    this.accessToken = credentials.accessToken;

    this.client = axios.create({
      baseURL: "https://api.mercadolibre.com",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Test de conexión
   */
  async testConnection(): Promise<boolean> {
    try {
      // GET /users/me - obtener datos del usuario actual
      const response = await this.client.get("/users/me");
      return response.status === 200;
    } catch (error) {
      throw new IntegrationError(
        this.platform,
        "Failed to connect to Mercado Libre",
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
      const testClient = new MercadoLibreClient(credentials);
      return await testClient.testConnection();
    } catch {
      return false;
    }
  }

  /**
   * Obtener métricas desde Mercado Libre
   */
  async getMetrics(options: MetricsOptions): Promise<MetricData[]> {
    const metrics: MetricData[] = [];

    try {
      // Obtener órdenes del usuario
      const ordersMetrics = await this.getOrdersMetrics(options);
      metrics.push(...ordersMetrics);

      // Obtener datos de publicaciones
      const publicationsMetrics = await this.getPublicationsMetrics(options);
      metrics.push(...publicationsMetrics);

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
      // GET /users/{user_id}/orders/search
      const response = await this.client.get("/users/me/orders/search", {
        params: {
          limit: 50,
          offset: 0,
        },
      });

      if (response.data?.orders) {
        const orders = response.data.orders;

        // Total de órdenes
        metrics.push({
          metricType: "orders_total",
          value: orders.length,
          date: new Date(),
          rawData: orders,
        });

        // Total de ventas
        const totalSales = orders.reduce((sum: number, order: any) => {
          return sum + (order.buyer?.billing?.total_amount || 0);
        }, 0);

        metrics.push({
          metricType: "revenue",
          value: totalSales,
          date: new Date(),
          currency: "ARS",
          rawData: orders,
        });
      }

      return metrics;
    } catch (error) {
      console.warn("Error fetching orders metrics:", error);
      return [];
    }
  }

  /**
   * Obtener métricas de publicaciones
   */
  private async getPublicationsMetrics(
    options: MetricsOptions
  ): Promise<MetricData[]> {
    const metrics: MetricData[] = [];

    try {
      // GET /users/{user_id}/listings
      const response = await this.client.get("/users/me/listings", {
        params: {
          limit: 50,
        },
      });

      if (response.data) {
        // Total de publicaciones activas
        metrics.push({
          metricType: "publications_active",
          value: response.data.length,
          date: new Date(),
          rawData: response.data,
        });
      }

      return metrics;
    } catch (error) {
      console.warn("Error fetching publications metrics:", error);
      return [];
    }
  }

  /**
   * Parse credentials
   */
  private parseCredentials(creds: CredentialValue): MercadoLibreCredentials {
    if (typeof creds === "string") {
      const parsed = JSON.parse(creds);
      return {
        accessToken: parsed.accessToken,
        userId: parsed.userId,
        refreshToken: parsed.refreshToken,
      };
    }

    return {
      accessToken: creds.accessToken as string,
      userId: creds.userId as string,
      refreshToken: creds.refreshToken as string,
    };
  }
}

/**
 * Factory para crear cliente Mercado Libre
 */
export function createMercadoLibreClient(
  credentials: CredentialValue
): MercadoLibreClient {
  const creds =
    typeof credentials === "string" ? JSON.parse(credentials) : credentials;

  return new MercadoLibreClient({
    accessToken: creds.accessToken,
    userId: creds.userId,
    refreshToken: creds.refreshToken,
  });
}
