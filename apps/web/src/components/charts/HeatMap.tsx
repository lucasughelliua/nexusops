'use client'

import { useMemo } from 'react'
import { type HeatmapCell } from '@/types'

interface HeatMapProps {
  data: HeatmapCell[]
  title?: string
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

export default function HeatMap({ data, title = 'Órdenes por día y hora' }: HeatMapProps) {
  const { grid, maxVal } = useMemo(() => {
    const map: Record<string, number> = {}
    data.forEach(c => { map[`${c.day}-${c.hour}`] = c.value })
    const maxVal = Math.max(...data.map(c => c.value), 1)
    return { grid: map, maxVal }
  }, [data])

  function getCellColor(day: number, hour: number): string {
    const val = grid[`${day}-${hour}`] ?? 0
    if (val === 0) return 'rgba(0,166,81,0.04)'
    const intensity = val / maxVal
    // Green gradient: low→high
    const alpha = 0.12 + intensity * 0.78
    return `rgba(0,166,81,${alpha.toFixed(2)})`
  }

  function getCellTitle(day: number, hour: number): string {
    const val = grid[`${day}-${hour}`] ?? 0
    return `${DAYS[day]} ${String(hour).padStart(2, '0')}h — ${val} orden${val !== 1 ? 'es' : ''}`
  }

  return (
    <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5">
      {title && (
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-gray-200">{title}</span>
          <span className="text-[11px] text-gray-500">más oscuro = más órdenes</span>
        </div>
      )}

      {/* Hour labels */}
      <div className="flex gap-0" style={{ paddingLeft: '36px' }}>
        {HOURS.map(h => (
          <div
            key={h}
            className="text-center text-[9px] text-gray-600 font-mono"
            style={{ flex: 1 }}
          >
            {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="mt-1 space-y-0.5">
        {DAYS.map((day, di) => (
          <div key={di} className="flex items-center gap-0">
            {/* Day label */}
            <div className="text-[10px] text-gray-600 w-9 flex-shrink-0 font-mono">{day}</div>
            {/* Cells */}
            {HOURS.map(h => (
              <div
                key={h}
                className="flex-1 aspect-square rounded-[2px] cursor-pointer
                           transition-transform hover:scale-110 hover:z-10 relative"
                style={{ background: getCellColor(di, h) }}
                title={getCellTitle(di, h)}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3 justify-end">
        <span className="text-[10px] text-gray-600">Menos</span>
        {[0.08, 0.2, 0.4, 0.65, 0.9].map((a, i) => (
          <div
            key={i}
            className="w-3.5 h-3.5 rounded-[2px]"
            style={{ background: `rgba(0,166,81,${a})` }}
          />
        ))}
        <span className="text-[10px] text-gray-600">Más</span>
      </div>
    </div>
  )
}
