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

interface MercadoLibreCredentials {
  accessToken: string;
  userId?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  expiresAt?: string;
  sellerId?: string;
  channelKey?: "meli_1" | "meli_2";
  channelLabel?: string;
}

export interface MeliRefreshedTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
}

export type MeliTokenRefreshHandler = (tokens: MeliRefreshedTokens) => void | Promise<void>;

/**
 * Mapea status de orden + status de envío a los buckets genéricos del
 * dashboard (Live / Logística).
 */
function meliStatusBucket(status: string, shippingStatus?: string): NormalizedOrder["statusBucket"] {
  if (status === "cancelled") return "cancelled";
  if (status === "invalid") return "pending";

  switch (shippingStatus) {
    case "delivered":
      return "delivered";
    case "shipped":
      return "in_transit";
    case "ready_to_ship":
    case "handling":
      return "dispatched";
    case "pending":
    case "not_delivered":
      return "pending";
  }

  switch (status) {
    case "payment_required":
    case "payment_in_process":
      return "pending";
    case "paid":
    case "confirmed":
    default:
      return "dispatched";
  }
}

/**
 * Mercado Libre Integration Client
 * Conecta con Mercado Libre API
 */
export class MercadoLibreClient implements IntegrationClient {
  platform = Platform.MERCADO_LIBRE;
  private client: AxiosInstance;
  private accessToken: string;
  private refreshToken?: string;
  private clientId?: string;
  private clientSecret?: string;
  private expiresAt?: string;
  private sellerId?: string;
  private channelKey: "meli_1" | "meli_2";
  private channelLabel: string;
  private onTokenRefresh?: MeliTokenRefreshHandler;

  constructor(credentials: MercadoLibreCredentials, onTokenRefresh?: MeliTokenRefreshHandler) {
    this.accessToken = credentials.accessToken;
    this.refreshToken = credentials.refreshToken;
    this.clientId = credentials.clientId;
    this.clientSecret = credentials.clientSecret;
    this.expiresAt = credentials.expiresAt;
    this.sellerId = credentials.sellerId;
    this.channelKey = credentials.channelKey ?? "meli_1";
    this.channelLabel = credentials.channelLabel ?? "MercadoLibre";
    this.onTokenRefresh = onTokenRefresh;

    this.client = axios.create({
      baseURL: "https://api.mercadolibre.com",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Refresca el access token si está vencido (o por vencer) usando el
   * refresh_token + client_id/client_secret. Si se proveyó
   * `onTokenRefresh`, se notifican los nuevos tokens para persistirlos.
   */
  private async ensureFreshToken(): Promise<void> {
    if (!this.refreshToken || !this.clientId || !this.clientSecret) return;

    const expiresAtMs = this.expiresAt ? new Date(this.expiresAt).getTime() : 0;
    const fiveMinutes = 5 * 60 * 1000;
    if (expiresAtMs - Date.now() > fiveMinutes) return;

    try {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
      });

      const response = await axios.post("https://api.mercadolibre.com/oauth/token", body.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      });

      const { access_token, refresh_token, expires_in } = response.data;
      this.accessToken = access_token;
      this.refreshToken = refresh_token ?? this.refreshToken;
      this.expiresAt = new Date(Date.now() + (expires_in ?? 21600) * 1000).toISOString();
      this.client.defaults.headers.common.Authorization = `Bearer ${this.accessToken}`;

      if (this.onTokenRefresh) {
        await this.onTokenRefresh({
          accessToken: this.accessToken,
          refreshToken: this.refreshToken,
          expiresAt: this.expiresAt,
        });
      }
    } catch (error) {
      console.warn("No se pudo refrescar el token de Mercado Libre:", error);
    }
  }

  /**
   * Resuelve (y cachea) el ID numérico del vendedor.
   */
  private async getSellerId(): Promise<string> {
    if (this.sellerId) return this.sellerId;
    const { data } = await this.client.get("/users/me");
    this.sellerId = String(data.id);
    return this.sellerId;
  }

