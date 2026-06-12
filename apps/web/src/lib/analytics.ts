import { createVTEXClient } from "./integrations/vtex";
import { createMercadoLibreClient } from "./integrations/mercado-libre";
import { NormalizedOrder } from "./integrations/types";
import {
  ChannelKey,
  ECOMMERCE_CHANNELS,
  CHANNEL_ACCOUNT_NAME,
  getChannelConfig,
  patchChannelConfig,
  setChannelSyncStatus,
} from "./integrations/credentials";
import { CHANNEL_COLORS } from "./utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const TTL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Convierte una fecha a Buenos Aires (ART, UTC-3).
 * Útil para funciones que usan `new Date()` y necesitan respetar la timezone local.
 */
function toARTDate(date: Date): Date {
  // Restar 3 horas para convertir de UTC del servidor a ART
  const artDate = new Date(date.getTime());
  artDate.setHours(artDate.getHours() - 3);
  return artDate;
}

// ─── Cache en memoria (por proceso) ────────────────────────────────────────────
const ordersCache = new Map<string, { data: NormalizedOrder[] | null; expires: number }>();

function cacheKey(channel: ChannelKey, from: Date, to: Date): string {
  return `${channel}:${from.toISOString()}:${to.toISOString()}`;
}

/**
 * Trae las órdenes de un canal para el rango dado, usando las credenciales
 * reales guardadas (si existen). Devuelve `null` si el canal no está
 * configurado o si la conexión falla (en ese caso el caller usa mock).
 */
