'use client';

import { useState, useEffect } from 'react';

interface Account {
  id: string;
  name: string;
}

interface Metric {
  id: string;
  platform: string;
  metricType: string;
  value: number;
  currency: string;
  date: string;
  account: {
    id: string;
    name: string;
  };
}

export default function MetricsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'value' | 'type'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Fetch accounts
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const response = await fetch('/api/accounts');
        if (response.ok) {
          const data = await response.json();
          setAccounts(data.accounts || []);
        }
      } catch (error) {
        console.error('Error fetching accounts:', error);
      }
    };

    fetchAccounts();
  }, []);

  // Fetch metrics
  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();

        if (selectedAccount !== 'all') {
          params.append('accountId', selectedAccount);
        }

        if (selectedPlatform !== 'all') {
          params.append('platform', selectedPlatform);
        }

        params.append('limit', '5000');

        const response = await fetch(`/api/metrics?${params}`);
        if (response.ok) {
          const data = await response.json();
          setMetrics(data.metrics || []);
        }
      } catch (error) {
        console.error('Error fetching metrics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [selectedAccount, selectedPlatform]);

  // Filter and sort metrics
  let filteredMetrics = metrics.filter((metric) => {
    const matchesSearch =
      metric.metricType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      metric.platform.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  filteredMetrics.sort((a, b) => {
    let compareValue = 0;

    if (sortBy === 'date') {
      compareValue = new Date(a.date).getTime() - new Date(b.date).getTime();
    } else if (sortBy === 'value') {
      compareValue = a.value - b.value;
    } else if (sortBy === 'type') {
      compareValue = a.metricType.localeCompare(b.metricType);
    }

    return sortOrder === 'asc' ? compareValue : -compareValue;
  });

  const platforms = [...new Set(metrics.map((m) => m.platform))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Metrics</h1>
        <p className="text-gray-600 mt-2">Browse and analyze all your tracked metrics</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="all">All Accounts</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="all">All Platforms</option>
              {platforms.map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by type or platform"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12">Loading metrics...</div>
      ) : filteredMetrics.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">No metrics found</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Account
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Platform
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => {
                    if (sortBy === 'type') {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortBy('type');
                      setSortOrder('asc');
                    }
                  }}
                >
                  Metric Type {sortBy === 'type' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => {
                    if (sortBy === 'value') {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortBy('value');
                      setSortOrder('desc');
                    }
                  }}
                >
                  Value {sortBy === 'value' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => {
                    if (sortBy === 'date') {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortBy('date');
                      setSortOrder('desc');
                    }
                  }}
                >
                  Date {sortBy === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredMetrics.slice(0, 100).map((metric) => (
                <tr key={metric.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {metric.account.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-medium">
                      {metric.platform}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {metric.metricType}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                    {metric.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    {metric.currency && <span className="text-gray-600 ml-1">{metric.currency}</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(metric.date).toLocaleDateString('en-US')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredMetrics.length > 100 && (
            <div className="px-6 py-4 bg-gray-50 text-center text-sm text-gray-600">
              Showing 100 of {filteredMetrics.length} metrics
            </div>
          )}
        </div>
      )}
    </div>
  );
}
