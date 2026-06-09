'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { RevenueChart } from '@/components/charts/RevenueChart';
import { MetricsChart } from '@/components/charts/MetricsChart';
import { KPICard } from '@/components/dashboard/KPICard';
import { FilterBar } from '@/components/dashboard/FilterBar';

interface Account {
  id: string;
  name: string;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');

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

        // Last 30 days
        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 30);

        params.append('startDate', startDate.toISOString());
        params.append('endDate', endDate.toISOString());
        params.append('limit', '1000');

        const response = await fetch(`/api/metrics?${params}`);
        if (response.ok) {
          const data = await response.json();
          setMetrics(data.metrics || []);
          setChartData(data.chartData || []);
          setSummary(data.summary);
        }
      } catch (error) {
        console.error('Error fetching metrics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [selectedAccount, selectedPlatform]);

  if (loading) {
    return <div className="text-center py-12">Loading dashboard...</div>;
  }

  const platforms = [...new Set(metrics.map((m) => m.platform))];

  const revenueData = chartData.map((item) => {
    const revenueKey = Object.keys(item).find(
      (key) => key.includes('revenue') || key.includes('REVENUE')
    );
    return {
      date: item.date,
      value: revenueKey ? item[revenueKey] : 0,
    };
  });

  const ordersData = chartData.map((item) => {
    const ordersKey = Object.keys(item).find(
      (key) => key.includes('orders') || key.includes('ORDERS')
    );
    return {
      date: item.date,
      value: ordersKey ? item[ordersKey] : 0,
    };
  });

  const platformStats = Object.entries(
    metrics.reduce(
      (acc: Record<string, number>, metric) => {
        acc[metric.platform] = (acc[metric.platform] || 0) + metric.value;
        return acc;
      },
      {}
    )
  ).map(([name, value]) => ({
    name,
    value,
  }));

  const totalRevenue = metrics
    .filter((m) => m.metricType?.toLowerCase().includes('revenue'))
    .reduce((sum, m) => sum + m.value, 0);

  const totalOrders = metrics
    .filter((m) => m.metricType?.toLowerCase().includes('order'))
    .reduce((sum, m) => sum + m.value, 0);

  const totalMetrics = metrics.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Real-time metrics from all your platforms</p>
      </div>

      {/* Filter Bar */}
      <FilterBar
        accounts={accounts}
        platforms={platforms}
        onAccountChange={setSelectedAccount}
        onPlatformChange={setSelectedPlatform}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Total Revenue"
          value={Math.round(totalRevenue)}
          unit="USD"
          color="blue"
          trend={totalRevenue > 0 ? 'up' : 'neutral'}
          trendPercent={12}
        />
        <KPICard
          label="Total Orders"
          value={Math.round(totalOrders)}
          color="green"
          trend={totalOrders > 0 ? 'up' : 'neutral'}
          trendPercent={8}
        />
        <KPICard
          label="Metrics Tracked"
          value={totalMetrics}
          color="purple"
        />
        <KPICard
          label="Connected Accounts"
          value={accounts.length}
          color="yellow"
        />
      </div>

      {/* Charts Grid */}
      {chartData.length > 0 ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RevenueChart data={revenueData} title="Revenue Trend (Last 30 Days)" />
            <MetricsChart
              data={ordersData}
              title="Orders Trend (Last 30 Days)"
              type="line"
            />
          </div>

          {platformStats.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <MetricsChart
                data={platformStats}
                title="Metrics by Platform"
                type="pie"
              />
              <MetricsChart
                data={platformStats}
                title="Volume by Platform"
                type="bar"
              />
            </div>
          )}

          {/* Metrics Summary */}
          {summary?.metrics && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Metrics Summary
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(summary.metrics).map(([metricType, stats]: any) => (
                  <div key={metricType} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 capitalize mb-2">
                      {metricType}
                    </h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Sum:</span>
                        <span className="font-medium">
                          {Math.round(stats.sum).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Avg:</span>
                        <span className="font-medium">{Math.round(stats.avg)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Max:</span>
                        <span className="font-medium">{Math.round(stats.max)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-4">No metrics available yet</p>
          <p className="text-sm text-gray-400 mb-6">
            Add an account and integration to start tracking metrics. Data will appear here after
            the first sync.
          </p>
          <div className="space-x-3">
            <a
              href="/dashboard/accounts"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm transition"
            >
              Add Account
            </a>
            <a
              href="/dashboard/credentials"
              className="inline-block px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm transition"
            >
              Connect Integration
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
