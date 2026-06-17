'use client'

import { useState, useEffect, useCallback } from 'react'
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

const STATUS_COLORS: Record<string, string> = {
  payment_approved: 'text-emerald-400',
  invoiced:         'text-blue-400',
  ready_for_handling: 'text-amber-400',
  handling:         'text-orange-400',
  shipped:          'text-teal-400',
  delivered:        'text-emerald-400',
  cancelled:        'text-red-400',
}

const CHANNEL_PILL: Record<string, string> = {
  'VTEX':        'bg-red-900/30 text-red-400',
  'MeLi UA':     'bg-amber-900/30 text-amber-400',
  'MeLi Sporta': 'bg-teal-900/30 text-teal-400',
}

export default function LivePage() {
  const [orders, setOrders]     = useState<LiveOrder[]>([])
  const [loading, setLoading]   = useState(true)
  const [todayTotal, setTodayTotal] = useState(0)
  const [todayOrders, setTodayOrders] = useState(0)

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch('/api/orders?limit=50')
      if (res.ok) {
        const data = await res.json()
        setOrders(data.orders ?? [])
        setTodayOrders(data.total ?? data.orders?.length ?? 0)
        // Revenue excluye canceladas (igual que Canales)
        setTodayTotal(data.totalRevenue ?? data.orders?.filter((o: LiveOrder) => o.statusBucket !== 'cancelled').reduce((s: number, o: LiveOrder) => s + o.revenue, 0) ?? 0)
      }
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchLive()
    const interval = setInterval(fetchLive, 30_000)
    return () => clearInterval(interval)
  }, [fetchLive])

  function relativeTime(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const min  = Math.floor(diff / 60000)
    if (min < 1)   return 'Ahora'
    if (min < 60)  return `${min}m`
    const hrs = Math.floor(min / 60)
    if (hrs < 24)  return `${hrs}h`
    return `${Math.floor(hrs / 24)}d`
  }

  return (
    <div className="p-6 space-y-6 fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
            Ventas en Vivo
            <span className="flex items-center gap-1 text-sm font-normal text-red-400">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse pulse-green" /> En tiempo real
            </span>
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Actualizando cada 30 segundos · Hoy</p>
        </div>
        <button
          onClick={fetchLive}
          className="text-xs px-3 py-1.5 rounded-lg border border-[rgba(0,166,81,0.2)] text-gray-500 hover:text-gray-200 transition-all"
        >
          ↺ Actualizar ahora
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
          <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Revenue hoy</div>
          <div className="text-3xl font-bold font-mono text-gray-100">{fmtARSCompact(todayTotal)}</div>
        </div>
        <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
          <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Órdenes hoy</div>
          <div className="text-3xl font-bold font-mono text-gray-100">{todayOrders}</div>
        </div>
      </div>

      {/* Live feed */}
      <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[rgba(0,166,81,0.12)] flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-200">Últimas órdenes</span>
          <span className="text-xs text-gray-500">{orders.length} órdenes</span>
        </div>
        <div className="divide-y divide-[rgba(0,166,81,0.06)]">
          {loading && Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3 animate-pulse">
              <div className="h-3 w-24 bg-[#1a2e1b] rounded" />
              <div className="h-3 w-16 bg-[#1a2e1b] rounded" />
              <div className="h-3 w-20 bg-[#1a2e1b] rounded ml-auto" />
            </div>
          ))}
          {!loading && orders.map(order => (
            <div
              key={order.id}
              className={`flex items-center gap-4 px-5 py-3 hover:bg-[#112011] transition-colors ${order.statusBucket === 'cancelled' ? 'opacity-50' : ''}`}
            >
              <span className="text-[10px] text-gray-600 font-mono w-12 flex-shrink-0">
                {relativeTime(order.created_at)}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 ${CHANNEL_PILL[order.channel] ?? 'bg-gray-800 text-gray-400'}`}>
                {order.channel}
              </span>
              <span className="text-xs text-gray-500 truncate flex-1 font-mono">#{order.id.slice(-8)}</span>
              <span className="text-xs text-gray-500">{order.items} item{order.items !== 1 ? 's' : ''}</span>
              <span className={`text-xs font-medium ${STATUS_COLORS[order.status] ?? STATUS_COLORS[order.statusBucket] ?? 'text-gray-400'}`}>
                {order.status}
              </span>
              <span className={`text-sm font-mono font-semibold flex-shrink-0 ${order.statusBucket === 'cancelled' ? 'line-through text-gray-600' : 'text-gray-200'}`}>
                {fmtARSCompact(order.revenue)}
              </span>
            </div>
          ))}
          {!loading && orders.length === 0 && (
            <div className="px-5 py-10 text-center text-gray-500 text-sm">
              Sin órdenes hoy todavía
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