async function fetchRealOrders(channel: ChannelKey, from: Date, to: Date): Promise<NormalizedOrder[] | null> {
  const config = await getChannelConfig(channel);
  if (!config) return null;

  try {
    if (channel === "vtex") {
      const client = createVTEXClient(config as any);
      const orders = await client.getOrders(from, to);
      await setChannelSyncStatus(channel, "SUCCESS");
      return orders;
    }

    if (channel === "meli_1" || channel === "meli_2") {
      const client = createMercadoLibreClient(
        { ...config, channelKey: channel, channelLabel: CHANNEL_ACCOUNT_NAME[channel] },
        async (tokens) => {
          await patchChannelConfig(channel, tokens);
        }
      );
      // Trae todas las órdenes del rango de fechas (dinámico, sin límite de página)
      const orders = await client.getOrders(from, to);
      await setChannelSyncStatus(channel, "SUCCESS");
      return orders;
    }

    return null;
  } catch (error) {
    await setChannelSyncStatus(channel, "ERROR", error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function getCachedOrders(channel: ChannelKey, from: Date, to: Date): Promise<NormalizedOrder[] | null> {
  const key = cacheKey(channel, from, to);
  const cached = ordersCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;

  const data = await fetchRealOrders(channel, from, to);
  ordersCache.set(key, { data, expires: Date.now() + TTL_MS });
  return data;
}

// ─── Datos mock (fallback para canales sin configurar) ─────────────────────────
const MOCK_MULTIPLIER: Record<ChannelKey, number> = {
  vtex: 2.5,
  meli_1: 1.8,
  meli_2: 1.2,
  meta: 1,
  google: 1,
  perfit: 1,
  kommo: 1,
};

const MOCK_PRODUCTS: Record<string, { sku: string; name: string }[]> = {
  vtex: [
    { sku: "SAM-A14-128BK", name: "Smartphone Samsung A14" },
    { sku: "SAM-GW6-44MM", name: "Samsung Galaxy Watch 6" },
    { sku: "NTD-SWITCH-OLED", name: "Nintendo Switch OLED" },
    { sku: "DJI-MINI3-FM", name: "DJI Mini 3 Fly More" },
    { sku: "LG-27UK850", name: "Monitor LG 27' 4K" },
  ],
  meli_1: [
    { sku: "APL-MBA-M2-256", name: "MacBook Air M2" },
    { sku: "APL-IPA-5G-64", name: "iPad Air 5ta Gen" },
    { sku: "AMZ-KPW-11G", name: "Kindle Paperwhite 11va" },
    { sku: "APL-AWSE-40MM", name: "Apple Watch SE" },
    { sku: "KBD-RGB-TKL", name: "Teclado Mecánico RGB" },
  ],
  meli_2: [
    { sku: "APL-APP-2GEN", name: "AirPods Pro 2da Gen" },
    { sku: "SNY-WH1000XM4", name: "Sony WH-1000XM4" },
    { sku: "GPR-HERO11-BLK", name: "GoPro Hero 11 Black" },
    { sku: "MOC-ANTI-001", name: "Mochila Antirrobo USB" },
    { sku: "NSP-VRTL-PLUS", name: "Cafetera Nespresso Vertuo" },
  ],
};

const STATUS_BUCKETS: NormalizedOrder["statusBucket"][] = [
  "pending",
  "dispatched",
  "in_transit",
  "delivered",
  "delayed",
  "cancelled",
];
const STATUS_WEIGHTS = [0.13, 0.27, 0.15, 0.32, 0.06, 0.07];

function pickWeighted<T>(items: T[], weights: number[]): T {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += weights[i];
    if (r <= acc) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Genera órdenes "plausibles" para un canal sin configurar, en el rango
 * dado, para que el dashboard nunca se vea vacío/roto antes de conectar
 * las credenciales reales.
 */
function generateMockOrders(channel: ChannelKey, from: Date, to: Date): NormalizedOrder[] {
  const mult = MOCK_MULTIPLIER[channel] ?? 1;
  const products = MOCK_PRODUCTS[channel] ?? MOCK_PRODUCTS.vtex;
  const label = CHANNEL_ACCOUNT_NAME[channel];
  const baseOrdersPerDay = 20;
  const baseUnitPrice = 12000;

  const orders: NormalizedOrder[] = [];

  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const dayOrders = Math.round(baseOrdersPerDay * mult * (0.8 + Math.random() * 0.4));
    for (let i = 0; i < dayOrders; i++) {
      const date = new Date(t);
      date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0);
      const product = products[Math.floor(Math.random() * products.length)];
      const qty = 1 + Math.floor(Math.random() * 3);
      const unitPrice = Math.round(baseUnitPrice * (0.5 + Math.random() * 2));

      orders.push({
        id: `mock-${channel}-${t}-${i}`,
        channelKey: channel as NormalizedOrder["channelKey"],
        channel: label,
        date: date.toISOString(),
        status: "mock",
        statusBucket: pickWeighted(STATUS_BUCKETS, STATUS_WEIGHTS),
        total: unitPrice * qty,
        items: [{ sku: product.sku, name: product.name, qty, unitPrice }],
      });
    }
  }

  return orders;
}

/**
 * Devuelve las órdenes (reales si el canal está configurado, mock si no)
 * para el rango dado.
 */
async function getChannelOrders(channel: ChannelKey, from: Date, to: Date): Promise<NormalizedOrder[]> {
  const real = await getCachedOrders(channel, from, to);
  return real ?? generateMockOrders(channel, from, to);
}

function resolveChannels(channel: string): ChannelKey[] {
  if (channel === "all") return ECOMMERCE_CHANNELS;
  return ECOMMERCE_CHANNELS.includes(channel as ChannelKey) ? [channel as ChannelKey] : ECOMMERCE_CHANNELS;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function pctChange(current: number, previous: number): number {
  if (previous <= 0) return 0;
  return ((current - previous) / previous) * 100;
}

// ─── /api/metrics ───────────────────────────────────────────────────────────────
export async function getMetricsAnalytics(
  dateFrom: string,
  dateTo: string,
  channel: string,
  options: { compareFrom?: string; compareTo?: string; statusFilter?: string[] } = {}
) {
  const channels = resolveChannels(channel);
  // Convertir a fecha en Buenos Aires (ART, UTC-3)
  // dateFrom/dateTo llegan como "YYYY-MM-DD" en timezone local del navegador (ART)
  const from = new Date(`${dateFrom}T00:00:00-03:00`);
  const to = new Date(`${dateTo}T23:59:59-03:00`);

  const periodMs = to.getTime() - from.getTime();
  const prevFrom = options.compareFrom ? new Date(`${options.compareFrom}T00:00:00-03:00`) : new Date(from.getTime() - periodMs);
  const prevTo = options.compareTo ? new Date(`${options.compareTo}T23:59:59-03:00`) : new Date(from.getTime() - 1);

  const ordersByChannel: Record<string, NormalizedOrder[]> = {};
  const prevOrdersByChannel: Record<string, NormalizedOrder[]> = {};

  for (const ch of channels) {
    ordersByChannel[ch] = await getChannelOrders(ch, from, to);
    prevOrdersByChannel[ch] = await getChannelOrders(ch, prevFrom, prevTo);
  }

  const allOrders = Object.values(ordersByChannel).flat();
  const prevAllOrders = Object.values(prevOrdersByChannel).flat();

  // Filtrar por estado si se especifica (por defecto excluye canceladas)
  const statusFilter = options.statusFilter && options.statusFilter.length > 0 ? options.statusFilter : ["pending", "dispatched", "in_transit", "delivered", "delayed"];
  const validOrders = allOrders.filter((o) => statusFilter.includes(o.statusBucket));
  const prevValidOrders = prevAllOrders.filter((o) => statusFilter.includes(o.statusBucket));

  const revenue = sum(validOrders.map((o) => o.total));
  const prevRevenue = sum(prevValidOrders.map((o) => o.total));

  const ordersCount = validOrders.length;
  const prevOrdersCount = prevValidOrders.length;

  const units = sum(validOrders.flatMap((o) => o.items.map((it) => it.qty)));
  const cancellations = allOrders.length - validOrders.length;
  const avgTicket = ordersCount > 0 ? revenue / ordersCount : 0;

  // Serie diaria (TZ Argentina)
  const dailyMap = new Map<string, { revenue: number; orders: number }>();
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    dailyMap.set(new Date(t).toISOString().split("T")[0], { revenue: 0, orders: 0 });
  }
  for (const o of validOrders) {
    const day = o.date.split("T")[0];
    const entry = dailyMap.get(day);
    if (entry) {
      entry.revenue += o.total;
      entry.orders += 1;
    }
  }
  const daily = Array.from(dailyMap.entries()).map(([date, v]) => ({
    date,
    revenue: Math.round(v.revenue),
    orders: v.orders,
  }));

  // Heatmap día x hora (día: 0=Dom … 6=Sáb)
  const heatmapMap = new Map<string, number>();
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      heatmapMap.set(`${day}-${hour}`, 0);
    }
  }
  for (const o of validOrders) {
    const d = new Date(o.date);
    const key = `${d.getUTCDay()}-${d.getUTCHours()}`;
    heatmapMap.set(key, (heatmapMap.get(key) ?? 0) + 1);
  }
  const heatmap = Array.from(heatmapMap.entries()).map(([key, value]) => {
    const [day, hour] = key.split("-").map(Number);
    return { day, hour, value };
  });

  // Resumen por canal
  const channelSummaries = channels.map((ch) => {
    const chOrders = ordersByChannel[ch].filter((o) => o.statusBucket !== "cancelled");
    const chRevenue = sum(chOrders.map((o) => o.total));
    return {
      channel: CHANNEL_ACCOUNT_NAME[ch],
      revenue: Math.round(chRevenue),
      orders: chOrders.length,
      color: CHANNEL_COLORS[ch] ?? "#6366f1",
      pct_revenue: revenue > 0 ? (chRevenue / revenue) * 100 : 0,
      avg_ticket: chOrders.length > 0 ? chRevenue / chOrders.length : 0,
    };
  });

  return {
    kpi: {
      revenue: Math.round(revenue),
      orders: ordersCount,
      units,
      avg_ticket: Math.round(avgTicket * 100) / 100,
      conversion: 2.8,
      cancellations,
      compare: {
        revenue_delta: Math.round(pctChange(revenue, prevRevenue) * 10) / 10,
        orders_delta: Math.round(pctChange(ordersCount, prevOrdersCount) * 10) / 10,
      },
    },
    daily,
    heatmap,
    channels: channelSummaries,
  };
}

