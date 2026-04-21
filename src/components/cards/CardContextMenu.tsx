'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Heart, Share2, Loader2, Check, ChevronLeft } from 'lucide-react'

interface DeckSummary {
  id: string
  name: string
  format: string
}

interface CardContextMenuProps {
  cardId: string | number
  cardName: string
  shareUrl: string
  x: number
  y: number
  liked: boolean
  userDecks: DeckSummary[]
  onToggleLike: () => Promise<void> | void
  onClose: () => void
}

/**
 * Floating context menu shown on long-press (mobile) or right-click
 * (desktop) over a card in the browser. Positioned near the pointer,
 * clamped inside the viewport, dismissed on outside click or Escape.
 *
 * When the user taps "Add to Deck" the menu swaps its contents in-place
 * for a scrollable deck picker — no full-screen modal, no context switch.
 */
export default function CardContextMenu({
  cardId,
  cardName,
  shareUrl,
  x,
  y,
  liked,
  userDecks,
  onToggleLike,
  onClose,
}: CardContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [likeBusy, setLikeBusy] = useState(false)
  const [shareFeedback, setShareFeedback] = useState<null | 'copied'>(null)
  const [mode, setMode] = useState<'menu' | 'decks'>('menu')
  const [addingToDeckId, setAddingToDeckId] = useState<string | null>(null)
  const [addedToDeckId, setAddedToDeckId] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // If inside the deck picker, escape steps back to the main menu
        // first — the user's "back" expectation before actually closing.
        if (mode === 'decks') setMode('menu')
        else onClose()
      }
    }
    document.addEventListener('keydown', onKey)

    // Lock body scroll while the menu is open so a stray touch-scroll on
    // mobile can't drag the page behind — which used to visually detach
    // the floating panel from the buttons the user was trying to tap.
    // Pure CSS lock; the menu stays a floating context menu, not a sheet.
    const { body } = document
    const prevOverflow = body.style.overflow
    const prevPaddingRight = body.style.paddingRight
    const scrollbarGap = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (scrollbarGap > 0) body.style.paddingRight = `${scrollbarGap}px`

    return () => {
      document.removeEventListener('keydown', onKey)
      body.style.overflow = prevOverflow
      body.style.paddingRight = prevPaddingRight
    }
  }, [onClose, mode])

  // Clamp position so the menu fits inside the viewport. The deck picker
  // reserves more vertical space so long deck lists don't get clipped.
  const MENU_W = 240
  const MENU_H = mode === 'decks' ? 280 : 160
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

  const addToDeck = async (deckId: string) => {
    if (addingToDeckId) return
    setAddingToDeckId(deckId)
    try {
      const res = await fetch(`/api/decks/${deckId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_id: cardId, quantity: 1, board: 'main' }),
      })
      if (res.ok) {
        setAddedToDeckId(deckId)
        // Short success tick, then close the menu entirely.
        setTimeout(onClose, 700)
      }
    } catch {
      /* ignore — menu stays open so user can retry */
    } finally {
      setAddingToDeckId(null)
    }
  }

  if (typeof document === 'undefined') return null

  // Portal into document.body so no ancestor (backdrop-filter, transform,
  // filter, etc.) can become the containing block for our `fixed` nodes.
  // That was the root of the "popup is offset upward after the user
  // scrolls down" bug: any ancestor that promotes itself to a containing
  // block re-anchors fixed descendants to itself instead of the viewport,
  // so once the ancestor scrolls off-screen the popup goes with it.
  return createPortal(
    <>
      {/* Invisible backdrop — captures outside clicks and any scroll/touch-scroll
       *  without ever reaching the CardItem underneath, so clicking another card
       *  or starting to scroll just closes the menu. */}
      <div
        className="fixed inset-0 z-40"
        onMouseDown={onClose}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose() }}
        onContextMenu={(e) => { e.preventDefault(); onClose() }}
        onWheel={onClose}
        onTouchStart={onClose}
        onTouchMove={onClose}
      />
      <div
        ref={ref}
        role="menu"
        aria-label={`Actions for ${cardName}`}
        className="fixed z-50 w-[240px] rounded-xl border border-border bg-bg-surface p-1.5 shadow-2xl backdrop-blur-xl"
        style={{ left, top }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {mode === 'menu' && (
          <>
            <button
              type="button"
              onClick={() => setMode('decks')}
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
          </>
        )}

        {mode === 'decks' && (
          <div className="flex max-h-64 flex-col">
            <div className="flex items-center gap-1 px-1 py-0.5">
              <button
                type="button"
                onClick={() => setMode('menu')}
                aria-label="Back to actions"
                className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-font-muted transition-colors hover:bg-bg-hover hover:text-font-primary"
              >
                <ChevronLeft size={14} />
                Back
              </button>
              <span className="ml-auto pr-2 text-[11px] font-semibold uppercase tracking-wider text-font-muted">
                Pick a deck
              </span>
            </div>

            <div className="mt-1 flex-1 overflow-y-auto overscroll-contain">
              {userDecks.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-font-muted">
                  No decks yet. Create one first.
                </div>
              ) : (
                userDecks.map((deck) => {
                  const isAdding = addingToDeckId === deck.id
                  const isAdded = addedToDeckId === deck.id
                  return (
                    <button
                      key={deck.id}
                      type="button"
                      onClick={() => addToDeck(deck.id)}
                      disabled={isAdding || addedToDeckId != null}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-bg-hover disabled:opacity-60"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-font-primary">{deck.name}</div>
                        <div className="text-[10px] text-font-muted">{deck.format}</div>
                      </div>
                      {isAdding && (
                        <Loader2 size={14} className="shrink-0 animate-spin text-font-muted" />
                      )}
                      {isAdded && (
                        <Check size={14} className="shrink-0 text-bg-green" />
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>
    </>,
    document.body,
  )
}
