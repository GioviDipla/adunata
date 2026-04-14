'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { X, Plus, ChevronDown, Loader2 } from 'lucide-react'
import type { Database } from '@/types/supabase'
import ManaCost from './ManaCost'

type Card = Database['public']['Tables']['cards']['Row']

interface CardFace {
  name?: string
  mana_cost?: string
  type_line?: string
  oracle_text?: string
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

interface CardDetailProps {
  card: Card
  onClose: () => void
  onPrintingSelect?: (printing: Card) => void
  onAddToDeck?: (card: Card) => void
}

export default function CardDetail({ card, onClose, onPrintingSelect, onAddToDeck }: CardDetailProps) {
  const [displayCard, setDisplayCard] = useState<Card>(card)
  const [printings, setPrintings] = useState<Card[]>([])
  const [loadingPrintings, setLoadingPrintings] = useState(false)
  const [showPrintings, setShowPrintings] = useState(false)

  const legalities = displayCard.legalities as Record<string, string> | null
  const cardFaces = displayCard.card_faces as CardFace[] | null
  const isDoubleFaced = cardFaces && cardFaces.length > 1

  // Reset when card prop changes
  useEffect(() => {
    setDisplayCard(card)
    setPrintings([])
    setShowPrintings(false)
  }, [card])

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
                    const src = face.image_normal || displayCard.image_normal || ''
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
              {(displayCard.prices_usd != null || displayCard.prices_usd_foil != null) && (
                <div>
                  <p className="text-sm text-font-muted mb-1">Prices</p>
                  <div className="flex gap-4">
                    {displayCard.prices_usd != null && (
                      <span className="text-font-primary">
                        ${Number(displayCard.prices_usd).toFixed(2)}{' '}
                        <span className="text-font-muted text-xs">USD</span>
                      </span>
                    )}
                    {displayCard.prices_usd_foil != null && (
                      <span className="text-font-accent">
                        ${Number(displayCard.prices_usd_foil).toFixed(2)}{' '}
                        <span className="text-font-muted text-xs">Foil</span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Add to Deck button */}
              {onAddToDeck && (
                <button
                  onClick={() => { onAddToDeck(displayCard); onClose() }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-accent hover:bg-bg-accent-dark text-font-white font-medium transition-colors"
                >
                  <Plus size={16} />
                  Add to Deck
                </button>
              )}
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
