'use client'

import { useState, useEffect, useCallback } from 'react'
import { type DateRange, type KPIData, type DailySales, type HeatmapCell, type ChannelSummary, type TopProduct } from '@/types'
import { getPeriodRange, fmtARSCompact } from '@/lib/utils'
import DateRangePicker from '@/components/ui/DateRangePicker'
import KPICard from '@/components/ui/KPICard'
import ProductTable from '@/components/ui/ProductTable'
import SalesChart from '@/components/charts/SalesChart'
import ChannelDonut from '@/components/charts/ChannelDonut'
import HeatMap from '@/components/charts/HeatMap'

// ─── Types ────────────────────────────────────────────────────────────────────
interface MetricsResponse {
  kpi: KPIData & { compare?: { revenue_delta: number; orders_delta: number } }
  daily: DailySales[]
  heatmap: HeatmapCell[]
  channels: ChannelSummary[]
}

interface ProductsResponse {
  products: TopProduct[]
  total: number
}

// ─── Channel filter tabs ──────────────────────────────────────────────────────
const CHANNEL_TABS = [
  { key: 'all',    label: 'Todos los canales' },
  { key: 'vtex',   label: 'VTEX' },
  { key: 'meli_1', label: 'MeLi UA' },
  { key: 'meli_2', label: 'MeLi Sporta' },
]

