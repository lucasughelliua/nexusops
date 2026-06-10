'use client';

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface MetricsChartProps {
  data: any[];
  title?: string;
  height?: number;
  type?: 'bar' | 'line' | 'pie';
  dataKey?: string;
  colors?: string[];
}

const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function MetricsChart({
  data,
  title,
  height = 300,
  type = 'bar',
  dataKey = 'value',
  colors = DEFAULT_COLORS,
}: MetricsChartProps) {
  if (type === 'pie') {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        {title && <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>}

        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, value }) => `${name}: ${value}`}
              outerRadius={100}
              fill="#8884d8"
              dataKey={dataKey}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const ChartComponent = type === 'bar' ? BarChart : LineChart;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {title && <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>}

      <ResponsiveContainer width="100%" height={height}>
        <ChartComponent data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="name"
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            tick={{ fill: '#6b7280' }}
          />
          <YAxis
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            tick={{ fill: '#6b7280' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
            formatter={(value) => {
              if (typeof value === 'number') {
                return value.toLocaleString('en-US');
              }
              return value;
            }}
          />
          <Legend />
          {type === 'line' ? (
            <Line
              dataKey={dataKey}
              stroke={colors[0]}
              strokeWidth={2}
              isAnimationActive={true}
              dot={{ fill: colors[0], r: 4 }}
              activeDot={{ r: 6 }}
            />
          ) : (
            <Bar
              dataKey={dataKey}
              fill={colors[0]}
              isAnimationActive={true}
            />
          )}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}
