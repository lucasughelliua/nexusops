'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
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
  const [collapsed, setCollapsed] = useState(false)

  // Persistir estado en localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved === 'true') setCollapsed(true)
  }, [])

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      localStorage.setItem('sidebar-collapsed', String(!prev))
      return !prev
    })
  }

  const userInitials = session?.user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'
  const userRole = session?.user?.role === 'ADMIN' ? 'Administrador' : 'Usuario'

  return (
    <aside
      className={cn(
        'flex-shrink-0 bg-[#071409] border-r h-screen sticky top-0 flex flex-col overflow-hidden transition-all duration-200',
        collapsed ? 'w-14' : 'w-60'
      )}
      style={{ borderColor: 'color-mix(in srgb, var(--ua-green) 12%, transparent)' }}
    >
      {/* Logo + toggle */}
      <div
        className="px-3 py-4 flex items-center gap-2.5"
        style={{ borderBottom: '1px solid color-mix(in srgb, var(--ua-green) 12%, transparent)' }}
      >
        {/* Logo icon */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
          style={{ backgroundColor: 'var(--ua-green)' }}
        >
          N
        </div>

        {/* Text — hidden when collapsed */}
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 leading-none">NexusOps</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
              Universo Aventura
            </div>
          </div>
        )}

        {/* Toggle button */}
        <button
          onClick={toggleCollapsed}
          className="flex-shrink-0 w-7 h-7 flex flex-col items-center justify-center gap-[5px] rounded-md hover:bg-[#0c1a0d] transition-colors"
          title={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
        >
          <span className="w-4 h-[2px] rounded bg-gray-400" />
          <span className="w-4 h-[2px] rounded bg-gray-400" />
          <span className="w-4 h-[2px] rounded bg-gray-400" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
        {NAV.map(group => (
          <div key={group.section} className="mb-2">
            {/* Section label — hidden when collapsed */}
            {!collapsed && (
              <div className="px-5 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
                {group.section}
              </div>
            )}
            {group.items.map(item => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'relative flex items-center gap-2.5 mx-2 rounded-lg text-sm transition-all',
                    collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2.5',
                    isActive
                      ? 'font-medium'
                      : 'text-gray-400 hover:bg-[#0c1a0d] hover:text-gray-200'
                  )}
                  style={isActive ? {
                    backgroundColor: 'color-mix(in srgb, var(--ua-green) 15%, transparent)',
                    color: 'var(--ua-green-light)',
                  } : undefined}
                >
                  {isActive && !collapsed && (
                    <div className="absolute left-0 w-0.5 h-6 rounded-r" style={{ backgroundColor: 'var(--ua-green)' }} />
                  )}
                  <span className="text-base leading-none">{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {item.badge === 'live' && (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        </span>
                      )}
                    </>
                  )}
                  {collapsed && item.badge === 'live' && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User pill */}
      <div
        className="px-3 py-4 border-t border-[rgba(0,166,81,0.12)] space-y-3"
      >
        {!collapsed && <ColorPicker />}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className={cn(
              'w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-[#0c1a0d] cursor-pointer transition-colors',
              collapsed && 'justify-center px-0'
            )}
            title={collapsed ? session?.user?.name || 'Usuario' : undefined}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: 'var(--ua-green-dark)' }}
            >
              {userInitials}
            </div>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-200 truncate">{session?.user?.name || 'Usuario'}</div>
                  <div className="text-[10px] text-gray-500">{userRole}</div>
                </div>
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--ua-green)' }} />
              </>
            )}
          </button>

          {showMenu && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#0c1a0d] border border-[rgba(0,166,81,0.2)] rounded-lg shadow-lg overflow-hidden">
              <button
                onClick={() => {
                  setShowMenu(false)
                  signOut({ callbackUrl: '/login' })
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-[#1a2e1b] hover:text-red-300 transition-colors"
              >
                {collapsed ? '→' : 'Cerrar sesión'}
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