  /**
   * Test de conexión
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.ensureFreshToken();
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
   * Trae TODAS las órdenes creadas en el rango [dateFrom, dateTo] normalizadas
   * para el dashboard (KPIs, serie diaria, heatmap, logística, live feed).
   *
   * Pagina dinámicamente hasta obtener todos los resultados o alcanzar un
   * máximo de seguridad. No se rompe por límites de páginas.
   */
  async getOrders(
    dateFrom: Date,
    dateTo: Date,
    options: { maxPages?: number } = {}
  ): Promise<NormalizedOrder[]> {
    await this.ensureFreshToken();
    const sellerId = await this.getSellerId();

    const limit = 50;
    // Máximo absoluto de seguridad: 1000 páginas = 50,000 órdenes (prácticamente ilimitado)
    const absoluteMax = 1000;
    const raw: any[] = [];
    let page = 0;

    while (page < absoluteMax) {
      const offset = page * limit;
      let data: any;
      try {
        const response = await this.client.get("/orders/search", {
          params: {
            seller: sellerId,
            "order.date_created.from": dateFrom.toISOString(),
            "order.date_created.to": dateTo.toISOString(),
            // Incluir todos los estados, incluyendo canceladas
            status: "all",
            sort: "date_desc",
            limit,
            offset,
          },
        });
        data = response.data;
      } catch (error) {
        if (page === 0) {
          throw new IntegrationError(
            this.platform,
            "Failed to fetch Mercado Libre orders",
            axios.isAxiosError(error) ? error.response?.status : undefined,
            error
          );
        }
        // Si hay error en página posterior, simplemente terminamos
        break;
      }

      const results: any[] = data?.results ?? [];
      raw.push(...results);

      // Si no hay más resultados o llegamos al total, terminamos
      const total = data?.paging?.total ?? results.length;
      if (offset + limit >= total || results.length === 0) break;

      page++;
    }

    return raw.map((o) => ({
      id: String(o.id),
      channelKey: this.channelKey,
      channel: this.channelLabel,
      date: o.date_created,
      status: o.status,
      statusBucket: meliStatusBucket(o.status, o.shipping?.status),
      total: Number(o.total_amount ?? o.paid_amount ?? 0),
      items: (o.order_items ?? []).map((it: any) => ({
        sku: it.item?.seller_sku || it.item?.id || "—",
        name: it.item?.title ?? "Producto",
        qty: Number(it.quantity ?? 1),
        unitPrice: Number(it.unit_price ?? it.full_unit_price ?? 0),
      })),
    }));
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
    const parsed: any = typeof creds === "string" ? JSON.parse(creds) : creds;
    return {
      accessToken: parsed.accessToken,
      userId: parsed.userId,
      refreshToken: parsed.refreshToken,
      clientId: parsed.clientId,
      clientSecret: parsed.clientSecret,
      expiresAt: parsed.expiresAt,
      sellerId: parsed.sellerId,
      channelKey: parsed.channelKey,
      channelLabel: parsed.channelLabel,
    };
  }
}

/**
 * Factory para crear cliente Mercado Libre. `credentials` puede incluir
 * clientId/clientSecret/expiresAt/sellerId/channelKey/channelLabel para
 * habilitar el refresh automático de tokens y la normalización de
 * órdenes; `onTokenRefresh` permite persistir los tokens renovados.
 */
export function createMercadoLibreClient(
  credentials: CredentialValue,
  onTokenRefresh?: MeliTokenRefreshHandler
): MercadoLibreClient {
  const creds: any =
    typeof credentials === "string" ? JSON.parse(credentials) : credentials;

  return new MercadoLibreClient(
    {
      accessToken: creds.accessToken,
      userId: creds.userId,
      refreshToken: creds.refreshToken,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      expiresAt: creds.expiresAt,
      sellerId: creds.sellerId,
      channelKey: creds.channelKey,
      channelLabel: creds.channelLabel,
    },
    onTokenRefresh
  );
}
