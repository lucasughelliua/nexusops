'use client'

import { useState, useEffect, useCallback } from 'react'
import { ProtectedAdminRoute } from '@/components/ProtectedAdminRoute'

interface User {
  id: string
  username: string
  name: string
  role: 'ADMIN' | 'USER'
  status: boolean
  pin?: string
  createdAt?: string
}

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

function AdminPageContent() {
  const [activeTab, setActiveTab] = useState<'users' | 'invite' | 'settings' | 'integraciones'>('users')
  const [goal, setGoal]           = useState('4500000')
  const [name, setName]           = useState('')
  const [role, setRole]           = useState('USER')
  const [pin, setPin]             = useState('')
  const [username, setUsername]   = useState('')

  const [users, setUsers] = useState<User[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [savingUser, setSavingUser] = useState(false)

  const [integrations, setIntegrations] = useState<ChannelStatus[]>([])
  const [loadingInt, setLoadingInt] = useState(false)
  const [savingChannel, setSavingChannel] = useState<string | null>(null)
  const [meliMessage, setMeliMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [vtexForm, setVtexForm] = useState({ accountName: '', appKey: '', appToken: '' })
  const [meli1Form, setMeli1Form] = useState({ accessToken: '' })
  const [meli2Form, setMeli2Form] = useState({ accessToken: '' })

  const [metaForm, setMetaForm] = useState({ adAccountId: '', accessToken: '' })
  const [googleForm, setGoogleForm] = useState({ sheetsUrl: '', apiKey: '' })
  const [perfitForm, setPerfitForm] = useState({ apiKey: '', subdomain: '' })
  const [kommoForm, setKommoForm] = useState({ subdomain: '', accessToken: '' })

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true)
    try {
      const res = await fetch('/api/users')
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users ?? [])
      }
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  async function saveUser(user: Partial<User> & { id?: string }) {
    setSavingUser(true)
    try {
      if (user.id) {
        // Editar usuario existente
        const res = await fetch(`/api/users/${user.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: user.name,
            role: user.role,
            pin: user.pin || undefined,
          }),
        })
        if (res.ok) {
          await loadUsers()
          setEditingUser(null)
        }
      } else {
        // Crear nuevo usuario
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: user.username,
            name: user.name,
            pin: user.pin,
            role: user.role || 'USER',
          }),
        })
        if (res.ok) {
          await loadUsers()
          setName('')
          setPin('')
          setRole('gerente')
        }
      }
    } finally {
      setSavingUser(false)
    }
  }

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
    } else if (activeTab === 'users') {
      loadUsers()
    }
  }, [activeTab, loadIntegrations, loadUsers])

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
          {loadingUsers && <div className="text-sm text-gray-500">Cargando usuarios…</div>}
          {users.length === 0 && !loadingUsers && (
            <div className="text-sm text-gray-500">No hay usuarios creados aún.</div>
          )}
          {users.map(u => (
            <div
              key={u.id}
              className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-4 flex items-center gap-4"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 bg-[#007A3D]"
              >
                {u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-200">{u.name}</div>
                <div className="text-xs text-gray-500">{u.username}</div>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_PILL[u.role] ?? ''}`}>
                {ROLE_LABELS[u.role]}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingUser(u)}
                  className="text-xs px-2.5 py-1 rounded bg-[#1a2e1b] text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Editar
                </button>
              </div>
            </div>
          ))}

          {/* Edit modal */}
          {editingUser && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-6 max-w-sm w-full mx-4 space-y-4">
                <h2 className="text-lg font-bold text-gray-100">Editar usuario</h2>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nombre</label>
                  <input
                    value={editingUser.name}
                    onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                    className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#00A651]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">PIN (opcional)</label>
                  <input
                    type="password"
                    maxLength={6}
                    placeholder="Dejar en blanco para no cambiar"
                    className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#00A651] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Rol</label>
                  <select
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as 'ADMIN' | 'USER' })}
                    className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#00A651]"
                  >
                    <option value="USER">Usuario</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingUser(null)}
                    className="flex-1 px-3 py-2 rounded bg-[#1a2e1b] text-gray-400 hover:text-gray-200 transition-colors text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={savingUser}
                    onClick={() => saveUser(editingUser)}
                    className="flex-1 px-3 py-2 rounded bg-[#00A651] text-white hover:bg-[#007A3D] transition-colors text-sm font-semibold disabled:opacity-50"
                  >
                    {savingUser ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Invite form */}
      {activeTab === 'invite' && (
        <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-6 max-w-lg space-y-4">
          <p className="text-sm text-gray-400">Creá un nuevo usuario con acceso al dashboard.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email/Usuario</label>
              <input
                value={username} onChange={e => setUsername(e.target.value)}
                className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2
                           text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors"
                placeholder="usuario@empresa.com"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nombre</label>
              <input
                value={name} onChange={e => setName(e.target.value)}
                className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2
                           text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors"
                placeholder="Ej: Laura García"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">PIN (4-6 dígitos)</label>
              <input
                value={pin} onChange={e => setPin(e.target.value)} maxLength={6}
                className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2
                           text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors font-mono"
                placeholder="1234"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Rol</label>
              <select
                value={role} onChange={e => setRole(e.target.value)}
                className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2
                           text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors"
              >
                <option value="USER">Usuario</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </div>
          </div>
          <button
            disabled={savingUser || !username || !name || !pin}
            onClick={() => saveUser({ username, name, role: role as 'ADMIN' | 'USER', pin })}
            className="w-full py-2.5 bg-[#00A651] text-white rounded-lg text-sm font-semibold hover:bg-[#007A3D] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingUser ? 'Creando…' : 'Crear usuario'}
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
                      autoComplete="off"
                      name="vtex-account-name"
                      className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">App Key</label>
                    <input
                      value={vtexForm.appKey}
                      onChange={(e) => setVtexForm({ ...vtexForm, appKey: e.target.value })}
                      placeholder={status?.summary?.['App Key']}
                      autoComplete="off"
                      name="vtex-app-key"
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
                      autoComplete="new-password"
                      name="vtex-app-token"
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
            const isConnected = status?.syncStatus === 'SUCCESS'
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

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Access Token (Larga duración)</label>
                    <input
                      type="password"
                      value={form.accessToken}
                      onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
                      placeholder="APP_USR-XXXX..."
                      autoComplete="new-password"
                      name={`${channel}-access-token`}
                      className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors font-mono"
                    />
                    <p className="text-xs text-gray-500 mt-1">Formato: APP_USR-XXXX...</p>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Seller ID (opcional - para debugging)</label>
                    <input
                      type="text"
                      value={(form as any).sellerId || ''}
                      onChange={(e) => setForm({ ...form, sellerId: e.target.value } as any)}
                      placeholder="Ej: 123456789"
                      autoComplete="off"
                      name={`${channel}-seller-id`}
                      className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors font-mono"
                    />
                    <p className="text-xs text-gray-500 mt-1">Tu ID numérico de vendedor (lo obtiene automáticamente si está vacío)</p>
                  </div>
                </div>
                {status?.syncError && <p className="text-xs text-red-400">{status.syncError}</p>}
                <button
                  disabled={savingChannel === channel || !form.accessToken}
                  onClick={() => saveChannel(channel, form)}
                  className="px-5 py-2.5 bg-[#00A651] text-white rounded-lg text-sm font-semibold hover:bg-[#007A3D] transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-full"
                >
                  {savingChannel === channel ? 'Guardando…' : 'Guardar y probar conexión'}
                </button>
              </div>
            )
          })}

          {/* Marketing Channels Header */}
          <div className="mt-8 pt-6 border-t border-[rgba(0,166,81,0.15)]">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Marketing & CRM</h3>
            <p className="text-xs text-gray-400 mb-4">Conectá tus plataformas de marketing para traer campañas, montos y métricas</p>
          </div>

          {/* Meta */}
          {(() => {
            const status = statusFor('meta')
            return (
              <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-200">Meta (Facebook Ads)</h3>
                  {status?.syncStatus && (
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${SYNC_STATUS_PILL[status.syncStatus] ?? ''}`}>
                      {SYNC_STATUS_LABEL[status.syncStatus] ?? status.syncStatus}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Ad Account ID</label>
                    <input
                      value={metaForm.adAccountId}
                      onChange={(e) => setMetaForm({ ...metaForm, adAccountId: e.target.value })}
                      placeholder="act_1234567890"
                      autoComplete="off"
                      name="meta-ad-account-id"
                      className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Access Token</label>
                    <input
                      type="password"
                      value={metaForm.accessToken}
                      onChange={(e) => setMetaForm({ ...metaForm, accessToken: e.target.value })}
                      autoComplete="new-password"
                      name="meta-access-token"
                      className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors font-mono"
                    />
                  </div>
                </div>
                {status?.syncError && <p className="text-xs text-red-400">{status.syncError}</p>}
                <button
                  disabled={savingChannel === 'meta' || !metaForm.adAccountId || !metaForm.accessToken}
                  onClick={() => saveChannel('meta', metaForm)}
                  className="px-5 py-2.5 bg-[#00A651] text-white rounded-lg text-sm font-semibold hover:bg-[#007A3D] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {savingChannel === 'meta' ? 'Guardando…' : 'Guardar y probar conexión'}
                </button>
              </div>
            )
          })()}

          {/* Google Ads / Google Sheets */}
          {(() => {
            const status = statusFor('google')
            return (
              <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-200">Google Ads</h3>
                  {status?.syncStatus && (
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${SYNC_STATUS_PILL[status.syncStatus] ?? ''}`}>
                      {SYNC_STATUS_LABEL[status.syncStatus] ?? status.syncStatus}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">Cargá los datos desde una Google Sheet con tus campañas y gastos</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">URL de Google Sheet</label>
                    <input
                      value={googleForm.sheetsUrl}
                      onChange={(e) => setGoogleForm({ ...googleForm, sheetsUrl: e.target.value })}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      autoComplete="off"
                      name="google-sheets-url"
                      className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">API Key (Google Sheets) - opcional</label>
                    <input
                      type="password"
                      value={googleForm.apiKey}
                      onChange={(e) => setGoogleForm({ ...googleForm, apiKey: e.target.value })}
                      autoComplete="new-password"
                      name="google-api-key"
                      placeholder="No requerido si el sheet es público"
                      className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors font-mono"
                    />
                  </div>
                </div>
                {status?.syncError && <p className="text-xs text-red-400">{status.syncError}</p>}
                <button
                  disabled={savingChannel === 'google' || !googleForm.sheetsUrl}
                  onClick={() => saveChannel('google', googleForm)}
                  className="px-5 py-2.5 bg-[#00A651] text-white rounded-lg text-sm font-semibold hover:bg-[#007A3D] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {savingChannel === 'google' ? 'Guardando…' : 'Guardar y probar conexión'}
                </button>
              </div>
            )
          })()}

          {/* Perfit */}
          {(() => {
            const status = statusFor('perfit')
            return (
              <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-200">Perfit</h3>
                  {status?.syncStatus && (
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${SYNC_STATUS_PILL[status.syncStatus] ?? ''}`}>
                      {SYNC_STATUS_LABEL[status.syncStatus] ?? status.syncStatus}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Subdominio</label>
                    <input
                      value={perfitForm.subdomain}
                      onChange={(e) => setPerfitForm({ ...perfitForm, subdomain: e.target.value })}
                      placeholder="tunegocio"
                      autoComplete="off"
                      name="perfit-subdomain"
                      className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">API Key</label>
                    <input
                      type="password"
                      value={perfitForm.apiKey}
                      onChange={(e) => setPerfitForm({ ...perfitForm, apiKey: e.target.value })}
                      autoComplete="new-password"
                      name="perfit-api-key"
                      className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors font-mono"
                    />
                  </div>
                </div>
                {status?.syncError && <p className="text-xs text-red-400">{status.syncError}</p>}
                <button
                  disabled={savingChannel === 'perfit' || !perfitForm.subdomain || !perfitForm.apiKey}
                  onClick={() => saveChannel('perfit', perfitForm)}
                  className="px-5 py-2.5 bg-[#00A651] text-white rounded-lg text-sm font-semibold hover:bg-[#007A3D] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {savingChannel === 'perfit' ? 'Guardando…' : 'Guardar y probar conexión'}
                </button>
              </div>
            )
          })()}

          {/* Kommo (CRM) */}
          {(() => {
            const status = statusFor('kommo')
            return (
              <div className="bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-200">Kommo CRM</h3>
                  {status?.syncStatus && (
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${SYNC_STATUS_PILL[status.syncStatus] ?? ''}`}>
                      {SYNC_STATUS_LABEL[status.syncStatus] ?? status.syncStatus}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Subdominio</label>
                    <input
                      value={kommoForm.subdomain}
                      onChange={(e) => setKommoForm({ ...kommoForm, subdomain: e.target.value })}
                      placeholder="tunegocio"
                      autoComplete="off"
                      name="kommo-subdomain"
                      className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Access Token</label>
                    <input
                      type="password"
                      value={kommoForm.accessToken}
                      onChange={(e) => setKommoForm({ ...kommoForm, accessToken: e.target.value })}
                      autoComplete="new-password"
                      name="kommo-access-token"
                      className="w-full bg-[#071409] border border-[rgba(0,166,81,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#00A651] transition-colors font-mono"
                    />
                  </div>
                </div>
                {status?.syncError && <p className="text-xs text-red-400">{status.syncError}</p>}
                <button
                  disabled={savingChannel === 'kommo' || !kommoForm.subdomain || !kommoForm.accessToken}
                  onClick={() => saveChannel('kommo', kommoForm)}
                  className="px-5 py-2.5 bg-[#00A651] text-white rounded-lg text-sm font-semibold hover:bg-[#007A3D] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {savingChannel === 'kommo' ? 'Guardando…' : 'Guardar y probar conexión'}
                </button>
              </div>
            )
          })()}
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

export default function AdminPage() {
  return (
    <ProtectedAdminRoute>
      <AdminPageContent />
    </ProtectedAdminRoute>
  )
}
