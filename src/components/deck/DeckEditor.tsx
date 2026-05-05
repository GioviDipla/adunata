'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  Trash2,
  Download,
  Check,
  X,
  Pencil,
  Fish,
  FileText,
  Plus,
  Printer,
  Library,
  ClipboardCopy,
  Layers,
  BarChart3,
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CARD_GAME_COLUMNS } from '@/lib/supabase/columns'
import { Button } from '@/components/ui/Button'
import DeckStatsBar from './DeckStatsBar'
import AddCardSearch from './AddCardSearch'
import DeckContent from './DeckContent'
import { useDeckOverlay } from '@/lib/hooks/useDeckOverlay'
import DeckSectionsPanel from './DeckSectionsPanel'
import SidebarCards, { type SidebarPanel } from './SidebarCards'
import VisibilityToggle from './VisibilityToggle'
import ShareDeckButton from './ShareDeckButton'
import type { Database } from '@/types/supabase'
import type { SectionRow } from '@/types/deck'

// Heavy dependencies (recharts, jsPDF) — defer until the user opens the
// matching surface. Saves ~940KB of recharts off the initial bundle.
const DeckStats = dynamic(() => import('./DeckStats'), { ssr: false })
const DeckExport = dynamic(() => import('./DeckExport'), { ssr: false })
const ProxyPrintModal = dynamic(() => import('./ProxyPrintModal'), { ssr: false })
const ImportCardsModal = dynamic(() => import('./ImportCardsModal'), { ssr: false })
const CardDetail = dynamic(() => import('@/components/cards/CardDetail'), { ssr: false })
const AddToCollectionModal = dynamic(() => import('./AddToCollectionModal'), { ssr: false })

type CardRow = Database['public']['Tables']['cards']['Row']
type DeckRow = Database['public']['Tables']['decks']['Row']

interface DeckCardEntry {
  id: string
  card: CardRow
  quantity: number
  board: string
  /** Persisted at import time from Moxfield-style `*F*` / `*E*` / trailing F/E markers. */
  isFoil?: boolean
  section_id?: string | null
  tags?: string[]
  position_in_section?: number | null
}

interface DeckEditorProps {
  deck: DeckRow
  initialCards: DeckCardEntry[]
  initialSections?: SectionRow[]
}

type BoardTab = 'main' | 'sideboard' | 'maybeboard' | 'tokens' | 'removed'

