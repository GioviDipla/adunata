'use client'

import { useEffect, useState } from 'react'
import {
  Sparkles,
  Palette,
  MousePointerClick,
  ArrowLeft,
  ArrowRight,
  Check,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ThemePicker from './ThemePicker'
import GestureControls from './GestureControls'

const FLAG_PREFIX = 'adunata:onboarded:'

/**
 * First-login setup wizard. Shows once per (user, device): keyed by user id in
 * localStorage so each account gets the walkthrough the first time it signs in
 * on a given browser. Lets the user pick their theme and control scheme with
 * inline examples; the choices are saved live via PreferencesProvider, so even
 * skipping leaves sensible defaults in place.
 */
export default function OnboardingWizard() {
  const [userId, setUserId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      const id = data.user?.id
      if (!id) return
      try {
        if (localStorage.getItem(FLAG_PREFIX + id)) return
      } catch {
        return
      }
      setUserId(id)
      setOpen(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function finish() {
    if (userId) {
      try {
        localStorage.setItem(FLAG_PREFIX + userId, '1')
      } catch {
        /* storage disabled — wizard simply reappears next load */
      }
    }
    setOpen(false)
  }

  if (!open) return null

  const STEPS = [
    {
      icon: Sparkles,
      title: 'Benvenuto su Adunata!!!',
      body: (
        <div className="space-y-3 text-sm leading-relaxed text-font-secondary">
          <p>
            Prima di iniziare, due impostazioni rapide per cucire l&apos;app sul tuo
            modo di giocare. Puoi sempre cambiarle dopo, dal tuo{' '}
            <span className="font-medium text-font-primary">Profilo</span> o dalla
            pagina <span className="font-medium text-font-primary">Leggi qui</span>.
          </p>
          <p>
            Le preferenze restano salvate su questo dispositivo, anche dopo il
            logout.
          </p>
        </div>
      ),
    },
    {
      icon: Palette,
      title: 'Scegli il tema',
      body: (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-font-secondary">
            L&apos;aspetto dell&apos;interfaccia. <strong>Auto</strong> segue il
            sistema (chiaro/scuro), oppure scegli una delle tinte. Tocca per
            vedere subito l&apos;anteprima dal vivo.
          </p>
          <ThemePicker />
        </div>
      ),
    },
    {
      icon: MousePointerClick,
      title: 'I tuoi controlli',
      body: (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-font-secondary">
            Nelle aree mazzo: <strong>tap/click</strong> = azione rapida,{' '}
            <strong>long-press</strong> (mobile) o <strong>tasto destro</strong>{' '}
            (desktop) = anteprima + azioni. Se preferisci, inverti i gesti — la
            tabella qui sotto si aggiorna in tempo reale per mostrare la tua
            configurazione.
          </p>
          <GestureControls />
        </div>
      ),
    },
  ]

  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-accent/10 text-font-accent">
            <Icon className="h-5 w-5" />
          </span>
          <h2 className="flex-1 text-lg font-semibold text-font-primary">
            {current.title}
          </h2>
          <button
            type="button"
            onClick={finish}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-font-muted transition-colors hover:bg-bg-hover hover:text-font-primary"
            aria-label="Salta e chiudi"
            title="Salta"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">{current.body}</div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-5 bg-bg-accent' : 'w-1.5 bg-bg-cell'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm font-medium text-font-secondary transition-colors hover:bg-bg-hover"
              >
                <ArrowLeft className="h-4 w-4" />
                Indietro
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                onClick={finish}
                className="inline-flex items-center gap-1.5 rounded-lg bg-bg-accent px-4 py-2 text-sm font-medium text-font-white transition-colors hover:bg-bg-accent-dark"
              >
                <Check className="h-4 w-4" />
                Fine
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-bg-accent px-4 py-2 text-sm font-medium text-font-white transition-colors hover:bg-bg-accent-dark"
              >
                Avanti
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