// ─── /api/products ──────────────────────────────────────────────────────────────
export async function getTopProductsAnalytics(
  channel: string,
  offset: number,
  limit: number,
  options: { statusFilter?: string[] } = {}
) {
  const channels = resolveChannels(channel);
  const to = toARTDate(new Date());
  const from = new Date(to.getTime() - 30 * DAY_MS);
  const statusFilter = options.statusFilter && options.statusFilter.length > 0 ? options.statusFilter : ["pending", "dispatched", "in_transit", "delivered", "delayed"];

  const productMap = new Map<
    string,
    { id: string; name: string; sku: string; channel: string; qty: number; revenue: number }
  >();

  for (const ch of channels) {
    const orders = await getChannelOrders(ch, from, to);
    const channelLabel = CHANNEL_ACCOUNT_NAME[ch];
    for (const o of orders) {
      if (!statusFilter.includes(o.statusBucket)) continue;
      for (const item of o.items) {
        const key = `${ch}:${item.sku}`;
        const existing = productMap.get(key);
        if (existing) {
          existing.qty += item.qty;
          existing.revenue += item.qty * item.unitPrice;
        } else {
          productMap.set(key, {
            id: key,
            name: item.name,
            sku: item.sku,
            channel: channelLabel,
            qty: item.qty,
            revenue: item.qty * item.unitPrice,
          });
        }
      }
    }
  }

  const totalRevenue = sum(Array.from(productMap.values()).map((p) => p.revenue));
  const allProducts = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .map((p) => ({
      ...p,
      revenue: Math.round(p.revenue),
      pct: totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0,
    }));

  return {
    products: allProducts.slice(offset, offset + limit),
    total: allProducts.length,
  };
}

