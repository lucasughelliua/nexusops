'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer, Legend,
} from 'recharts'
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

type SortKey = keyof Campaign
type SortDir = 'asc' | 'desc'

const CHANNEL_PILL: Record<string, string> = {
  meta: 'bg-blue-900/30 text-blue-400 border border-blue-800/40',
  perfit: 'bg-pink-900/30 text-pink-400 border border-pink-800/40',
  google: 'bg-cyan-900/30 text-cyan-400 border border-cyan-800/40',
  kommo: 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/40',
}

const CHANNEL_COLORS: Record<string, string> = {
  'Meta Ads': '#3b82f6',
  Perfit: '#ec4899',
  'Google Ads': '#06b6d4',
  Kommo: '#10b981',
}

const PIE_FALLBACK_COLORS = ['#3b82f6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b']

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activa', active: 'Activa',
  PAUSED: 'Pausada', paused: 'Pausada',
  ARCHIVED: 'Archivada', archived: 'Archivada',
  DELETED: 'Eliminada', completed: 'Completada',
}

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status
  const color = ['ACTIVE', 'active'].includes(status)
    ? 'bg-[rgba(0,166,81,0.15)] text-[#00C65E]'
    : ['PAUSED', 'paused'].includes(status)
      ? 'bg-amber-900/30 text-amber-400'
      : 'bg-gray-800/60 text-gray-500'
  return <span className={`text-[11px] px-2 py-1 rounded font-medium ${color}`}>{label}</span>
}

function SortIcon({ col, sortKey, sortDir }: { col: string; sortKey: string; sortDir: SortDir }) {
  if (col !== sortKey) return <span className="ml-1 text-gray-700">↕</span>
  return <span className="ml-1 text-[#00A651]">{sortDir === 'asc' ? '↑' : '↓'}</span>
}

