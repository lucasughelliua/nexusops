'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import ColorPicker from '@/components/ColorPicker'

const NAV = [
  {
    section: 'Principal',
    items: [
      { href: '/dashboard/metricas',  label: 'Métricas',        icon: '📊' },
      { href: '/dashboard/live',      label: 'Ventas en Vivo',  icon: '🔴', badge: 'live' },
      { href: '/dashboard/canales',   label: 'Canales',         icon: '📈' },
    ],
  },
  {
    section: 'CRM & Ops',
    items: [
      { href: '/dashboard/marketing', label: 'Marketing / CRM', icon: '📢' },
      { href: '/dashboard/logistica', label: 'Logística',       icon: '🚚' },
      { href: '/dashboard/reportes',  label: 'Reportes',        icon: '📋' },
    ],
  },
  {
    section: 'Sistema',
    items: [
      { href: '/dashboard/admin',     label: 'Administración',  icon: '⚙️' },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [showMenu, setShowMenu] = useState(false)

  const userInitials = session?.user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'
  const userRole = session?.user?.role === 'ADMIN' ? 'Administrador' : 'Usuario'

  return (
    <aside className="w-60 flex-shrink-0 bg-[#071409] border-r border-[rgba(0,166,81,0.12)]
                      h-screen sticky top-0 flex flex-col overflow-hidden">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[rgba(0,166,81,0.12)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#00A651] flex items-center justify-center
                          text-white text-sm font-bold">N</div>
          <div>
            <div className="text-sm font-semibold text-gray-100 leading-none">NexusOps</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
              Universo Aventura
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {NAV.map(group => (
          <div key={group.section} className="mb-2">
            <div className="px-5 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
              {group.section}
            </div>
            {group.items.map(item => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 mx-2 px-3 py-2.5 rounded-lg text-sm transition-all',
                    isActive
                      ? 'bg-[rgba(0,166,81,0.15)] text-[#00C65E] font-medium'
                      : 'text-gray-400 hover:bg-[#0c1a0d] hover:text-gray-200'
                  )}
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.badge === 'live' && (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    </span>
                  )}
                  {isActive && (
                    <div className="absolute left-0 w-0.5 h-6 bg-[#00A651] rounded-r" />
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User pill */}
      <div className="px-3 py-4 border-t border-[rgba(0,166,81,0.12)] space-y-3">
        <ColorPicker />
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-[#0c1a0d] cursor-pointer transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-[#007A3D] flex items-center justify-center
                            text-white text-xs font-bold">{userInitials}</div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-200 truncate">{session?.user?.name || 'Usuario'}</div>
              <div className="text-[10px] text-gray-500">{userRole}</div>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-[#00A651]" />
          </button>

          {showMenu && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#0c1a0d] border border-[rgba(0,166,81,0.2)] rounded-lg shadow-lg overflow-hidden">
              <button
                onClick={() => {
                  setShowMenu(false)
                  signOut({ callbackUrl: '/login' })
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-[#1a2e1b] hover:text-gray-100 transition-colors text-red-400 hover:text-red-300"
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
