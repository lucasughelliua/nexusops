'use client';

import { useState } from 'react';

interface FilterBarProps {
  onAccountChange?: (accountId: string) => void;
  onPlatformChange?: (platform: string) => void;
  onDateRangeChange?: (startDate: Date, endDate: Date) => void;
  accounts?: Array<{ id: string; name: string }>;
  platforms?: string[];
}

export function FilterBar({
  onAccountChange,
  onPlatformChange,
  onDateRangeChange,
  accounts = [],
  platforms = [],
}: FilterBarProps) {
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'custom'>('30d');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const handleAccountChange = (value: string) => {
    setSelectedAccount(value);
    onAccountChange?.(value);
  };

  const handlePlatformChange = (value: string) => {
    setSelectedPlatform(value);
    onPlatformChange?.(value);
  };

  const handleTimeRangeChange = (range: '7d' | '30d' | '90d' | 'custom') => {
    setTimeRange(range);

    if (range === 'custom') return;

    const now = new Date();
    const start = new Date();

    if (range === '7d') start.setDate(start.getDate() - 7);
    else if (range === '30d') start.setDate(start.getDate() - 30);
    else if (range === '90d') start.setDate(start.getDate() - 90);

    onDateRangeChange?.(start, now);
  };

  const handleCustomDateRangeChange = () => {
    if (startDate && endDate) {
      onDateRangeChange?.(new Date(startDate), new Date(endDate));
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Account Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Account</label>
          <select
            value={selectedAccount}
            onChange={(e) => handleAccountChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="all">All Accounts</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Platform Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Platform</label>
          <select
            value={selectedPlatform}
            onChange={(e) => handlePlatformChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="all">All Platforms</option>
            {platforms.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
        </div>

        {/* Time Range */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Period</label>
          <div className="flex gap-2">
            {(['7d', '30d', '90d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => handleTimeRangeChange(range)}
                className={`px-3 py-2 rounded text-xs font-medium transition ${
                  timeRange === range
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {range === '7d' ? '7D' : range === '30d' ? '30D' : '90D'}
              </button>
            ))}
            <button
              onClick={() => handleTimeRangeChange('custom')}
              className={`px-3 py-2 rounded text-xs font-medium transition ${
                timeRange === 'custom'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Custom
            </button>
          </div>
        </div>

        {/* Custom Date Range */}
        {timeRange === 'custom' && (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <button
              onClick={handleCustomDateRangeChange}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
            >
              Apply
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
