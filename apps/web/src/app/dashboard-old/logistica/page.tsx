'use client'

import { useState, useEffect } from 'react'
import { getPeriodRange, fmtNum } from '@/lib/utils'
import DateRangePicker from '@/components/ui/DateRangePicker'
import KPICard from '@/components/ui/KPICard'
import { type DateRange, type LogisticsSummary } from '@/types'

export default function LogisticaPage() {
  const [dateRange, setDateRange] = useState<DateRange>(getPeriodRange('last30'))
  const [data, setData]           = useState<LogisticsSummary | null>(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/logistics?date_from=${dateRange.from}&date_to=${dateRange.to}`)
        if (res.ok) setData(await res.json())
      } catch {}
      finally { setLoading(false) }
    }
    load()
  }, [dateRange])

  const statuses = [
    { label: 'Despachados',  value: data?.dispatched ?? 0,  color: '#3b82f6', icon: '📦' },
    { label: 'En tránsito',  value: data?.in_transit ?? 0,  color: '#f59e0b', icon: '🚚' },
    { label: 'Entregados',   value: data?.delivered ?? 0,   color: '#10b981', icon: '✅' },
    { label: 'Demorados',    value: data?.delayed ?? 0,     color: '#ef4444', icon: '⚠️' },
    { label: 'Pendientes',   value: data?.pending ?? 0,     color: '#8b5cf6', icon: '⏳' },
  ]

  const total = statuses.reduce((s, st) => s + st.value, 0) || 1

  return (
    <div className="p-6 space-y-6 fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Logística</h1>
          <p className="text-sm text-gray-500 mt-0.5">Estados de envíos y demoras</p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Tiempo promedio" value={data?.avg_days ?? 0} format="number" icon="⏱️" subtitle="días hábiles" loading={loading} />
        <KPICard title="En tiempo" value={data?.on_time_rate ?? 0} format="percent" icon="✅" accentColor="#10b981" loading={loading} />
        <KPICard title="Entregados" value={data?.delivered ?? 0} format="number" icon="📬" loading={loading} />
        <KPICard title="Demorados" value={data?.delayed ?? 0} format="number" icon="⚠️" accentColor="#ef4444" loading={loading} />
      </div>

      {/* Status breakdown */}
      <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
        <div className="text-sm font-semibold text-gray-200 mb-5">Distribución de estados</div>
        <div className="space-y-4">
          {statuses.map(st => (
            <div key={st.label} className="flex items-center gap-4">
              <span className="text-base w-6">{st.icon}</span>
              <span className="text-sm text-gray-400 w-28">{st.label}</span>
              <div className="flex-1 h-2 bg-[#1a2e1b] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${(st.value / total) * 100}%`, background: st.color }}
                />
              </div>
              <span className="text-sm font-mono text-gray-300 w-16 text-right">{fmtNum(st.value)}</span>
              <span className="text-xs text-gray-600 w-10 text-right">
                {((st.value / total) * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
