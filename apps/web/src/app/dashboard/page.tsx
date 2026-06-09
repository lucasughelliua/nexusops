'use client';

import { useSession } from "next-auth/react";

export default function DashboardPage() {
  const { data: session } = useSession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Manage your metrics and integrations in one place
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-blue-600">0</div>
          <p className="text-gray-600 text-sm mt-2">Connected Accounts</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-green-600">0</div>
          <p className="text-gray-600 text-sm mt-2">Active Integrations</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-purple-600">0</div>
          <p className="text-gray-600 text-sm mt-2">Metrics Tracked</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-orange-600">0</div>
          <p className="text-gray-600 text-sm mt-2">Active Objectives</p>
        </div>
      </div>

      {/* Welcome Card */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg shadow p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">Welcome to NexusOps!</h2>
        <p className="mb-4">
          Get started by connecting your first account and integrating your business platforms.
        </p>
        <div className="space-x-3">
          <a
            href="/dashboard/accounts"
            className="inline-block px-4 py-2 bg-white text-blue-600 rounded-lg font-medium hover:bg-gray-100 transition"
          >
            Add Account
          </a>
          <a
            href="/dashboard/credentials"
            className="inline-block px-4 py-2 bg-blue-700 text-white rounded-lg font-medium hover:bg-blue-800 transition"
          >
            Connect Integration
          </a>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
        </div>
        <div className="p-6 text-center text-gray-500">
          <p>No recent activity yet</p>
          <p className="text-sm mt-1">Start by adding an account</p>
        </div>
      </div>
    </div>
  );
}
