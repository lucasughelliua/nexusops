'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type ColorTheme = 'green' | 'blue' | 'purple' | 'orange'

interface ColorContextType {
  theme: ColorTheme
  setTheme: (theme: ColorTheme) => void
}

const ColorContext = createContext<ColorContextType | undefined>(undefined)

export function ColorProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ColorTheme>('green')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem('colorTheme') as ColorTheme | null
    if (stored && ['green', 'blue', 'purple', 'orange'].includes(stored)) {
      setThemeState(stored)
      document.documentElement.setAttribute('data-color', stored)
    } else {
      document.documentElement.setAttribute('data-color', 'green')
    }
  }, [])

  const setTheme = (newTheme: ColorTheme) => {
    setThemeState(newTheme)
    localStorage.setItem('colorTheme', newTheme)
    document.documentElement.setAttribute('data-color', newTheme)
  }

  if (!mounted) return <>{children}</>

  return (
    <ColorContext.Provider value={{ theme, setTheme }}>
      {children}
    </ColorContext.Provider>
  )
}

export function useColor() {
  const context = useContext(ColorContext)
  if (!context) {
    return { theme: 'green' as ColorTheme, setTheme: () => {} }
  }
  return context
}
