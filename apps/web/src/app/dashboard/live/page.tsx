'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { fmtARSCompact } from '@/lib/utils'

interface LiveOrder {
  id: string
  created_at: string
  channel: string
  status: string
  statusBucket: string
  revenue: number
  items: number
}

interface TopProduct {
  name: string
  sku: string
  channel: string
  qty: number
  revenue: number
}

interface LiveData {
  orders: LiveOrder[]
  total: number
  totalRevenue: number
  topProducts: TopProduct[]
}

const CHANNEL_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'MercadoLibre UA':     { bg: 'bg-amber-500/15', text: 'text-amber-400', dot: 'bg-amber-400' },
  'MercadoLibre Sporta': { bg: 'bg-teal-500/15',  text: 'text-teal-400',  dot: 'bg-teal-400'  },
  'VTEX':                { bg: 'bg-red-500/15',    text: 'text-red-400',   dot: 'bg-red-400'   },
  'MeLi UA':             { bg: 'bg-amber-500/15', text: 'text-amber-400', dot: 'bg-amber-400' },
  'MeLi Sporta':         { bg: 'bg-teal-500/15',  text: 'text-teal-400',  dot: 'bg-teal-400'  },
}

const STATUS_LABEL: Record<string, string> = {
  payment_approved:    'Aprobado',
  invoiced:            'Facturado',
  ready_for_handling:  'Para despachar',
  handling:            'Preparando',
  shipped:             'Enviado',
  delivered:           'Entregado',
  cancelled:           'Cancelado',
  pending:             'Pendiente',
  dispatched:          'Despachado',
  in_transit:          'En tránsito',
  delayed:             'Demorado',
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1)  return 'Ahora'
  if (min < 60) return `${min}m`
  const hrs = Math.floor(min / 60)
  return `${hrs}h`
}

function channelStyle(ch: string) {
  return CHANNEL_COLORS[ch] ?? { bg: 'bg-gray-700/40', text: 'text-gray-300', dot: 'bg-gray-400' }
}

// Acortar nombre de producto para que entre en pantalla
function shortName(name: string, max = 42) {
  if (name.length <= max) return name
  return name.slice(0, max - 1) + '…'
}

