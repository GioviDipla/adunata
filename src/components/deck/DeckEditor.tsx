'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Trash2,
  Download,
  Check,
  X,
  Pencil,
  Fish,
  Crown,
  List,
  LayoutGrid,
  AlignLeft,
  FileText,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import DeckCard from './DeckCard'
import DeckGridView from './DeckGridView'
import DeckTextView from './DeckTextView'
import DeckStats from './DeckStats'
import DeckExport from './DeckExport'
import AddCardSearch from './AddCardSearch'
import CardDetail from '@/components/cards/CardDetail'
import ImportCardsModal from './ImportCardsModal'
import { getCardTypeCategory, TYPE_ORDER } from '@/lib/utils/card'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']
type DeckRow = Database['public']['Tables']['decks']['Row']

interface DeckCardEntry {
  id: string
  card: CardRow
  quantity: number
  board: string
}

interface DeckEditorProps {
  deck: DeckRow
  initialCards: DeckCardEntry[]
}

type BoardTab = 'main' | 'sideboard' | 'maybeboard'
type ViewMode = 'list' | 'grid' | 'text'

export default function DeckEditor({ deck, initialCards }: DeckEditorProps) {
  const router = useRouter()
  const [cards, setCards] = useState<DeckCardEntry[]>(initialCards)
  const [activeTab, setActiveTab] = useState<BoardTab>('main')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [isEditingName, setIsEditingName] = useState(false)
  const [deckName, setDeckName] = useState(deck.name)
  const [editingName, setEditingName] = useState(deck.name)
  const [showExport, setShowExport] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selectedDetailCard, setSelectedDetailCard] = useState<CardRow | null>(null)
  const [showImport, setShowImport] = useState(false)

  // Extract commander cards
  const commanderCards = useMemo(
    () => cards.filter((c) => c.board === 'commander'),
    [cards]
  )

  // Check if a card is a commander
  const isCommander = useCallback(
    (cardId: number) => commanderCards.some((c) => c.card.id === cardId),
    [commanderCards]
  )

  // Filter cards by active tab (excluding commander cards)
  const filteredCards = useMemo(
    () => cards.filter((c) => c.board === activeTab),
    [cards, activeTab]
  )

  // Group cards by type
  const groupedCards = useMemo(() => {
    const groups: Record<string, DeckCardEntry[]> = {}
    filteredCards.forEach((entry) => {
      if (!entry.card) return
      const cat = getCardTypeCategory(entry.card.type_line)
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(entry)
    })
    const sorted: [string, DeckCardEntry[]][] = []
    TYPE_ORDER.forEach((type) => {
      if (groups[type]) {
        sorted.push([type, groups[type].sort((a, b) => a.card.cmc - b.card.cmc)])
      }
    })
    return sorted
  }, [filteredCards])

  const tabCounts = useMemo(
    () => ({
      main: cards
        .filter((c) => c.board === 'main')
        .reduce((s, c) => s + c.quantity, 0),
      sideboard: cards
        .filter((c) => c.board === 'sideboard')
        .reduce((s, c) => s + c.quantity, 0),
      maybeboard: cards
        .filter((c) => c.board === 'maybeboard')
        .reduce((s, c) => s + c.quantity, 0),
    }),
    [cards]
  )

  const handleQuantityChange = useCallback(
    async (cardId: number, newQuantity: number, board: string) => {
      if (newQuantity <= 0) {
        setCards((prev) =>
          prev.filter((c) => !(c.card.id === cardId && c.board === board))
        )
        await fetch(`/api/decks/${deck.id}/cards`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ card_id: cardId, board }),
        })
        return
      }

      setCards((prev) =>
        prev.map((c) =>
          c.card.id === cardId && c.board === board
            ? { ...c, quantity: newQuantity }
            : c
        )
      )

      await fetch(`/api/decks/${deck.id}/cards`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_id: cardId, quantity: newQuantity, board }),
      })
    },
    [deck.id]
  )

  const handleRemove = useCallback(
    async (cardId: number, board: string) => {
      setCards((prev) =>
        prev.filter((c) => !(c.card.id === cardId && c.board === board))
      )
      await fetch(`/api/decks/${deck.id}/cards`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_id: cardId, board }),
      })
    },
    [deck.id]
  )

  const handleToggleCommander = useCallback(
    async (cardId: number, currentBoard: string) => {
      const isCurrentlyCommander = currentBoard === 'commander'

      if (isCurrentlyCommander) {
        // Remove as commander: move back to main
        setCards((prev) =>
          prev.map((c) =>
            c.card.id === cardId && c.board === 'commander'
              ? { ...c, board: 'main' }
              : c
          )
        )
        await fetch(`/api/decks/${deck.id}/cards`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            card_id: cardId,
            board: 'main',
            current_board: 'commander',
          }),
        })
      } else {
        // Set as commander: first, unset any existing commander (move them back to main)
        setCards((prev) =>
          prev.map((c) => {
            if (c.board === 'commander') return { ...c, board: 'main' }
            if (c.card.id === cardId && c.board === currentBoard)
              return { ...c, board: 'commander' }
            return c
          })
        )

        // Unset existing commanders
        const existingCommanders = cards.filter((c) => c.board === 'commander')
        for (const cmd of existingCommanders) {
          await fetch(`/api/decks/${deck.id}/cards`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              card_id: cmd.card.id,
              board: 'main',
              current_board: 'commander',
            }),
          })
        }

        // Set the new commander
        await fetch(`/api/decks/${deck.id}/cards`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            card_id: cardId,
            board: 'commander',
            current_board: currentBoard,
          }),
        })
      }
    },
    [deck.id, cards]
  )

  const handlePrintingSelect = useCallback(
    async (oldCard: CardRow, newPrinting: CardRow) => {
      if (oldCard.id === newPrinting.id) return

      // Update local state: replace the card object in all entries that reference the old card
      setCards((prev) =>
        prev.map((c) =>
          c.card.id === oldCard.id ? { ...c, card: newPrinting } : c
        )
      )

      // Update the detail card to show the new printing
      setSelectedDetailCard(newPrinting)

      // Update in DB: swap card_id for all deck_cards referencing the old card
      await fetch(`/api/decks/${deck.id}/cards/swap`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_card_id: oldCard.id,
          new_card_id: newPrinting.id,
        }),
      })
    },
    [deck.id]
  )

  const handleCardAdded = useCallback((card: CardRow, board: string) => {
    setCards((prev) => {
      const existing = prev.find(
        (c) => c.card.id === card.id && c.board === board
      )
      if (existing) {
        return prev.map((c) =>
          c.card.id === card.id && c.board === board
            ? { ...c, quantity: c.quantity + 1 }
            : c
        )
      }
      return [
        ...prev,
        {
          id: `temp-${Date.now()}`,
          card,
          quantity: 1,
          board,
        },
      ]
    })
  }, [])

  async function saveName() {
    if (!editingName.trim()) return
    setDeckName(editingName)
    setIsEditingName(false)
    await fetch(`/api/decks/${deck.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingName }),
    })
  }

  async function deleteDeck() {
    setDeleting(true)
    const res = await fetch(`/api/decks/${deck.id}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/decks')
    }
    setDeleting(false)
  }

  const statsCards = useMemo(
    () =>
      cards.map((c) => ({
        card: c.card,
        quantity: c.quantity,
        board: c.board,
      })),
    [cards]
  )

  const VIEW_MODE_OPTIONS: { mode: ViewMode; icon: typeof List; label: string }[] = [
    { mode: 'list', icon: List, label: 'List view' },
    { mode: 'grid', icon: LayoutGrid, label: 'Grid view' },
    { mode: 'text', icon: AlignLeft, label: 'Text view' },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:py-6">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <div className="flex items-center gap-2 sm:gap-3">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
                className="rounded-lg border border-border bg-bg-card px-3 py-1.5 text-lg font-bold text-font-primary focus:border-bg-accent focus:outline-none focus:ring-2 focus:ring-bg-accent/20"
                autoFocus
              />
              <button
                onClick={saveName}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-bg-green hover:bg-bg-green/10"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setIsEditingName(false)
                  setEditingName(deckName)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-font-muted hover:bg-bg-hover"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditingName(true)}
              className="group flex items-center gap-2"
            >
              <h1 className="text-xl sm:text-2xl font-bold text-font-primary">
                {deckName}
              </h1>
              <Pencil className="h-4 w-4 text-font-muted opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
          <span className="shrink-0 rounded-full bg-bg-cell px-2 py-0.5 text-[10px] sm:px-3 sm:py-1 sm:text-xs font-medium text-font-secondary">
            {deck.format}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2">
          <Link
            href={`/decks/${deck.id}/goldfish`}
            className="inline-flex items-center gap-1 rounded-lg bg-bg-accent px-2.5 py-1.5 text-xs sm:text-sm font-medium text-font-white transition-colors hover:bg-bg-accent-dark"
          >
            <Fish className="h-3.5 w-3.5" />
            Goldfish
          </Link>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowImport(true)}
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Import</span>
            <span className="sm:hidden">Imp</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowExport(true)}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
            <span className="sm:hidden">Exp</span>
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Delete</span>
            <span className="sm:hidden">Del</span>
          </Button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row">
        {/* Left panel: Card list */}
        <div className="flex-1">
          {/* Search bar */}
          <div className="mb-3 sm:mb-4">
            <AddCardSearch
              deckId={deck.id}
              onCardAdded={handleCardAdded}
              currentBoard={activeTab}
            />
          </div>

          {/* Board tabs + View mode toggle */}
          <div className="mb-3 flex flex-col gap-2">
            <div className="flex gap-1 rounded-lg bg-bg-cell p-1">
              {(['main', 'sideboard', 'maybeboard'] as BoardTab[]).map(
                (tab) => (
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
                )
              )}
            </div>

            {/* View mode toggle */}
            <div className="flex gap-0.5 rounded-lg bg-bg-cell p-1 self-start">
              {VIEW_MODE_OPTIONS.map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                    viewMode === mode
                      ? 'bg-bg-surface text-font-primary shadow-sm'
                      : 'text-font-muted hover:text-font-primary'
                  }`}
                  title={label}
                  aria-label={label}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          {/* Commander section */}
          {commanderCards.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-bg-yellow">
                <Crown className="h-4 w-4" />
                Commander
              </h3>
              {viewMode === 'grid' ? (
                <DeckGridView
                  cards={commanderCards}
                  onQuantityChange={handleQuantityChange}
                  onRemove={handleRemove}
                  isCommander={() => true}
                  onToggleCommander={handleToggleCommander}
                  onCardClick={setSelectedDetailCard}
                />
              ) : viewMode === 'text' ? (
                <DeckTextView
                  cards={commanderCards}
                  isCommander={() => true}
                  onToggleCommander={handleToggleCommander}
                  onCardClick={setSelectedDetailCard}
                />
              ) : (
                <div className="flex flex-col gap-1">
                  {commanderCards.map((entry) => (
                    <DeckCard
                      key={`${entry.card.id}-${entry.board}`}
                      card={entry.card}
                      quantity={entry.quantity}
                      board={entry.board}
                      isCommander
                      onQuantityChange={handleQuantityChange}
                      onRemove={handleRemove}
                      onToggleCommander={handleToggleCommander}
                      onCardClick={setSelectedDetailCard}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Card groups - different views */}
          {viewMode === 'list' && (
            <>
              {groupedCards.length === 0 ? (
                <div className="rounded-xl border border-border-light border-dashed bg-bg-surface p-8 text-center">
                  <p className="text-font-muted">
                    No cards in{' '}
                    {activeTab === 'main' ? 'main deck' : activeTab}. Use the
                    search below to add cards.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {groupedCards.map(([type, entries]) => (
                    <div key={type}>
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-font-secondary">
                        {type}
                        <span className="text-xs text-font-muted">
                          ({entries.reduce((s, e) => s + e.quantity, 0)})
                        </span>
                      </h3>
                      <div className="flex flex-col gap-1">
                        {entries.map((entry) => (
                          <DeckCard
                            key={`${entry.card.id}-${entry.board}`}
                            card={entry.card}
                            quantity={entry.quantity}
                            board={entry.board}
                            isCommander={isCommander(entry.card.id)}
                            onQuantityChange={handleQuantityChange}
                            onRemove={handleRemove}
                            onToggleCommander={handleToggleCommander}
                            onCardClick={setSelectedDetailCard}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {viewMode === 'grid' && (
            <DeckGridView
              cards={filteredCards}
              onQuantityChange={handleQuantityChange}
              onRemove={handleRemove}
              isCommander={isCommander}
              onToggleCommander={handleToggleCommander}
              onCardClick={setSelectedDetailCard}
            />
          )}

          {viewMode === 'text' && (
            <DeckTextView
              cards={filteredCards}
              isCommander={isCommander}
              onToggleCommander={handleToggleCommander}
              onCardClick={setSelectedDetailCard}
            />
          )}

        </div>

        {/* Right panel: Stats */}
        <div className="w-full shrink-0 lg:w-80">
          <div className="sticky top-6 rounded-xl border border-border bg-bg-surface p-4">
            <h2 className="mb-4 text-sm font-semibold text-font-secondary">
              Deck Statistics
            </h2>
            <DeckStats cards={statsCards} />
          </div>
        </div>
      </div>

      {/* Export modal */}
      {showExport && (
        <DeckExport
          deckName={deckName}
          cards={statsCards}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-dark/80 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-bg-surface p-6 shadow-2xl">
            <h2 className="mb-2 text-lg font-bold text-font-primary">
              Delete Deck
            </h2>
            <p className="mb-6 text-sm text-font-secondary">
              Are you sure you want to delete &quot;{deckName}&quot;? This
              action cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={deleteDeck}
                loading={deleting}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Card detail modal */}
      {selectedDetailCard && (
        <CardDetail
          card={selectedDetailCard}
          onClose={() => setSelectedDetailCard(null)}
          onPrintingSelect={(newPrinting) =>
            handlePrintingSelect(selectedDetailCard, newPrinting)
          }
        />
      )}
      {/* Import cards modal */}
      {showImport && (
        <ImportCardsModal
          deckId={deck.id}
          currentBoard={activeTab}
          onClose={() => setShowImport(false)}
          onCardsImported={(imported) => {
            for (const { card, board } of imported) {
              handleCardAdded(card, board)
            }
          }}
        />
      )}
    </div>
  )
}
