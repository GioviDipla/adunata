'use client'

import { useState } from 'react'
import { MousePointerClick, Eye } from 'lucide-react'
import { usePreferences } from '@/lib/contexts/PreferencesContext'
import { useCardGestures } from '@/lib/hooks/useCardGestures'

// Three real example cards, one per deck-area surface. Images come from
// Scryfall's named-card image endpoint (302-redirects to the art), so no
// hard-coded CDN hashes that could rot on a new printing.
const SAMPLE_CARDS: { surface: string; name: string; image: string }[] = [
  {
    surface: 'Deck Builder',
    name: 'Llanowar Elves',
    image:
      'https://api.scryfall.com/cards/named?exact=Llanowar%20Elves&format=image&version=normal',
  },
  {
    surface: 'Deck Viewer',
    name: 'Krenko, Mob Boss',
    image:
      'https://api.scryfall.com/cards/named?exact=Krenko%2C%20Mob%20Boss&format=image&version=normal',
  },
  {
    surface: 'Cards search',
    name: 'Emrakul, the Aeons Torn',
    image:
      'https://api.scryfall.com/cards/named?exact=Emrakul%2C%20the%20Aeons%20Torn&format=image&version=normal',
  },
]

// Mock quick-action menu items per surface — purely illustrative, so the user
// sees what the "quick action" opens on each deck-area screen.
const QUICK_ACTIONS: Record<string, string[]> = {
  'Deck Builder': ['Aggiungi al deck', 'Imposta comandante', 'Sposta in sideboard'],
  'Deck Viewer': ['Apri dettaglio carta', 'Stampe alternative', 'Aggiungi al deck'],
  'Cards search': ['Aggiungi al deck', 'Metti like', 'Condividi'],
}

/**
 * A single interactive sample card wired through useCardGestures. The real
 * gestures (tap/click, long-press/right-click) trigger the real effects so the
 * user sees them: the quick action opens a mock context menu, the preview
 * gesture opens the enlarged card. Reflects the live inversion settings.
 */
function SampleCard({
  surface,
  name,
  image,
}: {
  surface: string
  name: string
  image: string
}) {
  const [mode, setMode] = useState<'idle' | 'menu' | 'preview'>('idle')
  const { getHandlers } = useCardGestures()
  const handlers = getHandlers({
    onPrimary: () => setMode('menu'),
    onSecondary: () => setMode('preview'),
  })

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-font-muted">
        {surface}
      </span>
      <div
        {...handlers}
        className="group relative cursor-pointer select-none overflow-hidden rounded-lg ring-1 ring-border transition-all hover:ring-border-light"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={name}
          loading="lazy"
          draggable={false}
          className="aspect-[488/680] w-full object-cover"
        />

        {/* Quick action = mock context menu over the card */}
        {mode === 'menu' && (
          <div
            className="absolute inset-0 flex flex-col justify-center gap-1 bg-bg-dark/85 p-2 backdrop-blur-sm"
            onClick={(e) => {
              e.stopPropagation()
              setMode('idle')
            }}
          >
            <span className="mb-1 flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-font-accent">
              <MousePointerClick className="h-3 w-3" /> Azione rapida
            </span>
            {QUICK_ACTIONS[surface]?.map((label) => (
              <span
                key={label}
                className="truncate rounded bg-bg-cell px-2 py-1 text-center text-[11px] text-font-primary"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Preview = enlarged card, viewport-centered overlay */}
      {mode === 'preview' && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setMode('idle')}
        >
          <div className="flex flex-col items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-bg-yellow">
              <Eye className="h-4 w-4" /> Anteprima
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt={name}
              draggable={false}
              className="max-h-[70vh] w-auto rounded-xl shadow-2xl"
            />
            <span className="text-xs text-font-secondary">{name}</span>
            <span className="text-[11px] text-font-muted">Tocca per chiudere</span>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Interactive sandbox: three sample cards, one per deck-area surface, that the
 * user can poke to feel their current control configuration.
 */
function GestureTester() {
  return (
    <div className="rounded-lg border border-border bg-bg-surface p-3">
      <p className="text-xs font-medium text-font-secondary">Prova i controlli</p>
      <p className="mb-2.5 text-[11px] text-font-muted">
        Azione rapida → menu contestuale · Anteprima → carta ingrandita
      </p>
      <div className="grid grid-cols-3 gap-2.5">
        {SAMPLE_CARDS.map((c) => (
          <SampleCard key={c.name} {...c} />
        ))}
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
