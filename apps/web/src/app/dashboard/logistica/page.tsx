'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { format, subDays } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { fmtNum } from '@/lib/utils'
import type { EpresisStats } from '@/lib/integrations/epresis'
import type { SearchResult, SearchType, TrackingEvent } from '@/app/api/logistics/search/route'

// ── Constants ─────────────────────────────────────────────────────────────────

const ESTADO_COLORS: Record<string, string> = {
  'Cancelaciones': '#ef4444',
  'Depósito': '#8b5cf6',
  'Devoluciones': '#f97316',
  'Entrega EFECTIVA': '#00A651',
  'Entrega Impuesto': '#06b6d4',
  'Envío Impuesto': '#3b82f6',
  'Pendiente': '#64748b',
}

const SERVICIO_COLORS: Record<string, string> = {
  'Camioneta Fija': '#00A651',
  'Flex Same Day': '#3b82f6',
  'Butting en Camionceta': '#f59e0b',
  'Same Day Web': '#ec4899',
}

const PIE_COLORS = ['#00A651', '#3b82f6', '#f59e0b', '#ec4899', '#ef4444', '#8b5cf6', '#f97316']

const TYPE_COLORS: Record<SearchType, string> = {
  guia:   'text-blue-400 bg-blue-900/30 border-blue-800/40',
  remito: 'text-purple-400 bg-purple-900/30 border-purple-800/40',
  dni:    'text-amber-400 bg-amber-900/30 border-amber-800/40',
}

const TYPE_ICONS: Record<SearchType, string> = {
  guia:   '📦',
  remito: '🧾',
  dni:    '🪪',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectSearchType(q: string): { type: SearchType; label: string } | null {
  const trimmed = q.trim()
  if (trimmed.length < 3) return null
  const isAllDigits = /^\d+$/.test(trimmed)
  if (isAllDigits && trimmed.length >= 7 && trimmed.length <= 8) return { type: 'dni', label: 'DNI' }
  if (isAllDigits) return { type: 'guia', label: 'Nro de Envío' }
  return { type: 'remito', label: 'Nro de Venta' }
}

function getEstadoColor(estado: string): string {
  const upper = estado.toUpperCase()
  if (upper.includes('ENTREGA') || upper.includes('EFECTIVA')) return '#00A651'
  if (upper.includes('TRANSIT')) return '#3b82f6'
  if (upper.includes('CANCEL')) return '#ef4444'
  if (upper.includes('DEVOL')) return '#f97316'
  if (upper.includes('DEPOSITO') || upper.includes('DEPÓSITO')) return '#8b5cf6'
  if (upper.includes('PENDING') || upper.includes('PICKING') || upper.includes('PROGRAMAC')) return '#f59e0b'
  return '#9ca3af'
}

// ── UI Components ─────────────────────────────────────────────────────────────

function KPICard({
  title, value, subtitle, accentColor = '#00A651', loading = false,
}: {
  title: string; value: number | string; subtitle?: string; accentColor?: string; loading?: boolean
}) {
  return (
    <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
      <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">{title}</div>
      {loading ? (
        <div className="h-8 bg-[#1a2e1b] rounded animate-pulse" />
      ) : (
        <div style={{ color: accentColor }} className="text-3xl font-bold font-mono">
          {fmtNum(Number(value))}
        </div>
      )}
      {subtitle && <div className="text-xs text-gray-600 mt-2">{subtitle}</div>}
    </div>
  )
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.25)] rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-gray-400 mb-1">{payload[0]?.payload?.name || payload[0]?.name}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }} className="font-mono font-semibold">
          {fmtNum(p.value)}
        </div>
      ))}
    </div>
  )
}

