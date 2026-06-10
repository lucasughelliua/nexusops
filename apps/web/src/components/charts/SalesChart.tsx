'use client'

import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, BarChart, Bar
} from 'recharts'
import { fmtARSCompact, fmtNum } from '@/lib/utils'
import { type DailySales } from '@/types'

interface SalesChartProps {
  data: DailySales[]
  title?: string
  mode?: 'revenue' | 'orders' | 'both'
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg p-3 text-xs shadow-xl">
      <div className="text-gray-400 mb-1.5 font-medium">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-300">{p.name}:</span>
          <span className="font-mono font-semibold" style={{ color: p.color }}>
            {p.name === 'Órdenes' ? fmtNum(p.value) : fmtARSCompact(p.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function SalesChart({ data, title = 'Ventas por día', mode = 'revenue' }: SalesChartProps) {
  const formatted = data.map(d => ({
    ...d,
    label: d.date.slice(5), // MM-DD
  }))

  return (
    <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-5 h-full">
      <div className="text-sm font-semibold text-gray-200 mb-4">{title}</div>
      <ResponsiveContainer width="100%" height={260}>
        {mode === 'orders' ? (
          <BarChart data={formatted} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,166,81,0.06)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#545d75', fontSize: 10, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#545d75', fontSize: 10, fontFamily: 'monospace' }} axisLine={false} tickLine={false} tickFormatter={v => String(v)} width={32} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="orders" name="Órdenes" fill="rgba(0,166,81,0.7)" radius={[3,3,0,0]} />
          </BarChart>
        ) : (
          <AreaChart data={formatted} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#00A651" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00A651" stopOpacity={0.02} />
              </linearGradient>
              {mode === 'both' && (
                <linearGradient id="ordersGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                </linearGradient>
              )}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,166,81,0.06)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#545d75', fontSize: 10, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#545d75', fontSize: 10, fontFamily: 'monospace' }} axisLine={false} tickLine={false} tickFormatter={v => fmtARSCompact(v)} width={48} />
            <Tooltip content={<CustomTooltip />} />
            {mode === 'both' && <Legend wrapperStyle={{ fontSize: 11, color: '#8b92a8' }} />}
            <Area
              type="monotone" dataKey="revenue" name="Revenue"
              stroke="#00A651" strokeWidth={2}
              fill="url(#revenueGrad)" dot={false} activeDot={{ r: 4, fill: '#00A651' }}
            />
            {mode === 'both' && (
              <Area
                type="monotone" dataKey="orders" name="Órdenes"
                stroke="#f59e0b" strokeWidth={1.5}
                fill="url(#ordersGrad)" dot={false} activeDot={{ r: 3, fill: '#f59e0b' }}
              />
            )}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
