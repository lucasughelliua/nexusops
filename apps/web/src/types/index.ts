// ─── Core Data Types ────────────────────────────────────────────────────────

export type Channel = 'all' | 'vtex' | 'meli_1' | 'meli_2'

export interface KPIData {
  revenue: number
  orders: number
  avg_ticket: number
  units: number
  cancellations: number
  conversion_rate: number
  compare?: {
    revenue: number
    orders: number
    avg_ticket: number
  }
}

export interface DailySales {
  date: string
  revenue: number
  orders: number
  channel?: Channel
}

export interface HeatmapCell {
  day: number   // 0=Lun … 6=Dom
  hour: number  // 0-23
  value: number
}

export interface TopProduct {
  id: string
  name: string
  sku: string
  channel: string
  qty: number
  revenue: number
  pct: number
}

export interface ChannelSummary {
  channel: string
  label: string
  revenue: number
  orders: number
  avg_ticket: number
  pct_revenue: number
  pct_orders: number
}

export interface OrderItem {
  id: string
  created_at: string
  channel: string
  status: string
  revenue: number
  items: number
}

// ─── Marketing Types ─────────────────────────────────────────────────────────

export interface MetaAdsTotals {
  spend: number
  impressions: number
  clicks: number
  ctr: number
  conversions: number
  leads: number
  revenue: number
  roas: number
  cpa: number
  cpm: number
}

export interface MetaCampaign {
  id: string
  name: string
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
  spend: number
  impressions: number
  clicks: number
  conversions: number
  roas: number
}

export interface GoogleAdsTotals {
  spend: number
  clicks: number
  impressions: number
  conversions: number
  revenue: number
  roas: number
}

export interface PerfitTotals {
  sent: number
  delivered: number
  opened: number
  clicked: number
  unsubscribed: number
  open_rate: number
  click_rate: number
}

export interface KommoCRM {
  new_leads: number
  open_leads: number
  won_leads: number
  lost_leads: number
  revenue: number
  conversion_rate: number
}

// ─── Logistics Types ──────────────────────────────────────────────────────────

export interface LogisticsSummary {
  dispatched: number
  in_transit: number
  delivered: number
  delayed: number
  pending: number
  avg_days: number
  on_time_rate: number
}

// ─── UI State Types ───────────────────────────────────────────────────────────

export interface DateRange {
  from: string   // YYYY-MM-DD
  to: string     // YYYY-MM-DD
}

export type Period = 'today' | 'yesterday' | 'last7' | 'last30' | 'mtd' | 'lastmonth' | 'ytd' | 'custom'

export interface User {
  id: number
  username: string
  name: string
  role: 'admin' | 'gerente' | 'marketing' | 'ops' | 'viewer'
  color: string
  initials: string
  perms: string[]
}
