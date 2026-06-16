'use client'

import { useColor } from '@/lib/color-context'
import { useState, useEffect } from 'react'

const COLORS = [
  { key: 'green', hex: '#00A651' },
  { key: 'blue', hex: '#0066CC' },
  { key: 'purple', hex: '#7C3AED' },
  { key: 'orange', hex: '#F97316' },
]

export default function ColorPicker() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useColor()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <div className="flex items-center gap-1.5 justify-center px-2 py-2">
      {COLORS.map(c => (
        <button
          key={c.key}
          onClick={() => setTheme(c.key as any)}
          className={`w-5 h-5 rounded-full transition-all ${
            theme === c.key
              ? 'ring-2 ring-gray-300 ring-offset-2 ring-offset-[#071409]'
              : 'hover:opacity-80'
          }`}
          style={{ backgroundColor: c.hex }}
          title={c.key}
        />
      ))}
    </div>
  )
}
