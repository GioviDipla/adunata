'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { X, LogIn } from 'lucide-react'

interface AuthRequiredDialogProps {
  open: boolean
  onClose: () => void
  /** Path the user should land on after authenticating. Passed through
   *  `?next=` so they return to the action they tried to perform. */
  redirectAfterLogin: string
  /** Title shown above the message. Defaults to a generic phrasing. */
  title?: string
  /** Body copy describing why the action is gated. */
  message?: string
}

const DEFAULT_TITLE = 'Funzione riservata'
const DEFAULT_MESSAGE = 'Questa funzione è riservata agli utenti registrati Adunata.'

export default function AuthRequiredDialog({
  open,
  onClose,
  redirectAfterLogin,
  title = DEFAULT_TITLE,
  message = DEFAULT_MESSAGE,
}: AuthRequiredDialogProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const loginHref = `/login?next=${encodeURIComponent(redirectAfterLogin)}`

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-required-title"
        className="relative w-full max-w-sm rounded-2xl border border-border bg-bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi"
          className="absolute right-3 top-3 rounded p-1 text-font-muted transition-colors hover:bg-bg-hover hover:text-font-primary"
        >
          <X className="h-4 w-4" />
        </button>
        <h2
          id="auth-required-title"
          className="mb-2 text-base font-bold text-font-primary"
        >
          {title}
        </h2>
        <p className="mb-5 text-sm text-font-secondary">{message}</p>
        <Link
          href={loginHref}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-bg-accent px-4 py-2.5 text-sm font-bold text-font-white transition-colors hover:bg-bg-accent/80"
        >
          <LogIn className="h-4 w-4" />
          Accedi o registrati
        </Link>
      </div>
    </div>
  )
}
