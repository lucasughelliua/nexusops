'use client'

import { useState, useEffect } from 'react'
import { getPeriodRange, fmtARSCompact, fmtNum } from '@/lib/utils'
import DateRangePicker from '@/components/ui/DateRangePicker'
import SalesChart from '@/components/charts/SalesChart'
import { type DateRange } from '@/types'

const CHANNELS = [
  { key: 'vtex',   label: 'VTEX',        color: '#ef4444', icon: '🏪' },
  { key: 'meli_1', label: 'MeLi UA',     color: '#f59e0b', icon: '🛒' },
  { key: 'meli_2', label: 'MeLi Sporta', color: '#14b8a6', icon: '🛒' },
]

export default function CanalesPage() {
  const [dateRange, setDateRange] = useState<DateRange>(getPeriodRange('last30'))
  const [data, setData]           = useState<Record<string, any>>({})
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    async function loadAll() {
      setLoading(true)
      const results: Record<string, any> = {}
      await Promise.all(
        CHANNELS.map(async ch => {
          try {
            const res = await fetch(
              `/api/metrics?date_from=${dateRange.from}&date_to=${dateRange.to}&channel=${ch.key}`
            )
            if (res.ok) results[ch.key] = await res.json()
          } catch {}
        })
      )
      setData(results)
      setLoading(false)
    }
    loadAll()
  }, [dateRange])

  return (
    <div className="p-6 space-y-6 fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Canales</h1>
          <p className="text-sm text-gray-500 mt-0.5">Performance por canal de venta</p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Channel cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {CHANNELS.map(ch => {
          const d = data[ch.key]?.kpi
          return (
            <div
              key={ch.key}
              className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5"
              style={{ borderTop: `3px solid ${ch.color}` }}
            >
              <div className="flex items-center gap-2 mb-4">
                <span>{ch.icon}</span>
                <span className="font-semibold text-gray-200">{ch.label}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { l: 'Revenue', v: d ? fmtARSCompact(d.revenue) : '—' },
                  { l: 'Órdenes', v: d ? fmtNum(d.orders) : '—' },
                  { l: 'Ticket', v: d ? fmtARSCompact(d.avg_ticket) : '—' },
                  { l: 'Unidades', v: d ? fmtNum(d.units) : '—' },
                ].map(({ l, v }) => (
                  <div key={l} className={loading ? 'animate-pulse' : ''}>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">{l}</div>
                    <div className="text-lg font-mono font-semibold text-gray-100 mt-0.5">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Charts per channel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {CHANNELS.map(ch => (
          <SalesChart
            key={ch.key}
            data={data[ch.key]?.daily ?? []}
            title={`${ch.label} — Ventas`}
            mode="revenue"
          />
        ))}
      </div>
    </div>
  )
}
