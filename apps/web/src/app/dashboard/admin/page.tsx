'use client'

import { useState, useEffect, useCallback } from 'react'

interface ChannelStatus {
  channel: string
  platform: string
  accountName: string
  configured: boolean
  syncStatus: string | null
  syncError: string | null
  lastSyncAt: string | null
  summary: Record<string, string>
}

const SYNC_STATUS_PILL: Record<string, string> = {
  SUCCESS: 'bg-[rgba(0,166,81,0.15)] text-[#00C65E] border border-[rgba(0,166,81,0.3)]',
  ERROR: 'bg-red-900/30 text-red-400 border border-red-800/40',
  PENDING: 'bg-amber-900/30 text-amber-400 border border-amber-800/40',
  SYNCING: 'bg-blue-900/30 text-blue-400 border border-blue-800/40',
}

const SYNC_STATUS_LABEL: Record<string, string> = {
  SUCCESS: 'Conectado',
  ERROR: 'Error de conexión',
  PENDING: 'Pendiente de prueba',
  SYNCING: 'Sincronizando',
}

const USERS = [
  { id: 1, name: 'Lucas Ughelli', role: 'admin',    color: '#007A3D', initials: 'LU', perms: ['metricas','live','canales','marketing','logistica','reportes','admin'] },
  { id: 2, name: 'Ernesto',       role: 'gerente',  color: '#059669', initials: 'EG', perms: ['metricas','live','canales','marketing','logistica'] },
  { id: 3, name: 'Ambar',         role: 'marketing',color: '#7c3aed', initials: 'AL', perms: ['marketing','live'] },
]

const ROLE_LABELS: Record<string, string> = {
  admin:    'Administrador',
  gerente:  'Gerente',
  marketing:'Marketing',
  ops:      'Operaciones',
  viewer:   'Solo lectura',
}

const ROLE_PILL: Record<string, string> = {
  admin:    'bg-[rgba(0,166,81,0.15)] text-[#00C65E] border border-[rgba(0,166,81,0.3)]',
  gerente:  'bg-blue-900/30 text-blue-400 border border-blue-800/40',
  marketing:'bg-purple-900/30 text-purple-400 border border-purple-800/40',
  viewer:   'bg-gray-900/30 text-gray-500 border border-gray-800/40',
}

