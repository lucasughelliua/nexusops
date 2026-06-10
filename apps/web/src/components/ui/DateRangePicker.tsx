'use client'

import { useState } from 'react'
import { getPeriodRange } from '@/lib/utils'
import { type Period, type DateRange } from '@/types'

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
}

const PRESETS: { label: string; period: Period }[] = [
  { label: 'Hoy',        period: 'today' },
  { label: 'Ayer',       period: 'yesterday' },
  { label: '7D',         period: 'last7' },
  { label: '30D',        period: 'last30' },
  { label: 'MTD',        period: 'mtd' },
  { label: 'Mes ant.',   period: 'lastmonth' },
  { label: 'YTD',        period: 'ytd' },
]

export default function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [activePeriod, setActivePeriod] = useState<Period>('last30')
  const [showCustom, setShowCustom]     = useState(false)
  const [customFrom, setCustomFrom]     = useState(value.from)
  const [customTo, setCustomTo]         = useState(value.to)

  function selectPreset(period: Period) {
    setActivePeriod(period)
    setShowCustom(false)
    onChange(getPeriodRange(period))
  }

  function applyCustom() {
    if (customFrom && customTo) {
      setActivePeriod('custom')
      onChange({ from: customFrom, to: customTo })
      setShowCustom(false)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Preset tabs */}
      <div className="flex gap-0.5 bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-lg p-1">
        {PRESETS.map(p => (
          <button
            key={p.period}
            onClick={() => selectPreset(p.period)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activePeriod === p.period
                ? 'bg-[#00A651] text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a2e1b]'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(v => !v)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            activePeriod === 'custom'
              ? 'bg-[#00A651] text-white'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a2e1b]'
          }`}
        >
          Personalizado
        </button>
      </div>

      {/* Custom date inputs */}
      {showCustom && (
        <div className="flex items-center gap-2 bg-[#0c1a0d] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-1.5">
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            className="bg-transparent text-gray-200 text-xs font-mono outline-none"
          />
          <span className="text-gray-500 text-xs">→</span>
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            className="bg-transparent text-gray-200 text-xs font-mono outline-none"
          />
          <button
            onClick={applyCustom}
            className="ml-1 px-2.5 py-1 bg-[#00A651] text-white text-xs rounded-md font-semibold hover:bg-[#007A3D] transition-colors"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  )
}
