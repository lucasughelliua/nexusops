import { Platform, SyncStatus } from "@prisma/client";

/**
 * Tipo base para todos los integradores
 */
export interface IntegrationClient {
  platform: Platform;
  testConnection(): Promise<boolean>;
  getMetrics(options: MetricsOptions): Promise<MetricData[]>;
  validateCredentials(credentials: CredentialValue): Promise<boolean>;
}

/**
 * Opciones para obtener métricas
 */
export interface MetricsOptions {
  startDate: Date;
  endDate: Date;
  includeBreakdown?: boolean;
  dimensions?: string[];
}

/**
 * Datos de métrica obtenidos de una API
 */
export interface MetricData {
  metricType: string;
  value: number;
  date: Date;
  dimensions?: Record<string, string | number>;
  currency?: string;
  rawData?: unknown;
}

/**
 * Valores de credencial según plataforma
 */
export interface CredentialValue {
  [key: string]: string;
}

/**
 * Resultado de sincronización
 */
export interface SyncResult {
  platform: Platform;
  status: SyncStatus;
  recordsCount: number;
  duration: number;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

/**
 * Item normalizado dentro de una orden (línea de pedido).
 */
export interface NormalizedOrderItem {
  sku: string;
  name: string;
  qty: number;
  unitPrice: number; // en la moneda de la cuenta (ARS)
}

/**
 * Orden normalizada, independiente de la plataforma de origen.
 * Es la unidad mínima sobre la que se calculan KPIs, series diarias,
 * heatmaps, top productos, feed de "live" y logística.
 */
export interface NormalizedOrder {
  id: string;
  channelKey: "vtex" | "meli_1" | "meli_2" | "tiendanube_ua" | "tiendanube_alaska";
  channel: string; // label legible: "VTEX" | "MercadoLibre UA" | "MercadoLibre Sporta" | "Tiendanube UA" | "Tiendanube Alaska"
  date: string; // ISO 8601
  status: string; // status crudo de la plataforma de origen
  statusBucket: "pending" | "dispatched" | "in_transit" | "delivered" | "delayed" | "cancelled";
  total: number; // ARS
  items: NormalizedOrderItem[];
}

/**
 * Error de integración
 */
export class IntegrationError extends Error {
  constructor(
    public platform: Platform,
    message: string,
    public statusCode?: number,
    public originalError?: unknown
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}
