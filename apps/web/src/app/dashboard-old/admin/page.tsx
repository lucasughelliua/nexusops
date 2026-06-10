'use client'

import { useState } from 'react'

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
  const [activeTab, setActiveTab] = useState<'users' | 'invite' | 'settings'>('users')
  const [goal, setGoal]           = useState('4500000')
  const [name, setName]           = useState('')
  const [role, setRole]           = useState('gerente')
  const [pin, setPin]             = useState('')

  return (
    <div className="p-6 space-y-6 fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Administración</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gestión de usuarios y configuración del sistema</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0c1a0d] border border-[rgba(0,166,81,0.15)] rounded-lg p-1 w-fit">
        {(['users', 'invite', 'settings'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab ? 'bg-[#00A651] text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {{ users: 'Usuarios', invite: 'Invitar', settings: 'Configuración' }[tab]}
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
