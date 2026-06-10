'use client';

import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface DataPoint {
  date: string;
  value: number;
  [key: string]: any;
}

interface RevenueChartProps {
  data: DataPoint[];
  title?: string;
  height?: number;
  type?: 'line' | 'area';
  currency?: string;
}

export function RevenueChart({
  data,
  title = 'Revenue',
  height = 300,
  type = 'area',
  currency = 'USD',
}: RevenueChartProps) {
  const ChartComponent = type === 'area' ? AreaChart : LineChart;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {title && <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>}

      <ResponsiveContainer width="100%" height={height}>
        <ChartComponent data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            tick={{ fill: '#6b7280' }}
          />
          <YAxis
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            tick={{ fill: '#6b7280' }}
            label={{ value: currency, angle: -90, position: 'insideLeft' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
            formatter={(value) => {
              if (typeof value === 'number') {
                return [
                  `${currency} ${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
                  'Revenue',
                ];
              }
              return value;
            }}
          />
          <Legend />
          {type === 'area' ? (
            <Area
              dataKey="value"
              stroke="#3b82f6"
              fill="#3b82f6"
              strokeWidth={2}
              isAnimationActive={true}
              activeDot={{ r: 6 }}
              opacity={0.3}
            />
          ) : (
            <Line
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={2}
              isAnimationActive={true}
              dot={{ fill: '#3b82f6', r: 4 }}
              activeDot={{ r: 6 }}
            />
          )}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}
