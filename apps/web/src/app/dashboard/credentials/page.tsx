'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface Account {
  id: string;
  name: string;
}

interface Credential {
  id: string;
  accountId: string;
  platform: string;
  type: string;
  name: string;
  syncStatus: string;
  lastSyncAt?: string;
  createdAt: string;
}

const PLATFORM_FIELDS: Record<string, Array<{ name: string; label: string; type: string }>> = {
  VTEX: [
    { name: 'accountName', label: 'Account Name', type: 'text' },
    { name: 'appKey', label: 'App Key', type: 'password' },
    { name: 'appToken', label: 'App Token', type: 'password' },
  ],
  MERCADO_LIBRE: [
    { name: 'accessToken', label: 'Access Token', type: 'password' },
  ],
  META: [
    { name: 'accessToken', label: 'Access Token', type: 'password' },
    { name: 'businessAccountId', label: 'Business Account ID', type: 'text' },
  ],
  GOOGLE_ADS: [
    { name: 'customerId', label: 'Customer ID', type: 'text' },
    { name: 'accessToken', label: 'Access Token', type: 'password' },
    { name: 'developerToken', label: 'Developer Token', type: 'password' },
  ],
  KOMMO_CRM: [
    { name: 'domain', label: 'Domain', type: 'text' },
    { name: 'apiKey', label: 'API Key', type: 'password' },
  ],
  PERFIT: [
    { name: 'apiKey', label: 'API Key', type: 'password' },
  ],
};

export default function CredentialsPage() {
  const { data: session } = useSession();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [credentialName, setCredentialName] = useState('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  // Fetch data
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [accountsRes, credentialsRes] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/credentials'),
      ]);

      if (accountsRes.ok) {
        const data = await accountsRes.json();
        setAccounts(data.accounts || []);
      }

      if (credentialsRes.ok) {
        const data = await credentialsRes.json();
        setCredentials(data.credentials || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlatform || !selectedAccount) return;

    setSubmitting(true);

    try {
      const credentialValue = JSON.stringify(formData);

      const response = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccount,
          platform: selectedPlatform,
          type: Object.keys(formData)[0] || 'token',
          name: credentialName,
          value: credentialValue,
        }),
      });

      if (response.ok) {
        setSelectedPlatform(null);
        setCredentialName('');
        setFormData({});
        setShowForm(false);
        await fetchData();
      }
    } catch (error) {
      console.error('Error adding credential:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTestConnection = async (credentialId: string) => {
    setTesting(credentialId);

    try {
      const response = await fetch('/api/credentials/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialId }),
      });

      if (response.ok) {
        alert('✅ Connection successful!');
        await fetchData();
      } else {
        alert('❌ Connection failed. Check your credentials.');
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      alert('Error testing connection');
    } finally {
      setTesting(null);
    }
  };

  const handleDeleteCredential = async (credentialId: string) => {
    if (!window.confirm('Delete this credential?')) return;

    try {
      const response = await fetch(`/api/credentials/${credentialId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error('Error deleting credential:', error);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  const platformOptions = Object.keys(PLATFORM_FIELDS);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Integrations</h1>
          <p className="text-gray-600 mt-2">Connect your marketing platforms and sync metrics</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          + Add Integration
        </button>
      </div>

      {/* Add Credential Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Add New Integration</h2>

          <form onSubmit={handleAddCredential} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account
              </label>
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select an account</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Platform
              </label>
              <select
                value={selectedPlatform || ''}
                onChange={(e) => {
                  setSelectedPlatform(e.target.value);
                  setFormData({});
                }}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a platform</option>
                {platformOptions.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
            </div>

            {selectedPlatform && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Credential Name
                  </label>
                  <input
                    type="text"
                    value={credentialName}
                    onChange={(e) => setCredentialName(e.target.value)}
                    required
                    placeholder="e.g., Production VTEX Token"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                {PLATFORM_FIELDS[selectedPlatform]?.map((field) => (
                  <div key={field.name}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {field.label}
                    </label>
                    <input
                      type={field.type}
                      value={formData[field.name] || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, [field.name]: e.target.value })
                      }
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                ))}
              </>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting || !selectedPlatform}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
              >
                {submitting ? 'Adding...' : 'Add Integration'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setSelectedPlatform(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Credentials List */}
      {credentials.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-4">No integrations yet</p>
          <p className="text-sm text-gray-400 mb-4">
            Add your first integration to start syncing metrics from your marketing platforms.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {credentials.map((cred) => (
            <div key={cred.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-gray-900">{cred.name}</h3>
                  <p className="text-sm text-gray-600">{cred.platform}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className={`px-3 py-1 rounded text-xs font-semibold ${
                      cred.syncStatus === 'SUCCESS'
                        ? 'bg-green-100 text-green-700'
                        : cred.syncStatus === 'ERROR'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {cred.syncStatus}
                  </div>
                  <button
                    onClick={() => handleTestConnection(cred.id)}
                    disabled={testing === cred.id}
                    className="text-blue-600 hover:text-blue-700 text-sm disabled:text-gray-400"
                  >
                    {testing === cred.id ? 'Testing...' : 'Test'}
                  </button>
                  <button
                    onClick={() => handleDeleteCredential(cred.id)}
                    className="text-red-600 hover:text-red-700 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {cred.lastSyncAt && (
                <p className="text-xs text-gray-500 mt-2">
                  Last sync: {new Date(cred.lastSyncAt).toLocaleString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
