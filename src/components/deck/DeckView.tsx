'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { Copy, Check, Globe, Printer, Library, ClipboardCopy } from 'lucide-react'
import DeckContent, { type DeckCardEntry } from './DeckContent'
import ProxyPrintModal from './ProxyPrintModal'
import ShareDeckButton from './ShareDeckButton'
import DeckStats from './DeckStats'
import DeckStatsBar from './DeckStatsBar'
import DeckEngagement from './DeckEngagement'
import CardDetail from '@/components/cards/CardDetail'
import { useDeckOverlay } from '@/lib/hooks/useDeckOverlay'
import type { Database } from '@/types/supabase'
import type { SectionRow } from '@/types/deck'

type CardRow = Database['public']['Tables']['cards']['Row']
type DeckRow = Database['public']['Tables']['decks']['Row']

type BoardTab = 'main' | 'sideboard' | 'maybeboard' | 'stats'

interface DeckViewProps {
  deck: DeckRow
  cards: DeckCardEntry[]
  sections?: SectionRow[]
  ownerUsername: string
  ownerDisplayName: string
  viewerId: string | null
}

export default function DeckView({
  deck,
  cards,
  sections = [],
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
  const [overlayOn, setOverlayOn] = useState(false)
  const [overlayToast, setOverlayToast] = useState<string | null>(null)

  // Persist the overlay toggle per-deck so refreshing the page doesn't
  // drop the user's preference. Key scheme matches other client
  // localStorage keys — `adunata:<feature>:<id>`.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = `adunata:deck-overlay:${deck.id}`
    const raw = window.localStorage.getItem(key)
    if (raw === '1') queueMicrotask(() => setOverlayOn(true))
  }, [deck.id])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = `adunata:deck-overlay:${deck.id}`
    window.localStorage.setItem(key, overlayOn ? '1' : '0')
  }, [deck.id, overlayOn])

  const overlayData = useDeckOverlay(deck.id, overlayOn)

  const overlayByCardId = useMemo(() => {
    if (!overlayData) return undefined
    const m = new Map<
      number,
      { owned: number; needed: number; missing: number }
    >()
    for (const row of overlayData.overlay) {
      m.set(row.card_id, {
        owned: row.owned,
        needed: row.needed,
        missing: row.missing,
      })
    }
    return m
  }, [overlayData])

  async function exportShoppingList() {
    if (!overlayData) return
    const missing = overlayData.overlay.filter((r) => r.missing > 0)
    const lines = missing.map((r) => `${r.missing} ${r.name}`).join('\n')
    try {
      await navigator.clipboard.writeText(lines)
      setOverlayToast(`Copied ${missing.length} cards to clipboard`)
    } catch {
      setOverlayToast('Clipboard blocked')
    }
    setTimeout(() => setOverlayToast(null), 2500)
  }

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

  // Commander color identity union for the stats panel (identity violations).
  const commanderIdentity = useMemo<string[] | undefined>(() => {
    if (commanderCards.length === 0) return undefined
    const set = new Set<string>()
    for (const cc of commanderCards) {
      const ci = (cc.card.color_identity as string[] | null) ?? []
      for (const c of ci) set.add(c)
    }
    return Array.from(set)
  }, [commanderCards])

  const tabCounts = useMemo<Record<BoardTab, number | null>>(
    () => ({
      main: cards.filter((c) => c.board === 'main').reduce((s, c) => s + c.quantity, 0),
      sideboard: cards.filter((c) => c.board === 'sideboard').reduce((s, c) => s + c.quantity, 0),
      maybeboard: cards.filter((c) => c.board === 'maybeboard').reduce((s, c) => s + c.quantity, 0),
      stats: null,
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
          <ShareDeckButton
            deckId={deck.id}
            deckName={deck.name}
            visibility="public"
            isOwner={false}
          />
          <button
            onClick={() => setOverlayOn((p) => !p)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              overlayOn
                ? 'border-bg-accent bg-bg-accent/20 text-font-accent'
                : 'border-border bg-bg-surface text-font-secondary hover:bg-bg-hover'
            }`}
            title="Show owned/missing badges based on your collection"
          >
            <Library className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Collection overlay</span>
            <span className="sm:hidden">Overlay</span>
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
              <DeckStats cards={statsCards} format={deck.format} commanderIdentity={commanderIdentity} />
            </div>
          )}

          {/* Board tabs — 'stats' tab is mobile-only; desktop has the sidebar. */}
          <div className="mb-3 flex gap-1 rounded-lg bg-bg-cell p-1">
            {(['main', 'sideboard', 'maybeboard', 'stats'] as BoardTab[]).map((tab) => {
              const isStats = tab === 'stats'
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm font-medium transition-colors whitespace-nowrap ${
                    isStats ? 'lg:hidden' : ''
                  } ${
                    activeTab === tab
                      ? 'bg-bg-surface text-font-primary shadow-sm'
                      : 'text-font-secondary hover:text-font-primary'
                  }`}
                >
                  <span className="sm:hidden">
                    {tab === 'main' ? 'Main' : tab === 'sideboard' ? 'Side' : tab === 'maybeboard' ? 'Maybe' : 'Stats'}
                  </span>
                  <span className="hidden sm:inline">
                    {tab === 'main' ? 'Main Deck' : tab === 'sideboard' ? 'Sideboard' : tab === 'maybeboard' ? 'Maybeboard' : 'Stats'}
                  </span>
                  {tabCounts[tab] != null && (
                    <span className="ml-1 text-[10px] sm:text-xs text-font-muted">
                      ({tabCounts[tab]})
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Overlay summary strip — shown above the tab content when overlay is on. */}
          {overlayOn && overlayData && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg-surface px-3 py-2 text-xs">
              <span className="font-semibold text-font-primary">
                {overlayData.owned} / {overlayData.needed}
              </span>
              <span className="text-font-muted">owned</span>
              {overlayData.missingEur > 0 && (
                <span className="text-font-secondary">
                  · €{overlayData.missingEur.toFixed(2)}{' '}
                  <span className="text-font-muted">missing (Cardmarket)</span>
                </span>
              )}
              {overlayData.missingUsd > 0 && (
                <span className="text-font-secondary">
                  · ${overlayData.missingUsd.toFixed(2)}{' '}
                  <span className="text-font-muted">fallback (TCGPlayer)</span>
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {overlayToast && (
                  <span className="text-[11px] text-bg-green">{overlayToast}</span>
                )}
                <button
                  onClick={exportShoppingList}
                  disabled={overlayData.overlay.every((r) => r.missing === 0)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-bg-accent px-2 py-1 text-[11px] font-semibold text-font-white transition-opacity disabled:opacity-40"
                >
                  <ClipboardCopy className="h-3 w-3" />
                  Export shopping list
                </button>
              </div>
            </div>
          )}

          {activeTab === 'stats' ? (
            <div className="rounded-xl border border-border bg-bg-surface p-4">
              <DeckStats cards={statsCards} format={deck.format} commanderIdentity={commanderIdentity} />
            </div>
          ) : (
            <DeckContent
              cards={filteredCards}
              commanderCards={commanderCards}
              sections={sections}
              isCommander={isCommander}
              onCardClick={setSelectedDetailCard}
              overlayByCardId={overlayByCardId}
            />
          )}

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
            <DeckStats cards={statsCards} format={deck.format} commanderIdentity={commanderIdentity} />
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
