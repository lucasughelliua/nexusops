import { createVTEXClient } from "./integrations/vtex";
import { createMercadoLibreClient } from "./integrations/mercado-libre";
import { createTiendanubeClient } from "./integrations/tiendanube";
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
const TTL_MS = 30 * 1000; // 30 segundos (antes era 5 minutos, pero causaba caching de datos stale)

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

// Función para limpiar el cache de un canal
export function clearChannelCache(channel?: ChannelKey): void {
  if (channel) {
    // Limpiar solo un canal
    for (const key of ordersCache.keys()) {
      if (key.startsWith(channel + ":")) {
        ordersCache.delete(key);
      }
    }
  } else {
    // Limpiar todo
    ordersCache.clear();
  }
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

    if (channel === "tiendanube_ua" || channel === "tiendanube_alaska") {
      const client = createTiendanubeClient(config as any);
      const orders = await client.getNormalizedOrders(
        channel,
        CHANNEL_ACCOUNT_NAME[channel],
        from,
        to,
        1000
      );
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
  tiendanube_ua: 2,
  tiendanube_alaska: 1.5,
  epresis: 1,
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

const ECOMMERCE_REAL_CHANNELS: ChannelKey[] = ["vtex", "meli_1", "meli_2", "tiendanube_ua", "tiendanube_alaska"];

/**
 * Devuelve las órdenes reales si el canal está configurado, o array vacío
 * para canales de e-commerce sin configurar (vtex, meli, tiendanube).
 * Para otros canales sin datos reales no se genera mock.
 */
async function getChannelOrders(channel: ChannelKey, from: Date, to: Date): Promise<NormalizedOrder[]> {
  const real = await getCachedOrders(channel, from, to);
  if (real !== null) return real;
  if (ECOMMERCE_REAL_CHANNELS.includes(channel)) return [];
  return generateMockOrders(channel, from, to);
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
  // Las fechas vienen como YYYY-MM-DD y se interpretan en hora de Buenos Aires (UTC-3)
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

  const vtexOrders = ordersByChannel["vtex"] || [];
  const meliOrders = (ordersByChannel["meli_1"] || []).concat(ordersByChannel["meli_2"] || []);
  const otherOrders = allOrders.filter((o) => !vtexOrders.includes(o) && !meliOrders.includes(o));

  // Excluir canceladas de todos los canales para revenue/count (igual que hace cada plataforma)
  const vtexValidOrders = vtexOrders.filter((o) => o.statusBucket !== "cancelled");
  const meliValidOrders = meliOrders.filter((o) => o.statusBucket !== "cancelled");
  const validOrders = [...vtexValidOrders, ...meliValidOrders, ...otherOrders.filter((o) => o.statusBucket !== "cancelled")];

  // Mismo para período anterior
  const prevVtexOrders = prevOrdersByChannel["vtex"] || [];
  const prevMeliOrders = (prevOrdersByChannel["meli_1"] || []).concat(prevOrdersByChannel["meli_2"] || []);
  const prevOtherOrders = prevAllOrders.filter((o) => !prevVtexOrders.includes(o) && !prevMeliOrders.includes(o));
  const prevVtexValidOrders = prevVtexOrders.filter((o) => o.statusBucket !== "cancelled");
  const prevMeliValidOrders = prevMeliOrders.filter((o) => o.statusBucket !== "cancelled");
  const prevValidOrders = [...prevVtexValidOrders, ...prevMeliValidOrders, ...prevOtherOrders.filter((o) => o.statusBucket !== "cancelled")];

  // Métricas principales
  const revenue = sum(validOrders.map((o) => o.total));
  const prevRevenue = sum(prevValidOrders.map((o) => o.total));

  // Órdenes = total incluyendo canceladas; revenue/ticket excluyen canceladas
  const ordersCount = allOrders.length;
  const prevOrdersCount = prevAllOrders.length;

  const units = sum(validOrders.flatMap((o) => o.items.map((it) => it.qty)));
  const prevUnits = sum(prevValidOrders.flatMap((o) => o.items.map((it) => it.qty)));

  const cancellations = allOrders.filter((o) => o.statusBucket === "cancelled").length;
  const prevCancellations = prevAllOrders.filter((o) => o.statusBucket === "cancelled").length;

  // Ticket promedio: solo VTEX + MeLi (excluye Tiendanube y otros)
  const ticketOrders = [...vtexValidOrders, ...meliValidOrders];
  const ticketRevenue = sum(ticketOrders.map((o) => o.total));
  const avgTicket = ticketOrders.length > 0 ? ticketRevenue / ticketOrders.length : 0;
  const cancellationRate = (ordersCount > 0) ? (cancellations / ordersCount) * 100 : 0;

  // Breakdown por estado
  const stateBreakdown = {
    pending: validOrders.filter((o) => o.statusBucket === "pending").length,
    dispatched: validOrders.filter((o) => o.statusBucket === "dispatched").length,
    in_transit: validOrders.filter((o) => o.statusBucket === "in_transit").length,
    delivered: validOrders.filter((o) => o.statusBucket === "delivered").length,
    delayed: validOrders.filter((o) => o.statusBucket === "delayed").length,
    cancelled: cancellations,
  };

  const unitsBreakdown = {
    pending: sum(validOrders.filter((o) => o.statusBucket === "pending").flatMap((o) => o.items.map((it) => it.qty))),
    dispatched: sum(validOrders.filter((o) => o.statusBucket === "dispatched").flatMap((o) => o.items.map((it) => it.qty))),
    in_transit: sum(validOrders.filter((o) => o.statusBucket === "in_transit").flatMap((o) => o.items.map((it) => it.qty))),
    delivered: sum(validOrders.filter((o) => o.statusBucket === "delivered").flatMap((o) => o.items.map((it) => it.qty))),
    delayed: sum(validOrders.filter((o) => o.statusBucket === "delayed").flatMap((o) => o.items.map((it) => it.qty))),
  };

  const revenueBreakdown = {
    pending: sum(validOrders.filter((o) => o.statusBucket === "pending").map((o) => o.total)),
    dispatched: sum(validOrders.filter((o) => o.statusBucket === "dispatched").map((o) => o.total)),
    in_transit: sum(validOrders.filter((o) => o.statusBucket === "in_transit").map((o) => o.total)),
    delivered: sum(validOrders.filter((o) => o.statusBucket === "delivered").map((o) => o.total)),
    delayed: sum(validOrders.filter((o) => o.statusBucket === "delayed").map((o) => o.total)),
  };

  // Serie diaria mejorada
  const dailyMap = new Map<string, { revenue: number; orders: number; units: number; cancelled: number }>();
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    dailyMap.set(new Date(t).toISOString().split("T")[0], { revenue: 0, orders: 0, units: 0, cancelled: 0 });
  }
  for (const o of allOrders) {
    const day = o.date.split("T")[0];
    const entry = dailyMap.get(day);
    if (entry) {
      if (o.statusBucket !== "cancelled") {
        entry.revenue += o.total;
        entry.orders += 1;
        entry.units += sum(o.items.map((it) => it.qty));
      } else {
        entry.cancelled += 1;
      }
    }
  }
  const daily = Array.from(dailyMap.entries()).map(([date, v]) => ({
    date,
    revenue: Math.round(v.revenue),
    orders: v.orders,
    units: v.units,
    cancelled: v.cancelled,
  }));

  // Heatmap mejorado: día x hora con breakdown
  const heatmapMap = new Map<string, { count: number; revenue: number }>();
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      heatmapMap.set(`${day}-${hour}`, { count: 0, revenue: 0 });
    }
  }
  for (const o of validOrders) {
    const d = new Date(o.date);
    const key = `${d.getUTCDay()}-${d.getUTCHours()}`;
    const entry = heatmapMap.get(key);
    if (entry) {
      entry.count += 1;
      entry.revenue += o.total;
    }
  }
  const heatmap = Array.from(heatmapMap.entries()).map(([key, value]) => {
    const [day, hour] = key.split("-").map(Number);
    return { day, hour, orders: value.count, revenue: Math.round(value.revenue) };
  });

  // Resumen por canal
  const channelSummaries = channels.map((ch) => {
    const chOrders = ordersByChannel[ch];
    // Para VTEX: excluir canceladas. Para otros: incluir todo
    const chValidOrders = ch === "vtex" ? chOrders.filter((o) => o.statusBucket !== "cancelled") : chOrders;
    const chRevenue = sum(chValidOrders.map((o) => o.total));
    const chCancellations = chOrders.filter((o) => o.statusBucket === "cancelled").length;
    return {
      channel: CHANNEL_ACCOUNT_NAME[ch],
      revenue: Math.round(chRevenue),
      orders: chValidOrders.length,
      units: sum(chValidOrders.flatMap((o) => o.items.map((it) => it.qty))),
      cancelled: chCancellations,
      color: CHANNEL_COLORS[ch] ?? "#6366f1",
      pct_revenue: revenue > 0 ? (chRevenue / revenue) * 100 : 0,
      avg_ticket: chValidOrders.length > 0 ? chRevenue / chValidOrders.length : 0,
    };
  });

  return {
    kpi: {
      revenue: Math.round(revenue),
      orders: ordersCount,
      units,
      avg_ticket: Math.round(avgTicket * 100) / 100,
      cancellations,
      cancellation_rate: Math.round(cancellationRate * 100) / 100,
      compare: {
        revenue_delta: Math.round(pctChange(revenue, prevRevenue) * 10) / 10,
        orders_delta: Math.round(pctChange(ordersCount, prevOrdersCount) * 10) / 10,
        units_delta: Math.round(pctChange(units, prevUnits) * 10) / 10,
      },
    },
    breakdown: {
      by_state: stateBreakdown,
      units_by_state: unitsBreakdown,
      revenue_by_state: revenueBreakdown,
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