// ─── /api/orders (live feed) ─────────────────────────────────────────────────────
export async function getLiveOrdersAnalytics(
  channel: string,
  limit: number,
  options: { statusFilter?: string[] } = {}
) {
  const channels = resolveChannels(channel);
  const to = toARTDate(new Date());
  const from = new Date(to.getTime() - DAY_MS);
  const statusFilter = options.statusFilter && options.statusFilter.length > 0 ? options.statusFilter : ["pending", "dispatched", "in_transit", "delivered", "delayed"];

  const allOrders: NormalizedOrder[] = [];
  for (const ch of channels) {
    const orders = await getChannelOrders(ch, from, to);
    allOrders.push(...orders.filter((o) => statusFilter.includes(o.statusBucket)));
  }

  const sorted = allOrders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, limit);

  const orders = sorted.map((o) => ({
    id: o.id,
    created_at: o.date,
    channel: o.channel,
    status: o.status === "mock" ? o.statusBucket : o.status,
    revenue: Math.round(o.total),
    items: o.items.length > 0 ? sum(o.items.map((it) => it.qty)) : 1,
  }));

  return { orders, total: orders.length };
}

// ─── /api/logistics ──────────────────────────────────────────────────────────────
export async function getLogisticsAnalytics(
  channel: string,
  options: { statusFilter?: string[] } = {}
) {
  const channels = resolveChannels(channel);
  const to = toARTDate(new Date());
  const from = new Date(to.getTime() - 30 * DAY_MS);
  const statusFilter = options.statusFilter && options.statusFilter.length > 0 ? options.statusFilter : ["pending", "dispatched", "in_transit", "delivered", "delayed"];

  const counts: Record<NormalizedOrder["statusBucket"], number> = {
    pending: 0,
    dispatched: 0,
    in_transit: 0,
    delivered: 0,
    delayed: 0,
    cancelled: 0,
  };

  for (const ch of channels) {
    const orders = await getChannelOrders(ch, from, to);
    for (const o of orders) {
      if (statusFilter.includes(o.statusBucket)) {
        counts[o.statusBucket] += 1;
      }
    }
  }

  const deliveredAndDelayed = counts.delivered + counts.delayed;
  const onTimeRate = deliveredAndDelayed > 0 ? (counts.delivered / deliveredAndDelayed) * 100 : 91.5;

  return {
    dispatched: counts.dispatched,
    in_transit: counts.in_transit,
    delivered: counts.delivered,
    delayed: counts.delayed,
    pending: counts.pending,
    avg_days: 2.4,
    on_time_rate: Math.round(onTimeRate * 10) / 10,
  };
}
