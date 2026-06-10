'use client'

import { useState } from 'react'
import { getPeriodRange } from '@/lib/utils'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { type DateRange } from '@/types'

const REPORTS = [
  { id: 'metrics',    label: 'KPIs generales',        desc: 'Revenue, órdenes, ticket promedio por período',        icon: '📊' },
  { id: 'products',   label: 'Top productos',          desc: 'Ranking de productos por unidades y revenue',          icon: '📦' },
  { id: 'orders',     label: 'Detalle de órdenes',    desc: 'Listado completo con estado y canal',                   icon: '🛒' },
  { id: 'channels',   label: 'Performance por canal', desc: 'VTEX, MeLi UA y MeLi Sporta comparados',               icon: '📈' },
  { id: 'marketing',  label: 'Reporte de marketing',  desc: 'Inversión, ROAS y conversiones de Meta y Google Ads',   icon: '📢' },
  { id: 'logistics',  label: 'Reporte logístico',     desc: 'Estados de envíos, demoras y tiempos promedio',         icon: '🚚' },
]

export default function ReportesPage() {
  const [dateRange, setDateRange] = useState<DateRange>(getPeriodRange('last30'))
  const [downloading, setDownloading] = useState<string | null>(null)

  async function downloadReport(reportId: string) {
    setDownloading(reportId)
    try {
      let url = ''
      if (reportId === 'metrics') {
        url = `/api/metrics?date_from=${dateRange.from}&date_to=${dateRange.to}`
      } else if (reportId === 'products') {
        url = `/api/products?date_from=${dateRange.from}&date_to=${dateRange.to}&limit=500`
      } else if (reportId === 'orders') {
        url = `/api/orders?date_from=${dateRange.from}&date_to=${dateRange.to}&limit=1000`
      }

      if (!url) {
        alert('Este reporte aún no está implementado.')
        return
      }

      const res = await fetch(url)
      const data = await res.json()

      // Convert to CSV
      const csvContent = jsonToCSV(data, reportId)
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `nexusops_${reportId}_${dateRange.from}_${dateRange.to}.csv`
      link.click()
    } catch (e) {
      alert('Error al generar el reporte.')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="p-6 space-y-6 fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Reportes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Exportar datos a CSV</p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {REPORTS.map(r => (
          <div
            key={r.id}
            className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5
                       hover:border-[rgba(0,166,81,0.35)] transition-all"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{r.icon}</span>
                <div>
                  <div className="text-sm font-semibold text-gray-200">{r.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{r.desc}</div>
                </div>
              </div>
              <button
                onClick={() => downloadReport(r.id)}
                disabled={downloading === r.id}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-[#00A651] text-white text-xs
                           font-semibold hover:bg-[#007A3D] transition-colors disabled:opacity-50"
              >
                {downloading === r.id ? '…' : '↓ CSV'}
              </button>
            </div>
            <div className="mt-3 text-[10px] font-mono text-gray-600">
              Período: {dateRange.from} → {dateRange.to}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function jsonToCSV(data: any, type: string): string {
  let rows: any[] = []
  if (type === 'products') rows = data.products ?? []
  else if (type === 'orders') rows = data.orders ?? []
  else rows = [data.kpi ?? data]

  if (!rows.length) return 'Sin datos'
  const headers = Object.keys(rows[0])
  return [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = row[h]
        if (typeof val === 'string' && val.includes(',')) return `"${val}"`
        return val ?? ''
      }).join(',')
    ),
  ].join('\n')
}
