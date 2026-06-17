'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { format, subDays } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { fmtNum } from '@/lib/utils'
import type { ShipmentResult, SearchType } from '@/app/api/logistics/shipments/route'

// ── Palettes ──────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#00A651','#3b82f6','#f59e0b','#ec4899','#ef4444','#8b5cf6','#f97316','#06b6d4']

const ESTADO_DOT: Record<string, string> = {
  entregado:  '#00A651',
  en_transito:'#3b82f6',
  devolucion: '#f97316',
  cancelado:  '#ef4444',
  pendiente:  '#64748b',
  demorado:   '#f59e0b',
}

const TYPE_CHIP: Record<SearchType, string> = {
  guia:   'text-blue-400 bg-blue-900/30 border-blue-800/40',
  remito: 'text-purple-400 bg-purple-900/30 border-purple-800/40',
  dni:    'text-amber-400 bg-amber-900/30 border-amber-800/40',
  tn:     'text-sky-400 bg-sky-900/30 border-sky-800/40',
  vtex:   'text-red-400 bg-red-900/30 border-red-800/40',
  ml:     'text-yellow-400 bg-yellow-900/30 border-yellow-800/40',
}

const TYPE_ICON: Record<SearchType, string> = {
  guia: '📦', remito: '🧾', dni: '🪪', tn: '🛍️', vtex: '🔴', ml: '🟡',
}

// Placeholder de texto para el input de búsqueda
const SEARCH_PLACEHOLDER = 'Ej: 455164805 (tracking) · 31533900 (VTEX) · 20123456789 (CUIT) · MLB123'

function isEntregado(estado: string) {
  const e = estado.toLowerCase()
  return e.includes('entregad') || e.includes('efectiva')
}

function getEstadoColor(estado: string): string {
  const e = estado.toLowerCase()
  if (e.includes('entregad') || e.includes('efectiva')) return '#00A651'
  if (e.includes('transit')) return '#3b82f6'
  if (e.includes('cancelac') || e.includes('cancelad')) return '#ef4444'
  if (e.includes('devoluci') || e.includes('devuelt')) return '#f97316'
  if (e.includes('picking') || e.includes('programac')) return '#f59e0b'
  return '#9ca3af'
}

// ── Detect type from input ────────────────────────────────────────────────────

// Misma lógica que shipments/route.ts detectType (mantener sincronizadas)
function detectType(q: string): { type: SearchType; label: string } | null {
  const t = q.trim()
  if (t.length < 3) return null
  if (/^20000\d+$/.test(t))        return { type: 'ml',   label: 'Pedido MercadoLibre' }
  if (/^\d{8,}-\d{1,4}$/.test(t)) return { type: 'vtex', label: 'Pedido VTEX' }
  // DNI: exactamente 8 dígitos (PAAQ lo interpreta como DNI/CUIT)
  if (/^\d{8}$/.test(t))          return { type: 'dni',  label: 'DNI' }
  // PAAQ tracking: 9 o más dígitos
  if (/^\d+$/.test(t))            return { type: 'guia', label: 'Nro de Seguimiento' }
  return { type: 'remito', label: 'Nro de Venta' }
}

// ── Reusable Components ───────────────────────────────────────────────────────

function KPICard({ title, value, sub, color = '#00A651', loading = false }: {
  title: string; value: string | number; sub?: string; color?: string; loading?: boolean
}) {
  return (
    <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
      <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">{title}</div>
      {loading
        ? <div className="h-8 bg-[#1a2e1b] rounded animate-pulse" />
        : <div style={{ color }} className="text-3xl font-bold font-mono">{value}</div>}
      {sub && <div className="text-xs text-gray-600 mt-1">{sub}</div>}
    </div>
  )
}

function ChartTip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.25)] rounded-lg px-3 py-2 text-xs shadow-xl">
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color || '#00A651' }} className="font-mono font-semibold">
          {fmtNum(p.value)}
        </div>
      ))}
    </div>
  )
}

