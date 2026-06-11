'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function ProtectedAdminRoute({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return

    if (!session || session.user?.role !== 'ADMIN') {
      router.push('/dashboard')
    }
  }, [session, status, router])

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Verificando acceso...</div>
      </div>
    )
  }

  if (!session || session.user?.role !== 'ADMIN') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-red-400 font-semibold mb-2">Acceso denegado</div>
          <div className="text-sm text-gray-500">Solo administradores pueden acceder a esta sección</div>
        </div>
      </div>
    )
  }

  return children
}
