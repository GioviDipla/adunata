'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { X, Plus, ChevronDown, Loader2, Check } from 'lucide-react'
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-bg-surface border border-border shadow-2xl">
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

              {/* Prices */}
              {(displayCard.prices_eur != null || displayCard.prices_usd != null) && (
                <div>
                  <p className="text-sm text-font-muted mb-1">Prices</p>
                  <div className="flex flex-col gap-1.5">
                    {/* Cardmarket (EUR) — primary */}
                    {(displayCard.prices_eur != null || displayCard.prices_eur_foil != null) && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-font-muted w-20">Cardmarket</span>
                        {displayCard.prices_eur != null && (
                          <span className="text-font-primary font-medium">
                            €{Number(displayCard.prices_eur).toFixed(2)}
                          </span>
                        )}
                        {displayCard.prices_eur_foil != null && (
                          <span className="text-font-accent text-sm">
                            €{Number(displayCard.prices_eur_foil).toFixed(2)}{' '}
                            <span className="text-font-muted text-xs">Foil</span>
                          </span>
                        )}
                      </div>
                    )}
                    {/* TCGPlayer (USD) — secondary */}
                    {(displayCard.prices_usd != null || displayCard.prices_usd_foil != null) && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-font-muted w-20">TCGPlayer</span>
                        {displayCard.prices_usd != null && (
                          <span className="text-font-secondary">
                            ${Number(displayCard.prices_usd).toFixed(2)}
                          </span>
                        )}
                        {displayCard.prices_usd_foil != null && (
                          <span className="text-font-secondary text-sm">
                            ${Number(displayCard.prices_usd_foil).toFixed(2)}{' '}
                            <span className="text-font-muted text-xs">Foil</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Add to Deck */}
              <div className="relative">
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
    </div>
  )
}
