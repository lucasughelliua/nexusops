import { type ClassValue, clsx } from 'clsx'
import { type DateRange, type Period } from '@/types'
import { formatInTimeZone } from 'date-fns-tz'
import { subDays, startOfMonth, startOfYear, subMonths, endOfMonth } from 'date-fns'

// ─── Class names helper ────────────────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

// ─── Currency formatters ───────────────────────────────────────────────────────
export const fmtARS = (n: number) =>
  '$' + Math.round(n).toLocaleString('es-AR')

export const fmtARSCompact = (n: number) => {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'k'
  return fmtARS(n)
}

export const fmtNum = (n?: number | null) => {
  if (n === undefined || n === null || isNaN(n)) return '0'
  return Math.round(n).toLocaleString('es-AR')
}

export const fmtPct = (n?: number | null, decimals = 1) => {
  if (n === undefined || n === null || isNaN(n)) return '0%'
  return n.toFixed(decimals) + '%'
}

export const fmtDelta = (n?: number | null) => {
  if (n === undefined || n === null || isNaN(n)) return '→ 0%'
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'
}

// ─── Date helpers (always Argentina TZ) ───────────────────────────────────────
const TZ = 'America/Argentina/Buenos_Aires'

export function today(): string {
  return formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd')
}

export function isoDate(d: Date): string {
  return formatInTimeZone(d, TZ, 'yyyy-MM-dd')
}

export function getPeriodRange(period: Period): DateRange {
  const now = new Date()
  // IMPORTANTE: Calcular fechas en UTC para consistencia con el backend
  // No usar timezone de Buenos Aires aquí
  const getTodayUTC = () => now.toISOString().split('T')[0]
  const getDateUTC = (d: Date) => d.toISOString().split('T')[0]

  switch (period) {
    case 'today':
      return { from: getTodayUTC(), to: getTodayUTC() }
    case 'yesterday': {
      const y = getDateUTC(subDays(now, 1))
      return { from: y, to: y }
    }
    case 'last7':
      return { from: getDateUTC(subDays(now, 6)), to: getTodayUTC() }
    case 'last30':
      return { from: getDateUTC(subDays(now, 29)), to: getTodayUTC() }
    case 'mtd': {
      const first = getDateUTC(startOfMonth(now))
      return { from: first, to: getTodayUTC() }
    }
    case 'lastmonth': {
      const prev = subMonths(now, 1)
      return { from: getDateUTC(startOfMonth(prev)), to: getDateUTC(endOfMonth(prev)) }
    }
    case 'ytd':
      return { from: getDateUTC(startOfYear(now)), to: getTodayUTC() }
    default:
      return { from: getDateUTC(subDays(now, 29)), to: getTodayUTC() }
  }
}

// ─── Channel label map ─────────────────────────────────────────────────────────
export const CHANNEL_LABELS: Record<string, string> = {
  vtex: 'VTEX',
  meli_1: 'MeLi UA',
  meli_2: 'MeLi Sporta',
  all: 'Todos',
}

export const CHANNEL_COLORS: Record<string, string> = {
  vtex: '#ef4444',
  meli_1: '#f59e0b',
  meli_2: '#14b8a6',
}

// ─── Delta color ───────────────────────────────────────────────────────────────
export function deltaClass(n: number) {
  if (n > 0) return 'text-emerald-400'
  if (n < 0) return 'text-red-400'
  return 'text-gray-400'
}

export function deltaIcon(n: number) {
  if (n > 0) return '↑'
  if (n < 0) return '↓'
  return '→'
}

// ─── API fetch helper ──────────────────────────────────────────────────────────
export async function apiFetch<T>(path: string): Promise<T | null> {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? ''
  const key = process.env.NEXT_PUBLIC_API_KEY ?? ''
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { 'x-api-key': key },
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}
