'use client';

import { useState, useEffect } from 'react';

interface Account {
  id: string;
  name: string;
}

interface Objective {
  id: string;
  accountId: string;
  name: string;
  description?: string;
  metric: string;
  targetValue: number;
  period: string;
  status: boolean;
  startDate: string;
  endDate: string;
  account?: {
    name: string;
  };
}

export default function ObjectivesPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    metric: 'revenue',
    targetValue: 0,
    period: 'MONTHLY',
    startDate: '',
    endDate: '',
    accountId: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Fetch accounts and objectives
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [accountsRes, objectivesRes] = await Promise.all([
          fetch('/api/accounts'),
          fetch('/api/objectives'),
        ]);

        if (accountsRes.ok) {
          const data = await accountsRes.json();
          setAccounts(data.accounts || []);
          if (data.accounts?.length > 0) {
            setFormData((prev) => ({ ...prev, accountId: data.accounts[0].id }));
          }
        }

        if (objectivesRes.ok) {
          const data = await objectivesRes.json();
          setObjectives(data.objectives || []);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch('/api/objectives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setFormData({
          name: '',
          description: '',
          metric: 'revenue',
          targetValue: 0,
          period: 'MONTHLY',
          startDate: '',
          endDate: '',
          accountId: accounts[0]?.id || '',
        });
        setShowForm(false);

        // Refetch objectives
        const res = await fetch('/api/objectives');
        if (res.ok) {
          const data = await res.json();
          setObjectives(data.objectives || []);
        }
      }
    } catch (error) {
      console.error('Error creating objective:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this objective?')) return;

    try {
      const response = await fetch(`/api/objectives/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setObjectives(objectives.filter((obj) => obj.id !== id));
      }
    } catch (error) {
      console.error('Error deleting objective:', error);
    }
  };

  const handleToggleStatus = async (objective: Objective) => {
    try {
      const response = await fetch(`/api/objectives/${objective.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: !objective.status }),
      });

      if (response.ok) {
        setObjectives(
          objectives.map((obj) =>
            obj.id === objective.id ? { ...obj, status: !obj.status } : obj
          )
        );
      }
    } catch (error) {
      console.error('Error updating objective:', error);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading objectives...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Objectives</h1>
          <p className="text-gray-600 mt-2">Track your business goals and targets</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          + New Objective
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Create New Objective</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account *
                </label>
                <select
                  value={formData.accountId}
                  onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Objective Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="e.g., Monthly Revenue Target"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Metric Type *
                </label>
                <select
                  value={formData.metric}
                  onChange={(e) => setFormData({ ...formData, metric: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="revenue">Revenue</option>
                  <option value="orders">Orders</option>
                  <option value="conversions">Conversions</option>
                  <option value="clicks">Clicks</option>
                  <option value="leads">Leads</option>
                  <option value="customers">Customers</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Value *
                </label>
                <input
                  type="number"
                  value={formData.targetValue}
                  onChange={(e) => setFormData({ ...formData, targetValue: parseFloat(e.target.value) })}
                  required
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Period *
                </label>
                <select
                  value={formData.period}
                  onChange={(e) => setFormData({ ...formData, period: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date *
                </label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (optional)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Add notes about this objective"
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
              >
                {submitting ? 'Creating...' : 'Create Objective'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Objectives List */}
      {objectives.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-4">No objectives yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition inline-block"
          >
            Create Your First Objective
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {objectives.map((objective) => (
            <div key={objective.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{objective.name}</h3>
                    <button
                      onClick={() => handleToggleStatus(objective)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                        objective.status
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {objective.status ? '✓ Active' : '○ Inactive'}
                    </button>
                  </div>
                  {objective.description && (
                    <p className="text-sm text-gray-600">{objective.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(objective.id)}
                  className="text-red-600 hover:text-red-700 text-sm"
                >
                  Delete
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Account</p>
                  <p className="text-sm font-medium text-gray-900">{objective.account?.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Metric</p>
                  <p className="text-sm font-medium text-gray-900 capitalize">{objective.metric}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Target</p>
                  <p className="text-sm font-medium text-blue-600">
                    {objective.targetValue.toLocaleString('en-US')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Period</p>
                  <p className="text-sm font-medium text-gray-900">{objective.period}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Date Range</p>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(objective.startDate).toLocaleDateString('en-US')} -{' '}
                    {new Date(objective.endDate).toLocaleDateString('en-US')}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">Progress</span>
                  <span className="text-sm font-medium text-gray-900">0%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full" style={{ width: '0%' }}></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