export default function DeckEditor({ deck, initialCards, initialSections = [] }: DeckEditorProps) {
  const router = useRouter()
  const [cards, setCards] = useState<DeckCardEntry[]>(initialCards)
  const [sections, setSections] = useState<SectionRow[]>(initialSections)
  const [activeTab, setActiveTab] = useState<BoardTab>('main')
  const [isEditingName, setIsEditingName] = useState(false)
  const [deckName, setDeckName] = useState(deck.name)
  const [editingName, setEditingName] = useState(deck.name)
  const [showExport, setShowExport] = useState(false)
  const [showProxyPrint, setShowProxyPrint] = useState(false)
  const [showAddToCollection, setShowAddToCollection] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selectedDetailCard, setSelectedDetailCard] = useState<CardRow | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [overlayOn, setOverlayOn] = useState(false)
  const [overlayToast, setOverlayToast] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = `adunata:deck-overlay:${deck.id}`
    const raw = window.localStorage.getItem(key)
    if (raw === '1') setOverlayOn(true)
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

  // Count cards per section so the sections panel can show inline chips.
  // Cards on the 'removed' board don't count toward any section.
  const sectionCardCounts = useMemo(() => {
    const map: Record<string, number> = {}
    let uncategorized = 0
    for (const c of cards) {
      if (c.board === 'removed' || c.board === 'tokens') continue
      if (c.section_id) {
        map[c.section_id] = (map[c.section_id] ?? 0) + c.quantity
      } else {
        uncategorized += c.quantity
      }
    }
    return { map, uncategorized }
  }, [cards])

  const applySectionUpdates = useCallback(
    (updates: Array<{ id: string; section_id: string }>) => {
      if (!updates.length) return
      const map = new Map(updates.map((u) => [u.id, u.section_id]))
      setCards((prev) =>
        prev.map((c) =>
          map.has(c.id) ? { ...c, section_id: map.get(c.id) ?? null } : c,
        ),
      )
    },
    [],
  )

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
  // Lifted so the ShareDeckButton sees the current value even after the
  // user flips the VisibilityToggle pills — it skips the "make public
  // first?" confirm if the deck is already public.
  const [deckVisibility, setDeckVisibility] = useState<'private' | 'public'>(
    (deck.visibility as 'private' | 'public') ?? 'private',
  )
  // Pre-filled text for the import-from-string modal. Populated on
  // mount when the deck was just created via /decks/import and some
  // lines failed; the import page stashes the original failed lines
  // in sessionStorage so the user can retry them without re-typing.
  const [importPrefill, setImportPrefill] = useState<string>('')
  const [showExpandedStats, setShowExpandedStats] = useState(false)
  const [showSectionsPanel, setShowSectionsPanel] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = `retry-import-${deck.id}`
    const pending = sessionStorage.getItem(key)
    if (pending) {
      sessionStorage.removeItem(key)
      setImportPrefill(pending)
      setShowImport(true)
    }
  }, [deck.id])
  const [tokenSearch, setTokenSearch] = useState('')
  const [tokenSearchResults, setTokenSearchResults] = useState<CardRow[]>([])
  const [searchingTokens, setSearchingTokens] = useState(false)

  // Search tokens from DB + Scryfall
  useEffect(() => {
    if (tokenSearch.trim().length < 2) {
      setTokenSearchResults([])
      return
    }
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setSearchingTokens(true)
      try {
        const supabase = createClient()
        const { data: localTokens } = await supabase
          .from('cards')
          .select(CARD_GAME_COLUMNS)
          .ilike('type_line', '%Token%')
          .ilike('name', `%${tokenSearch.trim()}%`)
          .limit(10)

        if (controller.signal.aborted) return

        if (localTokens && localTokens.length >= 3) {
          setTokenSearchResults(localTokens as unknown as CardRow[])
          setSearchingTokens(false)
          return
        }

        const res = await fetch(
          `https://api.scryfall.com/cards/search?q=t:token+${encodeURIComponent(tokenSearch.trim())}&unique=cards`,
          { signal: controller.signal }
        )
        if (res.ok) {
          const data = await res.json()
          const scryfallTokens = (data.data ?? []).slice(0, 10).map((c: Record<string, unknown>) => ({
            id: c.id,
            scryfall_id: c.id as string,
            name: c.name,
            type_line: c.type_line,
            power: c.power ?? null,
            toughness: c.toughness ?? null,
            colors: c.colors ?? [],
            color_identity: c.color_identity ?? [],
            image_small: c.image_uris ? (c.image_uris as Record<string, string>).small : null,
            image_normal: c.image_uris ? (c.image_uris as Record<string, string>).normal : null,
            oracle_text: c.oracle_text ?? null,
            keywords: c.keywords ?? [],
            set_code: c.set ?? '',
            set_name: c.set_name ?? '',
            collector_number: c.collector_number ?? '',
            rarity: c.rarity ?? '',
            mana_cost: c.mana_cost ?? null,
            cmc: c.cmc ?? 0,
            layout: c.layout ?? null,
          }))
          if (!controller.signal.aborted) {
            setTokenSearchResults([...((localTokens ?? []) as CardRow[]), ...scryfallTokens])
          }
        }
      } catch { /* ignore abort */ }
      if (!controller.signal.aborted) setSearchingTokens(false)
    }, 400)
    return () => { controller.abort(); clearTimeout(timeout) }
  }, [tokenSearch])

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

  // Single pass over `cards` instead of 5 filter+reduce passes.
  const tabCounts = useMemo<Record<BoardTab, number | null>>(() => {
    const counts: Record<BoardTab, number> = {
      main: 0,
      sideboard: 0,
      maybeboard: 0,
      tokens: 0,
      removed: 0,
    }
    for (const c of cards) {
      if (c.board in counts) {
        counts[c.board as BoardTab] += c.quantity
      }
    }
    return counts
  }, [cards])

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
      // Soft-delete: shift the card to a 'removed' board so the user
      // can restore it later. From the Removed tab itself we hard-delete.
      if (board === 'removed') {
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
            ? { ...c, board: 'removed' }
            : c,
        ),
      )
      await fetch(`/api/decks/${deck.id}/cards`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: cardId,
          board: 'removed',
          current_board: board,
        }),
      })
    },
    [deck.id]
  )

  const handleMoveToBoard = useCallback(
    async (cardId: number, fromBoard: string, toBoard: string) => {
      setCards((prev) =>
        prev.map((c) =>
          c.card.id === cardId && c.board === fromBoard
            ? { ...c, board: toBoard }
            : c
        )
      )
      await fetch(`/api/decks/${deck.id}/cards`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: cardId,
          board: toBoard,
          current_board: fromBoard,
        }),
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

  const handleSectionChange = useCallback(
    async (deckCardId: string, sectionId: string | null) => {
      let prevSectionId: string | null | undefined
      setCards((prev) =>
        prev.map((c) => {
          if (c.id !== deckCardId) return c
          prevSectionId = c.section_id ?? null
          return { ...c, section_id: sectionId }
        }),
      )
      try {
        const res = await fetch(`/api/decks/${deck.id}/cards/${deckCardId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ section_id: sectionId }),
        })
        if (!res.ok) throw new Error('failed')
      } catch {
        const fallback = prevSectionId ?? null
        setCards((prev) =>
          prev.map((c) => (c.id === deckCardId ? { ...c, section_id: fallback } : c)),
        )
      }
    },
    [deck.id],
  )

  const handleTagsChange = useCallback(
    async (deckCardId: string, tags: string[]) => {
      let prevTags: string[] | undefined
      setCards((prev) =>
        prev.map((c) => {
          if (c.id !== deckCardId) return c
          prevTags = c.tags ?? []
          return { ...c, tags }
        }),
      )
      try {
        const res = await fetch(`/api/decks/${deck.id}/cards/${deckCardId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tags }),
        })
        if (!res.ok) throw new Error('failed')
      } catch {
        const fallback = prevTags ?? []
        setCards((prev) =>
          prev.map((c) => (c.id === deckCardId ? { ...c, tags: fallback } : c)),
        )
      }
    },
    [deck.id],
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

  const handleAddTokenWithSave = useCallback(async (card: CardRow, board: string) => {
    handleCardAdded(card, board)
    // Use upsert endpoint — the card may not exist in DB yet (Scryfall result)
    const scryfallId = (card as Record<string, unknown>).scryfall_id as string | undefined
    await fetch(`/api/decks/${deck.id}/cards/add-with-upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scryfall_id: scryfallId || String(card.id),
        board,
        card_data: {
          name: card.name,
          mana_cost: card.mana_cost,
          cmc: card.cmc,
          type_line: card.type_line,
          oracle_text: card.oracle_text,
          colors: card.colors,
          color_identity: card.color_identity,
          rarity: card.rarity,
          set_code: card.set_code,
          set_name: card.set_name,
          collector_number: card.collector_number,
          image_small: card.image_small,
          image_normal: card.image_normal,
          image_art_crop: card.image_art_crop,
          power: card.power,
          toughness: card.toughness,
          keywords: card.keywords,
          layout: (card as Record<string, unknown>).layout ?? null,
        },
      }),
    })
  }, [deck.id, handleCardAdded])

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
      // router.refresh() invalidates the client Router Cache so the /decks
      // list re-fetches after push — without it the deleted deck can linger.
      router.replace('/decks')
      router.refresh()
    }
    setDeleting(false)
  }

  const statsCards = useMemo(
    () =>
      cards
        .filter((c) => c.board !== 'removed')
        .map((c) => ({
          card: c.card,
          quantity: c.quantity,
          board: c.board,
        })),
    [cards]
  )

  // Union of color_identity across all commander cards (for Commander decks
  // — used by the stats panel to flag color identity violations).
  const commanderIdentity = useMemo<string[] | undefined>(() => {
    if (commanderCards.length === 0) return undefined
    const set = new Set<string>()
    for (const cc of commanderCards) {
      const ci = (cc.card.color_identity as string[] | null) ?? []
      for (const c of ci) set.add(c)
    }
    return Array.from(set)
  }, [commanderCards])

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
          <VisibilityToggle
            deckId={deck.id}
            initialVisibility={deckVisibility}
            onChange={setDeckVisibility}
          />
          <ShareDeckButton
            deckId={deck.id}
            deckName={deckName}
            visibility={deckVisibility}
            isOwner
            onVisibilityChanged={(next) => setDeckVisibility(next)}
          />
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
            variant="secondary"
            size="sm"
            onClick={() => setShowProxyPrint(true)}
          >
            <Printer className="h-3.5 w-3.5" />
            Proxy
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAddToCollection(true)}
            title="Pick which cards to add to your collection"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Collezione</span>
            <span className="sm:hidden">Coll</span>
          </Button>
          <Button
            variant={overlayOn ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setOverlayOn((p) => !p)}
            title="Show owned/missing badges based on your collection"
          >
            <Library className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Overlay</span>
            <span className="sm:hidden">Ovrl</span>
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

          {/* Expanded stats on mobile (hidden on lg where right panel shows) */}
          {showExpandedStats && (
            <div className="mb-3 sm:mb-4 lg:hidden rounded-xl border border-border bg-bg-surface p-4">
              <DeckStats cards={statsCards} format={deck.format} commanderIdentity={commanderIdentity} />
            </div>
          )}

          {/* Search bar */}
          <div className="mb-3 sm:mb-4">
            <AddCardSearch
              deckId={deck.id}
              onCardAdded={handleCardAdded}
              currentBoard={activeTab}
            />
          </div>

          {/* Sections panel — mobile only (desktop shows it in the right sidebar) */}
          <div className="mb-3 sm:mb-4 lg:hidden">
            <button
              onClick={() => setShowSectionsPanel((p) => !p)}
              className="flex w-full items-center justify-between rounded-lg bg-bg-cell px-3 py-2 text-xs text-font-secondary hover:text-font-primary"
            >
              <span className="font-semibold">Sections ({sections.length})</span>
              <span>{showSectionsPanel ? '−' : '+'}</span>
            </button>
            {showSectionsPanel && (
              <div className="mt-2">
                <DeckSectionsPanel
                  deckId={deck.id}
                  sections={sections}
                  onChange={setSections}
                  onAutoAssignUpdates={applySectionUpdates}
                  cardCounts={sectionCardCounts.map}
                  uncategorizedCount={sectionCardCounts.uncategorized}
                />
              </div>
            )}
          </div>

          {/* Board tabs */}
          <div className="mb-3 flex gap-1 rounded-lg bg-bg-cell p-1">
            {(['main', 'sideboard', 'maybeboard', 'tokens', 'removed'] as BoardTab[]).map((tab) => {
              return (
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
                    {tab === 'main' ? 'Main' : tab === 'sideboard' ? 'Side' : tab === 'maybeboard' ? 'Maybe' : tab === 'tokens' ? 'Tkns' : 'Rmvd'}
                  </span>
                  <span className="hidden sm:inline">
                    {tab === 'main' ? 'Main Deck' : tab === 'sideboard' ? 'Sideboard' : tab === 'maybeboard' ? 'Maybeboard' : tab === 'tokens' ? 'Tokens' : 'Removed'}
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

          {activeTab === 'tokens' && (
            <div className="mb-3">
              {/* Token search bar */}
              <div className="mb-3">
                <input
                  value={tokenSearch}
                  onChange={(e) => setTokenSearch(e.target.value)}
                  placeholder="Search tokens (e.g. Soldier, Zombie, Treasure)..."
                  className="w-full rounded-lg bg-bg-cell px-3 py-2 text-sm text-font-primary placeholder:text-font-muted outline-none focus:ring-1 focus:ring-bg-accent"
                />
              </div>

              {/* Search results */}
              {tokenSearch.trim().length >= 2 && (
                <div className="max-h-60 overflow-y-auto rounded-lg border border-border bg-bg-card">
                  {searchingTokens ? (
                    <div className="flex items-center justify-center py-4 text-sm text-font-muted">Searching...</div>
                  ) : tokenSearchResults.length === 0 ? (
                    <div className="py-4 text-center text-sm text-font-muted">No tokens found</div>
                  ) : (
                    tokenSearchResults.map((card) => (
                      <button
                        key={card.id}
                        onClick={() => handleAddTokenWithSave(card, 'tokens')}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg-hover border-b border-border/30 last:border-0"
                      >
                        {card.image_small && (
                          <img src={card.image_small} alt={card.name} className="h-12 w-auto rounded" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-font-primary truncate">{card.name}</div>
                          <div className="text-[10px] text-font-muted">
                            {card.type_line}
                            {card.power && card.toughness ? ` · ${card.power}/${card.toughness}` : ''}
                          </div>
                        </div>
                        <Plus className="h-4 w-4 shrink-0 text-font-accent" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

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

          <DeckContent
            cards={filteredCards}
            commanderCards={activeTab === 'removed' ? [] : commanderCards}
            sections={activeTab === 'removed' ? [] : sections}
            deckId={deck.id}
            isCommander={isCommander}
            onCardClick={setSelectedDetailCard}
            onQuantityChange={handleQuantityChange}
            onRemove={handleRemove}
            onToggleCommander={
              activeTab !== 'tokens' && activeTab !== 'removed'
                ? handleToggleCommander
                : undefined
            }
            onMoveToBoard={activeTab !== 'tokens' ? handleMoveToBoard : undefined}
            onSectionChange={
              activeTab === 'removed' ? undefined : handleSectionChange
            }
            onTagsChange={
              activeTab === 'removed' ? undefined : handleTagsChange
            }
            overlayByCardId={overlayByCardId}
          />
          {activeTab === 'removed' && (
            <p className="mt-3 text-[11px] text-font-muted">
              Cards removed from this deck. Use the context menu to restore them
              to Main Deck, Sideboard or Maybeboard.
            </p>
          )}
        </div>

        {/* Right panel: stats + sections — only on lg+. Order is user-
            persistable via SidebarCards (drag handle on hover), and each
            card is collapsible via its header chevron. Defaults: stats
            first, sections second. */}
        <div className="hidden lg:block w-80 shrink-0">
          <div className="sticky top-6">
            <SidebarCards
              deckId={deck.id}
              panels={[
                {
                  id: 'stats',
                  header: (
                    <h2 className="flex items-center gap-2 text-sm font-bold text-font-primary">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-bg-accent/10 text-font-accent">
                        <BarChart3 className="h-4 w-4" />
                      </span>
                      Stats
                      <span className="ml-auto text-[10px] font-normal text-font-muted">
                        {deck.format}
                      </span>
                    </h2>
                  ),
                  body: (
                    <DeckStats
                      cards={statsCards}
                      format={deck.format}
                      commanderIdentity={commanderIdentity}
                    />
                  ),
                },
                {
                  id: 'sections',
                  header: (
                    <h2 className="flex items-center gap-2 text-sm font-bold text-font-primary">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-bg-accent/10 text-font-accent">
                        <Layers className="h-4 w-4" />
                      </span>
                      Sections
                      {sections.length > 0 && (
                        <span className="ml-auto rounded-full bg-bg-cell px-2 py-0.5 text-[10px] font-semibold tabular-nums text-font-secondary">
                          {sections.length}
                        </span>
                      )}
                    </h2>
                  ),
                  body: (
                    <DeckSectionsPanel
                      chromeless
                      deckId={deck.id}
                      sections={sections}
                      onChange={setSections}
                      onAutoAssignUpdates={applySectionUpdates}
                      cardCounts={sectionCardCounts.map}
                      uncategorizedCount={sectionCardCounts.uncategorized}
                    />
                  ),
                },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Export modal */}
      {showExport && (
        <DeckExport
          deckId={deck.id}
          deckName={deckName}
          cards={statsCards}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* Proxy print modal */}
      {showProxyPrint && (
        <ProxyPrintModal
          deckName={deckName}
          cards={statsCards}
          onClose={() => setShowProxyPrint(false)}
        />
      )}

      {showAddToCollection && (
        <AddToCollectionModal
          cards={cards.filter((c) => c.board !== 'removed')}
          onClose={() => setShowAddToCollection(false)}
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
          onAddToDeck={(card) => {
            handleCardAdded(card, activeTab)
          }}
        />
      )}
      {/* Import cards modal */}
      {showImport && (
        <ImportCardsModal
          deckId={deck.id}
          currentBoard={activeTab}
          initialText={importPrefill}
          onClose={() => {
            setShowImport(false)
            setImportPrefill('')
          }}
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
