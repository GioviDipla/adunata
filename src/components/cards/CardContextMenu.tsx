'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, Heart, Share2, Loader2, Check } from 'lucide-react'

interface CardContextMenuProps {
  cardName: string
  shareUrl: string
  x: number
  y: number
  liked: boolean
  onAddToDeck: () => void
  onToggleLike: () => Promise<void> | void
  onClose: () => void
}

/**
 * Floating context menu shown on long-press (mobile) or right-click
 * (desktop) over a card in the browser. Positioned near the pointer,
 * clamped inside the viewport, dismissed on outside click or Escape.
 */
export default function CardContextMenu({
  cardName,
  shareUrl,
  x,
  y,
  liked,
  onAddToDeck,
  onToggleLike,
  onClose,
}: CardContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [likeBusy, setLikeBusy] = useState(false)
  const [shareFeedback, setShareFeedback] = useState<null | 'copied'>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [onClose])

  // Clamp position so the menu fits inside the viewport.
  const MENU_W = 220
  const MENU_H = 160
  const pad = 8
  const viewW = typeof window !== 'undefined' ? window.innerWidth : 0
  const viewH = typeof window !== 'undefined' ? window.innerHeight : 0
  const left = Math.min(Math.max(pad, x - MENU_W / 2), viewW - MENU_W - pad)
  const top = Math.min(Math.max(pad, y - MENU_H / 2), viewH - MENU_H - pad)

  const handleLike = async () => {
    if (likeBusy) return
    setLikeBusy(true)
    try {
      await onToggleLike()
    } finally {
      setLikeBusy(false)
    }
  }

  const handleShare = async () => {
    const data: ShareData = { title: cardName, url: shareUrl }
    // Prefer native share sheet when available (mobile + some desktops).
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(data)
        onClose()
        return
      } catch {
        // User cancelled or share failed — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareFeedback('copied')
      setTimeout(() => {
        setShareFeedback(null)
        onClose()
      }, 900)
    } catch {
      onClose()
    }
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions for ${cardName}`}
      className="fixed z-50 w-[220px] rounded-xl border border-border bg-bg-surface p-1.5 shadow-2xl backdrop-blur-xl"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => { onAddToDeck(); onClose() }}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-font-primary transition-colors hover:bg-bg-hover active:bg-bg-hover"
      >
        <Plus size={18} className="shrink-0 text-font-accent" />
        Add to Deck
      </button>

      <button
        type="button"
        onClick={handleLike}
        disabled={likeBusy}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-font-primary transition-colors hover:bg-bg-hover active:bg-bg-hover disabled:opacity-60"
      >
        {likeBusy
          ? <Loader2 size={18} className="shrink-0 animate-spin text-font-muted" />
          : <Heart
              size={18}
              className={`shrink-0 ${liked ? 'fill-red-500 text-red-500' : 'text-font-muted'}`}
            />}
        {liked ? 'Liked' : 'Like'}
      </button>

      <button
        type="button"
        onClick={handleShare}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-font-primary transition-colors hover:bg-bg-hover active:bg-bg-hover"
      >
        {shareFeedback === 'copied'
          ? <Check size={18} className="shrink-0 text-bg-green" />
          : <Share2 size={18} className="shrink-0 text-font-muted" />}
        {shareFeedback === 'copied' ? 'Link copied' : 'Share'}
      </button>
    </div>
  )
}
