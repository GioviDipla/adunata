'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------
// `auto` follows the OS `prefers-color-scheme` and resolves to `dark`/`light`
// at runtime. Every other id maps 1:1 to a `:root[data-theme="<id>"]` palette
// block in globals.css. Keep this list in sync with that CSS.
export const THEMES = [
  { id: 'auto', label: 'Auto', swatch: '#3B82F6' },
  { id: 'dark', label: 'Dark', swatch: '#121218' },
  { id: 'light', label: 'Light', swatch: '#F5F5F7' },
  { id: 'midnight', label: 'Midnight', swatch: '#080A12' },
  { id: 'sunburned', label: 'Sunburned', swatch: '#F97316' },
  { id: 'blue', label: 'Blue', swatch: '#0D1320' },
  { id: 'yellow', label: 'Yellow', swatch: '#EAB308' },
  { id: 'forest', label: 'Forest', swatch: '#16271D' },
  { id: 'crimson', label: 'Crimson', swatch: '#2E1820' },
  { id: 'sepia', label: 'Sepia', swatch: '#EDE4D3' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export interface Preferences {
  theme: ThemeId
  /** Desktop: when true, left-click and right-click swap roles. */
  invertDesktop: boolean
  /** Mobile: when true, tap and long-press swap roles. */
  invertMobile: boolean
}

const DEFAULT_PREFS: Preferences = {
  theme: 'dark',
  invertDesktop: false,
  invertMobile: false,
}

export const PREFS_STORAGE_KEY = 'adunata:prefs'

interface PreferencesContextType {
  prefs: Preferences
  setTheme: (theme: ThemeId) => void
  setInvertDesktop: (value: boolean) => void
  setInvertMobile: (value: boolean) => void
}

const PreferencesContext = createContext<PreferencesContextType>({
  prefs: DEFAULT_PREFS,
  setTheme: () => {},
  setInvertDesktop: () => {},
  setInvertMobile: () => {},
})

export function usePreferences() {
  return useContext(PreferencesContext)
}

function readStored(): Preferences {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<Preferences>
    return {
      theme:
        parsed.theme && THEMES.some((t) => t.id === parsed.theme)
          ? parsed.theme
          : DEFAULT_PREFS.theme,
      invertDesktop: !!parsed.invertDesktop,
      invertMobile: !!parsed.invertMobile,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

/** Resolve `auto` against the current OS color scheme. */
function resolveTheme(theme: ThemeId): Exclude<ThemeId, 'auto'> {
  if (theme !== 'auto') return theme
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: ThemeId) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = resolveTheme(theme)
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  // Hydrate synchronously from localStorage so the first client render already
  // matches the no-flash <script> in <head> (avoids a flash + state mismatch).
  const [prefs, setPrefs] = useState<Preferences>(readStored)

  // Re-apply on every prefs change (theme attribute on <html>).
  useEffect(() => {
    applyTheme(prefs.theme)
  }, [prefs.theme])

  // When the theme is `auto`, follow live OS scheme changes.
  useEffect(() => {
    if (prefs.theme !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('auto')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [prefs.theme])

  function persist(next: Preferences) {
    setPrefs(next)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* storage full / disabled — ignore */
      }
    }
  }

  const value: PreferencesContextType = {
    prefs,
    setTheme: (theme) => persist({ ...prefs, theme }),
    setInvertDesktop: (invertDesktop) => persist({ ...prefs, invertDesktop }),
    setInvertMobile: (invertMobile) => persist({ ...prefs, invertMobile }),
  }

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  )
}
