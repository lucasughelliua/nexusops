import axios, { AxiosInstance } from "axios";
import {
  IntegrationClient,
  IntegrationError,
  MetricsOptions,
  MetricData,
  CredentialValue,
  NormalizedOrder,
  NormalizedOrderItem,
} from "./types";
import { Platform } from "@prisma/client";

export interface TiendanubeCredentials {
  apiToken: string;
  storeId?: string;
}

export interface TiendanubeOrder {
  id: string;
  number: string;
  status: string;
  created_at: string;
  updated_at: string;
  total: number;
  subtotal: number;
  items_count: number;
  customer_name: string;
  payment_status: string;
}

export interface TiendanubeProduct {
  id: string;
  name: string;
  price: number;
  stock: number;
  created_at: string;
  sales_count?: number;
}

export interface TiendanubeCustomer {
  id: string;
  name: string;
  email: string;
  total_orders: number;
  total_spent: number;
}

export interface TiendanubeStats {
  totalOrders: number;
  totalRevenue: number;
  totalCustomers: number;
  avgOrderValue: number;
  lastOrderDate?: string;
}

export class TiendanubeClient implements IntegrationClient {
  platform = Platform.TIENDANUBE;
  private client: AxiosInstance;

  constructor(credentials: TiendanubeCredentials) {
    const baseURL =
      process.env.TIENDANUBE_API_BASE ||
      "https://api.tiendanube.com/v1";

    this.client = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.apiToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get("/store", {
        params: { limit: 1 },
      });
      return response.status === 200;
    } catch (error) {
      throw new IntegrationError(
        this.platform,
        "Failed to connect to Tiendanube",
        axios.isAxiosError(error) ? error.response?.status : undefined,
        error
      );
    }
  }

  async validateCredentials(credentials: CredentialValue): Promise<boolean> {
    try {
      const client = new TiendanubeClient({
        apiToken: credentials.apiToken,
        storeId: credentials.storeId,
      });
      return await client.testConnection();
    } catch {
      return false;
    }
  }

  async getMetrics(options: MetricsOptions): Promise<MetricData[]> {
    const orders = await this.getOrders(
      options.startDate,
      options.endDate,
      100
    );

    const metrics: MetricData[] = [];

    // Group by day for daily metrics
    const byDate = new Map<string, TiendanubeOrder[]>();
    for (const order of orders) {
      const date = new Date(order.created_at)
        .toISOString()
        .split("T")[0];
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(order);
    }

    for (const [dateStr, dayOrders] of byDate.entries()) {
      const revenue = dayOrders.reduce((s, o) => s + o.total, 0);
      metrics.push({
        metricType: "revenue",
        value: revenue,
        date: new Date(dateStr),
      });

      metrics.push({
        metricType: "orders",
        value: dayOrders.length,
        date: new Date(dateStr),
      });
    }

    return metrics;
  }

  async getOrders(
    dateFrom?: Date,
    dateTo?: Date,
    limit = 100,
    offset = 0
  ): Promise<TiendanubeOrder[]> {
    try {
      const params: Record<string, any> = {
        limit,
        offset,
      };

      if (dateFrom) {
        params.created_at_min = dateFrom.toISOString();
      }
      if (dateTo) {
        params.created_at_max = dateTo.toISOString();
      }

      const response = await this.client.get("/orders", { params });

      if (!response.data?.orders) {
        return [];
      }

      return response.data.orders.map((o: any) => ({
        id: String(o.id),
        number: String(o.number),
        status: o.status || "pending",
        created_at: o.created_at,
        updated_at: o.updated_at,
        total: Number(o.total) || 0,
        subtotal: Number(o.subtotal) || 0,
        items_count: o.items?.length || 0,
        customer_name: o.customer?.name || "Unknown",
        payment_status: o.payment_status || "pending",
      }));
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return [];
      }
      throw new IntegrationError(
        this.platform,
        "Failed to fetch orders",
        axios.isAxiosError(error) ? error.response?.status : undefined,
        error
      );
    }
  }

  /**
   * Maps Tiendanube order status to normalized statusBucket
   */
  private mapStatusBucket(
    status: string
  ): "pending" | "dispatched" | "in_transit" | "delivered" | "delayed" | "cancelled" {
    const normalizedStatus = status.toLowerCase();
    if (
      normalizedStatus === "open" ||
      normalizedStatus === "pending" ||
      normalizedStatus === "awaiting_confirmation"
    ) {
      return "pending";
    }
    if (normalizedStatus === "closed" || normalizedStatus === "ready") {
      return "dispatched";
    }
    if (normalizedStatus === "shipped" || normalizedStatus === "in_transit") {
      return "in_transit";
    }
    if (normalizedStatus === "delivered") {
      return "delivered";
    }
    if (normalizedStatus === "delayed") {
      return "delayed";
    }
    if (normalizedStatus === "cancelled") {
      return "cancelled";
    }
    return "pending";
  }

  async getNormalizedOrders(
    channelKey: "tiendanube_ua" | "tiendanube_alaska",
    channelLabel: string,
    dateFrom?: Date,
    dateTo?: Date,
    limit = 100,
    offset = 0
  ): Promise<NormalizedOrder[]> {
    const orders = await this.getOrders(dateFrom, dateTo, limit, offset);

    return orders.map((o) => ({
      id: String(o.id),
      channelKey,
      channel: channelLabel,
      date: o.created_at.split("T")[0],
      status: o.status,
      statusBucket: this.mapStatusBucket(o.status),
      total: o.total,
      items: this.extractItems(o),
    }));
  }

  /**
   * Extracts items from Tiendanube order
   * Note: The API may not return items in the simple order list, so we provide defaults
   */
  private extractItems(order: TiendanubeOrder): NormalizedOrderItem[] {
    // For now, return a placeholder item since we don't have detailed items in the simple order response
    // In a real scenario, you'd fetch the order details separately or check if items are included
    if (order.items_count > 0) {
      return [
        {
          sku: "unknown",
          name: `${order.items_count} items`,
          qty: order.items_count,
          unitPrice: order.total / order.items_count,
        },
      ];
    }
    return [];
  }

  async getProducts(limit = 100, offset = 0): Promise<TiendanubeProduct[]> {
    try {
      const response = await this.client.get("/products", {
        params: { limit, offset },
      });

      if (!response.data?.products) {
        return [];
      }

      return response.data.products.map((p: any) => ({
        id: String(p.id),
        name: p.name || "Unknown",
        price: Number(p.price) || 0,
        stock: Number(p.stock) || 0,
        created_at: p.created_at,
        sales_count: p.sales_count || 0,
      }));
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return [];
      }
      throw new IntegrationError(
        this.platform,
        "Failed to fetch products",
        axios.isAxiosError(error) ? error.response?.status : undefined,
        error
      );
    }
  }

  async getCustomers(limit = 100, offset = 0): Promise<TiendanubeCustomer[]> {
    try {
      const response = await this.client.get("/customers", {
        params: { limit, offset },
      });

      if (!response.data?.customers) {
        return [];
      }

      return response.data.customers.map((c: any) => ({
        id: String(c.id),
        name: c.name || "Unknown",
        email: c.email || "",
        total_orders: Number(c.total_orders) || 0,
        total_spent: Number(c.total_spent) || 0,
      }));
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return [];
      }
      throw new IntegrationError(
        this.platform,
        "Failed to fetch customers",
        axios.isAxiosError(error) ? error.response?.status : undefined,
        error
      );
    }
  }

  async getStats(
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<TiendanubeStats> {
    try {
      const orders = await this.getOrders(dateFrom, dateTo, 1000);
      const customers = await this.getCustomers(1000);

      const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
      const avgOrderValue =
        orders.length > 0 ? totalRevenue / orders.length : 0;

      return {
        totalOrders: orders.length,
        totalRevenue,
        totalCustomers: customers.length,
        avgOrderValue,
        lastOrderDate:
          orders.length > 0
            ? orders[0].created_at
            : undefined,
      };
    } catch (error) {
      throw new IntegrationError(
        this.platform,
        "Failed to calculate stats",
        undefined,
        error
      );
    }
  }
}

export function createTiendanubeClient(
  credentials: Record<string, string>
): TiendanubeClient {
  return new TiendanubeClient({
    apiToken: credentials.apiToken,
    storeId: credentials.storeId,
  });
}
