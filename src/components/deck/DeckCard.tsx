'use client'

import { memo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Minus, Plus, RotateCcw, Sparkles } from 'lucide-react'
import CardContextMenu from './CardContextMenu'
import SectionPicker, { type SectionOption } from './SectionPicker'
import TagEditor from './TagEditor'
import UpscaledBadge from '@/components/cards/UpscaledBadge'
import { useCardGestures } from '@/lib/hooks/useCardGestures'
import { formatPreferredPrice } from '@/lib/utils/price'
import type { Database } from '@/types/supabase'

// Mobile action sheet only mounts after a long-press / tap-in-edit-mode
// — defer the chunk so the long list-view doesn't pre-mount one sheet
// per card.
const DeckCardActionSheet = dynamic(() => import('./DeckCardActionSheet'), {
  ssr: false,
})

type CardRow = Database['public']['Tables']['cards']['Row']

interface DeckCardProps {
  card: CardRow
  quantity: number
  board: string
  isCommander?: boolean
  onQuantityChange?: (cardId: number, quantity: number, board: string) => void
  onRemove?: (cardId: number, board: string) => void
  onToggleCommander?: (cardId: number, board: string) => void
  onCardClick?: (card: CardRow) => void
  onMoveToBoard?: (cardId: number, fromBoard: string, toBoard: string) => void
  isFoil?: boolean
  onToggleFoil?: (cardId: number, board: string) => void

  // Section / tag editing — only rendered when both `deckId` + `deckCardId`
  // are provided AND an edit handler (onRemove) is also wired.
  deckId?: string
  deckCardId?: string
  sections?: SectionOption[]
  sectionId?: string | null
  tags?: string[]
  tagSuggestions?: string[]
  onSectionChange?: (deckCardId: string, sectionId: string | null) => void
  onTagsChange?: (deckCardId: string, tags: string[]) => void

  /** Collection overlay badge — rendered when the deck view is in
   *  "show collection overlay" mode. `missing == 0` renders a green
   *  "Owned" chip; otherwise amber/red "Need N". */
  overlay?: { owned: number; needed: number; missing: number }
}

