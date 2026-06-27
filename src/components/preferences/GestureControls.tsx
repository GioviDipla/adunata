'use client'

import { useState } from 'react'
import { MousePointerClick, Eye } from 'lucide-react'
import { usePreferences } from '@/lib/contexts/PreferencesContext'
import { useCardGestures } from '@/lib/hooks/useCardGestures'

/**
 * Interactive sandbox: a sample card that reacts to the real gestures
 * (tap/click, long-press/right-click) through useCardGestures, so the user
 * can feel their current configuration. The feedback re-labels itself with the
 * active inversion, matching the explanation table above.
 */
function GestureTester() {
  const [last, setLast] = useState<'primary' | 'secondary' | null>(null)
  const { getHandlers } = useCardGestures()
  const handlers = getHandlers({
    onPrimary: () => setLast('primary'),
    onSecondary: () => setLast('secondary'),
  })

  return (
    <div className="rounded-lg border border-border bg-bg-surface p-3">
      <p className="mb-2 text-xs font-medium text-font-secondary">
        Prova i controlli
      </p>
      <div
        {...handlers}
        className="flex aspect-[16/9] cursor-pointer select-none items-center justify-center rounded-lg border border-dashed border-border-light bg-bg-cell/50 p-4 text-center transition-colors hover:bg-bg-cell"
      >
        {last === null ? (
          <span className="text-xs text-font-muted">
            Tocca / clicca, oppure long-press / tasto destro qui sopra
          </span>
        ) : last === 'primary' ? (
          <span className="flex items-center gap-2 text-sm font-semibold text-font-accent">
            <MousePointerClick className="h-4 w-4" /> Azione rapida
          </span>
        ) : (
          <span className="flex items-center gap-2 text-sm font-semibold text-bg-yellow">
            <Eye className="h-4 w-4" /> Anteprima + menu
          </span>
        )}
      </div>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-bg-surface px-3 py-2.5 text-left transition-colors hover:border-border-light"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-font-primary">{label}</span>
        <span className="block text-xs text-font-muted">{hint}</span>
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-bg-accent' : 'bg-bg-cell'
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  )
}

/**
 * Control-customization panel for the deck areas (builder / viewer / browser).
 * Two independent toggles invert the desktop click roles and the mobile
 * tap/long-press roles; the explanation table below re-labels itself live to
 * match the user's choice. Shared between /about and /profile.
 */
export default function GestureControls() {
  const { prefs, setInvertDesktop, setInvertMobile, setGridHoverZoom } =
    usePreferences()
  const { invertDesktop, invertMobile, gridHoverZoom } = prefs

  // Default desktop: left-click = quick, right-click = preview.
  // Default mobile:  tap        = quick, long-press = preview.
  const quickDesktop = invertDesktop ? 'Tasto destro' : 'Click sinistro'
  const previewDesktop = invertDesktop ? 'Click sinistro' : 'Tasto destro'
  const quickMobile = invertMobile ? 'Long-press (~500ms)' : 'Tap'
  const previewMobile = invertMobile ? 'Tap' : 'Long-press (~500ms)'

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle
          checked={invertDesktop}
          onChange={setInvertDesktop}
          label="Inverti click desktop"
          hint="Scambia sinistro e destro"
        />
        <Toggle
          checked={invertMobile}
          onChange={setInvertMobile}
          label="Inverti gesti mobile"
          hint="Scambia tap e long-press"
        />
        <Toggle
          checked={gridHoverZoom}
          onChange={setGridHoverZoom}
          label="Anteprima al passaggio mouse"
          hint="Ingrandimento carta in grid view (desktop)"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-bg-cell">
            <tr>
              <th className="px-3 py-2 font-semibold text-font-secondary">Azione</th>
              <th className="px-3 py-2 font-semibold text-font-secondary">Desktop</th>
              <th className="px-3 py-2 font-semibold text-font-secondary">Mobile</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            <tr>
              <td className="px-3 py-2 text-font-primary">
                Gioca / tappa / aggiungi al deck
              </td>
              <td className="px-3 py-2 text-font-secondary">{quickDesktop}</td>
              <td className="px-3 py-2 text-font-secondary">{quickMobile}</td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-font-primary">
                Anteprima carta + azioni contestuali
              </td>
              <td className="px-3 py-2 text-font-secondary">{previewDesktop}</td>
              <td className="px-3 py-2 text-font-secondary">{previewMobile}</td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-font-primary">Scorrere liste</td>
              <td className="px-3 py-2 text-font-secondary">Rotella / trackpad</td>
              <td className="px-3 py-2 text-font-secondary">Swipe</td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-font-primary">Uscire da una modale</td>
              <td className="px-3 py-2 text-font-secondary">Esc o click sullo sfondo</td>
              <td className="px-3 py-2 text-font-secondary">Tap sullo sfondo</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-font-muted">
        {invertDesktop || invertMobile
          ? 'Controlli personalizzati attivi: la tabella sopra riflette i tuoi gesti. Le impostazioni valgono nel deck builder, viewer e nel browser carte.'
          : 'Stessa regola ovunque nelle aree deck: tap/click per l’azione rapida, long-press (mobile) o tasto destro (desktop) per l’anteprima con le azioni contestuali.'}
      </p>

      <GestureTester />
    </div>
  )
}
