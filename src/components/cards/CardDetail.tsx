'use client'

import { X, Plus } from 'lucide-react'
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
}

export default function CardDetail({ card, onClose }: CardDetailProps) {
  const legalities = card.legalities as Record<string, string> | null
  const cardFaces = card.card_faces as CardFace[] | null
  const isDoubleFaced = cardFaces && cardFaces.length > 1

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
            <h2 className="text-xl font-bold text-font-primary">{card.name}</h2>
            <ManaCost manaCost={card.mana_cost} size="md" />
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
            <div className="shrink-0 flex gap-3">
              {isDoubleFaced ? (
                cardFaces.map((face, i) => (
                  <img
                    key={i}
                    src={face.image_normal || card.image_normal || ''}
                    alt={face.name || card.name}
                    className="w-56 rounded-lg shadow-lg"
                  />
                ))
              ) : (
                <img
                  src={card.image_normal || card.image_small || ''}
                  alt={card.name}
                  className="w-56 rounded-lg shadow-lg"
                />
              )}
            </div>

            {/* Details */}
            <div className="flex-1 space-y-4">
              {/* Type */}
              <div>
                <p className="text-sm text-font-muted mb-1">Type</p>
                <p className="text-font-primary">{card.type_line}</p>
              </div>

              {/* Oracle Text */}
              {card.oracle_text && (
                <div>
                  <p className="text-sm text-font-muted mb-1">Oracle Text</p>
                  <p className="text-font-secondary whitespace-pre-line text-sm leading-relaxed">
                    {card.oracle_text}
                  </p>
                </div>
              )}

              {/* Power / Toughness */}
              {card.power != null && card.toughness != null && (
                <div>
                  <p className="text-sm text-font-muted mb-1">P/T</p>
                  <p className="text-font-primary font-bold">
                    {card.power}/{card.toughness}
                  </p>
                </div>
              )}

              {/* Set & Rarity */}
              <div className="flex gap-6">
                <div>
                  <p className="text-sm text-font-muted mb-1">Set</p>
                  <p className="text-font-primary">
                    {card.set_name}{' '}
                    <span className="text-font-muted uppercase">({card.set_code})</span>
                  </p>
                </div>
                <div>
                  <p className="text-sm text-font-muted mb-1">Rarity</p>
                  <p className="text-font-primary capitalize">{card.rarity}</p>
                </div>
                <div>
                  <p className="text-sm text-font-muted mb-1">Collector #</p>
                  <p className="text-font-primary">{card.collector_number}</p>
                </div>
              </div>

              {/* Prices */}
              {(card.prices_usd != null || card.prices_usd_foil != null) && (
                <div>
                  <p className="text-sm text-font-muted mb-1">Prices</p>
                  <div className="flex gap-4">
                    {card.prices_usd != null && (
                      <span className="text-font-primary">
                        ${Number(card.prices_usd).toFixed(2)}{' '}
                        <span className="text-font-muted text-xs">USD</span>
                      </span>
                    )}
                    {card.prices_usd_foil != null && (
                      <span className="text-font-accent">
                        ${Number(card.prices_usd_foil).toFixed(2)}{' '}
                        <span className="text-font-muted text-xs">Foil</span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Add to Deck button */}
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-accent hover:bg-bg-accent-dark text-font-white font-medium transition-colors">
                <Plus size={16} />
                Add to Deck
              </button>
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