// ── Detail modal ──────────────────────────────────────────────────────────────
function CampaignModal({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const metrics = [
    { label: 'Gasto', value: fmtARSCompact(campaign.spend) },
    { label: 'Impresiones', value: campaign.impressions ? fmtNum(campaign.impressions) : '-' },
    { label: 'Clicks', value: campaign.clicks ? fmtNum(campaign.clicks) : '-' },
    {
      label: campaign.conversions != null ? 'Conversiones' : 'Leads',
      value: fmtNum(campaign.conversions ?? campaign.leads ?? 0),
    },
    { label: 'CPC', value: campaign.cpc ? fmtARSCompact(campaign.cpc) : '-' },
    { label: 'CPM', value: campaign.cpm ? fmtARSCompact(campaign.cpm) : '-' },
    { label: 'CTR', value: campaign.ctr ? fmtPct(campaign.ctr) : '-' },
    { label: 'Tasa Conv.', value: campaign.conversionRate ? fmtPct(campaign.conversionRate) : '-' },
    { label: 'ROAS', value: campaign.roas ? `${campaign.roas.toFixed(2)}x` : '-' },
    { label: 'ROI', value: campaign.roi ? `${fmtNum(campaign.roi)}%` : '-' },
  ]

  // Funnel para esta campaña
  const funnel = [
    { step: 'Impresiones', count: campaign.impressions ?? 0 },
    { step: 'Clicks', count: campaign.clicks ?? 0 },
    { step: 'Conv./Leads', count: campaign.conversions ?? campaign.leads ?? 0 },
  ].filter(f => f.count > 0)

  const maxFunnel = funnel[0]?.count ?? 1

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-xl max-h-[90vh] overflow-y-auto bg-[#081209] border border-[rgba(0,166,81,0.25)] rounded-t-2xl md:rounded-2xl p-6 space-y-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${CHANNEL_PILL[campaign.channelKey] || ''}`}>
                {campaign.channel}
              </span>
              <StatusBadge status={campaign.status} />
            </div>
            <h2 className="text-lg font-bold text-gray-100 leading-snug">{campaign.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-200 text-xl mt-0.5 shrink-0 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 gap-2">
          {metrics.map(m => (
            <div key={m.label} className="bg-[#0c1a0d] rounded-lg p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">{m.label}</div>
              <div className="text-base font-bold text-gray-100">{m.value}</div>
            </div>
          ))}
        </div>

        {/* Funnel visual */}
        {funnel.length > 1 && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-3">Embudo</div>
            <div className="space-y-2">
              {funnel.map((f, i) => {
                const pct = maxFunnel > 0 ? (f.count / maxFunnel) * 100 : 0
                const colors = ['#00A651', '#3b82f6', '#f59e0b']
                return (
                  <div key={f.step}>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>{f.step}</span>
                      <span className="font-mono font-semibold text-gray-200">{fmtNum(f.count)}</span>
                    </div>
                    <div className="h-2 bg-[#1a2e1b] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: colors[i] ?? '#00A651' }}
                      />
                    </div>
                    {i < funnel.length - 1 && funnel[i + 1].count > 0 && (
                      <div className="text-[10px] text-gray-600 text-right mt-0.5">
                        {((funnel[i + 1].count / f.count) * 100).toFixed(1)}% conversión
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Columnas de la tabla ──────────────────────────────────────────────────────
const COLUMNS: { key: SortKey; label: string; right?: boolean }[] = [
  { key: 'name', label: 'Campaña' },
  { key: 'channel', label: 'Canal' },
  { key: 'spend', label: 'Gasto', right: true },
  { key: 'impressions', label: 'Impresiones', right: true },
  { key: 'clicks', label: 'Clicks', right: true },
  { key: 'conversions', label: 'Conv.', right: true },
  { key: 'ctr', label: 'CTR', right: true },
  { key: 'cpc', label: 'CPC', right: true },
  { key: 'roas', label: 'ROAS', right: true },
  { key: 'status', label: 'Estado', right: true },
]

// ── Tooltip personalizado ──────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, fmt = 'num' }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.25)] rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-gray-400 mb-1 truncate max-w-[180px]">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }} className="font-mono font-semibold">
          {p.name}: {fmt === 'currency' ? fmtARSCompact(p.value) : fmt === 'pct' ? fmtPct(p.value) : fmtNum(p.value)}
        </div>
      ))}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function MarketingPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('spend')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selected, setSelected] = useState<Campaign | null>(null)

  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (channelFilter !== 'all') params.set('channel', channelFilter)
      const res = await fetch(`/api/campaigns?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setCampaigns(data.campaigns)
      }
    } catch (e) {
      console.error('Error fetching campaigns:', e)
    } finally {
      setLoading(false)
    }
  }, [channelFilter])

  useEffect(() => { fetchCampaigns() }, [fetchCampaigns])

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const filtered = useMemo(() => {
    let list = campaigns
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.channel.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
  }, [campaigns, search, sortKey, sortDir])

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0)
  const totalImpressions = campaigns.reduce((s, c) => s + (c.impressions ?? 0), 0)
  const totalClicks = campaigns.reduce((s, c) => s + (c.clicks ?? 0), 0)
  const totalConversions = campaigns.reduce((s, c) => s + (c.conversions ?? c.leads ?? 0), 0)
  const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
  const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0
  const avgROAS = useMemo(() => {
    const cs = campaigns.filter(c => c.roas != null)
    return cs.length > 0 ? cs.reduce((s, c) => s + (c.roas ?? 0), 0) / cs.length : 0
  }, [campaigns])

  // ── Chart data ───────────────────────────────────────────────────────────────
  const top10Spend = useMemo(() =>
    [...campaigns]
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10)
      .map(c => ({ name: c.name.length > 22 ? c.name.slice(0, 21) + '…' : c.name, gasto: c.spend })),
    [campaigns])

  const clicksConvData = useMemo(() =>
    [...campaigns]
      .filter(c => (c.clicks ?? 0) > 0)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 8)
      .map(c => ({
        name: c.name.length > 18 ? c.name.slice(0, 17) + '…' : c.name,
        clicks: c.clicks ?? 0,
        conv: c.conversions ?? c.leads ?? 0,
      })),
    [campaigns])

  const ctrData = useMemo(() =>
    [...campaigns]
      .filter(c => (c.ctr ?? 0) > 0)
      .sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0))
      .slice(0, 8)
      .map(c => ({
        name: c.name.length > 18 ? c.name.slice(0, 17) + '…' : c.name,
        ctr: c.ctr ?? 0,
      })),
    [campaigns])

  const spendByChannel = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of campaigns) map.set(c.channel, (map.get(c.channel) ?? 0) + c.spend)
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [campaigns])

  const KPI_CARDS = [
    { label: 'Gasto Total', value: fmtARSCompact(totalSpend), sub: `${campaigns.length} campañas` },
    { label: 'Impresiones', value: fmtNum(totalImpressions), sub: 'alcance total' },
    { label: 'Clicks', value: fmtNum(totalClicks), sub: `CTR ${fmtPct(avgCTR)}` },
    { label: 'Conversiones', value: fmtNum(totalConversions), sub: totalClicks > 0 ? `${fmtPct(totalConversions / totalClicks * 100)} tasa conv.` : '-' },
    { label: 'CPC Promedio', value: fmtARSCompact(avgCPC), sub: 'costo por click' },
    { label: 'CTR Promedio', value: fmtPct(avgCTR), sub: 'clicks / impresiones' },
    { label: 'ROAS Promedio', value: avgROAS > 0 ? `${avgROAS.toFixed(2)}x` : '-', sub: 'retorno por gasto' },
  ]

  return (
    <div className="p-6 space-y-6 fade-in">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-100 tracking-tight">Marketing & Campañas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Meta Ads · Perfit · Google Ads</p>
        </div>
        <button
          onClick={fetchCampaigns}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-lg border border-[rgba(0,166,81,0.2)] text-gray-500 hover:text-gray-200 hover:border-[rgba(0,166,81,0.4)] transition-all disabled:opacity-50"
        >
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {KPI_CARDS.map(k => (
          <div key={k.label} className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{k.label}</div>
            <div className="text-xl font-bold text-gray-100">{k.value}</div>
            {k.sub && <div className="text-[11px] text-gray-600 mt-1">{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Charts ─────────────────────────────────────────────────────────── */}
      {!loading && campaigns.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Gasto por canal */}
          <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-4">Gasto por Canal</div>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={spendByChannel}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  innerRadius={40}
                  paddingAngle={3}
                >
                  {spendByChannel.map((entry, i) => (
                    <Cell key={entry.name} fill={CHANNEL_COLORS[entry.name] ?? PIE_FALLBACK_COLORS[i % PIE_FALLBACK_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip fmt="currency" />} />
                <Legend
                  formatter={(v: string) => <span style={{ color: '#9ca3af', fontSize: 11 }}>{v}</span>}
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Top campañas por gasto */}
          <div className="lg:col-span-2 bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-4">Top 10 Campañas por Gasto</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={top10Spend} layout="vertical" margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2e1b" horizontal={false} />
                <XAxis type="number" tickFormatter={v => fmtARSCompact(v)} tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip fmt="currency" />} />
                <Bar dataKey="gasto" name="Gasto" fill="#00A651" radius={[0, 4, 4, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Clicks vs Conversiones */}
          {clicksConvData.length > 0 && (
            <div className="lg:col-span-2 bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-4">Clicks vs Conversiones (top 8)</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={clicksConvData} margin={{ left: 0, right: 8, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2e1b" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 9 }} angle={-35} textAnchor="end" axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend formatter={(v: string) => <span style={{ color: '#9ca3af', fontSize: 11 }}>{v === 'clicks' ? 'Clicks' : 'Conversiones'}</span>} iconSize={8} />
                  <Bar dataKey="clicks" name="clicks" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="conv" name="conv" fill="#00A651" radius={[3, 3, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* CTR por campaña */}
          {ctrData.length > 0 && (
            <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-4">CTR por Campaña</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={ctrData} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2e1b" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => fmtPct(v)} tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip fmt="pct" />} />
                  <Bar dataKey="ctr" name="CTR" fill="#f59e0b" radius={[0, 4, 4, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── Filters / Search ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Búsqueda */}
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar campaña…"
            className="pl-7 pr-3 py-1.5 text-xs rounded-lg bg-[#071409] border border-[rgba(0,166,81,0.2)] text-gray-200 placeholder:text-gray-600 outline-none focus:border-[#00A651] transition-colors w-48"
          />
        </div>

        {/* Canal filter */}
        <span className="text-xs text-gray-500 font-medium">Canal:</span>
        {['all', 'meta', 'perfit', 'google'].map(ch => (
          <button
            key={ch}
            onClick={() => setChannelFilter(ch)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
              channelFilter === ch
                ? 'bg-[#00A651] text-white border-[#00A651]'
                : 'bg-transparent text-gray-400 border-[rgba(0,166,81,0.2)] hover:border-[rgba(0,166,81,0.5)] hover:text-gray-200'
            }`}
          >
            {ch === 'all' ? 'Todas' : ch === 'meta' ? 'Meta' : ch === 'perfit' ? 'Perfit' : 'Google'}
          </button>
        ))}

        <span className="ml-auto text-xs text-gray-600">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#071409]">
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 cursor-pointer select-none hover:text-gray-300 transition-colors ${col.right ? 'text-right' : 'text-left'}`}
                  >
                    {col.label}
                    <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t border-[rgba(0,166,81,0.06)]">
                    {COLUMNS.map((_, j) => (
                      <td key={j} className="px-4 py-3.5">
                        <div className="h-3.5 bg-[#1a2e1b] rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-5 py-10 text-center text-gray-500 text-sm">
                    {campaigns.length === 0
                      ? 'No hay campañas. Cargá credenciales en Integraciones.'
                      : 'Sin resultados para esa búsqueda.'}
                  </td>
                </tr>
              ) : (
                filtered.map(c => (
                  <tr
                    key={`${c.channelKey}-${c.id}`}
                    onClick={() => setSelected(c)}
                    className="border-t border-[rgba(0,166,81,0.06)] hover:bg-[#112011] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3.5 max-w-[220px]">
                      <div className="text-sm text-gray-200 font-medium truncate">{c.name}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${CHANNEL_PILL[c.channelKey] || ''}`}>
                        {c.channel}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-semibold text-sm text-gray-200">
                      {fmtARSCompact(c.spend)}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm font-mono text-gray-400">
                      {c.impressions ? fmtNum(c.impressions) : '-'}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm font-mono text-gray-400">
                      {c.clicks ? fmtNum(c.clicks) : '-'}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm font-mono text-gray-400">
                      {c.conversions ? fmtNum(c.conversions) : c.leads ? fmtNum(c.leads) : '-'}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm font-mono text-gray-400">
                      {c.ctr ? <span className="text-amber-400">{fmtPct(c.ctr)}</span> : '-'}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm font-mono text-gray-400">
                      {c.cpc ? fmtARSCompact(c.cpc) : '-'}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {c.roas ? (
                        <span className="text-sm font-mono font-semibold text-emerald-400">{c.roas.toFixed(2)}x</span>
                      ) : c.roi ? (
                        <span className="text-sm font-mono font-semibold text-emerald-400">{fmtNum(c.roi)}%</span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Campaign detail modal ───────────────────────────────────────────── */}
      {selected && <CampaignModal campaign={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
