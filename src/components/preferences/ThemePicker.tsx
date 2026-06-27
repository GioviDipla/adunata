'use client'

import { Check } from 'lucide-react'
import { THEMES, usePreferences } from '@/lib/contexts/PreferencesContext'

/**
 * Theme selector — a grid of swatches. Reads and writes the persisted
 * preference; the change applies instantly via PreferencesProvider.
 */
export default function ThemePicker() {
  const { prefs, setTheme } = usePreferences()

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {THEMES.map((t) => {
        const active = prefs.theme === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            aria-pressed={active}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
              active
                ? 'border-bg-accent bg-bg-accent/10 text-font-primary'
                : 'border-border bg-bg-surface text-font-secondary hover:border-border-light hover:text-font-primary'
            }`}
          >
            <span
              className="h-5 w-5 shrink-0 rounded-full ring-1 ring-white/15"
              style={{ background: t.swatch }}
              aria-hidden="true"
            />
            <span className="flex-1 truncate font-medium">{t.label}</span>
            {active && <Check className="h-4 w-4 shrink-0 text-font-accent" />}
          </button>
        )
      })}
    </div>
  )
}
