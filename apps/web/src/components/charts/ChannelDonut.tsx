'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { fmtARSCompact, CHANNEL_COLORS, CHANNEL_LABELS } from '@/lib/utils'
import { type ChannelSummary } from '@/types'

interface ChannelDonutProps {
  data: ChannelSummary[]
  title?: string
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg p-3 text-xs shadow-xl">
      <div className="font-semibold text-gray-200 mb-1">{d.label}</div>
      <div className="text-gray-400">Revenue: <span className="text-gray-200 font-mono">{fmtARSCompact(d.revenue)}</span></div>
      <div className="text-gray-400">Órdenes: <span className="text-gray-200 font-mono">{d.orders}</span></div>
      <div className="text-gray-400">% Revenue: <span className="text-gray-200 font-mono">{d.pct_revenue.toFixed(1)}%</span></div>
    </div>
  )
}

export default function ChannelDonut({ data, title = 'Canales de venta' }: ChannelDonutProps) {
  const chartData = data.map(d => ({
    ...d,
    label: CHANNEL_LABELS[d.channel] ?? d.channel,
    fill: CHANNEL_COLORS[d.channel] ?? '#6b7280',
  }))

  return (
    <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5 h-full">
      <div className="text-sm font-semibold text-gray-200 mb-4">{title}</div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="revenue"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={3}
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} strokeWidth={0} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: '#8b92a8' }}
            formatter={(v) => <span style={{ color: '#9ca3af' }}>{v}</span>}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Channel breakdown table */}
      <div className="mt-2 space-y-2">
        {chartData.map((ch, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ch.fill }} />
              <span className="text-gray-400">{ch.label}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-gray-300 font-mono">{fmtARSCompact(ch.revenue)}</span>
              <span className="text-gray-500 w-10 text-right">{ch.pct_revenue.toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
