'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { X, Plus, ChevronDown, Loader2, Check, ExternalLink, Heart, Share2, Library } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CARD_DETAIL_COLUMNS } from '@/lib/supabase/columns'
import type { Database } from '@/types/supabase'
import ManaCost from './ManaCost'

type Card = Database['public']['Tables']['cards']['Row']

interface CardFace {
  name?: string
  mana_cost?: string
  type_line?: string
  oracle_text?: string
  /** Scryfall stores per-face images under image_uris. Older mapping
      used a flattened `image_normal` — keep both for compatibility. */
  image_uris?: { small?: string; normal?: string; large?: string }
  image_normal?: string
  power?: string
  toughness?: string
}

/**
 * Build a Cardmarket product URL for a specific printing.
 * Real format: /it/Magic/Products/Singles/{Set-Slug}/{Card-Slug}
 * Example: "Emeritus of Ideation // Ancestral Recall" in "Secrets of Strixhaven"
 *   → .../Products/Singles/Secrets-of-Strixhaven/Emeritus-of-Ideation-Ancestral-Recall
 * Double-faced cards keep both faces joined (the `//` is treated as whitespace).
 * Without a set, fall back to Cardmarket's search so the link still resolves.
 */
function cardmarketUrl(card: { name: string; set_name?: string | null }): string {
  const slugify = (s: string) =>
    s
      .replace(/[,'":!?.()]/g, '')
      .replace(/\s*\/\/\s*/g, ' ')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')

  const cardSlug = slugify(card.name)
  if (card.set_name) {
    return `https://www.cardmarket.com/it/Magic/Products/Singles/${slugify(card.set_name)}/${cardSlug}`
  }
  return `https://www.cardmarket.com/it/Magic/Products/Search?searchString=${encodeURIComponent(card.name)}`
}

const LEGALITY_COLORS: Record<string, string> = {
  legal: 'bg-bg-green/20 text-bg-green',
  not_legal: 'bg-bg-cell text-font-muted',
  banned: 'bg-bg-red/20 text-bg-red',
  restricted: 'bg-bg-yellow/20 text-bg-yellow',
}

interface DeckSummary {
  id: string
  name: string
  format: string
}

interface CardDetailProps {
  card: Card
  onClose: () => void
  onPrintingSelect?: (printing: Card) => void
  /** If provided, called after adding card to a deck (for local state update in deck editor) */
  onAddToDeck?: (card: Card) => void
  /** Pre-fetched user decks (server-rendered). If omitted, falls back to client fetch. */
  userDecks?: DeckSummary[]
}

export default function CardDetail({ card, onClose, onPrintingSelect, onAddToDeck, userDecks }: CardDetailProps) {
  const [displayCard, setDisplayCard] = useState<Card>(card)
  const [printings, setPrintings] = useState<Card[]>([])
  const [loadingPrintings, setLoadingPrintings] = useState(false)
  const [showPrintings, setShowPrintings] = useState(false)

  // Add to deck state — prefer pre-fetched decks from parent (server-rendered, instant).
  const [showDeckPicker, setShowDeckPicker] = useState(false)
  const [myDecks, setMyDecks] = useState<DeckSummary[]>(userDecks ?? [])
  const [loadingDecks, setLoadingDecks] = useState(false)
  const [addedToDeckId, setAddedToDeckId] = useState<string | null>(null)
  const [addingToDeck, setAddingToDeck] = useState<string | null>(null)

  // Like + Share state — the modal fetches its own "liked" status so it works
  // everywhere it's embedded (card browser, deck editor, deck view, deep link)
  // without the parent having to thread state through.
  const [liked, setLiked] = useState(false)
  const [likeBusy, setLikeBusy] = useState(false)
  const [shareFeedback, setShareFeedback] = useState<null | 'copied'>(null)

  // Add to collection state
  const [addingToCollection, setAddingToCollection] = useState(false)
  const [addedToCollection, setAddedToCollection] = useState(false)

  // Scroll container ref — used by the swipe-down-to-close gesture so we only
  // trigger the dismiss when the sheet is already scrolled to the top (i.e.
  // the user isn't mid-scroll of the card body).
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const dragStartRef = useRef<{ y: number; atTop: boolean } | null>(null)
  const [dragDelta, setDragDelta] = useState(0)

  // Lock body scroll + close on Escape while the modal is mounted. Without
  // the scroll lock, touch-scrolling inside the modal on mobile ends up
  // scrolling the page underneath (the classic "rubber-band" leak) which
  // offsets the backdrop and leaves the action buttons out of reach.
  useEffect(() => {
    const { body } = document
    const prevOverflow = body.style.overflow
    const prevPaddingRight = body.style.paddingRight
    const scrollbarGap = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (scrollbarGap > 0) body.style.paddingRight = `${scrollbarGap}px`

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)

    return () => {
      body.style.overflow = prevOverflow
      body.style.paddingRight = prevPaddingRight
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Swipe-down-to-close — only engages when the scroll area is at the top,
  // so internal scrolling still works. Threshold 80px or 25% of sheet
  // height, whichever is smaller.
  const onTouchStart = (e: React.TouchEvent) => {
    const el = scrollRef.current
    if (!el) return
    dragStartRef.current = { y: e.touches[0].clientY, atTop: el.scrollTop <= 0 }
    setDragDelta(0)
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const start = dragStartRef.current
    if (!start || !start.atTop) return
    const dy = e.touches[0].clientY - start.y
    if (dy > 0) setDragDelta(dy)
  }
  const onTouchEnd = () => {
    const start = dragStartRef.current
    dragStartRef.current = null
    const threshold = Math.min(80, (scrollRef.current?.clientHeight ?? 600) * 0.25)
    if (start?.atTop && dragDelta > threshold) {
      onClose()
      return
    }
    setDragDelta(0)
  }

  const legalities = displayCard.legalities as Record<string, string> | null
  const cardFaces = displayCard.card_faces as CardFace[] | null
  const isDoubleFaced = cardFaces && cardFaces.length > 1

  // Reset when card prop changes; lazily hydrate heavy fields
  // (oracle_text, legalities, card_faces, power, toughness, set_name,
  // collector_number, prices_eur*, prices_usd_foil) only when the
  // detail modal actually opens — the grid query omits them.
  useEffect(() => {
    setDisplayCard(card)
    setPrintings([])
    setShowPrintings(false)

    if (card.legalities !== undefined) return
    let aborted = false
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('cards')
        .select(CARD_DETAIL_COLUMNS)
        .eq('id', card.id)
        .single()
      if (aborted || !data) return
      setDisplayCard(data as Card)
    })()
    return () => { aborted = true }
  }, [card])

  // Fetch the current liked status from Supabase directly (RLS filters by user).
  // Re-run whenever the displayed card changes (user cycles printings).
  useEffect(() => {
    let aborted = false
    ;(async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user || aborted) return
      const { data } = await supabase
        .from('card_likes')
        .select('user_id')
        .eq('user_id', session.user.id)
        .eq('card_id', String(displayCard.id))
        .maybeSingle()
      if (aborted) return
      setLiked(data != null)
    })()
    return () => { aborted = true }
  }, [displayCard.id])

  const handleToggleLike = async () => {
    if (likeBusy) return
    const prev = liked
    setLikeBusy(true)
    setLiked(!prev) // optimistic
    try {
      const res = await fetch(`/api/cards/${displayCard.id}/like`, { method: 'POST' })
      if (!res.ok) throw new Error('like failed')
      const payload = (await res.json()) as { liked: boolean }
      setLiked(payload.liked)
    } catch {
      setLiked(prev) // rollback
    } finally {
      setLikeBusy(false)
    }
  }

  const handleShare = async () => {
    const shareUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/cards?open=${displayCard.id}`
        : `/cards?open=${displayCard.id}`
    const data: ShareData = { title: displayCard.name, url: shareUrl }
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(data)
        return
      } catch {
        // User cancelled or share sheet failed — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareFeedback('copied')
      setTimeout(() => setShareFeedback(null), 1400)
    } catch {
      /* clipboard unavailable — give up silently */
    }
  }

  // Fallback: if parent didn't pre-fetch (e.g. CardDetail used outside /cards),
  // load decks on mount using getSession() — no JWT round-trip.
  useEffect(() => {
    if (userDecks !== undefined) return
    let aborted = false
    const supabase = createClient()
    setLoadingDecks(true)
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user || aborted) {
        if (!aborted) setLoadingDecks(false)
        return
      }
      const { data } = await supabase
        .from('decks')
        .select('id, name, format')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
      if (aborted) return
      setMyDecks((data as DeckSummary[]) ?? [])
      setLoadingDecks(false)
    })()
    return () => { aborted = true }
  }, [userDecks])

  async function loadPrintings() {
    if (printings.length > 0) {
      setShowPrintings(!showPrintings)
      return
    }

    setLoadingPrintings(true)
    try {
      const res = await fetch(`/api/cards/printings?name=${encodeURIComponent(card.name)}`)
      if (res.ok) {
        const data = await res.json()
        setPrintings(data.printings ?? [])
        setShowPrintings(true)
      }
    } catch {
      // silently fail
    }
    setLoadingPrintings(false)
  }

  function selectPrinting(printing: Card) {
    setDisplayCard(printing)
    setShowPrintings(false)
    onPrintingSelect?.(printing)
  }

  function toggleDeckPicker() {
    setShowDeckPicker((v) => !v)
  }

  async function addCardToDeck(deckId: string) {
    setAddingToDeck(deckId)
    try {
      const res = await fetch(`/api/decks/${deckId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_id: displayCard.id, quantity: 1, board: 'main' }),
      })
      if (res.ok) {
        setAddedToDeckId(deckId)
        onAddToDeck?.(displayCard)
        setTimeout(() => setAddedToDeckId(null), 1500)
      }
    } catch { /* ignore */ }
    setAddingToDeck(null)
  }

  async function addToCollection() {
    if (addingToCollection) return
    setAddingToCollection(true)
    try {
      const res = await fetch('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_id: displayCard.id, quantity: 1 }),
      })
      if (res.ok) {
        setAddedToCollection(true)
        setTimeout(() => setAddedToCollection(false), 1800)
      }
    } catch { /* ignore */ }
    setAddingToCollection(false)
  }

  if (typeof document === 'undefined') return null

  // Portal into document.body so the sheet's `fixed` positioning is always
  // anchored to the viewport. Any ancestor with backdrop-filter / transform /
  // filter / will-change would otherwise become the containing block and
  // carry the sheet off-screen when the page is scrolled.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop — tappable top/bottom strips are guaranteed by the sheet
       *  taking at most 85vh on mobile and sitting flush to the bottom, so
       *  there is always a visible backdrop area above the sheet to tap. */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal sheet */}
      <div
        ref={scrollRef}
        className="relative z-10 flex w-full max-w-3xl max-h-[85vh] sm:max-h-[90vh] flex-col overflow-y-auto overscroll-contain rounded-t-2xl sm:rounded-xl bg-bg-surface border border-border shadow-2xl transition-transform duration-150 ease-out"
        style={{
          transform: dragDelta > 0 ? `translateY(${dragDelta}px)` : undefined,
          touchAction: 'pan-y',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {/* Drag handle — mobile-only affordance for swipe-down-to-close */}
        <div className="flex justify-center pt-2 pb-1 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-bg-surface border-b border-border">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-font-primary">{displayCard.name}</h2>
            <ManaCost manaCost={displayCard.mana_cost} size="md" />
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bg-hover text-font-muted hover:text-font-primary transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Image(s) */}
            <div className="shrink-0 flex flex-col gap-3">
              <div className="flex gap-3">
                {isDoubleFaced ? (
                  cardFaces.map((face, i) => {
                    const src =
                      face.image_uris?.normal ||
                      face.image_uris?.large ||
                      face.image_uris?.small ||
                      face.image_normal ||
                      // Only fall back to the top-level image for the front (index 0)
                      // — using it for index 1 would show the same face twice.
                      (i === 0 ? displayCard.image_normal : '') ||
                      ''
                    return src ? (
                      <Image
                        key={i}
                        src={src}
                        alt={face.name || displayCard.name}
                        width={224}
                        height={312}
                        className="w-56 h-auto rounded-lg shadow-lg"
                        priority
                      />
                    ) : null
                  })
                ) : (
                  (displayCard.image_normal || displayCard.image_small) && (
                    <Image
                      src={displayCard.image_normal || displayCard.image_small || ''}
                      alt={displayCard.name}
                      width={224}
                      height={312}
                      className="w-56 h-auto rounded-lg shadow-lg"
                      priority
                    />
                  )
                )}
              </div>

              {/* Printings selector button */}
              <button
                onClick={loadPrintings}
                disabled={loadingPrintings}
                className="flex items-center justify-center gap-2 rounded-lg border border-border bg-bg-card px-3 py-2 text-sm text-font-secondary transition-colors hover:bg-bg-hover hover:text-font-primary"
              >
                {loadingPrintings ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronDown className={`h-4 w-4 transition-transform ${showPrintings ? 'rotate-180' : ''}`} />
                )}
                {displayCard.set_name} ({displayCard.set_code?.toUpperCase()})
              </button>

              {/* Printings dropdown */}
              {showPrintings && printings.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-bg-card">
                  {printings.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => selectPrinting(p)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-hover ${
                        p.id === displayCard.id ? 'bg-bg-accent/10 text-font-accent' : 'text-font-secondary'
                      }`}
                    >
                      {p.image_small && (
                        <Image
                          src={p.image_small}
                          alt={p.set_name ?? ''}
                          width={29}
                          height={40}
                          className="h-8 w-auto rounded"
                          unoptimized
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">
                          {p.set_name}
                        </div>
                        <div className="text-xs text-font-muted">
                          {p.set_code?.toUpperCase()} #{p.collector_number} · {p.rarity}
                          {p.prices_usd != null && ` · $${Number(p.prices_usd).toFixed(2)}`}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex-1 space-y-4">
              {/* Type */}
              <div>
                <p className="text-sm text-font-muted mb-1">Type</p>
                <p className="text-font-primary">{displayCard.type_line}</p>
              </div>

              {/* Oracle Text */}
              {displayCard.oracle_text && (
                <div>
                  <p className="text-sm text-font-muted mb-1">Oracle Text</p>
                  <p className="text-font-secondary whitespace-pre-line text-sm leading-relaxed">
                    {displayCard.oracle_text}
                  </p>
                </div>
              )}

              {/* Power / Toughness */}
              {displayCard.power != null && displayCard.toughness != null && (
                <div>
                  <p className="text-sm text-font-muted mb-1">P/T</p>
                  <p className="text-font-primary font-bold">
                    {displayCard.power}/{displayCard.toughness}
                  </p>
                </div>
              )}

              {/* Set & Rarity */}
              <div className="flex gap-6">
                <div>
                  <p className="text-sm text-font-muted mb-1">Set</p>
                  <p className="text-font-primary">
                    {displayCard.set_name}{' '}
                    <span className="text-font-muted uppercase">({displayCard.set_code})</span>
                  </p>
                </div>
                <div>
                  <p className="text-sm text-font-muted mb-1">Rarity</p>
                  <p className="text-font-primary capitalize">{displayCard.rarity}</p>
                </div>
                <div>
                  <p className="text-sm text-font-muted mb-1">Collector #</p>
                  <p className="text-font-primary">{displayCard.collector_number}</p>
                </div>
              </div>

              {/* Prices — Cardmarket primary (EUR, buyable link), TCGPlayer secondary */}
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-font-muted">
                  Prices
                </p>

                {/* Primary: big Cardmarket card — the whole thing is a buy link */}
                <a
                  href={cardmarketUrl(displayCard)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-3 rounded-xl bg-gradient-to-br from-blue-900/60 to-blue-950/60 px-4 py-3 ring-1 ring-blue-500/40 transition-all hover:from-blue-800/70 hover:to-blue-900/70 hover:ring-blue-400/70 active:brightness-95"
                >
                  <div className="flex flex-col">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-200">
                      Cardmarket
                      <ExternalLink className="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </span>
                    <span className="mt-0.5 text-[10px] text-blue-300/80">Compra su Cardmarket</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    {displayCard.prices_eur != null ? (
                      <span className="text-2xl font-black tabular-nums text-white drop-shadow-sm">
                        €{Number(displayCard.prices_eur).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-sm text-blue-300/60">no price</span>
                    )}
                    {displayCard.prices_eur_foil != null && (
                      <span className="flex items-baseline gap-1 text-sm font-semibold tabular-nums text-amber-300">
                        €{Number(displayCard.prices_eur_foil).toFixed(2)}
                        <span className="text-[9px] uppercase tracking-wider text-amber-400/70">Foil</span>
                      </span>
                    )}
                  </div>
                </a>

                {/* Secondary: TCGPlayer, compact row */}
                {(displayCard.prices_usd != null || displayCard.prices_usd_foil != null) && (
                  <div className="flex items-center justify-between rounded-lg bg-bg-cell/60 px-3 py-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-font-muted">
                      TCGPlayer
                    </span>
                    <div className="flex items-baseline gap-2">
                      {displayCard.prices_usd != null && (
                        <span className="text-sm font-semibold tabular-nums text-font-secondary">
                          ${Number(displayCard.prices_usd).toFixed(2)}
                        </span>
                      )}
                      {displayCard.prices_usd_foil != null && (
                        <span className="flex items-baseline gap-1 text-xs tabular-nums text-amber-300/80">
                          ${Number(displayCard.prices_usd_foil).toFixed(2)}
                          <span className="text-[9px] uppercase tracking-wider text-amber-400/60">Foil</span>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions — Add to Deck (primary) + Like + Share */}
              <div className="relative flex items-center gap-2">
                <button
                  onClick={toggleDeckPicker}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    showDeckPicker
                      ? 'bg-bg-accent text-font-white'
                      : 'bg-bg-accent hover:bg-bg-accent-dark text-font-white'
                  }`}
                >
                  <Plus size={16} />
                  Add to Deck
                  <ChevronDown size={14} className={`transition-transform ${showDeckPicker ? 'rotate-180' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={handleToggleLike}
                  disabled={likeBusy}
                  aria-label={liked ? 'Unlike card' : 'Like card'}
                  title={liked ? 'Liked' : 'Like'}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 transition-colors disabled:opacity-60 ${
                    liked
                      ? 'bg-red-500/15 ring-red-500/40 text-red-400 hover:bg-red-500/25'
                      : 'bg-bg-cell ring-border text-font-muted hover:bg-bg-hover hover:text-font-primary'
                  }`}
                >
                  {likeBusy ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Heart size={18} className={liked ? 'fill-current' : ''} />
                  )}
                </button>

                <button
                  type="button"
                  onClick={addToCollection}
                  disabled={addingToCollection}
                  aria-label="Add to collection"
                  title={addedToCollection ? 'Added' : 'Add to collection'}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 transition-colors disabled:opacity-60 ${
                    addedToCollection
                      ? 'bg-emerald-500/15 ring-emerald-500/40 text-emerald-400'
                      : 'bg-bg-cell ring-border text-font-muted hover:bg-bg-hover hover:text-font-primary'
                  }`}
                >
                  {addingToCollection ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : addedToCollection ? (
                    <Check size={18} />
                  ) : (
                    <Library size={18} />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  aria-label="Share card"
                  title={shareFeedback === 'copied' ? 'Link copied' : 'Share'}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg-cell ring-1 ring-border text-font-muted transition-colors hover:bg-bg-hover hover:text-font-primary"
                >
                  {shareFeedback === 'copied' ? (
                    <Check size={18} className="text-bg-green" />
                  ) : (
                    <Share2 size={18} />
                  )}
                </button>

                {showDeckPicker && (
                  <div className="absolute left-0 top-full z-20 mt-1 w-72 max-h-60 overflow-y-auto rounded-lg border border-border bg-bg-surface shadow-xl">
                    {loadingDecks ? (
                      <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-font-muted">
                        <Loader2 size={14} className="animate-spin" /> Loading decks...
                      </div>
                    ) : myDecks.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-font-muted text-center">
                        No decks found. Create a deck first.
                      </div>
                    ) : (
                      myDecks.map((deck) => (
                        <button
                          key={deck.id}
                          onClick={() => addCardToDeck(deck.id)}
                          disabled={addingToDeck === deck.id}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-bg-hover disabled:opacity-50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-font-primary">{deck.name}</div>
                            <div className="text-[10px] text-font-muted">{deck.format}</div>
                          </div>
                          {addingToDeck === deck.id && (
                            <Loader2 size={14} className="shrink-0 animate-spin text-font-muted" />
                          )}
                          {addedToDeckId === deck.id && (
                            <Check size={14} className="shrink-0 text-bg-green" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Legalities */}
          {legalities && (
            <div className="mt-6">
              <p className="text-sm text-font-muted mb-2">Format Legalities</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {Object.entries(legalities).map(([format, status]) => (
                  <div
                    key={format}
                    className={`px-2 py-1 rounded text-xs font-medium capitalize ${LEGALITY_COLORS[status] || 'bg-bg-cell text-font-muted'}`}
                  >
                    <span className="text-font-secondary">{format.replace(/_/g, ' ')}</span>
                    <span className="ml-1">{status.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
