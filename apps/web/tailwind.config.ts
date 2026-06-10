import type { Config } from 'tailwindcss'

export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      black: '#000',
      white: '#fff',
      slate: {
        50: '#f8fafc',
        100: '#f1f5f9',
        200: '#e2e8f0',
        300: '#cbd5e1',
        400: '#94a3b8',
        500: '#64748b',
        600: '#475569',
        700: '#334155',
        800: '#1e293b',
        900: '#0f172a',
      },
      gray: {
        50: '#f9fafb',
        100: '#f3f4f6',
        200: '#e5e7eb',
        300: '#d1d5db',
        400: '#9ca3af',
        500: '#6b7280',
        600: '#4b5563',
        700: '#374151',
        800: '#1f2937',
        900: '#111827',
      },
      red: {
        500: '#ef4444',
      },
      emerald: {
        400: '#34d399',
      },
      ua: {
        green: '#00A651',
        'green-dark': '#007A3D',
        'green-light': '#00C65E',
        navy: '#070D17',
        'bg-dark': '#040c05',
        'bg-mid': '#071409',
        'bg-card': '#0c1a0d',
      },
    },
    fontFamily: {
      sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
      mono: ['var(--font-dm-mono)', 'monospace'],
    },
  },
  plugins: [],
} as Config
