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

const CAMPAIGN_STATUS_PILL: Record<string, string> = {
  ACTIVE:   'bg-emerald-900/30 text-emerald-400 border border-emerald-800/40',
  PAUSED:   'bg-amber-900/30 text-amber-400 border border-amber-800/40',
  ARCHIVED: 'bg-gray-800/50 text-gray-400 border border-gray-700/40',
}

const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  ACTIVE:   'Activa',
  PAUSED:   'Pausada',
  ARCHIVED: 'Archivada',
}

interface MetaCampaign {
  id: string
  name: string
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
  spend: number
  impressions: number
  clicks: number
  conversions: number
  roas: number
}

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

  const activeMeta = CHANNELS_MKT.find(c => c.key === activeChannel)

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

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5 animate-pulse h-28" />
          ))}
        </div>
      )}

      {/* ── Meta Ads ─────────────────────────────────────────────────────── */}
      {!loading && data && activeChannel === 'meta' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard title="Inversión Meta" value={data?.totals?.spend ?? 0} format="currency" icon="💸" accentColor="#1877f2" />
            <KPICard title="Revenue atribuido" value={data?.totals?.revenue ?? 0} format="currency" icon="💰" accentColor="#10b981" />
            <KPICard title="ROAS" value={data?.totals?.roas ?? 0} format="number" icon="📈" accentColor="#8b5cf6" subtitle="x veces invertido" />
            <KPICard title="Conversiones" value={data?.totals?.conversions ?? 0} format="number" icon="✅" accentColor="#1877f2" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard title="Impresiones" value={data?.totals?.impressions ?? 0} format="number" icon="👁️" accentColor="#1877f2" />
            <KPICard title="Clics" value={data?.totals?.clicks ?? 0} format="number" icon="🖱️" accentColor="#3b82f6" />
            <KPICard title="CTR" value={data?.totals?.ctr ?? 0} format="percent" icon="%" accentColor="#14b8a6" />
            <KPICard title="CPA" value={data?.totals?.cpa ?? 0} format="currency" icon="🎯" accentColor="#f59e0b" />
          </div>

          {/* Campaigns table */}
          {Array.isArray(data?.campaigns) && data.campaigns.length > 0 && (
            <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[rgba(0,166,81,0.12)]">
                <span className="text-sm font-semibold text-gray-200">Campañas activas</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#071409]">
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Campaña</th>
                      <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Estado</th>
                      <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">Inversión</th>
                      <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">Impresiones</th>
                      <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">Clics</th>
                      <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">Conv.</th>
                      <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.campaigns as MetaCampaign[]).map(c => (
                      <tr key={c.id} className="border-t border-[rgba(0,166,81,0.06)] hover:bg-[#112011] transition-colors">
                        <td className="px-5 py-3.5 text-sm text-gray-200 font-medium">{c.name}</td>
                        <td className="px-3 py-3.5">
                          <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${CAMPAIGN_STATUS_PILL[c.status] ?? 'bg-gray-800 text-gray-400'}`}>
                            {CAMPAIGN_STATUS_LABEL[c.status] ?? c.status}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-right text-sm font-mono text-gray-300">{fmtARSCompact(c.spend ?? 0)}</td>
                        <td className="px-3 py-3.5 text-right text-sm font-mono text-gray-300">{fmtNum(c.impressions)}</td>
                        <td className="px-3 py-3.5 text-right text-sm font-mono text-gray-300">{fmtNum(c.clicks)}</td>
                        <td className="px-3 py-3.5 text-right text-sm font-mono text-gray-300">{fmtNum(c.conversions)}</td>
                        <td className="px-5 py-3.5 text-right text-sm font-mono font-semibold text-[#00C65E]">{(c.roas ?? 0).toFixed(1)}x</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Perfit (email marketing) ────────────────────────────────────── */}
      {!loading && data && activeChannel === 'perfit' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard title="Emails enviados" value={data?.totals?.sent ?? 0} format="number" icon="📤" accentColor="#00b4d8" />
            <KPICard title="Entregados" value={data?.totals?.delivered ?? 0} format="number" icon="📬" accentColor="#00b4d8" />
            <KPICard title="Tasa de apertura" value={data?.totals?.open_rate ?? 0} format="percent" icon="👁️" accentColor="#10b981" />
            <KPICard title="Tasa de clics" value={data?.totals?.click_rate ?? 0} format="percent" icon="🖱️" accentColor="#3b82f6" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard title="Clics totales" value={data?.totals?.clicked ?? 0} format="number" icon="🔗" accentColor="#00b4d8" />
            <KPICard title="Bajas" value={data?.totals?.unsubscribed ?? 0} format="number" icon="🚫" accentColor="#ef4444" />
          </div>
        </>
      )}

      {/* ── Google Ads ───────────────────────────────────────────────────── */}
      {!loading && data && activeChannel === 'google' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard title="Inversión Google" value={data?.totals?.spend ?? 0} format="currency" icon="💸" accentColor="#4285f4" />
            <KPICard title="Revenue atribuido" value={data?.totals?.revenue ?? 0} format="currency" icon="💰" accentColor="#10b981" />
            <KPICard title="ROAS" value={data?.totals?.roas ?? 0} format="number" icon="📈" accentColor="#8b5cf6" subtitle="x veces invertido" />
            <KPICard title="Conversiones" value={data?.totals?.conversions ?? 0} format="number" icon="✅" accentColor="#4285f4" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard title="Clics" value={data?.totals?.clicks ?? 0} format="number" icon="🖱️" accentColor="#3b82f6" />
            <KPICard title="Impresiones" value={data?.totals?.impressions ?? 0} format="number" icon="👁️" accentColor="#4285f4" />
          </div>
        </>
      )}

      {/* ── Kommo CRM ────────────────────────────────────────────────────── */}
      {!loading && data && activeChannel === 'kommo' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Nuevos leads" value={data?.totals?.new_leads ?? 0} format="number" icon="🆕" accentColor="#e8622a" />
          <KPICard title="Leads abiertos" value={data?.totals?.open_leads ?? 0} format="number" icon="📂" accentColor="#f59e0b" />
          <KPICard title="Leads ganados" value={data?.totals?.won_leads ?? 0} format="number" icon="🏆" accentColor="#10b981" />
          <KPICard title="Leads perdidos" value={data?.totals?.lost_leads ?? 0} format="number" icon="❌" accentColor="#ef4444" />
          <KPICard title="Revenue CRM" value={data?.totals?.revenue ?? 0} format="currency" icon="💰" accentColor="#e8622a" />
          <KPICard title="Tasa de conversión" value={data?.totals?.conversion_rate ?? 0} format="percent" icon="📊" accentColor="#e8622a" />
        </div>
      )}

      {!loading && !data && (
        <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-10 text-center">
          <p className="text-gray-500 text-sm">
            Sin datos disponibles para {activeMeta?.label}.
          </p>
          <p className="text-gray-600 text-xs mt-1">
            Verificá que el Worker esté conectado y el token sea válido.
          </p>
        </div>
      )}
    </div>
  )
}
