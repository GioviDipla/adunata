'use client'

import { useEffect, useState } from 'react'
import { X, Check, Trash2 } from 'lucide-react'
import TagEditor from './TagEditor'
import type { SectionOption } from './SectionPicker'

interface Props {
  open: boolean
  onClose: () => void
  deckId: string
  deckCardId: string
  cardName: string
  currentBoard: string
  currentSectionId: string | null
  currentTags: string[]
  tagSuggestions: string[]
  sections: SectionOption[]
  onSectionChange?: (deckCardId: string, sectionId: string | null) => void
  onTagsChange?: (deckCardId: string, tags: string[]) => void
  onMoveToBoard?: (toBoard: string) => void
  onRemove?: () => void
}

const BOARD_LABELS: Record<string, string> = {
  main: 'Main deck',
  sideboard: 'Sideboard',
  maybeboard: 'Maybeboard',
  tokens: 'Tokens',
}

/**
 * Bottom-sheet action menu for a single deck_card on mobile / touch.
 * Opened by long-press. Exposes the full edit surface that desktop has
 * inline in the list view (section picker, tag editor, move-to-board,
 * remove) because touch UIs don't have hover / right-click.
 */
export default function DeckCardActionSheet({
  open,
  onClose,
  deckId,
  deckCardId,
  cardName,
  currentBoard,
  currentSectionId,
  currentTags,
  tagSuggestions,
  sections,
  onSectionChange,
  onTagsChange,
  onMoveToBoard,
  onRemove,
}: Props) {
  const [sectionId, setSectionId] = useState<string | null>(currentSectionId)

  useEffect(() => {
    setSectionId(currentSectionId)
  }, [currentSectionId])

  // Lock body scroll while the sheet is open so the backdrop actually
  // catches taps instead of bubbling into the list underneath.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  function pickSection(id: string | null) {
    if (id === sectionId) return
    setSectionId(id)
    // Parent handler owns persistence + rollback.
    onSectionChange?.(deckCardId, id)
  }

  const otherBoards = (['main', 'sideboard', 'maybeboard', 'tokens'] as const).filter(
    (b) => b !== currentBoard,
  )

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-label={`Actions for ${cardName}`}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col rounded-t-2xl border-t border-border bg-bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-font-primary">
              {cardName}
            </h3>
            <p className="text-[10px] text-font-muted">
              {BOARD_LABELS[currentBoard] ?? currentBoard}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-font-muted hover:bg-bg-hover hover:text-font-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* Section picker — radio list */}
          <section className="mb-4">
            <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-font-muted">
              Section
            </h4>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-bg-cell">
              <li>
                <button
                  onClick={() => pickSection(null)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-font-secondary hover:bg-bg-hover"
                >
                  <span className="flex h-4 w-4 items-center justify-center">
                    {sectionId == null && <Check className="h-4 w-4 text-font-accent" />}
                  </span>
                  Uncategorized
                </button>
              </li>
              {sections.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => pickSection(s.id)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-font-primary hover:bg-bg-hover"
                  >
                    <span className="flex h-4 w-4 items-center justify-center">
                      {sectionId === s.id && (
                        <Check className="h-4 w-4 text-font-accent" />
                      )}
                    </span>
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ background: s.color ?? '#475569' }}
                    />
                    <span className="truncate">{s.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Tag editor */}
          <section className="mb-4">
            <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-font-muted">
              Tags
            </h4>
            <div className="rounded-lg border border-border bg-bg-cell p-2">
              <TagEditor
                deckId={deckId}
                deckCardId={deckCardId}
                initialTags={currentTags}
                suggestions={tagSuggestions}
                onChange={(next) => onTagsChange?.(deckCardId, next)}
              />
            </div>
          </section>

          {/* Move to board */}
          {onMoveToBoard && (
            <section className="mb-4">
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-font-muted">
                Move to
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {otherBoards.map((b) => (
                  <button
                    key={b}
                    onClick={() => {
                      onMoveToBoard(b)
                      onClose()
                    }}
                    className="rounded-md border border-border bg-bg-cell px-3 py-2 text-sm text-font-primary hover:bg-bg-hover"
                  >
                    {BOARD_LABELS[b]}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Remove */}
          {onRemove && (
            <section className="pb-[env(safe-area-inset-bottom)]">
              <button
                onClick={() => {
                  onRemove()
                  onClose()
                }}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-bg-red/20 px-3 py-2.5 text-sm font-medium text-bg-red hover:bg-bg-red/30"
              >
                <Trash2 className="h-4 w-4" />
                Remove from deck
              </button>
            </section>
          )}
        </div>
      </div>
    </>
  )
}
