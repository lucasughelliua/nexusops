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