function Spinner({ size = 4 }: { size?: number }) {
  return (
    <svg className={`animate-spin h-${size} w-${size}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ── Tracking Timeline ─────────────────────────────────────────────────────────

function TrackingTimeline({ eventos }: { eventos: any[] }) {
  // Ordenar cronológicamente (el más viejo primero)
  const sorted = [...eventos].sort((a, b) => {
    const da = a.receptor_fecha_hora ?? a.fecha ?? ''
    const db = b.receptor_fecha_hora ?? b.fecha ?? ''
    return da.localeCompare(db)
  })

  return (
    <div className="space-y-0 mt-3">
      {sorted.map((ev, i) => {
        const isLast = i === sorted.length - 1
        const color = getEstadoColor(ev.estado ?? '')

        // Soporta formato nuevo (receptor_fecha_hora) y legacy (fecha + hora)
        const fechaHora = ev.receptor_fecha_hora
          ? ev.receptor_fecha_hora.replace('T', ' ')
          : [ev.fecha, ev.hora].filter(Boolean).join(' · ')
        const receptor = ev.receptor_nombre?.trim() || ev.receptor || null
        const detalles = ev.detalles || null
        const codigo = ev.estado_codigo || null

        return (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full mt-0.5 flex-shrink-0" style={{ backgroundColor: isLast ? color : '#374151' }} />
              {!isLast && <div className="w-px flex-1 mt-1 bg-[rgba(0,166,81,0.12)]" />}
            </div>
            <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
              <div className="flex items-center gap-2 flex-wrap">
                {codigo && (
                  <span className="text-[10px] font-mono text-gray-600 bg-gray-800 px-1.5 rounded">
                    {codigo}
                  </span>
                )}
                <span className="text-xs font-semibold" style={{ color }}>
                  {ev.estado}
                </span>
                {isLast && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#00A651]/10 text-[#00A651] border border-[#00A651]/20 font-semibold">
                    Estado actual
                  </span>
                )}
              </div>
              {detalles && (
                <div className="text-xs text-gray-500 mt-0.5">{detalles}</div>
              )}
              <div className="text-xs text-gray-600 mt-0.5 flex items-center gap-2">
                {fechaHora && <span>{fechaHora}</span>}
                {receptor && receptor.trim() && (
                  <span className="text-gray-400">· Recibió: <span className="font-medium">{receptor}</span></span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Shipment Card ─────────────────────────────────────────────────────────────

function ConstanciaButton({ nroGuia, guiaAgente }: { nroGuia: string; guiaAgente?: string | null }) {
  const [loading, setLoading] = useState(false)

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!guiaAgente || loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/logistics/constancia?guiaAgente=${encodeURIComponent(guiaAgente)}`)
      if (res.ok) {
        // PDF descargado: abrir en nueva pestaña via blob URL
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank')
        setTimeout(() => URL.revokeObjectURL(url), 30000)
      } else {
        // Fallback: abrir URL directamente (usuario deberá loguearse)
        const data = await res.json().catch(() => ({}))
        const fallbackUrl = data.url ?? `https://epresis.seguimientodeenvios.ar/guias/remito/imprimir-guia?url=constancia_electronica&guia_id=${encodeURIComponent(guiaAgente)}`
        window.open(fallbackUrl, '_blank')
      }
    } catch {
      window.open(`https://epresis.seguimientodeenvios.ar/guias/remito/imprimir-guia?url=constancia_electronica&guia_id=${encodeURIComponent(guiaAgente)}`, '_blank')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#00A651]/10 border border-[#00A651]/30 text-[#00A651] hover:bg-[#00A651]/20 transition-all font-semibold disabled:opacity-50"
    >
      {loading
        ? <Spinner size={3} />
        : <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
      }
      Constancia Electrónica
    </button>
  )
}

