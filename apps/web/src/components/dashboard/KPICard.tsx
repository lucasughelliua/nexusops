'use client';

interface KPICardProps {
  label: string;
  value: number | string;
  unit?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendPercent?: number;
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'pink';
  onClick?: () => void;
}

const colorClasses = {
  blue: 'bg-blue-50 text-blue-600 border-blue-200',
  green: 'bg-green-50 text-green-600 border-green-200',
  red: 'bg-red-50 text-red-600 border-red-200',
  yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200',
  purple: 'bg-purple-50 text-purple-600 border-purple-200',
  pink: 'bg-pink-50 text-pink-600 border-pink-200',
};

const textColorClasses = {
  blue: 'text-blue-900',
  green: 'text-green-900',
  red: 'text-red-900',
  yellow: 'text-yellow-900',
  purple: 'text-purple-900',
  pink: 'text-pink-900',
};

export function KPICard({
  label,
  value,
  unit = '',
  trend,
  trendPercent,
  icon,
  color = 'blue',
  onClick,
}: KPICardProps) {
  const colorClass = colorClasses[color];
  const textColor = textColorClasses[color];

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border p-6 ${colorClass} ${onClick ? 'cursor-pointer hover:shadow-md transition' : ''}`}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <div className="mt-2">
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl font-bold ${textColor}`}>
                {typeof value === 'number' ? value.toLocaleString('en-US') : value}
              </span>
              {unit && <span className="text-lg text-gray-600">{unit}</span>}
            </div>
          </div>

          {trend && trendPercent !== undefined && (
            <div className="mt-2 flex items-center gap-1">
              <span
                className={`text-sm font-medium ${
                  trend === 'up'
                    ? 'text-green-600'
                    : trend === 'down'
                    ? 'text-red-600'
                    : 'text-gray-600'
                }`}
              >
                {trend === 'up' && '↑'}
                {trend === 'down' && '↓'}
                {trend === 'neutral' && '→'}
                {Math.abs(trendPercent)}%
              </span>
              <span className="text-xs text-gray-500">vs last period</span>
            </div>
          )}
        </div>

        {icon && <div className="text-4xl opacity-20">{icon}</div>}
      </div>
    </div>
  );
}