export default function LivePage() {
  const [data, setData]       = useState<LiveData | null>(null)
  const [loading, setLoading] = useState(true)
  const [pulse, setPulse]     = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const prevTotalRef = useRef(0)

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch('/api/orders?limit=60')
      if (res.ok) {
        const d: LiveData = await res.json()
        setData(d)
        if (prevTotalRef.current > 0 && (d.total ?? 0) > prevTotalRef.current) {
          setPulse(true)
          setTimeout(() => setPulse(false), 1200)
        }
        prevTotalRef.current = d.total ?? 0
        setLastUpdated(new Date())
      }
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchLive()
    const iv = setInterval(fetchLive, 30_000)
    return () => clearInterval(iv)
  }, [fetchLive])

  const orders       = data?.orders ?? []
  const totalRevenue = data?.totalRevenue ?? 0
  const totalOrders  = data?.total ?? 0
  const topProducts  = data?.topProducts ?? []
  const maxQty       = topProducts[0]?.qty ?? 1

  // Contar por canal (excluyendo canceladas)
  const channelCounts = orders.reduce<Record<string, number>>((acc, o) => {
    if (o.statusBucket === 'cancelled') return acc
    acc[o.channel] = (acc[o.channel] ?? 0) + 1
    return acc
  }, {})

  const nowStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '...'

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] bg-[#090f0a] overflow-hidden select-none">

      {/* ── HEADER ── */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full bg-red-500 ${pulse ? 'animate-ping' : 'animate-pulse'}`} />
            <h1 className="text-2xl font-bold text-white tracking-tight">Ventas en Vivo</h1>
          </div>
          <span className="text-sm text-gray-500 font-mono">Hoy · Actualización {nowStr}</span>
        </div>
        <button
          onClick={fetchLive}
          className="text-xs px-4 py-2 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all"
        >
          ↺ Actualizar
        </button>
      </header>

      {/* ── HERO METRICS ── */}
      <div className="grid grid-cols-4 gap-4 px-8 py-4 flex-shrink-0">
        {/* Revenue */}
        <div className={`col-span-2 rounded-2xl bg-[#0c1a0d] border border-[rgba(0,166,81,0.2)] p-6 transition-all duration-500 ${pulse ? 'border-green-400/60 shadow-[0_0_24px_rgba(0,200,80,0.15)]' : ''}`}>
          <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Revenue del día</div>
          <div className="text-6xl font-black font-mono text-white leading-none tabular-nums">
            {loading ? <span className="opacity-30">$—</span> : fmtARSCompact(totalRevenue)}
          </div>
          <div className="text-sm text-gray-500 mt-3">en ventas confirmadas</div>
        </div>

        {/* Órdenes totales */}
        <div className={`rounded-2xl bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] p-6 flex flex-col justify-between transition-all duration-500 ${pulse ? 'border-green-400/40' : ''}`}>
          <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Órdenes hoy</div>
          <div className="text-6xl font-black font-mono text-white leading-none tabular-nums">
            {loading ? <span className="opacity-30">—</span> : totalOrders}
          </div>
          <div className="text-sm text-gray-500 mt-3">pedidos totales</div>
        </div>

        {/* Órdenes por canal */}
        <div className="rounded-2xl bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] p-6 flex flex-col gap-3">
          <div className="text-xs uppercase tracking-widest text-gray-500 mb-1">Por canal</div>
          {loading ? (
            <div className="flex-1 flex items-center">
              <div className="h-4 w-24 bg-white/5 rounded animate-pulse" />
            </div>
          ) : Object.entries(channelCounts).length === 0 ? (
            <div className="text-2xl font-mono text-gray-600">—</div>
          ) : (
            Object.entries(channelCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([ch, count]) => {
                const s = channelStyle(ch)
                const label = ch.replace('MercadoLibre ', 'ML ')
                return (
                  <div key={ch} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                      <span className={`text-sm font-medium ${s.text}`}>{label}</span>
                    </div>
                    <span className="text-2xl font-black font-mono text-white tabular-nums">{count}</span>
                  </div>
                )
              })
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT: Feed + Top Productos ── */}
      <div className="flex flex-1 gap-4 px-8 pb-4 min-h-0">

        {/* Feed de órdenes */}
        <div className="flex-1 flex flex-col bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 flex-shrink-0">
            <span className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Últimas órdenes</span>
            <span className="text-xs text-gray-600">{orders.length} órdenes</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Header col */}
            <div className="grid grid-cols-[56px_140px_1fr_80px_160px_100px] gap-3 px-6 py-2 sticky top-0 bg-[#0c1a0d] border-b border-white/5 z-10">
              {['', 'Canal', 'Orden', 'Items', 'Estado', 'Total'].map(h => (
                <span key={h} className="text-[10px] uppercase tracking-widest text-gray-600">{h}</span>
              ))}
            </div>

            {loading && Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[56px_140px_1fr_80px_160px_100px] gap-3 px-6 py-3 animate-pulse border-b border-white/[0.03]">
                <div className="h-3 bg-white/5 rounded" />
                <div className="h-3 bg-white/5 rounded" />
                <div className="h-3 bg-white/5 rounded" />
                <div className="h-3 bg-white/5 rounded" />
                <div className="h-3 bg-white/5 rounded" />
                <div className="h-3 bg-white/5 rounded ml-auto w-16" />
              </div>
            ))}

            {!loading && orders.map((order, idx) => {
              const s = channelStyle(order.channel)
              const cancelled = order.statusBucket === 'cancelled'
              const isNew = idx === 0 && pulse
              return (
                <div
                  key={order.id}
                  className={`grid grid-cols-[56px_140px_1fr_80px_160px_100px] gap-3 px-6 py-3 border-b border-white/[0.03] transition-all duration-300 ${cancelled ? 'opacity-40' : 'hover:bg-white/[0.02]'} ${isNew ? 'bg-green-500/10' : ''}`}
                >
                  <span className="text-xs text-gray-600 font-mono self-center">{relativeTime(order.created_at)}</span>
                  <div className="flex items-center gap-2 self-center">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                    <span className={`text-xs font-semibold truncate ${s.text}`}>{order.channel.replace('MercadoLibre ', 'ML ')}</span>
                  </div>
                  <span className="text-sm font-mono text-gray-400 self-center truncate">#{order.id.slice(-10)}</span>
                  <span className="text-sm text-gray-500 self-center">{order.items} {order.items === 1 ? 'item' : 'items'}</span>
                  <span className={`text-sm self-center font-medium ${cancelled ? 'text-red-500' : 'text-gray-400'}`}>
                    {STATUS_LABEL[order.status] ?? STATUS_LABEL[order.statusBucket] ?? order.status}
                  </span>
                  <span className={`text-base font-black font-mono self-center text-right tabular-nums ${cancelled ? 'line-through text-gray-600' : 'text-white'}`}>
                    {fmtARSCompact(order.revenue)}
                  </span>
                </div>
              )
            })}

            {!loading && orders.length === 0 && (
              <div className="flex items-center justify-center h-40 text-gray-600 text-lg">
                Sin órdenes hoy todavía
              </div>
            )}
          </div>
        </div>

        {/* Top Productos */}
        <div className="w-[420px] flex flex-col bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-2xl overflow-hidden flex-shrink-0">
          <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 flex-shrink-0">
            <span className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Top Productos · Hoy</span>
            <span className="text-xs text-gray-600">por unidades</span>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse space-y-1.5">
                <div className="h-3 bg-white/5 rounded w-3/4" />
                <div className="h-2 bg-white/5 rounded w-full" />
              </div>
            ))}

            {!loading && topProducts.length === 0 && (
              <div className="flex items-center justify-center h-40 text-gray-600 text-sm">
                Sin datos de productos hoy
              </div>
            )}

            {!loading && topProducts.map((p, idx) => {
              const pct = maxQty > 0 ? (p.qty / maxQty) * 100 : 0
              const isTop = idx === 0
              return (
                <div key={`${p.sku}-${idx}`} className={`rounded-xl p-3 ${isTop ? 'bg-green-500/10 border border-green-500/20' : 'bg-white/[0.03]'}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className={`text-lg font-black font-mono leading-none flex-shrink-0 tabular-nums ${isTop ? 'text-green-400' : 'text-gray-600'}`}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className={`text-sm font-semibold leading-tight ${isTop ? 'text-white' : 'text-gray-300'}`}>
                        {shortName(p.name)}
                      </span>
                    </div>
                    <span className={`text-2xl font-black font-mono flex-shrink-0 tabular-nums ${isTop ? 'text-green-400' : 'text-white'}`}>
                      {p.qty}
                    </span>
                  </div>

                  {/* Barra de progreso */}
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${isTop ? 'bg-green-400' : 'bg-gray-600'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-gray-600">{p.sku}</span>
                    <span className="text-xs text-gray-500 font-mono">{fmtARSCompact(p.revenue)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
