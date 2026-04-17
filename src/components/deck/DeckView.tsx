'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { Copy, Check, Globe, Printer } from 'lucide-react'
import DeckContent, { type DeckCardEntry } from './DeckContent'
import ProxyPrintModal from './ProxyPrintModal'
import DeckStats from './DeckStats'
import DeckStatsBar from './DeckStatsBar'
import DeckEngagement from './DeckEngagement'
import CardDetail from '@/components/cards/CardDetail'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']
type DeckRow = Database['public']['Tables']['decks']['Row']

type BoardTab = 'main' | 'sideboard' | 'maybeboard'

interface DeckViewProps {
  deck: DeckRow
  cards: DeckCardEntry[]
  ownerUsername: string
  ownerDisplayName: string
  viewerId: string | null
}

export default function DeckView({
  deck,
  cards,
  ownerUsername,
  ownerDisplayName,
  viewerId,
}: DeckViewProps) {
  const [selectedDetailCard, setSelectedDetailCard] = useState<CardRow | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<BoardTab>('main')
  const [showExpandedStats, setShowExpandedStats] = useState(false)
  const [showProxyPrint, setShowProxyPrint] = useState(false)

  const commanderCards = useMemo(
    () => cards.filter((c) => c.board === 'commander'),
    [cards],
  )

  const filteredCards = useMemo(
    () => cards.filter((c) => c.board === activeTab),
    [cards, activeTab],
  )

  const isCommander = useCallback(
    (cardId: number) => commanderCards.some((c) => c.card.id === cardId),
    [commanderCards],
  )

  const statsCards = useMemo(
    () => cards.map((c) => ({ card: c.card, quantity: c.quantity, board: c.board })),
    [cards],
  )

  const tabCounts = useMemo(
    () => ({
      main: cards.filter((c) => c.board === 'main').reduce((s, c) => s + c.quantity, 0),
      sideboard: cards.filter((c) => c.board === 'sideboard').reduce((s, c) => s + c.quantity, 0),
      maybeboard: cards.filter((c) => c.board === 'maybeboard').reduce((s, c) => s + c.quantity, 0),
    }),
    [cards],
  )

  async function copyDeckList() {
    const lines = cards
      .filter((c) => c.board === 'main' || c.board === 'commander')
      .map((c) => `${c.quantity} ${c.card.name}`)
      .join('\n')
    const sideLines = cards
      .filter((c) => c.board === 'sideboard')
      .map((c) => `${c.quantity} ${c.card.name}`)
    const full = sideLines.length > 0
      ? `${lines}\n\nSideboard\n${sideLines.join('\n')}`
      : lines
    try {
      await navigator.clipboard.writeText(full)
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
      <div className="mb-4 sm:mb-6">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <h1 className="text-xl font-bold text-font-primary sm:text-2xl">
            {deck.name}
          </h1>
          <span className="shrink-0 rounded-full bg-bg-cell px-2 py-0.5 text-[10px] sm:px-3 sm:py-1 sm:text-xs font-medium text-font-secondary">
            {deck.format}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-bg-green/20 px-2 py-0.5 text-[10px] font-bold text-bg-green">
            <Globe className="h-3 w-3" /> Public
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2">
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
              <><Check className="h-3.5 w-3.5 text-bg-green" /> Copied</>
            ) : (
              <><Copy className="h-3.5 w-3.5" /> Copy list</>
            )}
          </button>
          <button
            onClick={() => setShowProxyPrint(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-surface px-3 py-1.5 text-xs font-medium text-font-secondary transition-colors hover:bg-bg-hover"
          >
            <Printer className="h-3.5 w-3.5" /> Proxy
          </button>
          {copyError && (
            <span className="text-[11px] text-bg-red">{copyError}</span>
          )}
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row">
        {/* Left panel */}
        <div className="flex-1 min-w-0">
          {/* Compact stats bar */}
          <div className="mb-3 sm:mb-4">
            <DeckStatsBar
              cards={statsCards}
              format={deck.format}
              expanded={showExpandedStats}
              onToggleExpand={() => setShowExpandedStats((p) => !p)}
            />
          </div>

          {/* Expanded stats on mobile */}
          {showExpandedStats && (
            <div className="mb-3 sm:mb-4 lg:hidden rounded-xl border border-border bg-bg-surface p-4">
              <DeckStats cards={statsCards} />
            </div>
          )}

          {/* Board tabs */}
          <div className="mb-3 flex gap-1 rounded-lg bg-bg-cell p-1">
            {(['main', 'sideboard', 'maybeboard'] as BoardTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab
                    ? 'bg-bg-surface text-font-primary shadow-sm'
                    : 'text-font-secondary hover:text-font-primary'
                }`}
              >
                <span className="sm:hidden">
                  {tab === 'main' ? 'Main' : tab === 'sideboard' ? 'Side' : 'Maybe'}
                </span>
                <span className="hidden sm:inline">
                  {tab === 'main' ? 'Main Deck' : tab === 'sideboard' ? 'Sideboard' : 'Maybeboard'}
                </span>
                <span className="ml-1 text-[10px] sm:text-xs text-font-muted">
                  ({tabCounts[tab]})
                </span>
              </button>
            ))}
          </div>

          <DeckContent
            cards={filteredCards}
            commanderCards={commanderCards}
            isCommander={isCommander}
            onCardClick={setSelectedDetailCard}
          />

          <DeckEngagement
            deckId={deck.id}
            viewerId={viewerId}
            deckOwnerId={deck.user_id}
          />
        </div>

        {/* Right panel: Full stats — only on lg+ */}
        <div className="hidden lg:block w-80 shrink-0">
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

      {showProxyPrint && (
        <ProxyPrintModal
          deckName={deck.name}
          cards={cards}
          onClose={() => setShowProxyPrint(false)}
        />
      )}
    </div>
  )
}