export default function MetricasPage() {
  const [dateRange, setDateRange]     = useState<DateRange>(getPeriodRange('last30'))
  const [channel, setChannel]         = useState('all')
  const [metrics, setMetrics]         = useState<MetricsResponse | null>(null)
  const [products, setProducts]       = useState<ProductsResponse | null>(null)
  const [loadingMetrics, setLoadingMetrics] = useState(true)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [productOffset, setProductOffset]   = useState(0)
  const [lastUpdated, setLastUpdated]       = useState('')

  // ─── Fetch metrics ──────────────────────────────────────────────────────────
  const fetchMetrics = useCallback(async () => {
    setLoadingMetrics(true)
    try {
      const res = await fetch(
        `/api/metrics?date_from=${dateRange.from}&date_to=${dateRange.to}&channel=${channel}`
      )
      if (res.ok) {
        const data: MetricsResponse = await res.json()
        setMetrics(data)
        setLastUpdated(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }))
      }
    } catch (e) {
      console.error('Error fetching metrics:', e)
    } finally {
      setLoadingMetrics(false)
    }
  }, [dateRange, channel])

  // ─── Fetch products ─────────────────────────────────────────────────────────
  const fetchProducts = useCallback(async (offset = 0) => {
    setLoadingProducts(true)
    try {
      const res = await fetch(
        `/api/products?date_from=${dateRange.from}&date_to=${dateRange.to}&channel=${channel}&offset=${offset}`
      )
      if (res.ok) {
        const data: ProductsResponse = await res.json()
        setProducts(data)
      }
    } catch (e) {
      console.error('Error fetching products:', e)
    } finally {
      setLoadingProducts(false)
    }
  }, [dateRange, channel])

  useEffect(() => {
    fetchMetrics()
    fetchProducts(0)
    setProductOffset(0)
  }, [fetchMetrics, fetchProducts])

  // ─── Auto-refresh every 2 minutes ──────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(fetchMetrics, 120_000)
    return () => clearInterval(interval)
  }, [fetchMetrics])

  const kpi = metrics?.kpi

  return (
    <div className="p-6 space-y-6 fade-in">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-100 tracking-tight">Métricas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Resumen de desempeño · {lastUpdated ? `Actualizado ${lastUpdated}` : 'Cargando…'}
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={r => { setDateRange(r) }} />
      </div>

      {/* ── Channel filter ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">Canal:</span>
        {CHANNEL_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setChannel(t.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
              channel === t.key
                ? 'bg-[#00A651] text-white border-[#00A651]'
                : 'bg-transparent text-gray-400 border-[rgba(0,166,81,0.2)] hover:border-[rgba(0,166,81,0.5)] hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}

        <button
          onClick={() => { fetchMetrics(); fetchProducts(0) }}
          className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-[rgba(0,166,81,0.2)]
                     text-gray-500 hover:text-gray-200 hover:border-[rgba(0,166,81,0.4)] transition-all"
        >
          ↺ Actualizar
        </button>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Facturación"
          value={kpi?.revenue ?? 0}
          delta={kpi?.compare?.revenue_delta}
          format="currency"
          icon="💰"
          subtitle="vs período anterior"
          loading={loadingMetrics}
        />
        <KPICard
          title="Órdenes"
          value={kpi?.orders ?? 0}
          delta={kpi?.compare?.orders_delta}
          format="number"
          icon="🛒"
          subtitle="vs período anterior"
          loading={loadingMetrics}
        />
        <KPICard
          title="Ticket Promedio"
          value={kpi?.avg_ticket ?? 0}
          format="currency"
          icon="📦"
          loading={loadingMetrics}
        />
        <KPICard
          title="Unidades Vendidas"
          value={kpi?.units ?? 0}
          format="number"
          icon="📦"
          accentColor="#14b8a6"
          loading={loadingMetrics}
        />
      </div>

      {/* ── Secondary KPIs ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Cancelaciones"
          value={kpi?.cancellations ?? 0}
          format="number"
          icon="❌"
          accentColor="#ef4444"
          loading={loadingMetrics}
        />
        <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Mix de canales
          </div>
          <div className="space-y-2">
            {(metrics?.channels ?? []).map(ch => (
              <div key={ch.channel} className="flex items-center gap-2">
                <div className="text-[11px] text-gray-400 w-20 truncate capitalize">{ch.channel}</div>
                <div className="flex-1 h-1.5 bg-[#1a2e1b] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, ch.pct_revenue ?? 0)}%`,
                      background: ch.channel === 'vtex' ? '#ef4444' : ch.channel === 'meli_1' ? '#f59e0b' : '#14b8a6'
                    }}
                  />
                </div>
                <span className="text-[11px] font-mono text-gray-500">{(ch.pct_revenue ?? 0).toFixed(0)}%</span>
              </div>
            ))}
            {loadingMetrics && <div className="h-3 bg-[#1a2e1b] rounded animate-pulse" />}
          </div>
        </div>
        {/* Revenue goal card */}
        <div className="col-span-2 bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Meta del período
            </span>
            <span className="text-xs font-mono text-[#00A651]">
              {kpi ? fmtARSCompact(kpi.revenue) : '…'}
            </span>
          </div>
          <div className="text-xs text-gray-500 mb-3">vs. objetivo configurado</div>
          <div className="h-2 bg-[#1a2e1b] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, ((kpi?.revenue ?? 0) / 4_500_000) * 100)}%`,
                background: 'linear-gradient(90deg, #00A651, #00C65E)',
              }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-gray-600">$0</span>
            <span className="text-[10px] text-gray-600">Meta: $4.5M</span>
          </div>
        </div>
      </div>

      {/* ── Charts row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <SalesChart
            data={metrics?.daily ?? []}
            title="Facturación por día"
            mode="revenue"
          />
        </div>
        <div>
          <ChannelDonut
            data={(metrics?.channels ?? []).map(ch => ({
              ...ch,
              label: ch.channel,
              pct_orders: 0,
            }))}
            title="Distribución por canal"
          />
        </div>
      </div>

      {/* ── Orders chart row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SalesChart
          data={metrics?.daily ?? []}
          title="Órdenes por día"
          mode="orders"
        />
        <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
          <div className="text-sm font-semibold text-gray-200 mb-4">Resumen de canales</div>
          <div className="space-y-3">
            {(metrics?.channels ?? []).map(ch => (
              <div key={ch.channel} className="flex items-center justify-between py-2 border-b border-[rgba(0,166,81,0.08)]">
                <span className="text-sm capitalize text-gray-300 font-medium">{ch.channel}</span>
                <div className="flex gap-6 text-xs font-mono">
                  <div className="text-right">
                    <div className="text-gray-200">{fmtARSCompact(ch.revenue)}</div>
                    <div className="text-gray-600">revenue</div>
                  </div>
                  <div className="text-right">
                    <div className="text-gray-200">{ch.orders.toLocaleString('es-AR')}</div>
                    <div className="text-gray-600">órdenes</div>
                  </div>
                  <div className="text-right">
                    <div className="text-gray-200">{fmtARSCompact(ch.avg_ticket)}</div>
                    <div className="text-gray-600">ticket</div>
                  </div>
                </div>
              </div>
            ))}
            {loadingMetrics && (
              <>
                {[1,2,3].map(i => <div key={i} className="h-10 bg-[#1a2e1b] rounded animate-pulse" />)}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Heatmap ──────────────────────────────────────────────────────── */}
      <HeatMap data={metrics?.heatmap ?? []} />

      {/* ── Top products table ───────────────────────────────────────────── */}
      <ProductTable
        products={products?.products ?? []}
        total={products?.total ?? 0}
        loading={loadingProducts}
        onPageChange={(offset) => {
          setProductOffset(offset)
          fetchProducts(offset)
        }}
      />
    </div>
  )
}