function SortableTable<T extends { id?: string | number }>({
  cols, rows, loading, emptyMsg = 'Sin datos',
}: {
  cols: { key: string; label: string; right?: boolean }[]
  rows: T[]; loading: boolean; emptyMsg?: string
}) {
  const [sortKey, setSortKey] = useState(cols[0]?.key ?? '')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((a, b) => {
      const aVal = (a as any)[sortKey]
      const bVal = (b as any)[sortKey]
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      }
      return sortDir === 'asc'
        ? String(aVal).toLowerCase().localeCompare(String(bVal).toLowerCase())
        : String(bVal).toLowerCase().localeCompare(String(aVal).toLowerCase())
    })
  }, [rows, sortKey, sortDir])

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[rgba(0,166,81,0.1)]">
            {cols.map(col => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={`px-4 py-3 text-left font-semibold text-gray-400 text-xs uppercase tracking-wider cursor-pointer hover:text-gray-300 transition-colors ${col.right ? 'text-right' : ''}`}
              >
                <div className="flex items-center gap-1">
                  {col.label}
                  {sortKey === col.key && <span className="text-[#00A651]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-t border-[rgba(0,166,81,0.06)]">
                {cols.map((_, j) => (
                  <td key={j} className="px-4 py-3">
                    <div className="h-3.5 bg-[#1a2e1b] rounded animate-pulse" />
                  </td>
                ))}
              </tr>
            ))
          ) : sorted.length === 0 ? (
            <tr>
              <td colSpan={cols.length} className="px-4 py-8 text-center text-gray-500 text-xs">{emptyMsg}</td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr key={(row as any)?.id || i} className="border-t border-[rgba(0,166,81,0.06)] hover:bg-[rgba(0,166,81,0.03)]">
                {cols.map(col => (
                  <td key={col.key} className={`px-4 py-3 text-gray-300 ${col.right ? 'text-right font-mono' : ''}`}>
                    {col.key === 'name' ? (
                      <span className="font-medium">{(row as any)[col.key]}</span>
                    ) : (
                      fmtNum((row as any)[col.key] ?? 0)
                    )}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Search Section ────────────────────────────────────────────────────────────

function TrackingTimeline({ eventos }: { eventos: TrackingEvent[] }) {
  const last = eventos[eventos.length - 1]
  return (
    <div className="space-y-0">
      {eventos.map((ev, i) => {
        const isLast = i === eventos.length - 1
        const color = getEstadoColor(ev.estado)
        return (
          <div key={i} className="flex gap-3">
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div
                className="w-3 h-3 rounded-full mt-0.5 flex-shrink-0 ring-2 ring-offset-2 ring-offset-[#0c1a0d]"
                style={{ backgroundColor: color, ringColor: color }}
              />
              {!isLast && <div className="w-px flex-1 mt-1" style={{ backgroundColor: 'rgba(0,166,81,0.15)' }} />}
            </div>
            {/* Event info */}
            <div className={`pb-4 flex-1 ${isLast ? 'pb-0' : ''}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ color, backgroundColor: `${color}20` }}
                >
                  {ev.estado}
                </span>
                {isLast && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#00A651]/10 text-[#00A651] border border-[#00A651]/20 font-semibold">
                    Estado actual
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {ev.fecha} {ev.hora && `· ${ev.hora}`}
                {ev.receptor && <span className="ml-2 text-gray-400">Recibió: {ev.receptor}</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ShipmentSearch() {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const detected = useMemo(() => detectSearchType(query), [query])

  const doSearch = useCallback(async (q: string) => {
    setSearching(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch(`/api/logistics/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al buscar')
      } else {
        setResult(data as SearchResult)
      }
    } catch {
      setError('Error de red al buscar el envío')
    } finally {
      setSearching(false)
    }
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim().length >= 3) doSearch(query.trim())
  }

  const handleClear = () => {
    setQuery('')
    setResult(null)
    setError(null)
    inputRef.current?.focus()
  }

  return (
    <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-6 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-200">Rastrear Envío</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Buscá por DNI del destinatario, Nro de Venta (remito) o Nro de Envío (guía). El sistema detecta el tipo automáticamente.
        </p>
      </div>

      {/* Search input */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ej: 12345678 · A14785 · 258474"
            className="w-full px-4 py-2.5 pr-10 text-sm rounded-lg bg-[#071409] border border-[rgba(0,166,81,0.2)] text-gray-200 outline-none focus:border-[#00A651] transition-colors placeholder:text-gray-600"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
            >
              ×
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={!detected || searching}
          className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#00A651] text-white hover:bg-[#00b85b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {searching ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Buscando...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Buscar
            </>
          )}
        </button>
      </form>

      {/* Detected type chip */}
      {detected && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Tipo detectado:</span>
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${TYPE_COLORS[detected.type]}`}>
            <span>{TYPE_ICONS[detected.type]}</span>
            {detected.label}
          </span>
          {detected.type === 'dni' && (
            <span className="text-xs text-gray-600">· Se buscará como remito asociado al DNI</span>
          )}
        </div>
      )}

      {/* Searching indicator */}
      {searching && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-[#071409] border border-[rgba(0,166,81,0.1)]">
          <svg className="animate-spin h-5 w-5 text-[#00A651]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <div>
            <div className="text-sm text-gray-300 font-medium">Consultando Epresis…</div>
            <div className="text-xs text-gray-500 mt-0.5">Buscando <span className="font-mono text-gray-400">"{query}"</span> como {detected?.label}</div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !searching && (
        <div className="p-4 rounded-lg bg-red-900/20 border border-red-800/40 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Result */}
      {result && !searching && (
        <div className="space-y-4">
          {/* Result header */}
          <div className="flex items-start justify-between gap-3 p-4 rounded-lg bg-[#071409] border border-[rgba(0,166,81,0.12)]">
            <div>
              <div className="text-xs text-gray-500 mb-1">
                Búsqueda por <span className={`font-semibold`}>{result.searchLabel}</span>
              </div>
              <div className="text-base font-mono font-semibold text-gray-200">{result.query}</div>
            </div>
            {result.status === 'ok' && result.eventos?.length ? (
              <div>
                <div className="text-xs text-gray-500 mb-1">Estado actual</div>
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{
                    color: getEstadoColor(result.eventos[result.eventos.length - 1].estado),
                    backgroundColor: `${getEstadoColor(result.eventos[result.eventos.length - 1].estado)}20`,
                  }}
                >
                  {result.eventos[result.eventos.length - 1].estado}
                </span>
              </div>
            ) : null}
          </div>

          {result.status === 'not_found' ? (
            <div className="p-4 rounded-lg bg-amber-900/20 border border-amber-800/40 text-sm text-amber-400">
              No se encontró ningún envío con <span className="font-mono font-semibold">"{result.query}"</span> como {result.searchLabel}.
              <div className="text-xs mt-1 text-amber-600">
                Verificá el número o probá buscarlo con otro tipo (Nro de Envío, Nro de Venta).
              </div>
            </div>
          ) : result.eventos?.length ? (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                Historial de movimientos ({result.eventos.length} eventos)
              </div>
              <TrackingTimeline eventos={result.eventos} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LogisticaPage() {
  const [dateFrom, setDateFrom] = useState(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [stats, setStats] = useState<EpresisStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [isMock, setIsMock] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ from: dateFrom, to: dateTo })
        const res = await fetch(`/api/logistics/stats?${params}`)
        if (res.ok) {
          const data = await res.json()
          setStats(data.stats)
          setIsMock(data.isMock ?? false)
        }
      } catch (error) {
        console.error('Error loading logistics stats:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [dateFrom, dateTo])

  const estadoData = useMemo(() => stats?.estadoCounts ?? [], [stats])
  const servicioData = useMemo(() => stats?.servicioCounts ?? [], [stats])

  const topEstados = useMemo(
    () => [...estadoData].sort((a, b) => b.cantidad - a.cantidad).slice(0, 8),
    [estadoData]
  )
  const topServicios = useMemo(
    () => [...servicioData].sort((a, b) => b.cantidad - a.cantidad).slice(0, 8),
    [servicioData]
  )

  return (
    <div className="p-6 space-y-6 fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Logística</h1>
          <p className="text-sm text-gray-500 mt-0.5">Seguimiento y estadísticas de envíos PAAQ · Epresis</p>
        </div>
        {isMock && (
          <span className="text-xs px-3 py-1.5 rounded-lg bg-amber-900/30 text-amber-400 border border-amber-800/40">
            Datos de ejemplo
          </span>
        )}
      </div>

      {/* ── Smart Search ── */}
      <ShipmentSearch />

      {/* ── Metrics Section ── */}
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h2 className="text-base font-semibold text-gray-200">Métricas generales</h2>
          {/* Date filter */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-400 uppercase">Desde</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg bg-[#071409] border border-[rgba(0,166,81,0.2)] text-gray-200 outline-none focus:border-[#00A651] transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-400 uppercase">Hasta</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg bg-[#071409] border border-[rgba(0,166,81,0.2)] text-gray-200 outline-none focus:border-[#00A651] transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <KPICard
            title="Total de Guías Confirmadas"
            value={stats?.totalGuiasConfirmadas ?? 0}
            accentColor="#00A651"
            loading={loading}
          />
          <KPICard
            title="Total de Guías Pendientes de Confirmación"
            value={stats?.totalGuiasPendientes ?? 0}
            accentColor="#f59e0b"
            loading={loading}
          />
        </div>

        {/* Totales por Estado del Grupo */}
        <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-200">Totales por Estado del Grupo</h2>
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Tabla</div>
            <SortableTable
              cols={[
                { key: 'estado', label: 'Estado' },
                { key: 'cantidad', label: 'Cantidad', right: true },
              ]}
              rows={estadoData.map((e, i) => ({ id: i, ...e }))}
              loading={loading}
              emptyMsg="Sin datos de estado"
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 pt-6 border-t border-[rgba(0,166,81,0.1)]">
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Gráfico de Pastel</div>
              {loading ? (
                <div className="h-64 bg-[#1a2e1b] rounded animate-pulse" />
              ) : estadoData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={estadoData}
                      dataKey="cantidad"
                      nameKey="estado"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ estado, percent }) => `${estado} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {estadoData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={ESTADO_COLORS[entry.estado] || PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500 text-xs">Sin datos</div>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Top Estados</div>
              {loading ? (
                <div className="h-64 bg-[#1a2e1b] rounded animate-pulse" />
              ) : topEstados.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topEstados} layout="vertical" margin={{ top: 5, right: 30, left: 250 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,166,81,0.1)" />
                    <XAxis type="number" stroke="#9ca3af" />
                    <YAxis dataKey="estado" type="category" stroke="#9ca3af" width={240} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="cantidad" fill="#00A651" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500 text-xs">Sin datos</div>
              )}
            </div>
          </div>
        </div>

        {/* Totales por Servicio */}
        <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-200">Totales por Servicio</h2>
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Tabla</div>
            <SortableTable
              cols={[
                { key: 'servicio', label: 'Servicio' },
                { key: 'cantidad', label: 'Cantidad', right: true },
              ]}
              rows={servicioData.map((s, i) => ({ id: i, ...s }))}
              loading={loading}
              emptyMsg="Sin datos de servicio"
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 pt-6 border-t border-[rgba(0,166,81,0.1)]">
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Gráfico de Pastel</div>
              {loading ? (
                <div className="h-64 bg-[#1a2e1b] rounded animate-pulse" />
              ) : servicioData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={servicioData}
                      dataKey="cantidad"
                      nameKey="servicio"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ servicio, percent }) => `${servicio} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {servicioData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={SERVICIO_COLORS[entry.servicio] || PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500 text-xs">Sin datos</div>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Top Servicios</div>
              {loading ? (
                <div className="h-64 bg-[#1a2e1b] rounded animate-pulse" />
              ) : topServicios.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topServicios} layout="vertical" margin={{ top: 5, right: 30, left: 200 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,166,81,0.1)" />
                    <XAxis type="number" stroke="#9ca3af" />
                    <YAxis dataKey="servicio" type="category" stroke="#9ca3af" width={190} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="cantidad" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500 text-xs">Sin datos</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
