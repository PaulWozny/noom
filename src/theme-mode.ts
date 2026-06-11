import { create } from 'zustand'

// Light/dark mode. The initial class is applied pre-paint by an inline script
// in index.html (same key/logic) to avoid a theme flash; this store keeps the
// React side (React Flow colorMode, MiniMap colors) in sync.
const STORAGE_KEY = 'lunar-roadmap:theme'

export type ThemeMode = 'dark' | 'light'

function initialMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export const useThemeMode = create<{ mode: ThemeMode; toggle: () => void }>(set => ({
  mode: initialMode(),
  toggle: () => set(s => {
    const mode: ThemeMode = s.mode === 'dark' ? 'light' : 'dark'
    localStorage.setItem(STORAGE_KEY, mode)
    return { mode }
  }),
}))