function ManaCostDisplay({ manaCost }: { manaCost: string | null }) {
  if (!manaCost) return null

  const symbols = manaCost.match(/\{[^}]+\}/g) || []
  return (
    <span className="flex items-center gap-0.5">
      {symbols.map((symbol, i) => {
        const s = symbol.replace(/[{}]/g, '')
        let bgClass = 'bg-bg-cell'
        let textClass = 'text-font-primary'

        switch (s) {
          case 'W':
            bgClass = 'bg-mana-white'
            textClass = 'text-bg-dark'
            break
          case 'U':
            bgClass = 'bg-mana-blue'
            textClass = 'text-font-primary'
            break
          case 'B':
            bgClass = 'bg-mana-black'
            textClass = 'text-font-primary'
            break
          case 'R':
            bgClass = 'bg-mana-red'
            textClass = 'text-font-primary'
            break
          case 'G':
            bgClass = 'bg-mana-green'
            textClass = 'text-font-primary'
            break
        }

        return (
          <span
            key={i}
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${bgClass} ${textClass}`}
          >
            {s}
          </span>
        )
      })}
    </span>
  )
}

export { ManaCostDisplay }

function DeckCardImpl({
  card,
  quantity,
  board,
  isCommander = false,
  onQuantityChange,
  onRemove,
  onToggleCommander,
  onCardClick,
  onMoveToBoard,
  isFoil,
  onToggleFoil,
  deckId,
  deckCardId,
  sections,
  sectionId,
  tags,
  tagSuggestions,
  onSectionChange,
  onTagsChange,
  overlay,
}: DeckCardProps) {
  const editingEnabled =
    !!onRemove && !!deckId && !!deckCardId && Array.isArray(sections)
  const [showPreview, setShowPreview] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [showActionSheet, setShowActionSheet] = useState(false)

  // Centralised gesture handling + user control inversion (desktop click /
  // mobile long-press), shared with the other deck-area surfaces.
  const { getHandlers } = useCardGestures()

  // Editing mode = onMoveToBoard or full edit wiring is present.
  // In editing mode the quick action opens the context menu / action sheet,
  // while the preview gesture (long-press / right-click) opens the card
  // detail modal. View mode (no edit handlers) keeps both gestures on
  // open-detail.
  const editingMode = !!onMoveToBoard || editingEnabled

  // Helper: opens the appropriate "edit" surface for the gesture's device.
  // Touch + full edit wiring → action sheet. Anything else → desktop
  // context-menu popover anchored at the pointer coords from the gesture.
  const openEditSurface = (coords: { x: number; y: number }, isTouch: boolean) => {
    if (isTouch && editingEnabled) {
      setShowActionSheet(true)
    } else {
      setContextMenu({ x: coords.x, y: coords.y })
    }
  }

  // In editing mode the quick action opens the edit surface at the pointer;
  // the preview gesture opens the card detail. View mode maps both to detail.
  const gestures = getHandlers({
    onPrimary: editingMode
      ? (coords, meta) => openEditSurface(coords, meta.pointerType === 'touch')
      : () => onCardClick?.(card),
    onSecondary: () => onCardClick?.(card),
  })

  return (
    <div
      {...gestures}
      onMouseEnter={() => setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
      className={`group relative flex items-center gap-1.5 sm:gap-2 rounded-lg border px-2 py-1.5 sm:px-3 sm:py-2 transition-colors hover:bg-bg-hover ${
        isCommander
          ? 'border-bg-yellow/50 bg-bg-yellow/5'
          : 'border-border bg-bg-card'
      }`}
    >
      {/* Quantity controls — desktop only. On mobile editing happens
          through the tap context menu / action sheet. */}
      <div className="flex items-center gap-0.5 sm:gap-1">
        {onQuantityChange && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onQuantityChange(card.id, quantity - 1, board)
            }}
            className="hidden sm:flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded bg-bg-cell text-font-secondary transition-colors hover:bg-bg-hover hover:text-font-primary"
            aria-label="Decrease quantity"
          >
            <Minus className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
          </button>
        )}
        <span className="w-4 sm:w-6 text-center text-xs sm:text-sm font-medium text-font-primary">
          {quantity}
        </span>
        {onQuantityChange && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onQuantityChange(card.id, quantity + 1, board)
            }}
            className="hidden sm:flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded bg-bg-cell text-font-secondary transition-colors hover:bg-bg-hover hover:text-font-primary"
            aria-label="Increase quantity"
          >
            <Plus className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
          </button>
        )}
      </div>

      {/* Card info */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {/* Name is part of the row's gesture surface — let the click bubble
            up to the root so it routes through the shared gesture handler. */}
        <button
          className="truncate text-xs sm:text-sm font-medium text-font-primary hover:text-font-accent transition-colors text-left"
        >
          {card.name}
        </button>
        {isFoil && (
          <Sparkles className="h-3 w-3 shrink-0 text-bg-yellow" aria-label="Foil" />
        )}
        <div className="hidden sm:flex">
          <ManaCostDisplay manaCost={card.mana_cost} />
        </div>
      </div>

      {/* Compact mana cost on mobile */}
      <span className="shrink-0 text-[10px] text-font-muted sm:hidden">
        {card.mana_cost?.replace(/[{}]/g, '') || ''}
      </span>

      {/* Collection overlay badge — owned vs missing */}
      {overlay && (
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
            overlay.missing === 0
              ? 'bg-bg-green/20 text-bg-green'
              : overlay.missing === 1
                ? 'bg-bg-yellow/20 text-bg-yellow'
                : 'bg-bg-red/20 text-bg-red'
          }`}
          title={`Owned ${overlay.owned} / Needed ${overlay.needed}`}
        >
          {overlay.missing === 0 ? 'Owned' : `Need ${overlay.missing}`}
        </span>
      )}

      {/* Type line */}
      <span className="hidden text-xs text-font-muted lg:inline">
        {card.type_line?.split('—')[0]?.trim()}
      </span>

      {/* Price — EUR (Cardmarket) primary, USD fallback */}
      {formatPreferredPrice(card, quantity) && (
        <span className="hidden text-xs text-font-secondary sm:inline">
          {formatPreferredPrice(card, quantity)}
        </span>
      )}

      {/* Section + tags edit affordances — desktop list view only */}
      {editingEnabled && deckId && deckCardId && sections && (
        <div
          className="hidden xl:flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <SectionPicker
            currentSectionId={sectionId ?? null}
            sections={sections}
            onChange={(sid) => onSectionChange?.(deckCardId, sid)}
          />
          <TagEditor
            initialTags={tags ?? []}
            suggestions={tagSuggestions ?? []}
            onChange={(next) => onTagsChange?.(deckCardId, next)}
          />
        </div>
      )}

      {/* Restore button — only on the Removed board, when editing is wired */}
      {board === 'removed' && onMoveToBoard && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onMoveToBoard(card.id, 'removed', 'main')
          }}
          className="flex h-5 sm:h-6 shrink-0 items-center gap-1 rounded-full bg-bg-green/20 px-2 text-[10px] sm:text-xs font-medium text-bg-green hover:bg-bg-green/30"
          aria-label="Restore card to main deck"
          title="Restore to main deck"
        >
          <RotateCcw className="h-3 w-3" />
          <span className="hidden sm:inline">Restore</span>
        </button>
      )}

      {/* Card image preview on hover */}
      {showPreview && card.image_normal && (
        <div className="pointer-events-none fixed z-50 hidden md:block"
          style={{ left: 'var(--preview-x, 16px)', top: 'var(--preview-y, 16px)' }}
          ref={(el) => {
            if (!el) return
            const parent = el.parentElement
            if (!parent) return
            const rect = parent.getBoundingClientRect()
            const x = Math.min(rect.right + 8, window.innerWidth - 240)
            const y = Math.max(8, Math.min(rect.top, window.innerHeight - 340))
            el.style.left = `${x}px`
            el.style.top = `${y}px`
          }}
        >
          <img
            src={card.image_normal}
            alt={card.name}
            className="h-auto w-56 rounded-lg shadow-2xl"
          />
          {card.has_upscaled_2x && (
            <UpscaledBadge className="absolute bottom-1.5 right-1.5" />
          )}
        </div>
      )}

      {/* Context menu for moving between boards + inline quantity / commander */}
      {contextMenu && onMoveToBoard && (
        <CardContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          currentBoard={board}
          quantity={quantity}
          onQuantityChange={
            onQuantityChange ? (next) => onQuantityChange(card.id, next, board) : undefined
          }
          isCommander={isCommander}
          onToggleCommander={
            onToggleCommander ? () => onToggleCommander(card.id, board) : undefined
          }
          isFoil={isFoil}
          onToggleFoil={
            onToggleFoil ? () => onToggleFoil(card.id, board) : undefined
          }
          onMoveToBoard={(toBoard) => onMoveToBoard(card.id, board, toBoard)}
          onRemove={onRemove ? () => onRemove(card.id, board) : undefined}
          sections={sections && deckCardId ? sections : undefined}
          currentSectionId={sectionId ?? null}
          onMoveToSection={
            sections && deckCardId && onSectionChange
              ? (sid) => onSectionChange(deckCardId, sid)
              : undefined
          }
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Mobile long-press action sheet — section / tag / move / remove.
          Only mounted when actually open so the dynamic chunk + state
          don't load per row on a 60-card deck. */}
      {showActionSheet && editingEnabled && deckId && deckCardId && sections && (
        <DeckCardActionSheet
          open
          onClose={() => setShowActionSheet(false)}
          deckId={deckId}
          deckCardId={deckCardId}
          cardName={card.name}
          currentBoard={board}
          currentSectionId={sectionId ?? null}
          currentTags={tags ?? []}
          tagSuggestions={tagSuggestions ?? []}
          sections={sections}
          onSectionChange={onSectionChange}
          onTagsChange={onTagsChange}
          onMoveToBoard={
            onMoveToBoard ? (toBoard) => onMoveToBoard(card.id, board, toBoard) : undefined
          }
          onRemove={onRemove ? () => onRemove(card.id, board) : undefined}
          isFoil={isFoil}
          onToggleFoil={
            onToggleFoil ? () => onToggleFoil(card.id, board) : undefined
          }
        />
      )}
    </div>
  )
}

// Memo: lists of 60-100 rows would otherwise re-render every row on
// any state change in the editor (active tab, overlay toggle, etc).
// The card object itself is stable across renders (held in DeckEditor
// state), and our handlers are wrapped in useCallback at the parent.
const DeckCard = memo(DeckCardImpl)
export default DeckCard
