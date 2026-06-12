'use client'

import { useState } from 'react'
import { fmtARSCompact, fmtNum, fmtPct, deltaIcon, deltaClass } from '@/lib/utils'

interface KPICardProps {
  title: string
  value: number
  delta?: number
  format?: 'currency' | 'number' | 'percent'
  subtitle?: string
  icon?: string
  accentColor?: string
  loading?: boolean
  info?: string // Texto de info que aparece en tooltip
}

export default function KPICard({
  title,
  value,
  delta,
  format = 'currency',
  subtitle,
  icon,
  accentColor = '#00A651',
  loading = false,
  info,
}: KPICardProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const formattedValue =
    format === 'currency' ? fmtARSCompact(value) :
    format === 'percent'  ? fmtPct(value)        :
    fmtNum(value)

  const deltaColor = delta != null ? deltaClass(delta) : ''
  const deltaIco   = delta != null ? deltaIcon(delta) : ''

  if (loading) {
    return (
      <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5 animate-pulse">
        <div className="h-3 bg-[#1a2e1b] rounded w-24 mb-3" />
        <div className="h-7 bg-[#1a2e1b] rounded w-32 mb-2" />
        <div className="h-3 bg-[#1a2e1b] rounded w-16" />
      </div>
    )
  }

  return (
    <div
      className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5
                 hover:border-[rgba(0,166,81,0.35)] hover:shadow-lg
                 transition-all duration-200 group relative"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {title}
          </span>
          {info && (
            <div className="relative">
              <button
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className="text-xs w-5 h-5 rounded-full flex items-center justify-center bg-[rgba(0,166,81,0.2)] text-[#00A651] hover:bg-[rgba(0,166,81,0.4)] transition-colors"
              >
                ?
              </button>
              {showTooltip && (
                <div className="absolute left-0 top-full mt-2 bg-[#1a2e1b] border border-[rgba(0,166,81,0.3)] rounded-lg p-2 text-[11px] text-gray-300 w-40 z-50 shadow-lg">
                  {info}
                </div>
              )}
            </div>
          )}
        </div>
        {icon && (
          <span
            className="text-lg w-8 h-8 rounded-lg flex items-center justify-center text-sm"
            style={{ background: `${accentColor}20`, color: accentColor }}
          >
            {icon}
          </span>
        )}
      </div>

      {/* Value */}
      <div
        className="text-3xl font-bold mb-2 font-mono tracking-tight"
        style={{ color: '#e8eaf0' }}
      >
        {formattedValue}
      </div>

      {/* Delta + subtitle */}
      <div className="flex items-center gap-2">
        {delta != null && (
          <span className={`text-[12px] font-semibold ${deltaColor}`}>
            {deltaIco} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {subtitle && (
          <span className="text-[11px] text-gray-500">{subtitle}</span>
        )}
      </div>

      {/* Bottom accent bar */}
      <div
        className="mt-4 h-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }}
      />
    </div>
  )
}
