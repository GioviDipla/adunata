'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { Copy, Check, Globe } from 'lucide-react'
import DeckContent, { type DeckCardEntry } from './DeckContent'
import DeckStats from './DeckStats'
import CardDetail from '@/components/cards/CardDetail'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']
type DeckRow = Database['public']['Tables']['decks']['Row']

interface DeckViewProps {
  deck: DeckRow
  cards: DeckCardEntry[]
  ownerUsername: string
  ownerDisplayName: string
}

export default function DeckView({
  deck,
  cards,
  ownerUsername,
  ownerDisplayName,
}: DeckViewProps) {
  const [selectedDetailCard, setSelectedDetailCard] = useState<CardRow | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  const commanderCards = useMemo(
    () => cards.filter((c) => c.board === 'commander'),
    [cards],
  )
  const mainCards = useMemo(
    () => cards.filter((c) => c.board === 'main'),
    [cards],
  )

  const isCommander = useCallback(
    (cardId: number) => commanderCards.some((c) => c.card.id === cardId),
    [commanderCards],
  )

  const statsCards = useMemo(
    () => cards.map((c) => ({ card: c.card, quantity: c.quantity, board: c.board })),
    [cards],
  )

  async function copyDeckList() {
    const lines = cards.map((c) => `${c.quantity} ${c.card.name}`).join('\n')
    try {
      await navigator.clipboard.writeText(lines)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      setCopyError(e instanceof Error ? e.message : 'Clipboard blocked')
      setTimeout(() => setCopyError(null), 3000)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <h1 className="text-xl font-bold text-font-primary sm:text-2xl">
            {deck.name}
          </h1>
          <span className="shrink-0 rounded-full bg-bg-cell px-2 py-0.5 text-[10px] sm:px-3 sm:py-1 sm:text-xs font-medium text-font-secondary">
            {deck.format}
          </span>
          {/* DeckView is only reached for public decks — the deck page branches
              to notFound() for non-owners of private decks. So we always show
              the Public badge here. */}
          <span className="flex items-center gap-1 rounded-full bg-bg-green/20 px-2 py-0.5 text-[10px] font-bold text-bg-green">
            <Globe className="h-3 w-3" /> Public
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link
            href={`/u/${ownerUsername}`}
            className="flex items-center gap-2 text-sm text-font-secondary transition-colors hover:text-font-accent"
          >
            <span>
              by <span className="font-semibold">{ownerDisplayName}</span>
            </span>
            <span className="text-font-muted">@{ownerUsername}</span>
          </Link>

          <button
            onClick={copyDeckList}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-surface px-3 py-1.5 text-xs font-medium text-font-secondary transition-colors hover:bg-bg-hover"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-bg-green" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> Copy list
              </>
            )}
          </button>
          {copyError && (
            <span className="text-[11px] text-bg-red">{copyError}</span>
          )}
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row">
        <div className="flex-1">
          <DeckContent
            cards={mainCards}
            commanderCards={commanderCards}
            isCommander={isCommander}
            onCardClick={setSelectedDetailCard}
          />
        </div>

        <div className="w-full shrink-0 lg:w-80">
          <div className="sticky top-6 rounded-xl border border-border bg-bg-surface p-4">
            <h2 className="mb-4 text-sm font-semibold text-font-secondary">
              Deck Statistics
            </h2>
            <DeckStats cards={statsCards} />
          </div>
        </div>
      </div>

      {selectedDetailCard && (
        <CardDetail
          card={selectedDetailCard}
          onClose={() => setSelectedDetailCard(null)}
        />
      )}
    </div>
  )
}
