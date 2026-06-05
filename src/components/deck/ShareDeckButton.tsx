'use client'

import { useState } from 'react'
import { Share2, Check } from 'lucide-react'

interface ShareDeckButtonProps {
  deckId: string
  deckName: string
  /** Current visibility. Only the owner can see `private` — visitors
   *  reach this component only on public/unlisted decks (private is
   *  404'd server-side), so the private-confirmation branch is
   *  owner-only. */
  visibility: 'private' | 'unlisted' | 'public'
  isOwner: boolean
  /** Called after the deck was flipped via the share flow (we promote
   *  private decks to unlisted so the recipient can open the link
   *  without the deck appearing in public listings), so the parent can
   *  sync its local state (e.g. the visibility dropdown) without a
   *  round-trip refresh. */
  onVisibilityChanged?: (next: 'unlisted') => void
  /** When true, renders the compact label-less icon variant used in
   *  tight toolbars. */
  compact?: boolean
}

/**
 * Copy / native-share the deck visualizer URL.
 *
 *  - On mobile (`navigator.share` present), opens the OS share sheet.
 *  - Elsewhere falls back to the clipboard with a "Copied" affordance.
 *  - If the owner tries to share a private deck, confirms making it
 *    public first — otherwise the link would 404 for the recipient.
 */
export default function ShareDeckButton({
  deckId,
  deckName,
  visibility,
  isOwner,
  onVisibilityChanged,
  compact = false,
}: ShareDeckButtonProps) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  async function share() {
    if (busy) return
    setBusy(true)
    try {
      if (isOwner && visibility === 'private') {
        const ok = window.confirm(
          `"${deckName}" è privato. Per condividerlo verrà reso "unlisted" (visibile solo a chi ha il link, non listato sul tuo profilo). Procedere?`,
        )
        if (!ok) return
        const res = await fetch(`/api/decks/${deckId}/visibility`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visibility: 'unlisted' }),
        })
        if (!res.ok) return
        onVisibilityChanged?.('unlisted')
      }

      const url = `${window.location.origin}/decks/${deckId}`

      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: deckName, url })
          return
        } catch {
          // User dismissed the native sheet — fall through to clipboard
          // so we don't leave the action feeling like a no-op.
        }
      }

      try {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // Clipboard blocked (insecure context / permissions). The user
        // saw the native sheet attempt; bail silently here.
      }
    } finally {
      setBusy(false)
    }
  }

  const label = copied ? 'Copiato' : 'Condividi'
  const Icon = copied ? Check : Share2

  if (compact) {
    return (
      <button
        type="button"
        onClick={share}
        disabled={busy}
        aria-label={label}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg-surface text-font-secondary transition-colors hover:bg-bg-hover hover:text-font-primary disabled:opacity-60"
      >
        <Icon className="h-3.5 w-3.5" />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={share}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-surface px-3 py-1.5 text-xs font-medium text-font-secondary transition-colors hover:bg-bg-hover disabled:opacity-60"
    >
      <Icon className={`h-3.5 w-3.5 ${copied ? 'text-bg-green' : ''}`} />
      {label}
    </button>
  )
}
