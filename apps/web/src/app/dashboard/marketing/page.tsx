'use client'

import { useState, useEffect } from 'react'
import { getPeriodRange, fmtARSCompact, fmtNum, fmtPct } from '@/lib/utils'
import DateRangePicker from '@/components/ui/DateRangePicker'
import KPICard from '@/components/ui/KPICard'
import { type DateRange } from '@/types'

const CHANNELS_MKT = [
  { key: 'meta',    label: 'Meta Ads',    color: '#1877f2', icon: '📘' },
  { key: 'perfit',  label: 'Perfit',      color: '#00b4d8', icon: '📧' },
  { key: 'google',  label: 'Google Ads',  color: '#4285f4', icon: '🔍' },
  { key: 'kommo',   label: 'Kommo CRM',   color: '#e8622a', icon: '💼' },
]

export default function MarketingPage() {
  const [dateRange, setDateRange] = useState<DateRange>(getPeriodRange('last30'))
  const [activeChannel, setActive] = useState('meta')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/marketing/${activeChannel}?date_from=${dateRange.from}&date_to=${dateRange.to}`
        )
        if (res.ok) setData(await res.json())
        else setData(null)
      } catch { setData(null) }
      finally { setLoading(false) }
    }
    load()
  }, [dateRange, activeChannel])

  return (
    <div className="p-6 space-y-6 fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Marketing & CRM</h1>
          <p className="text-sm text-gray-500 mt-0.5">Meta · Perfit · Google Ads · Kommo</p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Channel tabs */}
      <div className="flex gap-2 flex-wrap">
        {CHANNELS_MKT.map(ch => (
          <button
            key={ch.key}
            onClick={() => setActive(ch.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
              activeChannel === ch.key
                ? 'text-white border-transparent'
                : 'bg-transparent text-gray-400 border-[rgba(255,255,255,0.08)] hover:text-gray-200'
            }`}
            style={activeChannel === ch.key ? { background: ch.color, borderColor: ch.color } : {}}
          >
            <span>{ch.icon}</span> {ch.label}
          </button>
        ))}
      </div>

      {/* Data area */}
      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5 animate-pulse h-28" />
          ))}
        </div>
      )}

      {!loading && data && activeChannel === 'meta' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard title="Inversión Meta" value={data?.totals?.spend ?? 0} format="currency" icon="💸" accentColor="#1877f2" />
            <KPICard title="Revenue atribuido" value={data?.totals?.revenue ?? 0} format="currency" icon="💰" accentColor="#10b981" />
            <KPICard title="ROAS" value={data?.totals?.roas ?? 0} format="number" icon="📈" accentColor="#8b5cf6" />
            <KPICard title="Conversiones" value={data?.totals?.conversions ?? 0} format="number" icon="✅" accentColor="#1877f2" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard title="Impresiones" value={data?.totals?.impressions ?? 0} format="number" icon="👁️" accentColor="#1877f2" />
            <KPICard title="Clics" value={data?.totals?.clicks ?? 0} format="number" icon="🖱️" accentColor="#3b82f6" />
            <KPICard title="CTR" value={data?.totals?.ctr ?? 0} format="percent" icon="%" accentColor="#14b8a6" />
            <KPICard title="CPA" value={data?.totals?.cpa ?? 0} format="currency" icon="🎯" accentColor="#f59e0b" />
          </div>
        </>
      )}

      {!loading && !data && (
        <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-10 text-center">
          <p className="text-gray-500 text-sm">
            Sin datos disponibles para {CHANNELS_MKT.find(c => c.key === activeChannel)?.label}.
          </p>
          <p className="text-gray-600 text-xs mt-1">
            Verificá que el Worker esté conectado y el token sea válido.
          </p>
        </div>
      )}
    </div>
  )
}