const ALL_PAGES = ['metricas', 'live', 'canales', 'marketing', 'logistica', 'reportes', 'admin']

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'invite' | 'settings' | 'integraciones'>('users')
  const [goal, setGoal]           = useState('4500000')
  const [name, setName]           = useState('')
  const [role, setRole]           = useState('gerente')
  const [pin, setPin]             = useState('')

  const [integrations, setIntegrations] = useState<ChannelStatus[]>([])
  const [loadingInt, setLoadingInt] = useState(false)
  const [savingChannel, setSavingChannel] = useState<string | null>(null)
  const [meliMessage, setMeliMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [vtexForm, setVtexForm] = useState({ accountName: '', appKey: '', appToken: '' })
  const [meli1Form, setMeli1Form] = useState({ clientId: '', clientSecret: '' })
  const [meli2Form, setMeli2Form] = useState({ clientId: '', clientSecret: '' })

  const loadIntegrations = useCallback(async () => {
    setLoadingInt(true)
    try {
      const res = await fetch('/api/integrations')
      if (res.ok) {
        const data = await res.json()
        setIntegrations(data.channels ?? [])
      }
    } finally {
      setLoadingInt(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'integraciones') {
      loadIntegrations()
    }
  }, [activeTab, loadIntegrations])

  // Maneja el redirect de vuelta de /api/integrations/meli/callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const success = params.get('meli_success')
    const error = params.get('meli_error')
    if (success || error) {
      setActiveTab('integraciones')
      if (success) {
        setMeliMessage({ type: 'success', text: `Conectado correctamente con Mercado Libre (${success === 'meli_1' ? 'UA' : 'Sporta'}).` })
      } else if (error) {
        setMeliMessage({ type: 'error', text: error })
      }
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  async function saveChannel(channel: string, config: Record<string, string>) {
    setSavingChannel(channel)
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, config }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.tested) {
        setMeliMessage({
          type: data.success ? 'success' : 'error',
          text: data.success ? 'Conexión verificada correctamente.' : 'Se guardó, pero la prueba de conexión falló. Revisá las credenciales.',
        })
      } else if (res.ok) {
        setMeliMessage({ type: 'success', text: 'Configuración guardada.' })
      } else {
        setMeliMessage({ type: 'error', text: data?.message ?? 'No se pudo guardar la configuración.' })
      }
      await loadIntegrations()
    } catch {
      setMeliMessage({ type: 'error', text: 'No se pudo guardar la configuración.' })
    } finally {
      setSavingChannel(null)
    }
  }

  function statusFor(channel: string): ChannelStatus | undefined {
    return integrations.find((c) => c.channel === channel)
  }

  return (
    <div className="p-6 space-y-6 fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Administración</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gestión de usuarios y configuración del sistema</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-lg p-1 w-fit">
        {(['users', 'invite', 'integraciones', 'settings'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab ? 'bg-[#00A651] text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {{ users: 'Usuarios', invite: 'Invitar', integraciones: 'Integraciones', settings: 'Configuración' }[tab]}
          </button>
        ))}
      </div>

      {/* Users list */}
      {activeTab === 'users' && (
        <div className="space-y-3">
          {USERS.map(u => (
            <div
              key={u.id}
              className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-4 flex items-center gap-4"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ background: u.color }}
              >
                {u.initials}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-200">{u.name}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {u.perms.map(p => (
                    <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(0,166,81,0.1)] text-[#00A651]">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_PILL[u.role] ?? ''}`}>
                {ROLE_LABELS[u.role]}
              </span>
              <div className="flex gap-2">
                <button className="text-xs px-2.5 py-1 rounded bg-[#1a2e1b] text-gray-400 hover:text-gray-200 transition-colors">
                  Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invite form */}
      {activeTab === 'invite' && (
        <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-6 max-w-lg space-y-4">
          <p className="text-sm text-gray-400">Creá un nuevo usuario con acceso al dashboard.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nombre</label>
              <input
                value={name} onChange={e => setName(e.target.value)}
                className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2
                           text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors"
                placeholder="Ej: Laura García"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">PIN (4-6 dígitos)</label>
              <input
                value={pin} onChange={e => setPin(e.target.value)} maxLength={6}
                className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2
                           text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors font-mono"
                placeholder="1234"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Rol</label>
            <select
              value={role} onChange={e => setRole(e.target.value)}
              className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2
                         text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors"
            >
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-2">Permisos de vista</label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_PAGES.map(p => (
                <label key={p} className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                  <input type="checkbox" className="accent-[#00A651]" defaultChecked={p !== 'admin'} />
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </label>
              ))}
            </div>
          </div>
          <button
            onClick={() => alert(`Usuario "${name}" creado (demo). Integrar con backend para persistir.`)}
            className="w-full py-2.5 bg-[#00A651] text-white rounded-lg text-sm font-semibold hover:bg-[#007A3D] transition-colors"
          >
            Crear usuario
          </button>
        </div>
      )}

      {/* Integraciones */}
      {activeTab === 'integraciones' && (
        <div className="space-y-4 max-w-2xl">
          <p className="text-sm text-gray-400">
            Conectá las cuentas reales de cada plataforma. Los datos se guardan encriptados y reemplazan
            automáticamente los valores de ejemplo del dashboard una vez verificada la conexión.
          </p>

          {meliMessage && (
            <div
              className={`text-sm rounded-lg p-3 border ${
                meliMessage.type === 'success'
                  ? 'bg-[rgba(0,166,81,0.1)] text-[#00C65E] border-[rgba(0,166,81,0.3)]'
                  : 'bg-red-900/10 text-red-400 border-red-800/30'
              }`}
            >
              {meliMessage.text}
            </div>
          )}

          {loadingInt && <p className="text-xs text-gray-500">Cargando estado de integraciones…</p>}

          {/* VTEX */}
          {(() => {
            const status = statusFor('vtex')
            return (
              <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-200">VTEX</h3>
                  {status?.syncStatus && (
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${SYNC_STATUS_PILL[status.syncStatus] ?? ''}`}>
                      {SYNC_STATUS_LABEL[status.syncStatus] ?? status.syncStatus}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Nombre de cuenta</label>
                    <input
                      value={vtexForm.accountName}
                      onChange={(e) => setVtexForm({ ...vtexForm, accountName: e.target.value })}
                      placeholder={status?.summary?.['Cuenta VTEX'] !== '—' ? status?.summary?.['Cuenta VTEX'] : 'miempresa'}
                      className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">App Key</label>
                    <input
                      value={vtexForm.appKey}
                      onChange={(e) => setVtexForm({ ...vtexForm, appKey: e.target.value })}
                      placeholder={status?.summary?.['App Key']}
                      className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">App Token</label>
                    <input
                      type="password"
                      value={vtexForm.appToken}
                      onChange={(e) => setVtexForm({ ...vtexForm, appToken: e.target.value })}
                      placeholder={status?.summary?.['App Token']}
                      className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors font-mono"
                    />
                  </div>
                </div>
                {status?.syncError && <p className="text-xs text-red-400">{status.syncError}</p>}
                <button
                  disabled={savingChannel === 'vtex' || !vtexForm.accountName || !vtexForm.appKey || !vtexForm.appToken}
                  onClick={() => saveChannel('vtex', vtexForm)}
                  className="px-5 py-2.5 bg-[#00A651] text-white rounded-lg text-sm font-semibold hover:bg-[#007A3D] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {savingChannel === 'vtex' ? 'Guardando…' : 'Guardar y probar conexión'}
                </button>
              </div>
            )
          })()}

          {/* MercadoLibre UA / Sporta */}
          {([
            { channel: 'meli_1', label: 'MercadoLibre UA', form: meli1Form, setForm: setMeli1Form },
            { channel: 'meli_2', label: 'MercadoLibre Sporta', form: meli2Form, setForm: setMeli2Form },
          ] as const).map(({ channel, label, form, setForm }) => {
            const status = statusFor(channel)
            const hasClientId = !!status?.summary?.['Client ID'] && status.summary['Client ID'] !== '—'
            const isConnected = status?.summary?.['Token'] === 'Conectado ✓'
            return (
              <div key={channel} className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-200">{label}</h3>
                  {status?.syncStatus && (
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${SYNC_STATUS_PILL[status.syncStatus] ?? ''}`}>
                      {SYNC_STATUS_LABEL[status.syncStatus] ?? status.syncStatus}
                    </span>
                  )}
                </div>

                {status?.summary && (status.summary['Vendedor'] !== '—' || isConnected) && (
                  <div className="text-xs text-gray-500 grid grid-cols-2 gap-1">
                    {Object.entries(status.summary).map(([k, v]) => (
                      <div key={k}><span className="text-gray-600">{k}:</span> {v}</div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Client ID (App ID)</label>
                    <input
                      value={form.clientId}
                      onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                      placeholder={status?.summary?.['Client ID']}
                      className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Client Secret</label>
                    <input
                      type="password"
                      value={form.clientSecret}
                      onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
                      className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors font-mono"
                    />
                  </div>
                </div>
                {status?.syncError && <p className="text-xs text-red-400">{status.syncError}</p>}
                <div className="flex gap-3">
                  <button
                    disabled={savingChannel === channel || !form.clientId || !form.clientSecret}
                    onClick={() => saveChannel(channel, form)}
                    className="px-5 py-2.5 bg-[#00A651] text-white rounded-lg text-sm font-semibold hover:bg-[#007A3D] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {savingChannel === channel ? 'Guardando…' : 'Guardar credenciales'}
                  </button>
                  <a
                    href={hasClientId ? `/api/integrations/meli/connect?channel=${channel}` : undefined}
                    aria-disabled={!hasClientId}
                    className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                      hasClientId
                        ? 'bg-[#1a2e1b] text-gray-200 hover:bg-[#243826] cursor-pointer'
                        : 'bg-[#1a2e1b] text-gray-600 cursor-not-allowed pointer-events-none'
                    }`}
                  >
                    {isConnected ? 'Reconectar con Mercado Libre' : 'Conectar con Mercado Libre'}
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Settings */}
      {activeTab === 'settings' && (
        <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-6 max-w-lg space-y-5">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Meta diaria de revenue ($)</label>
            <input
              value={goal} onChange={e => setGoal(e.target.value)} type="number"
              className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2
                         text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">API Worker URL</label>
            <input
              defaultValue={process.env.NEXT_PUBLIC_API_BASE ?? ''}
              className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2
                         text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors font-mono"
              readOnly
            />
          </div>
          <div className="text-xs text-amber-600/80 bg-amber-900/10 border border-amber-800/30 rounded-lg p-3">
            ⚠ Los cambios de configuración se aplican a todos los usuarios.
          </div>
          <button
            onClick={() => { localStorage.setItem('nexusops_goal', goal); alert('✓ Configuración guardada.') }}
            className="px-5 py-2.5 bg-[#00A651] text-white rounded-lg text-sm font-semibold hover:bg-[#007A3D] transition-colors"
          >
            Guardar cambios
          </button>
        </div>
      )}
    </div>
  )
}
