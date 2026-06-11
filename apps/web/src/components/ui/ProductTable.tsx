'use client'

import { useState, useMemo } from 'react'
import { fmtARSCompact, fmtNum } from '@/lib/utils'
import { type TopProduct } from '@/types'

interface ProductTableProps {
  products: TopProduct[]
  total: number
  loading?: boolean
  onPageChange?: (offset: number) => void
  pageSize?: number
}

const CHANNEL_PILL: Record<string, string> = {
  'VTEX':        'bg-red-900/30 text-red-400 border border-red-800/40',
  'MeLi UA':     'bg-amber-900/30 text-amber-400 border border-amber-800/40',
  'MeLi Sporta': 'bg-teal-900/30 text-teal-400 border border-teal-800/40',
}

type SortColumn = 'name' | 'qty' | 'revenue' | 'pct'
type SortDirection = 'asc' | 'desc'

export default function ProductTable({
  products,
  total,
  loading = false,
  onPageChange,
  pageSize = 20,
}: ProductTableProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [sortColumn, setSortColumn] = useState<SortColumn>('revenue')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const sortedProducts = useMemo(() => {
    const sorted = [...products]
    sorted.sort((a, b) => {
      let aVal: number | string = 0
      let bVal: number | string = 0

      switch (sortColumn) {
        case 'name':
          aVal = a.name.toLowerCase()
          bVal = b.name.toLowerCase()
          break
        case 'qty':
          aVal = a.qty
          bVal = b.qty
          break
        case 'revenue':
          aVal = a.revenue
          bVal = b.revenue
          break
        case 'pct':
          aVal = a.pct
          bVal = b.pct
          break
      }

      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortDirection === 'asc' ? comparison : -comparison
    })
    return sorted
  }, [products, sortColumn, sortDirection])

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('desc')
    }
  }

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <span className="text-gray-600 text-xs ml-1">↕</span>
    return (
      <span className={`text-[#00A651] text-xs ml-1 ${sortDirection === 'asc' ? '' : 'rotate-180'}`}>
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    )
  }

  function goToPage(page: number) {
    setCurrentPage(page)
    onPageChange?.((page - 1) * pageSize)
  }

  return (
    <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,166,81,0.12)]">
        <div>
          <span className="text-sm font-semibold text-gray-200">Top Productos</span>
          <span className="ml-2 text-xs text-gray-500">{total.toLocaleString('es-AR')} productos totales</span>
        </div>
        <span className="text-xs text-gray-500">
          Última actualización: ahora
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#071409]">
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">#</th>
              <th
                className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 cursor-pointer hover:text-gray-300 transition-colors"
                onClick={() => toggleSort('name')}
              >
                Producto <SortIcon column="name" />
              </th>
              <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Canal</th>
              <th
                className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500 cursor-pointer hover:text-gray-300 transition-colors"
                onClick={() => toggleSort('qty')}
              >
                Unidades <SortIcon column="qty" />
              </th>
              <th
                className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500 cursor-pointer hover:text-gray-300 transition-colors"
                onClick={() => toggleSort('revenue')}
              >
                Revenue <SortIcon column="revenue" />
              </th>
              <th
                className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500 cursor-pointer hover:text-gray-300 transition-colors"
                onClick={() => toggleSort('pct')}
              >
                % Total <SortIcon column="pct" />
              </th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-t border-[rgba(0,166,81,0.06)]">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-3 py-3.5">
                        <div className="h-3.5 bg-[#1a2e1b] rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              : sortedProducts.map((p, i) => (
                  <tr
                    key={p.id}
                    className="border-t border-[rgba(0,166,81,0.06)] hover:bg-[#112011] transition-colors"
                  >
                    <td className="px-5 py-3.5 text-sm font-mono text-gray-500">
                      {(currentPage - 1) * pageSize + i + 1}
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="text-sm text-gray-200 font-medium truncate max-w-[280px]">
                        {p.name}
                      </div>
                      <div className="text-[11px] text-gray-600 font-mono">{p.sku}</div>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${CHANNEL_PILL[p.channel] ?? 'bg-gray-800 text-gray-400'}`}>
                        {p.channel}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-right text-sm font-mono text-gray-300">
                      {fmtNum(p.qty)}
                    </td>
                    <td className="px-3 py-3.5 text-right text-sm font-mono font-semibold text-gray-200">
                      {fmtARSCompact(p.revenue)}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-[#1a2e1b] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(100, p.pct * 5)}%`, background: '#00A651' }}
                          />
                        </div>
                        <span className="text-xs font-mono text-gray-400 w-10 text-right">
                          {p.pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 px-5 py-4 border-t border-[rgba(0,166,81,0.12)]">
          <button
            onClick={() => goToPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-2.5 py-1.5 rounded text-xs text-gray-400 hover:bg-[#1a2e1b] disabled:opacity-30 transition-colors"
          >
            ‹
          </button>
          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
            const page = i + 1
            return (
              <button
                key={page}
                onClick={() => goToPage(page)}
                className={`w-8 h-7 rounded text-xs font-medium transition-colors ${
                  currentPage === page
                    ? 'bg-[#00A651] text-white'
                    : 'text-gray-400 hover:bg-[#1a2e1b]'
                }`}
              >
                {page}
              </button>
            )
          })}
          {totalPages > 7 && <span className="text-gray-600 text-xs">…</span>}
          <button
            onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-2.5 py-1.5 rounded text-xs text-gray-400 hover:bg-[#1a2e1b] disabled:opacity-30 transition-colors"
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
}
