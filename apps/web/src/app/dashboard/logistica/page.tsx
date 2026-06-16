'use client'

import { useState, useEffect, useMemo } from 'react'
import { format, subDays } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { fmtNum } from '@/lib/utils'
import type { EpresisStats } from '@/lib/integrations/epresis'

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

// ── UI Components ─────────────────────────────────────────────────────────────

function KPICard({
  title,
  value,
  subtitle,
  accentColor = '#00A651',
  loading = false,
}: {
  title: string
  value: number | string
  subtitle?: string
  accentColor?: string
  loading?: boolean
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
  cols,
  rows,
  loading,
  emptyMsg = 'Sin datos',
}: {
  cols: { key: string; label: string; right?: boolean }[]
  rows: T[]
  loading: boolean
  emptyMsg?: string
}) {
  const [sortKey, setSortKey] = useState(cols[0]?.key ?? '')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    const sorted = [...rows].sort((a, b) => {
      const aVal = (a as any)[sortKey]
      const bVal = (b as any)[sortKey]
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      }
      const aStr = String(aVal).toLowerCase()
      const bStr = String(bVal).toLowerCase()
      return sortDir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr)
    })
    return sorted
  }, [rows, sortKey, sortDir])

  const handleSort = (key: string) => {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
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
                className={`px-4 py-3 text-left font-semibold text-gray-400 text-xs uppercase tracking-wider cursor-pointer hover:text-gray-300 transition-colors ${
                  col.right ? 'text-right' : ''
                }`}
              >
                <div className="flex items-center gap-1">
                  {col.label}
                  {sortKey === col.key && (
                    <span className="text-[#00A651]">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
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
              <td colSpan={cols.length} className="px-4 py-8 text-center text-gray-500 text-xs">
                {emptyMsg}
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr key={(row as any)?.id || i} className="border-t border-[rgba(0,166,81,0.06)] hover:bg-[rgba(0,166,81,0.03)]">
                {cols.map(col => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-gray-300 ${col.right ? 'text-right font-mono' : ''}`}
                  >
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

// ── Main Page ─────────────────────────────────────────────────────────────────

interface LogisticaPageState {
  dateFrom: string
  dateTo: string
}

export default function LogisticaPage() {
  const [state, setState] = useState<LogisticaPageState>(() => {
    const to = format(new Date(), 'yyyy-MM-dd')
    const from = format(subDays(new Date(), 30), 'yyyy-MM-dd')
    return { dateFrom: from, dateTo: to }
  })

  const [stats, setStats] = useState<EpresisStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [isMock, setIsMock] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          from: state.dateFrom,
          to: state.dateTo,
        })
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
  }, [state])

  const estadoData = useMemo(() => stats?.estadoCounts ?? [], [stats])
  const servicioData = useMemo(() => stats?.servicioCounts ?? [], [stats])

  // Top estados for bar chart (limit to 8)
  const topEstados = useMemo(
    () => [...estadoData].sort((a, b) => b.cantidad - a.cantidad).slice(0, 8),
    [estadoData]
  )

  // Top servicios for bar chart (limit to 8)
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
          <p className="text-sm text-gray-500 mt-0.5">Seguimiento y estados de envíos desde Epresis</p>
        </div>
        {isMock && (
          <span className="text-xs px-3 py-1.5 rounded-lg bg-amber-900/30 text-amber-400 border border-amber-800/40">
            Datos de ejemplo
          </span>
        )}
      </div>

      {/* Date filter */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-400 uppercase">Desde</label>
          <input
            type="date"
            value={state.dateFrom}
            onChange={e => setState(s => ({ ...s, dateFrom: e.target.value }))}
            className="px-3 py-1.5 text-xs rounded-lg bg-[#071409] border border-[rgba(0,166,81,0.2)] text-gray-200 outline-none focus:border-[#00A651] transition-colors"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-400 uppercase">Hasta</label>
          <input
            type="date"
            value={state.dateTo}
            onChange={e => setState(s => ({ ...s, dateTo: e.target.value }))}
            className="px-3 py-1.5 text-xs rounded-lg bg-[#071409] border border-[rgba(0,166,81,0.2)] text-gray-200 outline-none focus:border-[#00A651] transition-colors"
          />
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

        {/* Table */}
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

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 pt-6 border-t border-[rgba(0,166,81,0.1)]">
          {/* Pie Chart */}
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
                      <Cell
                        key={`cell-${index}`}
                        fill={ESTADO_COLORS[entry.estado] || PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500 text-xs">Sin datos</div>
            )}
          </div>

          {/* Bar Chart */}
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

        {/* Table */}
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

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 pt-6 border-t border-[rgba(0,166,81,0.1)]">
          {/* Pie Chart */}
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
                      <Cell
                        key={`cell-${index}`}
                        fill={SERVICIO_COLORS[entry.servicio] || PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500 text-xs">Sin datos</div>
            )}
          </div>

          {/* Bar Chart */}
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
  )
}
