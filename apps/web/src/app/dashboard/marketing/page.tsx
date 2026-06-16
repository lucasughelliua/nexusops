'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts'
import { fmtARSCompact, fmtNum, fmtPct } from '@/lib/utils'

// ── Type definitions ──────────────────────────────────────────────────────────

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

interface MetaAdSet {
  id: string
  name: string
  status: string
  campaignId: string
  campaignName: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  cpc: number
  cpm: number
  conversionRate: number
}

interface MetaAd {
  id: string
  name: string
  status: string
  adSetId: string
  adSetName: string
  campaignId: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  cpc: number
  cpm: number
  thumbnailUrl?: string
}

interface MetaPageInsights {
  fbFollowers: number
  fbPageLikes: number
  igFollowers: number
  igMediaCount: number
  igUsername: string
  fbPageName: string
}

interface MetaFullData {
  campaigns: Campaign[]
  adsets: MetaAdSet[]
  ads: MetaAd[]
  page: MetaPageInsights
  summary: {
    totalSpend: number
    totalImpressions: number
    totalClicks: number
    totalConversions: number
    avgCTR: number
    avgCPC: number
    avgROAS: number
  }
  isMock?: boolean
}

interface PerfitData {
  totals: {
    sent: number
    delivered: number
    opened: number
    clicked: number
    unsubscribed: number
    open_rate: number
    click_rate: number
  }
}

interface GoogleData {
  totals: {
    spend: number
    clicks: number
    impressions: number
    conversions: number
    revenue: number
    roas: number
  }
}

interface KommoStats {
  total: number
  new_leads: number
  won: number
  lost: number
  open: number
  total_value: number
  won_value: number
  avg_deal_value: number
  conversion_rate: number
  pipelines: { id: number; name: string; statuses: { id: number; name: string; type: number }[] }[]
  leads_by_status: { statusName: string; pipelineName: string; count: number; value: number }[]
}

interface KommoFullData {
  stats: KommoStats
  isMock?: boolean
}

interface TiendanubeOrder {
  id: string
  number: string
  status: string
  created_at: string
  updated_at: string
  total: number
  subtotal: number
  items_count: number
  customer_name: string
  payment_status: string
}

interface TiendanubeStats {
  totalOrders: number
  totalRevenue: number
  totalCustomers: number
  avgOrderValue: number
  lastOrderDate?: string
}

interface TiendanubeFullData {
  orders: TiendanubeOrder[]
  stats: TiendanubeStats
  isMock?: boolean
}

type SortDir = 'asc' | 'desc'
type MainTab = 'resumen' | 'meta' | 'perfit' | 'google' | 'kommo' | 'tiendanube'
type MetaSubTab = 'campaigns' | 'adsets' | 'ads'

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNEL_COLORS_MAP: Record<string, string> = {
  'Meta Ads': '#3b82f6',
  Perfit: '#ec4899',
  'Google Ads': '#06b6d4',
  Kommo: '#10b981',
  Tiendanube: '#f59e0b',
}
const PIE_COLORS = ['#3b82f6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b']

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activa', active: 'Activa',
  PAUSED: 'Pausada', paused: 'Pausada',
  ARCHIVED: 'Archivada', archived: 'Archivada',
  DELETED: 'Eliminada', completed: 'Completada',
  pending: 'Pendiente', processing: 'Procesando', cancelled: 'Cancelada',
  paid: 'Pagada', failed: 'Fallida',
}

const CHANNEL_PILL: Record<string, string> = {
  meta: 'bg-blue-900/30 text-blue-400 border border-blue-800/40',
  perfit: 'bg-pink-900/30 text-pink-400 border border-pink-800/40',
  google: 'bg-cyan-900/30 text-cyan-400 border border-cyan-800/40',
  kommo: 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/40',
  tiendanube: 'bg-amber-900/30 text-amber-400 border border-amber-800/40',
}

const ROWS_PER_PAGE = 20

// ── Shared utility components ─────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status
  const color = ['ACTIVE', 'active', 'paid', 'completed'].includes(status)
    ? 'bg-[rgba(0,166,81,0.15)] text-[#00C65E]'
    : ['PAUSED', 'paused'].includes(status)
      ? 'bg-amber-900/30 text-amber-400'
      : ['pending'].includes(status)
        ? 'bg-slate-900/30 text-slate-400'
        : 'bg-gray-800/60 text-gray-500'
  return <span className={`text-[11px] px-2 py-1 rounded font-medium ${color}`}>{label}</span>
}

function SortIcon({ col, sortKey, sortDir }: { col: string; sortKey: string; sortDir: SortDir }) {
  if (col !== sortKey) return <span className="ml-1 text-gray-700">↕</span>
  return <span className="ml-1 text-[#00A651]">{sortDir === 'asc' ? '↑' : '↓'}</span>
}

