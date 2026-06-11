import axios, { AxiosInstance } from "axios";
import {
  IntegrationClient,
  IntegrationError,
  MetricsOptions,
  MetricData,
  CredentialValue,
  NormalizedOrder,
} from "./types";
import { Platform } from "@prisma/client";
import { mapWithConcurrency } from "./concurrency";

interface VTEXCredentials {
  accountName: string;
  appKey: string;
  appToken: string;
}

/**
 * Mapea el `status` de una orden de VTEX a uno de los buckets genéricos
 * usados por el dashboard (Live / Logística).
 * Referencia: https://developers.vtex.com/docs/guides/orders-statuses
 */
function vtexStatusBucket(status: string): NormalizedOrder["statusBucket"] {
  switch (status) {
    case "order-created":
    case "payment-pending":
    case "waiting-for-payment-confirmation":
    case "waiting-for-seller-confirmation":
    case "window-to-cancel":
    case "ready-for-handling-pending-urgent-validation":
      return "pending";
    case "canceled":
    case "cancel":
    case "payment-denied":
    case "cancellation-requested":
    case "order-cancelled":
      return "cancelled";
    case "invoiced":
    case "invoice-no-number":
    case "shipping":
    case "on-order-completed":
      return "in_transit";
    case "delivered":
    case "order-completed":
      return "delivered";
    case "payment-approved":
    case "ready-for-handling":
    case "handling":
    case "approved":
    default:
      return "dispatched";
  }
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
   * Usamos el propio endpoint de Order Management que necesitamos para
   * traer datos reales: si esto responde 200, el App Key/Token tienen
   * el permiso de "Orders" que requiere el dashboard.
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get("/oms/pvt/orders", {
        params: { per_page: 1, page: 1 },
      });
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
   * Trae las órdenes creadas en el rango [dateFrom, dateTo] normalizadas
   * para el dashboard (KPIs, serie diaria, heatmap, logística, live feed).
   *
   * Para no exceder rate limits, el detalle de items (necesario para el
   * ranking de productos) solo se pide para una muestra acotada de las
   * órdenes más recientes (`maxItemOrders`).
   */
  async getOrders(
    dateFrom: Date,
    dateTo: Date,
    options: { maxItemOrders?: number; maxPages?: number } = {}
  ): Promise<NormalizedOrder[]> {
    const maxPages = options.maxPages ?? 10; // hasta 1000 órdenes (per_page=100)
    const maxItemOrders = options.maxItemOrders ?? 60;

    const raw: any[] = [];
    let page = 1;

    while (page <= maxPages) {
      let data: any;
      try {
        const response = await this.client.get("/oms/pvt/orders", {
          params: {
            per_page: 100,
            page,
            f_creationDate: `creationDate:[${dateFrom.toISOString()} TO ${dateTo.toISOString()}]`,
            orderBy: "creationDate,desc",
          },
        });
        data = response.data;
      } catch (error) {
        if (page === 1) {
          throw new IntegrationError(
            this.platform,
            "Failed to fetch VTEX orders",
            axios.isAxiosError(error) ? error.response?.status : undefined,
            error
          );
        }
        break; // si falla una página intermedia, devolvemos lo que ya tenemos
      }

      const list: any[] = data?.list ?? [];
      raw.push(...list);

      const totalPages = data?.paging?.pages ?? 1;
      if (page >= totalPages || list.length === 0) break;
      page++;
    }

    const orders: NormalizedOrder[] = raw.map((o) => ({
      id: String(o.orderId),
      channelKey: "vtex",
      channel: "VTEX",
      date: o.creationDate,
      status: o.status,
      statusBucket: vtexStatusBucket(o.status),
      total: (o.value ?? o.totalValue ?? 0) / 100,
      items: [],
    }));

    // Ranking de productos: pedimos el detalle (items) solo de las
    // órdenes más recientes para acotar la cantidad de requests.
    const sample = orders.slice(0, maxItemOrders);
    await mapWithConcurrency(sample, 5, async (order) => {
      try {
        const { data } = await this.client.get(`/oms/pvt/orders/${order.id}`);
        order.items = (data?.items ?? []).map((it: any) => ({
          sku: it.refId || it.id || it.itemId || "—",
          name: it.name ?? it.skuName ?? "Producto",
          qty: Number(it.quantity ?? 1),
          unitPrice: Number(it.sellingPrice ?? it.price ?? 0) / 100,
        }));
      } catch {
        // Si falla el detalle de una orden puntual, seguimos sin sus items
      }
    });

    return orders;
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