function ShipmentCard({ s }: { s: ShipmentResult }) {
  const [expanded, setExpanded] = useState(false)
  const color = getEstadoColor(s.estado)
  const eventos: any[] = Array.isArray(s.eventos) ? s.eventos : []
  const entregado = isEntregado(s.estado)

  return (
    <div className="bg-[#071409] border border-[rgba(0,166,81,0.12)] rounded-xl overflow-hidden">
      <div
        className="p-4 flex items-start justify-between gap-3 cursor-pointer hover:bg-[rgba(0,166,81,0.03)] transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            {s.nroGuia && (
              <span className="font-mono text-sm font-bold text-gray-100">#{s.nroGuia}</span>
            )}
            {s.guiaAgente && s.guiaAgente !== s.nroGuia && (
              <span className="text-xs text-gray-500 font-mono">Agente: {s.guiaAgente}</span>
            )}
            {s.remito && !s.nroGuia && (
              <span className="font-mono text-sm font-bold text-gray-100">Remito {s.remito}</span>
            )}
            {s.source === 'epresis' && (
              <span className="text-[10px] text-gray-600 italic bg-gray-800/50 px-1.5 py-0.5 rounded">
                Epresis · tiempo real
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-xs font-bold px-2.5 py-0.5 rounded-full"
              style={{ color, backgroundColor: `${color}18` }}
            >
              {s.estado}
            </span>
            {s.servicio && <span className="text-xs text-gray-500">{s.servicio}</span>}
            {entregado && s.fechaEntrega && (
              <span className="text-xs text-gray-500">
                Entregado {new Date(s.fechaEntrega).toLocaleDateString('es-AR')}
              </span>
            )}
          </div>

          {s.destinatario && (
            <div className="text-xs text-gray-400">
              {s.destinatario}
              {s.localidad && ` · ${s.localidad}`}
              {s.provincia && `, ${s.provincia}`}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {s.remito && s.nroGuia && (
              <span className="text-xs text-gray-500 font-mono">Venta: {s.remito}</span>
            )}
            {s.tiendanubeOrderId && <span className="text-xs text-sky-400/80 bg-sky-900/20 px-2 py-0.5 rounded">TN #{s.tiendanubeOrderId}</span>}
            {s.vtexOrderId       && <span className="text-xs text-red-400/80 bg-red-900/20 px-2 py-0.5 rounded">VTEX {s.vtexOrderId}</span>}
            {s.mlOrderId         && <span className="text-xs text-yellow-400/80 bg-yellow-900/20 px-2 py-0.5 rounded">ML {s.mlOrderId}</span>}
          </div>
        </div>

        <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
          {s.fechaCreacion && (
            <div className="text-xs text-gray-500">
              {new Date(s.fechaCreacion).toLocaleDateString('es-AR')}
            </div>
          )}
          {eventos.length > 0 && (
            <span className="text-xs text-gray-600">{eventos.length} eventos {expanded ? '▲' : '▼'}</span>
          )}
        </div>
      </div>

      {/* Constancia electrónica — visible siempre en envíos entregados */}
      {s.guiaAgente && (
        <div className="px-4 pb-3 -mt-1" onClick={e => e.stopPropagation()}>
          <ConstanciaButton nroGuia={s.nroGuia ?? s.guiaAgente} guiaAgente={s.guiaAgente} />
        </div>
      )}

      {expanded && eventos.length > 0 && (
        <div className="border-t border-[rgba(0,166,81,0.08)] px-4 py-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Historial de movimientos ({eventos.length})
          </div>
          <TrackingTimeline eventos={eventos} />
        </div>
      )}
    </div>
  )
}

// ── Search Tab ────────────────────────────────────────────────────────────────

function SearchTab() {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<ShipmentResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [searchLabel, setSearchLabel] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const detected = useMemo(() => detectType(query), [query])

  const doSearch = useCallback(async (q: string) => {
    setSearching(true)
    setResults([])
    setError(null)
    setSearched(false)
    try {
      const res = await fetch(`/api/logistics/shipments?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al buscar')
      } else {
        setResults(data.results || [])
        setSearchLabel(data.searchLabel || '')
        setSearched(true)
      }
    } catch {
      setError('Error de red')
    } finally {
      setSearching(false)
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim().length >= 3) doSearch(query.trim())
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-gray-500">
          Buscá por Nro de Envío (guía), DNI, Nro de Venta (remito), o número de pedido de TiendaNube, VTEX o MercadoLibre. El sistema detecta el tipo automáticamente y busca primero en la base de datos local, luego en Epresis en tiempo real.
        </p>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSearched(false) }}
            placeholder={SEARCH_PLACEHOLDER}
            className="w-full px-4 py-2.5 pr-9 text-sm rounded-lg bg-[#071409] border border-[rgba(0,166,81,0.2)] text-gray-200 outline-none focus:border-[#00A651] transition-colors placeholder:text-gray-600"
            autoComplete="off"
          />
          {query && (
            <button type="button" onClick={() => { setQuery(''); setResults([]); setError(null); setSearched(false); inputRef.current?.focus() }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-lg leading-none">
              ×
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={!detected || searching}
          className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#00A651] text-white hover:bg-[#00b85b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {searching ? <><Spinner size={4} /> Buscando…</> : <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Buscar
          </>}
        </button>
      </form>

      {/* Detected type */}
      {detected && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Tipo detectado:</span>
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${TYPE_CHIP[detected.type]}`}>
            {TYPE_ICON[detected.type]} {detected.label}
          </span>
        </div>
      )}

      {/* Searching state */}
      {searching && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-[#071409] border border-[rgba(0,166,81,0.1)]">
          <Spinner size={5} />
          <div>
            <div className="text-sm text-gray-300 font-medium">Consultando base de datos y Epresis…</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Buscando <span className="font-mono text-gray-400">"{query}"</span> como {detected?.label}
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !searching && (
        <div className="p-4 rounded-lg bg-red-900/20 border border-red-800/40 text-sm text-red-400">{error}</div>
      )}

      {/* Results */}
      {!searching && searched && (
        results.length === 0 ? (
          <div className="p-4 rounded-lg bg-amber-900/20 border border-amber-800/40 text-sm text-amber-400">
            No se encontró ningún envío con <span className="font-mono font-semibold">"{query}"</span> como {searchLabel}.
            <div className="text-xs mt-1 text-amber-600">Verificá el número o probá con otro tipo de identificador.</div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-gray-500">{results.length} resultado{results.length !== 1 ? 's' : ''} para <span className="font-mono text-gray-400">"{query}"</span> como {searchLabel}</div>
            {results.map(s => <ShipmentCard key={s.id} s={s} />)}
          </div>
        )
      )}
    </div>
  )
}

// ── Metrics Tab ───────────────────────────────────────────────────────────────

function MetricsTab() {
  const [from, setFrom] = useState(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [to,   setTo]   = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [servicio, setServicio] = useState('')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; msg: string } | null>(null)

  const load = useCallback(async (f: string, t: string, srv: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ from: f, to: t })
      if (srv) params.set('servicio', srv)
      const res = await fetch(`/api/logistics/metrics?${params}`)
      if (res.ok) setData(await res.json())
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(from, to, servicio) }, [from, to, servicio, load])

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/logistics/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })
      const d = await res.json()
      if (d.noEndpoint) {
        setSyncMsg({ ok: false, msg: 'Epresis no expone un endpoint de listado por fechas. Usá el CSV o registrá el Webhook para sincronización automática.' })
      } else if (!res.ok) {
        setSyncMsg({ ok: false, msg: d.error ?? 'Error al sincronizar' })
      } else {
        setSyncMsg({ ok: true, msg: `Sincronizados ${d.synced} de ${d.total} envíos desde Epresis.` })
        load(from, to, servicio)
      }
    } catch {
      setSyncMsg({ ok: false, msg: 'Error de red' })
    } finally {
      setSyncing(false)
    }
  }

  const noData = !data?.hasData

  return (
    <div className="space-y-6">
      {/* Filters + Sync */}
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-400 uppercase">Desde</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg bg-[#071409] border border-[rgba(0,166,81,0.2)] text-gray-200 outline-none focus:border-[#00A651] transition-colors" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-400 uppercase">Hasta</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg bg-[#071409] border border-[rgba(0,166,81,0.2)] text-gray-200 outline-none focus:border-[#00A651] transition-colors" />
          </div>
          {data?.serviciosDisponibles?.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-400 uppercase">Servicio</label>
              <select value={servicio} onChange={e => setServicio(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg bg-[#071409] border border-[rgba(0,166,81,0.2)] text-gray-200 outline-none focus:border-[#00A651] transition-colors">
                <option value="">Todos</option>
                {data.serviciosDisponibles.map((s: string) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0c1a0d] border border-[rgba(0,166,81,0.25)] text-[#00A651] hover:bg-[rgba(0,166,81,0.08)] disabled:opacity-50 transition-all"
        >
          {syncing ? <><Spinner size={3} /> Sincronizando…</> : <>↺ Sincronizar desde Epresis</>}
        </button>
      </div>

      {syncMsg && (
        <div className={`px-4 py-3 rounded-lg text-xs ${syncMsg.ok ? 'bg-green-900/20 border border-green-800/40 text-green-400' : 'bg-amber-900/20 border border-amber-800/40 text-amber-400'}`}>
          {syncMsg.msg}
        </div>
      )}

      {noData && !loading ? (
        <div className="p-8 rounded-xl bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] text-center space-y-4">
          <div className="text-3xl">📊</div>
          <div>
            <div className="text-sm text-gray-300 font-semibold">Sin envíos en el período seleccionado</div>
            <div className="text-xs text-gray-500 mt-1">Los datos se cargan automáticamente o de forma manual.</div>
          </div>
          <div className="flex items-center justify-center gap-3 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <span className="text-[#00A651]">●</span>
              <span>Webhook activo → sync automático al cambiar estado</span>
            </div>
            <span>·</span>
            <div className="flex items-center gap-1.5">
              <span className="text-blue-400">●</span>
              <span>Botón "Sincronizar" → fetch de Epresis para el período</span>
            </div>
            <span>·</span>
            <div className="flex items-center gap-1.5">
              <span className="text-amber-400">●</span>
              <span>CSV → importación histórica desde la pestaña Importar</span>
            </div>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="mx-auto flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-lg bg-[#00A651]/10 border border-[#00A651]/30 text-[#00A651] hover:bg-[#00A651]/20 disabled:opacity-50 transition-all"
          >
            {syncing ? <><Spinner size={3} /> Sincronizando…</> : <>↺ Sincronizar desde Epresis ({from} → {to})</>}
          </button>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard title="Total Envíos" value={data?.total ?? 0} loading={loading} />
            <KPICard title="Entregados" value={data?.entregados ?? 0} color="#00A651" loading={loading}
              sub={data?.tasaEntrega != null ? `${data.tasaEntrega}% tasa de entrega` : undefined} />
            <KPICard title="En Tránsito" value={data?.enTransito ?? 0} color="#3b82f6" loading={loading} />
            <KPICard title="Demorados" value={data?.demorados ?? 0} color="#f59e0b" loading={loading} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard title="Devoluciones" value={data?.devoluciones ?? 0} color="#f97316" loading={loading} />
            <KPICard title="Cancelados" value={data?.cancelados ?? 0} color="#ef4444" loading={loading} />
            <KPICard title="Días prom. entrega" value={data?.promedioDiasEntrega ?? '—'} color="#8b5cf6" loading={loading} />
          </div>

          {/* Tasa entrega big indicator */}
          {!loading && data?.tasaEntrega != null && (
            <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5 flex items-center gap-5">
              <div className="relative w-20 h-20 flex-shrink-0">
                <svg className="w-20 h-20 -rotate-90">
                  <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(0,166,81,0.15)" strokeWidth="8" />
                  <circle cx="40" cy="40" r="32" fill="none" stroke="#00A651" strokeWidth="8"
                    strokeDasharray={`${2 * Math.PI * 32 * data.tasaEntrega / 100} 999`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-[#00A651]">
                  {data.tasaEntrega}%
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-200">Tasa de entrega efectiva</div>
                <div className="text-xs text-gray-500 mt-0.5">{data.entregados} de {data.total} envíos entregados en el período</div>
                {data.promedioDiasEntrega && (
                  <div className="text-xs text-purple-400 mt-1">Promedio {data.promedioDiasEntrega} días hasta entrega</div>
                )}
              </div>
            </div>
          )}

          {/* Charts grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Por estado */}
            <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Distribución por Estado</div>
              {loading ? <div className="h-48 bg-[#1a2e1b] rounded animate-pulse" /> : (
                data?.byEstado?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={data.byEstado} dataKey="cantidad" nameKey="estado" cx="50%" cy="50%" outerRadius={75}
                        label={({ estado, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {data.byEstado.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<ChartTip />} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div className="h-48 flex items-center justify-center text-gray-600 text-xs">Sin datos</div>
              )}
            </div>

            {/* Por servicio */}
            <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Envíos por Servicio</div>
              {loading ? <div className="h-48 bg-[#1a2e1b] rounded animate-pulse" /> : (
                data?.byServicio?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.byServicio} layout="vertical" margin={{ top: 0, right: 20, left: 160 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,166,81,0.1)" />
                      <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <YAxis dataKey="servicio" type="category" stroke="#9ca3af" width={155} tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="cantidad" fill="#3b82f6" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="h-48 flex items-center justify-center text-gray-600 text-xs">Sin datos</div>
              )}
            </div>

            {/* Por provincia */}
            {data?.byProvincia?.length > 0 && (
              <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5 lg:col-span-2">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Top Provincias de Destino</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.byProvincia.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 20, left: 130 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,166,81,0.1)" />
                    <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="provincia" type="category" stroke="#9ca3af" width={125} tick={{ fontSize: 10 }} />
                    <Tooltip content={<ChartTip />} />
                    <Bar dataKey="cantidad" fill="#00A651" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Import Tab ────────────────────────────────────────────────────────────────

function ImportTab() {
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [registering, setRegistering] = useState(false)
  const [regResult, setRegResult] = useState<any>(null)

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setImporting(true)
    setResult(null)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/logistics/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Error al importar')
      else setResult(data)
    } catch {
      setError('Error de red al importar')
    } finally {
      setImporting(false)
    }
  }

  const handleRegisterWebhook = async () => {
    setRegistering(true)
    setRegResult(null)
    try {
      const res = await fetch('/api/logistics/register-webhook', { method: 'POST' })
      const data = await res.json()
      setRegResult(data)
    } catch {
      setRegResult({ error: 'Error de red' })
    } finally {
      setRegistering(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* Webhook auto-sync */}
      <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Sincronización automática (Webhook)</h3>
          <p className="text-xs text-gray-500 mt-1">
            Registrá un webhook en Epresis para que NexusOps reciba actualizaciones de estado en tiempo real cada vez que PAAQ mueva un envío. Solo necesitás hacerlo una vez.
          </p>
        </div>
        <button
          onClick={handleRegisterWebhook}
          disabled={registering}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#00A651] text-white hover:bg-[#00b85b] disabled:opacity-40 transition-colors flex items-center gap-2"
        >
          {registering ? <><Spinner size={4} /> Registrando…</> : '🔗 Registrar webhook en Epresis'}
        </button>
        {regResult && (
          regResult.ok ? (
            <div className="p-3 rounded-lg bg-green-900/20 border border-green-800/40 text-xs text-green-400">
              ✓ Webhook registrado en Epresis. NexusOps recibirá notificaciones automáticas de estado.
              <div className="mt-1 font-mono text-green-600">{regResult.webhookUrl}</div>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-red-900/20 border border-red-800/40 text-xs text-red-400">
              {regResult.error}
            </div>
          )
        )}
      </div>

      {/* CSV import */}
      <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Importar histórico desde CSV</h3>
          <p className="text-xs text-gray-500 mt-1">
            Exportá el listado de guías desde el panel de PAAQ y subilo acá. El sistema detecta automáticamente las columnas. Los registros duplicados se actualizan.
          </p>
        </div>

        {/* Column guide */}
        <div className="text-xs text-gray-500 space-y-1">
          <div className="font-semibold text-gray-400">Columnas soportadas:</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
            <span><span className="text-[#00A651]">nro_guia</span> · guia · nroguia</span>
            <span><span className="text-[#00A651]">remito</span> · nro venta · pedido</span>
            <span><span className="text-[#00A651]">estado</span> · status</span>
            <span><span className="text-[#00A651]">servicio</span> · tipo servicio</span>
            <span><span className="text-[#00A651]">destinatario</span> · nombre · cliente</span>
            <span><span className="text-[#00A651]">dni</span> · cuit · documento</span>
            <span><span className="text-[#00A651]">fecha_creacion</span> · fecha</span>
            <span><span className="text-[#00A651]">fecha_entrega</span></span>
            <span><span className="text-sky-400">tiendanube</span> · tn_order</span>
            <span><span className="text-red-400">vtex</span> · vtex_order</span>
            <span><span className="text-yellow-400">mercadolibre</span> · ml_order</span>
            <span>localidad · provincia · cp</span>
          </div>
        </div>

        <form onSubmit={handleImport} className="space-y-3">
          <div>
            <label className="flex flex-col gap-2 cursor-pointer">
              <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${file ? 'border-[#00A651] bg-[#00A651]/5' : 'border-[rgba(0,166,81,0.2)] hover:border-[rgba(0,166,81,0.4)]'}`}>
                {file ? (
                  <div className="space-y-1">
                    <div className="text-2xl">📄</div>
                    <div className="text-sm text-gray-200 font-medium">{file.name}</div>
                    <div className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="text-2xl">📁</div>
                    <div className="text-sm text-gray-400">Arrastrá o hacé clic para seleccionar el CSV</div>
                    <div className="text-xs text-gray-600">Formatos: .csv (UTF-8 o con BOM)</div>
                  </div>
                )}
              </div>
              <input type="file" accept=".csv,text/csv" onChange={e => setFile(e.target.files?.[0] ?? null)} className="hidden" />
            </label>
          </div>
          <button type="submit" disabled={!file || importing}
            className="w-full py-2.5 text-sm font-semibold rounded-lg bg-[#00A651] text-white hover:bg-[#00b85b] disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
            {importing ? <><Spinner size={4} /> Importando…</> : '⬆ Importar guías'}
          </button>
        </form>

        {error && <div className="p-3 rounded-lg bg-red-900/20 border border-red-800/40 text-xs text-red-400">{error}</div>}

        {result && (
          <div className="p-4 rounded-lg bg-green-900/20 border border-green-800/40 text-sm text-green-400 space-y-1">
            <div className="font-semibold">✓ Importación completada</div>
            <div className="text-xs text-green-600 space-y-0.5">
              <div>Filas procesadas: <span className="text-green-400 font-mono">{result.total}</span></div>
              <div>Creadas nuevas: <span className="text-green-400 font-mono">{result.inserted}</span></div>
              <div>Actualizadas: <span className="text-green-400 font-mono">{result.updated}</span></div>
              {result.skipped > 0 && <div>Omitidas (sin ID): <span className="text-gray-400 font-mono">{result.skipped}</span></div>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Coverage Tab ─────────────────────────────────────────────────────────────

function CoverageTab() {
  const [cp, setCp] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ cobertura: boolean | null; localidad?: string | null; provincia?: string | null; error?: string } | null>(null)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = cp.trim()
    if (!/^\d{4}$/.test(val)) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/logistics/coverage?cp=${encodeURIComponent(val)}`)
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ cobertura: null, error: 'No se pudo consultar la cobertura' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <h2 className="text-base font-semibold text-gray-100 mb-1">Cobertura por Código Postal</h2>
        <p className="text-sm text-gray-500">Consultá si un CP tiene cobertura de entrega PAAQ.</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={cp}
          onChange={e => { setCp(e.target.value.replace(/\D/g, '').slice(0, 4)); setResult(null) }}
          placeholder="Ej: 1429"
          maxLength={4}
          className="flex-1 bg-[#0a120b] border border-[rgba(0,166,81,0.25)] rounded-lg px-4 py-2.5
                     text-gray-100 placeholder-gray-600 font-mono text-sm
                     focus:outline-none focus:border-[#00A651] transition-colors"
        />
        <button
          type="submit"
          disabled={cp.length !== 4 || loading}
          className="px-5 py-2.5 bg-[#00A651] hover:bg-[#009347] disabled:opacity-40
                     text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
        >
          {loading ? <Spinner size={4} /> : '🔍'}
          Consultar
        </button>
      </form>

      {result?.error && (
        <div className="bg-red-950/30 border border-red-800/40 rounded-xl p-4 text-sm text-red-300">
          {result.error}
        </div>
      )}

      {result && !result.error && (
        <div className={`rounded-xl px-5 py-4 border flex items-center gap-4 ${
          result.cobertura === true  ? 'bg-[rgba(0,166,81,0.08)] border-[rgba(0,166,81,0.3)]' :
          result.cobertura === false ? 'bg-red-950/20 border-red-800/30' :
          'bg-[#1a1a1a] border-gray-700'
        }`}>
          <span className="text-4xl flex-shrink-0">
            {result.cobertura === true ? '✅' : result.cobertura === false ? '❌' : '❓'}
          </span>
          <div>
            <div className={`text-lg font-bold ${
              result.cobertura === true  ? 'text-[#00A651]' :
              result.cobertura === false ? 'text-red-400' :
              'text-gray-400'
            }`}>
              CP {cp} —{' '}
              {result.cobertura === true  ? 'Tiene cobertura' :
               result.cobertura === false ? 'Sin cobertura' :
               'No se pudo determinar'}
            </div>
            {(result.localidad || result.provincia) && (
              <div className="text-sm text-gray-400 mt-0.5">
                {[result.localidad, result.provincia].filter(Boolean).join(', ')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'buscar' | 'metricas' | 'importar' | 'cobertura'

export default function LogisticaPage() {
  const [tab, setTab] = useState<Tab>('buscar')

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'buscar',    label: 'Buscar Envío', icon: '🔍' },
    { id: 'metricas',  label: 'Métricas',     icon: '📊' },
    { id: 'importar',  label: 'Importar',     icon: '⬆' },
    { id: 'cobertura', label: 'Cobertura CP', icon: '📍' },
  ]

  return (
    <div className="p-6 space-y-6 fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Logística PAAQ</h1>
        <p className="text-sm text-gray-500 mt-0.5">Seguimiento de envíos · Métricas · Sincronización Epresis</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-1.5 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${
              tab === t.id
                ? 'bg-[#00A651] text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-6">
        {tab === 'buscar'    && <SearchTab />}
        {tab === 'metricas'  && <MetricsTab />}
        {tab === 'importar'  && <ImportTab />}
        {tab === 'cobertura' && <CoverageTab />}
      </div>
    </div>
  )
}
