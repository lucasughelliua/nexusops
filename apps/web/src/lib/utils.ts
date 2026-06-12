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
  // IMPORTANTE: Devolver fechas en formato YYYY-MM-DD en UTC
  // Estas se convertirán a Date objects con UTC en el backend

  const getDateUTC = (d: Date) => d.toISOString().split('T')[0]

  switch (period) {
    case 'today':
      const today = getDateUTC(now)
      return { from: today, to: today }
    case 'yesterday': {
      const y = getDateUTC(subDays(now, 1))
      return { from: y, to: y }
    }
    case 'last7':
      // Últimos 7 días: desde hace 6 días hasta hoy (7 días totales)
      return { from: getDateUTC(subDays(now, 6)), to: getDateUTC(now) }
    case 'last30':
      // Últimos 30 días: desde hace 29 días hasta hoy (30 días totales)
      return { from: getDateUTC(subDays(now, 29)), to: getDateUTC(now) }
    case 'mtd': {
      const first = getDateUTC(startOfMonth(now))
      return { from: first, to: getDateUTC(now) }
    }
    case 'lastmonth': {
      const prev = subMonths(now, 1)
      return { from: getDateUTC(startOfMonth(prev)), to: getDateUTC(endOfMonth(prev)) }
    }
    case 'ytd':
      return { from: getDateUTC(startOfYear(now)), to: getDateUTC(now) }
    default:
      return { from: getDateUTC(subDays(now, 29)), to: getDateUTC(now) }
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