function ChartTooltip({ active, payload, label, fmt = 'num' }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.25)] rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-gray-400 mb-1 truncate max-w-[200px]">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }} className="font-mono font-semibold">
          {p.name}: {fmt === 'currency' ? fmtARSCompact(p.value) : fmt === 'pct' ? fmtPct(p.value) : fmtNum(p.value)}
        </div>
      ))}
    </div>
  )
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{label}</div>
      <div className={`text-xl font-bold ${accent ? 'text-[#00A651]' : 'text-gray-100'}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-600 mt-1">{sub}</div>}
    </div>
  )
}

function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-t border-[rgba(0,166,81,0.06)]">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3.5">
              <div className="h-3.5 bg-[#1a2e1b] rounded animate-pulse" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

function SearchInput({ value, onChange, placeholder = 'Buscar…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">&#128269;</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-7 pr-3 py-1.5 text-xs rounded-lg bg-[#071409] border border-[rgba(0,166,81,0.2)] text-gray-200 placeholder:text-gray-600 outline-none focus:border-[#00A651] transition-colors w-48"
      />
    </div>
  )
}

// ── Pagination Component ──────────────────────────────────────────────────────

function Pagination({
  pageCount,
  currentPage,
  onPageChange,
}: {
  pageCount: number
  currentPage: number
  onPageChange: (page: number) => void
}) {
  return (
    <div className="flex items-center justify-between mt-4 pt-3 border-t border-[rgba(0,166,81,0.1)]">
      <span className="text-xs text-gray-500">
        Página {currentPage} de {pageCount}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-3 py-1.5 text-xs rounded-lg border border-[rgba(0,166,81,0.2)] text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ← Anterior
        </button>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= pageCount}
          className="px-3 py-1.5 text-xs rounded-lg border border-[rgba(0,166,81,0.2)] text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Siguiente →
        </button>
      </div>
    </div>
  )
}

// ── Filter Bar Component ──────────────────────────────────────────────────────

function FilterBar({
  dateFrom,
  dateTo,
  onDatesChange,
  status,
  statusOptions,
  onStatusChange,
}: {
  dateFrom: string
  dateTo: string
  onDatesChange: (from: string, to: string) => void
  status: string
  statusOptions: string[]
  onStatusChange: (status: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-3 items-end mb-4 pb-4 border-b border-[rgba(0,166,81,0.1)]">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-400 uppercase">Desde</label>
        <input
          type="date"
          value={dateFrom}
          onChange={e => onDatesChange(e.target.value, dateTo)}
          className="px-3 py-1.5 text-xs rounded-lg bg-[#071409] border border-[rgba(0,166,81,0.2)] text-gray-200 outline-none focus:border-[#00A651] transition-colors"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-400 uppercase">Hasta</label>
        <input
          type="date"
          value={dateTo}
          onChange={e => onDatesChange(dateFrom, e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg bg-[#071409] border border-[rgba(0,166,81,0.2)] text-gray-200 outline-none focus:border-[#00A651] transition-colors"
        />
      </div>
      {statusOptions.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-400 uppercase">Estado</label>
          <select
            value={status}
            onChange={e => onStatusChange(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg bg-[#071409] border border-[rgba(0,166,81,0.2)] text-gray-200 outline-none focus:border-[#00A651] transition-colors"
          >
            <option value="">Todos</option>
            {statusOptions.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

// ── Generic sortable table with pagination ────────────────────────────────────

interface ColDef<T> {
  key: keyof T | string
  label: string
  right?: boolean
  render?: (row: T) => React.ReactNode
  sortValue?: (row: T) => number | string
}

function SortableTable<T extends { id: string | number }>({
  cols,
  rows,
  loading,
  onRowClick,
  emptyMsg = 'Sin datos',
}: {
  cols: ColDef<T>[]
  rows: T[]
  loading: boolean
  onRowClick?: (row: T) => void
  emptyMsg?: string
}) {
  const [sortKey, setSortKey] = useState<string>(cols[0]?.key as string ?? '')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
    setCurrentPage(1)
  }

  const filtered = useMemo(() => {
    let list = rows
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r => {
        return cols.some(c => {
          const v = (r as any)[c.key]
          return typeof v === 'string' && v.toLowerCase().includes(q)
        })
      })
    }
    return [...list].sort((a, b) => {
      const col = cols.find(c => c.key === sortKey)
      const av = col?.sortValue ? col.sortValue(a) : (a as any)[sortKey] ?? ''
      const bv = col?.sortValue ? col.sortValue(b) : (b as any)[sortKey] ?? ''
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
  }, [rows, search, sortKey, sortDir, cols])

  const pageCount = Math.ceil(filtered.length / ROWS_PER_PAGE)
  const paginatedRows = filtered.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar…" />
        <span className="ml-auto text-xs text-gray-600">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#071409]">
                {cols.map(col => (
                  <th
                    key={col.key as string}
                    onClick={() => handleSort(col.key as string)}
                    className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 cursor-pointer select-none hover:text-gray-300 transition-colors ${col.right ? 'text-right' : 'text-left'}`}
                  >
                    {col.label}
                    <SortIcon col={col.key as string} sortKey={sortKey} sortDir={sortDir} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={cols.length} />
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={cols.length} className="px-5 py-10 text-center text-gray-500 text-sm">{emptyMsg}</td>
                </tr>
              ) : paginatedRows.map(row => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row)}
                  className={`border-t border-[rgba(0,166,81,0.06)] hover:bg-[#112011] transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                >
                  {cols.map(col => (
                    <td
                      key={col.key as string}
                      className={`px-4 py-3.5 text-sm ${col.right ? 'text-right font-mono text-gray-400' : ''}`}
                    >
                      {col.render ? col.render(row) : <span className="text-gray-300">{String((row as any)[col.key] ?? '-')}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {pageCount > 1 && (
        <Pagination pageCount={pageCount} currentPage={currentPage} onPageChange={setCurrentPage} />
      )}
    </div>
  )
}

// ── Enhanced Detail Modal ─────────────────────────────────────────────────────

function DetailModal({
  title,
  channel,
  channelKey,
  status,
  metrics,
  thumbnailUrl,
  children,
  onClose,
}: {
  title: string
  channel?: string
  channelKey?: string
  status?: string
  metrics: { label: string; value: string }[]
  thumbnailUrl?: string
  children?: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-2xl max-h-[90vh] overflow-y-auto bg-[#081209] border border-[rgba(0,166,81,0.25)] rounded-t-2xl md:rounded-2xl p-6 space-y-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {channel && channelKey && (
                <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${CHANNEL_PILL[channelKey] ?? ''}`}>
                  {channel}
                </span>
              )}
              {status && <StatusBadge status={status} />}
            </div>
            <h2 className="text-lg font-bold text-gray-100 leading-snug">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-200 text-xl mt-0.5 shrink-0 transition-colors"
          >
            &#x2715;
          </button>
        </div>

        {/* Thumbnail if available */}
        {thumbnailUrl && (
          <div className="rounded-lg overflow-hidden bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)]">
            <img
              src={thumbnailUrl}
              alt="creative"
              className="w-full max-h-[200px] object-cover"
            />
          </div>
        )}

        {/* Metrics grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {metrics.map(m => (
            <div key={m.label} className="bg-[#0c1a0d] rounded-lg p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">{m.label}</div>
              <div className="text-base font-bold text-gray-100 truncate">{m.value}</div>
            </div>
          ))}
        </div>

        {/* Children for mini charts */}
        {children && (
          <div>
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Resumen Tab ───────────────────────────────────────────────────────────────

function ResumenTab({ allCampaigns, loading }: { allCampaigns: Campaign[]; loading: boolean }) {
  const totalSpend = allCampaigns.reduce((s, c) => s + c.spend, 0)
  const totalImpressions = allCampaigns.reduce((s, c) => s + (c.impressions ?? 0), 0)
  const totalClicks = allCampaigns.reduce((s, c) => s + (c.clicks ?? 0), 0)
  const totalConversions = allCampaigns.reduce((s, c) => s + (c.conversions ?? c.leads ?? 0), 0)
  const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
  const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0

  const spendByChannel = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of allCampaigns) map.set(c.channel, (map.get(c.channel) ?? 0) + c.spend)
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [allCampaigns])

  const top8Spend = useMemo(() =>
    [...allCampaigns].sort((a, b) => b.spend - a.spend).slice(0, 8).map(c => ({
      name: c.name.length > 22 ? c.name.slice(0, 21) + '…' : c.name,
      gasto: c.spend,
    })),
    [allCampaigns])

  const kpis = [
    { label: 'Gasto Total', value: fmtARSCompact(totalSpend), sub: `${allCampaigns.length} campañas` },
    { label: 'Impresiones', value: fmtNum(totalImpressions), sub: 'alcance total' },
    { label: 'Clicks', value: fmtNum(totalClicks), sub: `CTR ${fmtPct(avgCTR)}` },
    { label: 'Conversiones', value: fmtNum(totalConversions) },
    { label: 'CPC Promedio', value: fmtARSCompact(avgCPC) },
    { label: 'CTR Promedio', value: fmtPct(avgCTR) },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      {!loading && allCampaigns.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Pie: gasto por canal */}
          <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-4">Gasto por Canal</div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={spendByChannel} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={42} paddingAngle={3}>
                  {spendByChannel.map((e, i) => (
                    <Cell key={e.name} fill={CHANNEL_COLORS_MAP[e.name] ?? PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip fmt="currency" />} />
                <Legend formatter={(v: string) => <span style={{ color: '#9ca3af', fontSize: 11 }}>{v}</span>} iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Bar: top 8 por gasto */}
          <div className="lg:col-span-2 bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-4">Top Campañas por Gasto</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={top8Spend} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2e1b" horizontal={false} />
                <XAxis type="number" tickFormatter={v => fmtARSCompact(v)} tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip fmt="currency" />} />
                <Bar dataKey="gasto" name="Gasto" fill="#00A651" radius={[0, 4, 4, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-4 h-20 animate-pulse" />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Meta Tab ──────────────────────────────────────────────────────────────────

function SocialChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl px-4 py-3 flex flex-col gap-1">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-lg font-bold text-gray-100">{value}</div>
    </div>
  )
}

function MetaTab({ data, loading }: { data: MetaFullData | null; loading: boolean }) {
  const [subTab, setSubTab] = useState<MetaSubTab>('campaigns')
  const [selected, setSelected] = useState<any | null>(null)
  const [dateFrom, setDateFrom] = useState<string>(format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [filterStatus, setFilterStatus] = useState<string>('')

  const campaigns = data?.campaigns ?? []
  const adsets = data?.adsets ?? []
  const ads = data?.ads ?? []
  const page = data?.page

  // Charts for campaigns
  const top5SpendCamp = useMemo(() =>
    [...campaigns].sort((a, b) => b.spend - a.spend).slice(0, 5).map(c => ({
      name: c.name.length > 20 ? c.name.slice(0, 19) + '…' : c.name,
      gasto: c.spend,
      ctr: c.ctr ?? 0,
      clicks: c.clicks ?? 0,
      conv: c.conversions ?? 0,
    })), [campaigns])

  // Charts for adsets
  const top5SpendAdsets = useMemo(() =>
    [...adsets].sort((a, b) => b.spend - a.spend).slice(0, 5).map(a => ({
      name: a.name.length > 20 ? a.name.slice(0, 19) + '…' : a.name,
      gasto: a.spend,
      ctr: a.ctr,
      clicks: a.clicks,
      conv: a.conversions,
    })), [adsets])

  // Charts for ads
  const top5SpendAds = useMemo(() =>
    [...ads].sort((a, b) => b.spend - a.spend).slice(0, 5).map(a => ({
      name: a.name.length > 20 ? a.name.slice(0, 19) + '…' : a.name,
      gasto: a.spend,
      ctr: a.ctr,
      clicks: a.clicks,
      conv: a.conversions,
    })), [ads])

  const currentTop5 = subTab === 'campaigns' ? top5SpendCamp : subTab === 'adsets' ? top5SpendAdsets : top5SpendAds

  // Campaign columns
  const campCols: ColDef<Campaign>[] = [
    { key: 'name', label: 'Campaña', render: r => <span className="text-gray-200 font-medium truncate max-w-[200px] block">{r.name}</span> },
    { key: 'status', label: 'Estado', right: true, render: r => <StatusBadge status={r.status} /> },
    { key: 'spend', label: 'Gasto', right: true, render: r => <span className="font-semibold text-gray-200">{fmtARSCompact(r.spend)}</span> },
    { key: 'impressions', label: 'Impresiones', right: true, render: r => <span>{fmtNum(r.impressions)}</span> },
    { key: 'clicks', label: 'Clicks', right: true, render: r => <span>{fmtNum(r.clicks)}</span> },
    { key: 'conversions', label: 'Conv.', right: true, render: r => <span>{fmtNum(r.conversions)}</span> },
    { key: 'ctr', label: 'CTR', right: true, render: r => <span className="text-amber-400">{fmtPct(r.ctr)}</span> },
    { key: 'cpc', label: 'CPC', right: true, render: r => <span>{r.cpc ? fmtARSCompact(r.cpc) : '-'}</span> },
    { key: 'cpm', label: 'CPM', right: true, render: r => <span>{r.cpm ? fmtARSCompact(r.cpm) : '-'}</span> },
  ]

  // AdSet columns
  const adsetCols: ColDef<MetaAdSet>[] = [
    { key: 'name', label: 'Conjunto', render: r => <span className="text-gray-200 font-medium truncate max-w-[180px] block">{r.name}</span> },
    { key: 'campaignName', label: 'Campaña', render: r => <span className="text-gray-400 text-xs">{r.campaignName}</span> },
    { key: 'status', label: 'Estado', right: true, render: r => <StatusBadge status={r.status} /> },
    { key: 'spend', label: 'Gasto', right: true, render: r => <span className="font-semibold text-gray-200">{fmtARSCompact(r.spend)}</span> },
    { key: 'impressions', label: 'Impresiones', right: true, render: r => <span>{fmtNum(r.impressions)}</span> },
    { key: 'clicks', label: 'Clicks', right: true, render: r => <span>{fmtNum(r.clicks)}</span> },
    { key: 'conversions', label: 'Conv.', right: true, render: r => <span>{fmtNum(r.conversions)}</span> },
    { key: 'ctr', label: 'CTR', right: true, render: r => <span className="text-amber-400">{fmtPct(r.ctr)}</span> },
    { key: 'cpc', label: 'CPC', right: true, render: r => <span>{fmtARSCompact(r.cpc)}</span> },
  ]

  // Ad columns
  const adCols: ColDef<MetaAd>[] = [
    { key: 'name', label: 'Anuncio', render: r => <span className="text-gray-200 font-medium truncate max-w-[180px] block">{r.name}</span> },
    { key: 'adSetName', label: 'Conjunto', render: r => <span className="text-gray-400 text-xs">{r.adSetName}</span> },
    { key: 'status', label: 'Estado', right: true, render: r => <StatusBadge status={r.status} /> },
    { key: 'spend', label: 'Gasto', right: true, render: r => <span className="font-semibold text-gray-200">{fmtARSCompact(r.spend)}</span> },
    { key: 'impressions', label: 'Impresiones', right: true, render: r => <span>{fmtNum(r.impressions)}</span> },
    { key: 'clicks', label: 'Clicks', right: true, render: r => <span>{fmtNum(r.clicks)}</span> },
    { key: 'conversions', label: 'Conv.', right: true, render: r => <span>{fmtNum(r.conversions)}</span> },
    { key: 'ctr', label: 'CTR', right: true, render: r => <span className="text-amber-400">{fmtPct(r.ctr)}</span> },
    { key: 'cpc', label: 'CPC', right: true, render: r => <span>{fmtARSCompact(r.cpc)}</span> },
  ]

  const openModal = (row: any) => {
    setSelected(row)
  }

  const getModalMetrics = (row: any) => [
    { label: 'Gasto', value: fmtARSCompact(row.spend ?? 0) },
    { label: 'Impresiones', value: fmtNum(row.impressions) },
    { label: 'Clicks', value: fmtNum(row.clicks) },
    { label: 'Conversiones', value: fmtNum(row.conversions) },
    { label: 'CTR', value: fmtPct(row.ctr) },
    { label: 'CPC', value: fmtARSCompact(row.cpc ?? 0) },
    { label: 'CPM', value: fmtARSCompact(row.cpm ?? 0) },
    { label: 'Tasa Conv.', value: fmtPct(row.conversionRate) },
  ]

  const SUB_TABS = [
    { key: 'campaigns' as MetaSubTab, label: 'Campañas' },
    { key: 'adsets' as MetaSubTab, label: 'Conjuntos' },
    { key: 'ads' as MetaSubTab, label: 'Anuncios' },
  ]

  return (
    <div className="space-y-5">
      {/* Social row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SocialChip label="FB Seguidores" value={page ? fmtNum(page.fbFollowers) : '—'} />
        <SocialChip label="FB Page Likes" value={page ? fmtNum(page.fbPageLikes) : '—'} />
        <SocialChip label="IG Seguidores" value={page ? fmtNum(page.igFollowers) : '—'} />
        <SocialChip label="IG Publicaciones" value={page ? fmtNum(page.igMediaCount) : '—'} />
      </div>

      {/* Summary KPIs */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Gasto Total" value={fmtARSCompact(data.summary.totalSpend)} sub={`${campaigns.length} campañas`} />
          <KpiCard label="Impresiones" value={fmtNum(data.summary.totalImpressions)} />
          <KpiCard label="Clicks" value={fmtNum(data.summary.totalClicks)} />
          <KpiCard label="Conversiones" value={fmtNum(data.summary.totalConversions)} />
          <KpiCard label="CTR Promedio" value={fmtPct(data.summary.avgCTR)} />
          <KpiCard label="CPC Promedio" value={fmtARSCompact(data.summary.avgCPC)} />
        </div>
      )}

      {/* Charts row */}
      {!loading && currentTop5.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-4">Top 5 por Gasto</div>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={currentTop5} layout="vertical" margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2e1b" horizontal={false} />
                <XAxis type="number" tickFormatter={v => fmtARSCompact(v)} tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip fmt="currency" />} />
                <Bar dataKey="gasto" name="Gasto" fill="#00A651" radius={[0, 4, 4, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-4">CTR Ranking</div>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={[...currentTop5].sort((a, b) => b.ctr - a.ctr)} layout="vertical" margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2e1b" horizontal={false} />
                <XAxis type="number" tickFormatter={v => fmtPct(v)} tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip fmt="pct" />} />
                <Bar dataKey="ctr" name="CTR" fill="#f59e0b" radius={[0, 4, 4, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-4">Clicks vs Conv.</div>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={currentTop5} margin={{ left: 0, right: 8, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2e1b" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 9 }} angle={-30} textAnchor="end" axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend formatter={(v: string) => <span style={{ color: '#9ca3af', fontSize: 11 }}>{v === 'clicks' ? 'Clicks' : 'Conv.'}</span>} iconSize={8} />
                <Bar dataKey="clicks" name="clicks" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Bar dataKey="conv" name="conv" fill="#00A651" radius={[3, 3, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Sub-tab navigation */}
      <div className="flex gap-2 border-b border-[rgba(0,166,81,0.1)] pb-0">
        {SUB_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`text-xs px-4 py-2 rounded-t-lg border border-b-0 transition-all ${
              subTab === t.key
                ? 'bg-[#0c1a0d] border-[rgba(0,166,81,0.3)] text-[#00A651]'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'campaigns' && (
        <>
          <FilterBar
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDatesChange={(f, t) => { setDateFrom(f); setDateTo(t) }}
            status={filterStatus}
            statusOptions={['ACTIVE', 'PAUSED', 'ARCHIVED']}
            onStatusChange={setFilterStatus}
          />
          <SortableTable
            cols={campCols}
            rows={campaigns.filter(c => !filterStatus || c.status === filterStatus) as any[]}
            loading={loading}
            onRowClick={row => setSelected(row)}
            emptyMsg="Sin campañas. Configurá credenciales de Meta Ads en Integraciones."
          />
        </>
      )}
      {subTab === 'adsets' && (
        <>
          <FilterBar
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDatesChange={(f, t) => { setDateFrom(f); setDateTo(t) }}
            status={filterStatus}
            statusOptions={['ACTIVE', 'PAUSED']}
            onStatusChange={setFilterStatus}
          />
          <SortableTable
            cols={adsetCols}
            rows={adsets.filter(a => !filterStatus || a.status === filterStatus) as any[]}
            loading={loading}
            onRowClick={row => setSelected(row)}
            emptyMsg="Sin conjuntos de anuncios."
          />
        </>
      )}
      {subTab === 'ads' && (
        <>
          <FilterBar
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDatesChange={(f, t) => { setDateFrom(f); setDateTo(t) }}
            status={filterStatus}
            statusOptions={['ACTIVE', 'PAUSED']}
            onStatusChange={setFilterStatus}
          />
          <SortableTable
            cols={adCols}
            rows={ads.filter(a => !filterStatus || a.status === filterStatus) as any[]}
            loading={loading}
            onRowClick={row => setSelected(row)}
            emptyMsg="Sin anuncios."
          />
        </>
      )}

      {selected && (
        <DetailModal
          title={selected.name}
          channel="Meta Ads"
          channelKey="meta"
          status={selected.status}
          thumbnailUrl={selected.thumbnailUrl}
          metrics={getModalMetrics(selected)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

// ── Perfit Tab ────────────────────────────────────────────────────────────────

function PerfitTab({ campaigns, perfitData, loading }: {
  campaigns: Campaign[]
  perfitData: PerfitData | null
  loading: boolean
}) {
  const [selected, setSelected] = useState<Campaign | null>(null)
  const [dateFrom, setDateFrom] = useState<string>(format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [filterStatus, setFilterStatus] = useState<string>('')
  const totals = perfitData?.totals

  const kpis = totals ? [
    { label: 'Enviados', value: fmtNum(totals.sent) },
    { label: 'Entregados', value: fmtNum(totals.delivered) },
    { label: 'Abiertos', value: fmtNum(totals.opened), sub: `Tasa ${fmtPct(totals.open_rate)}` },
    { label: 'Clicks', value: fmtNum(totals.clicked), sub: `Tasa ${fmtPct(totals.click_rate)}` },
    { label: 'Tasa Apertura', value: fmtPct(totals.open_rate), accent: true },
    { label: 'Tasa Clicks', value: fmtPct(totals.click_rate), accent: true },
    { label: 'Desubscriptos', value: fmtNum(totals.unsubscribed) },
  ] : []

  const cols: ColDef<Campaign>[] = [
    { key: 'name', label: 'Campaña', render: r => <span className="text-gray-200 font-medium truncate max-w-[220px] block">{r.name}</span> },
    { key: 'status', label: 'Estado', right: true, render: r => <StatusBadge status={r.status} /> },
    { key: 'spend', label: 'Gasto', right: true, render: r => <span className="font-semibold text-gray-200">{fmtARSCompact(r.spend)}</span> },
    { key: 'leads', label: 'Leads', right: true, render: r => <span>{fmtNum(r.leads)}</span> },
    { key: 'roi', label: 'ROI', right: true, render: r => r.roi ? <span className="text-emerald-400 font-semibold">{fmtNum(r.roi)}%</span> : <span className="text-gray-600">-</span> },
  ]

  return (
    <div className="space-y-5">
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {kpis.map(k => <KpiCard key={k.label} {...k} />)}
        </div>
      )}

      <FilterBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDatesChange={(f, t) => { setDateFrom(f); setDateTo(t) }}
        status={filterStatus}
        statusOptions={['ACTIVE', 'PAUSED', 'ARCHIVED']}
        onStatusChange={setFilterStatus}
      />

      <SortableTable
        cols={cols}
        rows={campaigns.filter(c => !filterStatus || c.status === filterStatus) as any[]}
        loading={loading}
        onRowClick={c => setSelected(c as Campaign)}
        emptyMsg="Sin campañas de Perfit."
      />

      {selected && (
        <DetailModal
          title={selected.name}
          channel="Perfit"
          channelKey="perfit"
          status={selected.status}
          metrics={[
            { label: 'Gasto', value: fmtARSCompact(selected.spend) },
            { label: 'Leads', value: fmtNum(selected.leads) },
            { label: 'ROI', value: selected.roi ? `${fmtNum(selected.roi)}%` : '-' },
            { label: 'ROAS', value: selected.roas ? `${selected.roas.toFixed(2)}x` : '-' },
            { label: 'Estado', value: STATUS_LABELS[selected.status] ?? selected.status },
            { label: 'Conversiones', value: fmtNum(selected.conversions) },
          ]}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

// ── Google Tab ────────────────────────────────────────────────────────────────

function GoogleTab({ campaigns, googleData, loading }: {
  campaigns: Campaign[]
  googleData: GoogleData | null
  loading: boolean
}) {
  const [selected, setSelected] = useState<Campaign | null>(null)
  const [dateFrom, setDateFrom] = useState<string>(format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [filterStatus, setFilterStatus] = useState<string>('')
  const totals = googleData?.totals

  const kpis = totals ? [
    { label: 'Gasto', value: fmtARSCompact(totals.spend) },
    { label: 'Clicks', value: fmtNum(totals.clicks) },
    { label: 'Impresiones', value: fmtNum(totals.impressions) },
    { label: 'Conversiones', value: fmtNum(totals.conversions) },
    { label: 'Revenue', value: fmtARSCompact(totals.revenue) },
    { label: 'ROAS', value: `${totals.roas.toFixed(2)}x`, accent: true },
  ] : []

  const cols: ColDef<Campaign>[] = [
    { key: 'name', label: 'Campaña', render: r => <span className="text-gray-200 font-medium truncate max-w-[220px] block">{r.name}</span> },
    { key: 'status', label: 'Estado', right: true, render: r => <StatusBadge status={r.status} /> },
    { key: 'spend', label: 'Gasto', right: true, render: r => <span className="font-semibold text-gray-200">{fmtARSCompact(r.spend)}</span> },
    { key: 'impressions', label: 'Impresiones', right: true, render: r => <span>{fmtNum(r.impressions)}</span> },
    { key: 'clicks', label: 'Clicks', right: true, render: r => <span>{fmtNum(r.clicks)}</span> },
    { key: 'conversions', label: 'Conv.', right: true, render: r => <span>{fmtNum(r.conversions)}</span> },
    { key: 'ctr', label: 'CTR', right: true, render: r => r.ctr ? <span className="text-amber-400">{fmtPct(r.ctr)}</span> : <span className="text-gray-600">-</span> },
    { key: 'roas', label: 'ROAS', right: true, render: r => r.roas ? <span className="text-emerald-400 font-semibold">{r.roas.toFixed(2)}x</span> : <span className="text-gray-600">-</span> },
  ]

  return (
    <div className="space-y-5">
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map(k => <KpiCard key={k.label} {...k} />)}
        </div>
      )}

      <FilterBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDatesChange={(f, t) => { setDateFrom(f); setDateTo(t) }}
        status={filterStatus}
        statusOptions={['ACTIVE', 'PAUSED', 'ARCHIVED']}
        onStatusChange={setFilterStatus}
      />

      <SortableTable
        cols={cols}
        rows={campaigns.filter(c => !filterStatus || c.status === filterStatus) as any[]}
        loading={loading}
        onRowClick={c => setSelected(c as Campaign)}
        emptyMsg="Sin campañas de Google Ads."
      />

      {selected && (
        <DetailModal
          title={selected.name}
          channel="Google Ads"
          channelKey="google"
          status={selected.status}
          metrics={[
            { label: 'Gasto', value: fmtARSCompact(selected.spend) },
            { label: 'Impresiones', value: fmtNum(selected.impressions) },
            { label: 'Clicks', value: fmtNum(selected.clicks) },
            { label: 'Conversiones', value: fmtNum(selected.conversions) },
            { label: 'CTR', value: fmtPct(selected.ctr) },
            { label: 'CPC', value: selected.cpc ? fmtARSCompact(selected.cpc) : '-' },
            { label: 'ROAS', value: selected.roas ? `${selected.roas.toFixed(2)}x` : '-' },
          ]}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

// ── Kommo Tab ─────────────────────────────────────────────────────────────────

function KommoTab({ data, loading }: { data: KommoFullData | null; loading: boolean }) {
  const [dateFrom, setDateFrom] = useState<string>(format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [filterStatus, setFilterStatus] = useState<string>('')

  const stats = data?.stats

  const kpis = stats ? [
    { label: 'Nuevos Leads', value: fmtNum(stats.new_leads) },
    { label: 'Abiertos', value: fmtNum(stats.open) },
    { label: 'Ganados', value: fmtNum(stats.won), accent: true },
    { label: 'Perdidos', value: fmtNum(stats.lost) },
    { label: 'Tasa Conv.', value: fmtPct(stats.conversion_rate), accent: true },
    { label: 'Valor Total', value: fmtARSCompact(stats.total_value) },
    { label: 'Valor Ganado', value: fmtARSCompact(stats.won_value) },
    { label: 'Ticket Promedio', value: fmtARSCompact(stats.avg_deal_value) },
  ] : []

  const maxCount = stats ? Math.max(...stats.leads_by_status.map(s => s.count), 1) : 1

  type LeadStatus = { statusName: string; pipelineName: string; count: number; value: number; id: string }
  const statusRows: LeadStatus[] = (stats?.leads_by_status ?? []).map(s => ({
    ...s,
    id: s.statusName,
  }))

  const cols: ColDef<LeadStatus>[] = [
    { key: 'statusName', label: 'Estado', render: r => <span className="text-gray-200 font-medium">{r.statusName}</span> },
    { key: 'pipelineName', label: 'Pipeline', render: r => <span className="text-gray-400 text-xs">{r.pipelineName}</span> },
    { key: 'count', label: 'Leads', right: true, render: r => <span className="text-gray-200 font-semibold">{fmtNum(r.count)}</span> },
    { key: 'value', label: 'Valor', right: true, render: r => <span>{fmtARSCompact(r.value)}</span> },
  ]

  const barData = (stats?.leads_by_status ?? []).slice(0, 8).map(s => ({
    name: s.statusName.length > 16 ? s.statusName.slice(0, 15) + '…' : s.statusName,
    leads: s.count,
    valor: s.value,
  }))

  return (
    <div className="space-y-5">
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {kpis.map(k => <KpiCard key={k.label} {...k} />)}
        </div>
      )}

      {!loading && stats && stats.leads_by_status.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Funnel horizontal */}
          <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-4">Pipeline Funnel</div>
            <div className="space-y-2.5">
              {stats.leads_by_status.slice(0, 8).map((s, i) => {
                const pct = maxCount > 0 ? (s.count / maxCount) * 100 : 0
                const colors = ['#00A651', '#3b82f6', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444', '#10b981']
                return (
                  <div key={s.statusName}>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>{s.statusName}</span>
                      <span className="font-mono font-semibold text-gray-200">{fmtNum(s.count)}</span>
                    </div>
                    <div className="h-2.5 bg-[#1a2e1b] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: colors[i % colors.length] }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Bar chart */}
          <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-4">Leads por Estado</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2e1b" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="leads" name="Leads" fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <FilterBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDatesChange={(f, t) => { setDateFrom(f); setDateTo(t) }}
        status={filterStatus}
        statusOptions={[]}
        onStatusChange={setFilterStatus}
      />

      <SortableTable
        cols={cols}
        rows={statusRows}
        loading={loading}
        emptyMsg="Sin datos de Kommo CRM."
      />
    </div>
  )
}

// ── Tiendanube Tab ────────────────────────────────────────────────────────────

function TiendanubeTab({ data, loading }: { data: TiendanubeFullData | null; loading: boolean }) {
  const [selected, setSelected] = useState<TiendanubeOrder | null>(null)
  const [dateFrom, setDateFrom] = useState<string>(format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [filterStatus, setFilterStatus] = useState<string>('')

  const stats = data?.stats
  const orders = data?.orders ?? []

  const kpis = stats ? [
    { label: 'Pedidos Totales', value: fmtNum(stats.totalOrders), accent: false },
    { label: 'Revenue', value: fmtARSCompact(stats.totalRevenue), accent: true },
    { label: 'Clientes', value: fmtNum(stats.totalCustomers) },
    { label: 'Ticket Promedio', value: fmtARSCompact(stats.avgOrderValue), accent: false },
  ] : []

  const cols: ColDef<TiendanubeOrder>[] = [
    { key: 'number', label: 'Pedido #', render: r => <span className="text-gray-200 font-medium">{r.number}</span> },
    { key: 'customer_name', label: 'Cliente', render: r => <span className="text-gray-300">{r.customer_name}</span> },
    { key: 'status', label: 'Estado', right: true, render: r => <StatusBadge status={r.status} /> },
    { key: 'total', label: 'Total', right: true, render: r => <span className="font-semibold text-gray-200">{fmtARSCompact(r.total)}</span> },
    { key: 'items_count', label: 'Items', right: true, render: r => <span>{fmtNum(r.items_count)}</span> },
    { key: 'payment_status', label: 'Pago', right: true, render: r => <StatusBadge status={r.payment_status} /> },
    { key: 'created_at', label: 'Fecha', right: true, render: r => <span className="text-xs text-gray-400">{format(new Date(r.created_at), 'dd/MM/yyyy')}</span> },
  ]

  return (
    <div className="space-y-5">
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpis.map(k => <KpiCard key={k.label} {...k} />)}
        </div>
      )}

      {!loading && orders.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-4">Distribución por Estado</div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={Object.entries(
                    orders.reduce((acc, o) => ({ ...acc, [o.status]: (acc[o.status as keyof typeof acc] ?? 0) + 1 }), {} as Record<string, number>)
                  ).map(([status, count]) => ({ name: STATUS_LABELS[status] ?? status, value: count }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                >
                  {PIE_COLORS.map((color, i) => (
                    <Cell key={i} fill={color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-4">Revenue por Día</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart
                data={Object.entries(
                  orders.reduce((acc, o) => {
                    const day = format(new Date(o.created_at), 'dd/MM')
                    return { ...acc, [day]: (acc[day as keyof typeof acc] ?? 0) + o.total }
                  }, {} as Record<string, number>)
                ).map(([day, revenue]) => ({ day, revenue }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2e1b" />
                <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 10 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
                <Tooltip content={<ChartTooltip fmt="currency" />} />
                <Line type="monotone" dataKey="revenue" stroke="#00A651" strokeWidth={2} dot={{ fill: '#00A651', r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <FilterBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDatesChange={(f, t) => { setDateFrom(f); setDateTo(t) }}
        status={filterStatus}
        statusOptions={['pending', 'processing', 'completed', 'cancelled']}
        onStatusChange={setFilterStatus}
      />

      <SortableTable
        cols={cols}
        rows={orders.filter(o => !filterStatus || o.status === filterStatus)}
        loading={loading}
        onRowClick={o => setSelected(o)}
        emptyMsg="Sin pedidos en Tiendanube."
      />

      {selected && (
        <DetailModal
          title={`Pedido #${selected.number}`}
          channel="Tiendanube"
          channelKey="tiendanube"
          status={selected.status}
          metrics={[
            { label: 'Total', value: fmtARSCompact(selected.total) },
            { label: 'Subtotal', value: fmtARSCompact(selected.subtotal) },
            { label: 'Items', value: fmtNum(selected.items_count) },
            { label: 'Cliente', value: selected.customer_name },
            { label: 'Pago', value: STATUS_LABELS[selected.payment_status] ?? selected.payment_status },
            { label: 'Fecha', value: format(new Date(selected.created_at), 'dd/MM/yyyy HH:mm') },
          ]}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS: { key: MainTab; label: string }[] = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'meta', label: 'Meta Ads' },
  { key: 'perfit', label: 'Perfit' },
  { key: 'google', label: 'Google Ads' },
  { key: 'kommo', label: 'Kommo CRM' },
  { key: 'tiendanube', label: 'Tiendanube' },
]

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState<MainTab>('resumen')

  // All campaigns (for Resumen + Perfit/Google subtables)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campLoading, setCampLoading] = useState(true)

  // Meta full data
  const [metaData, setMetaData] = useState<MetaFullData | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [metaLoaded, setMetaLoaded] = useState(false)

  // Perfit mock totals
  const [perfitData, setPerfitData] = useState<PerfitData | null>(null)
  const [perfitLoading, setPerfitLoading] = useState(false)
  const [perfitLoaded, setPerfitLoaded] = useState(false)

  // Google mock totals
  const [googleData, setGoogleData] = useState<GoogleData | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleLoaded, setGoogleLoaded] = useState(false)

  // Kommo full data
  const [kommoData, setKommoData] = useState<KommoFullData | null>(null)
  const [kommoLoading, setKommoLoading] = useState(false)
  const [kommoLoaded, setKommoLoaded] = useState(false)

  // Tiendanube full data
  const [tiendanubeData, setTiendanubeData] = useState<TiendanubeFullData | null>(null)
  const [tiendanubeLoading, setTiendanubeLoading] = useState(false)
  const [tiendanubeLoaded, setTiendanubeLoaded] = useState(false)

  // Initial load: all campaigns for Resumen
  const fetchCampaigns = useCallback(async () => {
    setCampLoading(true)
    try {
      const res = await fetch('/api/campaigns')
      if (res.ok) {
        const d = await res.json()
        setCampaigns(d.campaigns ?? [])
      }
    } catch (e) {
      console.error('Error fetching campaigns:', e)
    } finally {
      setCampLoading(false)
    }
  }, [])

  useEffect(() => { fetchCampaigns() }, [fetchCampaigns])

  // Lazy-load per tab
  useEffect(() => {
    if (activeTab === 'meta' && !metaLoaded) {
      setMetaLoading(true)
      fetch('/api/marketing/meta-full')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setMetaData(d) })
        .catch(console.error)
        .finally(() => { setMetaLoading(false); setMetaLoaded(true) })
    }
    if (activeTab === 'perfit' && !perfitLoaded) {
      setPerfitLoading(true)
      fetch('/api/marketing/perfit')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setPerfitData(d) })
        .catch(console.error)
        .finally(() => { setPerfitLoading(false); setPerfitLoaded(true) })
    }
    if (activeTab === 'google' && !googleLoaded) {
      setGoogleLoading(true)
      fetch('/api/marketing/google')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setGoogleData(d) })
        .catch(console.error)
        .finally(() => { setGoogleLoading(false); setGoogleLoaded(true) })
    }
    if (activeTab === 'kommo' && !kommoLoaded) {
      setKommoLoading(true)
      fetch('/api/marketing/kommo-full')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setKommoData(d) })
        .catch(console.error)
        .finally(() => { setKommoLoading(false); setKommoLoaded(true) })
    }
    if (activeTab === 'tiendanube' && !tiendanubeLoaded) {
      setTiendanubeLoading(true)
      fetch('/api/marketing/tiendanube-full')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setTiendanubeData(d) })
        .catch(console.error)
        .finally(() => { setTiendanubeLoading(false); setTiendanubeLoaded(true) })
    }
  }, [activeTab, metaLoaded, perfitLoaded, googleLoaded, kommoLoaded, tiendanubeLoaded])

  const perfitCampaigns = useMemo(() => campaigns.filter(c => c.channelKey === 'perfit'), [campaigns])
  const googleCampaigns = useMemo(() => campaigns.filter(c => c.channelKey === 'google'), [campaigns])

  const handleRefresh = () => {
    fetchCampaigns()
    // Reset loaded state for active tab
    if (activeTab === 'meta') { setMetaLoaded(false); setMetaData(null) }
    if (activeTab === 'perfit') { setPerfitLoaded(false); setPerfitData(null) }
    if (activeTab === 'google') { setGoogleLoaded(false); setGoogleData(null) }
    if (activeTab === 'kommo') { setKommoLoaded(false); setKommoData(null) }
    if (activeTab === 'tiendanube') { setTiendanubeLoaded(false); setTiendanubeData(null) }
  }

  const isLoading = activeTab === 'resumen' ? campLoading
    : activeTab === 'meta' ? metaLoading
    : activeTab === 'perfit' ? (campLoading || perfitLoading)
    : activeTab === 'google' ? (campLoading || googleLoading)
    : activeTab === 'kommo' ? kommoLoading
    : activeTab === 'tiendanube' ? tiendanubeLoading
    : false

  return (
    <div className="p-6 space-y-5 fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-100 tracking-tight">Marketing &amp; Campañas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Meta Ads · Perfit · Google Ads · Kommo CRM · Tiendanube</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="text-xs px-3 py-1.5 rounded-lg border border-[rgba(0,166,81,0.2)] text-gray-500 hover:text-gray-200 hover:border-[rgba(0,166,81,0.4)] transition-all disabled:opacity-50"
        >
          {isLoading ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      <div className="flex gap-1 border-b border-[rgba(0,166,81,0.1)] overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`text-sm px-5 py-2.5 rounded-t-lg border border-b-0 transition-all font-medium whitespace-nowrap ${
              activeTab === t.key
                ? 'bg-[#0c1a0d] border-[rgba(0,166,81,0.3)] text-[#00A651]'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'resumen' && (
          <ResumenTab allCampaigns={campaigns} loading={campLoading} />
        )}
        {activeTab === 'meta' && (
          <MetaTab data={metaData} loading={metaLoading} />
        )}
        {activeTab === 'perfit' && (
          <PerfitTab campaigns={perfitCampaigns} perfitData={perfitData} loading={campLoading || perfitLoading} />
        )}
        {activeTab === 'google' && (
          <GoogleTab campaigns={googleCampaigns} googleData={googleData} loading={campLoading || googleLoading} />
        )}
        {activeTab === 'kommo' && (
          <KommoTab data={kommoData} loading={kommoLoading} />
        )}
        {activeTab === 'tiendanube' && (
          <TiendanubeTab data={tiendanubeData} loading={tiendanubeLoading} />
        )}
      </div>
    </div>
  )
}
