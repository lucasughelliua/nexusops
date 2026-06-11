'use client'

import { useState, useEffect, useCallback } from 'react'
import { fmtARSCompact, fmtNum, fmtPct } from '@/lib/utils'

interface Campaign {
  id: string
  channel: string
  channelKey: string
  name: string
  spend: number
  impressions?: number
  clicks?: number
  conversions?: number
  leads?: number
  status: string
  roi?: number
  roas?: number
  cpc?: number
  cpm?: number
  ctr?: number
  conversionRate?: number
}

interface CampaignResponse {
  campaigns: Campaign[]
  total: number
}

const CHANNEL_PILL: Record<string, string> = {
  meta: 'bg-blue-900/30 text-blue-400 border border-blue-800/40',
  perfit: 'bg-pink-900/30 text-pink-400 border border-pink-800/40',
  google: 'bg-cyan-900/30 text-cyan-400 border border-cyan-800/40',
  kommo: 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/40',
}

export default function MarketingPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'spend' | 'roi' | 'name'>('spend')

  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') {
        params.set('channel', filter)
      }
      const res = await fetch(`/api/campaigns?${params.toString()}`)
      if (res.ok) {
        const data: CampaignResponse = await res.json()
        setCampaigns(data.campaigns)
      }
    } catch (e) {
      console.error('Error fetching campaigns:', e)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  const sortedCampaigns = [...campaigns].sort((a, b) => {
    switch (sortBy) {
      case 'spend':
        return b.spend - a.spend
      case 'roi':
        return (b.roi ?? 0) - (a.roi ?? 0)
      case 'name':
        return a.name.localeCompare(b.name)
      default:
        return 0
    }
  })

  const totalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0)
  const totalLeads = campaigns.reduce((sum, c) => sum + (c.leads ?? 0), 0)
  const avgROI = campaigns.length > 0
    ? campaigns.reduce((sum, c) => sum + (c.roi ?? 0), 0) / campaigns.length
    : 0

  return (
    <div className="p-6 space-y-6 fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-100 tracking-tight">Marketing & Campañas</h1>
        <p className="text-sm text-gray-500 mt-0.5">Seguimiento de campañas en Meta, Perfit y Google Ads</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Gasto Total
          </div>
          <div className="text-2xl font-bold text-gray-100">
            {fmtARSCompact(totalSpend)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {campaigns.length} campañas
          </div>
        </div>

        <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Leads Totales
          </div>
          <div className="text-2xl font-bold text-gray-100">
            {fmtNum(totalLeads)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {totalLeads > 0 && campaigns.length > 0 ? `ARS ${(totalSpend / totalLeads).toFixed(2)}/lead` : '-'}
          </div>
        </div>

        <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
            ROI Promedio
          </div>
          <div className="text-2xl font-bold text-gray-100">
            {fmtNum(avgROI)}%
          </div>
          <div className="text-xs text-gray-500 mt-1">
            en todas campañas
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">Filtrar:</span>
        {['all', 'meta', 'perfit', 'google'].map(ch => (
          <button
            key={ch}
            onClick={() => setFilter(ch)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
              filter === ch
                ? 'bg-[#00A651] text-white border-[#00A651]'
                : 'bg-transparent text-gray-400 border-[rgba(0,166,81,0.2)] hover:border-[rgba(0,166,81,0.5)] hover:text-gray-200'
            }`}
          >
            {ch === 'all' ? 'Todas' : ch === 'meta' ? 'Meta' : ch === 'perfit' ? 'Perfit' : 'Google'}
          </button>
        ))}

        <div className="ml-auto flex gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-xs px-3 py-1.5 rounded-lg bg-[#071409] border border-[rgba(0,166,81,0.2)] text-gray-200 outline-none focus:border-[#00A651] transition-colors"
          >
            <option value="spend">Ordenar por Gasto</option>
            <option value="roi">Ordenar por ROI</option>
            <option value="name">Ordenar por Nombre</option>
          </select>

          <button
            onClick={fetchCampaigns}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg border border-[rgba(0,166,81,0.2)] text-gray-500 hover:text-gray-200 hover:border-[rgba(0,166,81,0.4)] transition-all disabled:opacity-50"
          >
            Actualizar
          </button>
        </div>
      </div>

      <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#071409]">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Campaña</th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Canal</th>
                <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">Gasto</th>
                <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">Impresiones</th>
                <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">Clicks</th>
                <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">Conv.</th>
                <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">ROI/ROAS</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-t border-[rgba(0,166,81,0.06)]">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-3 py-3.5">
                        <div className="h-3.5 bg-[#1a2e1b] rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sortedCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-gray-500 text-sm">
                    No hay campañas. Cargá credenciales en Integraciones
                  </td>
                </tr>
              ) : (
                sortedCampaigns.map((c) => (
                  <tr
                    key={`${c.channelKey}-${c.id}`}
                    className="border-t border-[rgba(0,166,81,0.06)] hover:bg-[#112011] transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="text-sm text-gray-200 font-medium truncate max-w-[200px]">
                        {c.name}
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${CHANNEL_PILL[c.channelKey] || ''}`}>
                        {c.channel}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <div className="text-sm font-mono font-semibold text-gray-200">
                        {fmtARSCompact(c.spend)}
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-right text-sm font-mono text-gray-400">
                      {c.impressions ? fmtNum(c.impressions) : '-'}
                    </td>
                    <td className="px-3 py-3.5 text-right text-sm font-mono text-gray-400">
                      {c.clicks ? fmtNum(c.clicks) : '-'}
                    </td>
                    <td className="px-3 py-3.5 text-right text-sm font-mono text-gray-400">
                      {c.conversions ? fmtNum(c.conversions) : c.leads ? fmtNum(c.leads) : '-'}
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      {c.roi ? (
                        <span className="text-sm font-mono font-semibold text-emerald-400">
                          {fmtNum(c.roi)}%
                        </span>
                      ) : c.roas ? (
                        <span className="text-sm font-mono font-semibold text-emerald-400">
                          {c.roas.toFixed(2)}x
                        </span>
                      ) : c.conversionRate ? (
                        <span className="text-sm font-mono text-gray-400">
                          {c.conversionRate.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`text-[11px] px-2 py-1 rounded font-medium ${
                        c.status === 'ACTIVE' || c.status === 'active'
                          ? 'bg-[rgba(0,166,81,0.15)] text-[#00C65E]'
                          : 'bg-amber-900/30 text-amber-400'
                      }`}>
                        {c.status === 'ACTIVE' || c.status === 'active' ? 'Activa' : c.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
