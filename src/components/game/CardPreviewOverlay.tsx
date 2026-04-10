'use client'

import { RotateCcw, Hand, Crown, Trash2, Ban, Play } from 'lucide-react'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

export type PreviewZone = 'hand' | 'battlefield' | 'commandZone' | 'library' | 'graveyard' | 'exile'

export interface PreviewState {
  card: CardRow
  zone?: PreviewZone
  instanceId?: string
  tapped?: boolean
}

interface CardPreviewOverlayProps {
  preview: PreviewState | null
  onClose: () => void
  isCommanderCard?: (card: CardRow) => boolean

  // Battlefield actions
  onTapToggle?: (instanceId: string) => void
  onReturnToHand?: (instanceId: string) => void
  onReturnToCommandZone?: (instanceId: string) => void
  onSendToGraveyard?: (instanceId: string) => void
  onExile?: (instanceId: string) => void

  // Hand actions
  onPlayCard?: (instanceId: string) => void
  onDiscardFromHand?: (instanceId: string) => void
  onExileFromHand?: (instanceId: string) => void

  // Command zone actions
  onPlayFromCommandZone?: (instanceId: string) => void
}

/**
 * Shared card preview modal. Used by both goldfish and multiplayer PlayGame.
 * Shows a zoomed image and context-aware action buttons based on `preview.zone`.
 */
export default function CardPreviewOverlay({
  preview,
  onClose,
  isCommanderCard,
  onTapToggle,
  onReturnToHand,
  onReturnToCommandZone,
  onSendToGraveyard,
  onExile,
  onPlayCard,
  onDiscardFromHand,
  onExileFromHand,
  onPlayFromCommandZone,
}: CardPreviewOverlayProps) {
  if (!preview) return null

  const act = (fn: (() => void) | undefined) => {
    if (!fn) return
    fn()
    onClose()
  }

  const canShowBattlefieldActions =
    preview.zone === 'battlefield' && preview.instanceId !== undefined
  const canShowHandActions =
    preview.zone === 'hand' && preview.instanceId !== undefined
  const canShowCommandZoneActions =
    preview.zone === 'commandZone' && preview.instanceId !== undefined

  const hasAnyActions =
    canShowBattlefieldActions || canShowHandActions || canShowCommandZoneActions

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-dark/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative flex max-h-[90vh] max-w-sm flex-col items-center gap-3 overflow-y-auto p-4">
        {preview.card.image_normal ? (
          <img
            src={preview.card.image_normal}
            alt={preview.card.name}
            className="max-h-[45vh] rounded-xl"
          />
        ) : preview.card.image_small ? (
          <img
            src={preview.card.image_small}
            alt={preview.card.name}
            className="max-h-[45vh] rounded-xl"
          />
        ) : (
          <div className="flex h-48 w-40 flex-col items-center justify-center gap-2 rounded-xl bg-bg-surface p-4">
            <span className="text-xs text-font-secondary">{preview.card.type_line}</span>
            <span className="text-center text-base font-bold text-font-primary">
              {preview.card.name}
            </span>
            {preview.card.oracle_text && (
              <p className="text-center text-xs text-font-secondary">
                {preview.card.oracle_text}
              </p>
            )}
          </div>
        )}
        <h3 className="text-sm font-bold text-font-primary">{preview.card.name}</h3>

        {hasAnyActions && (
          <div
            className="flex w-full flex-col gap-1 rounded-xl bg-bg-surface p-2"
            onClick={(e) => e.stopPropagation()}
          >
            {canShowBattlefieldActions && (
              <>
                {onTapToggle && (
                  <button
                    onClick={() => act(() => onTapToggle(preview.instanceId!))}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-font-primary active:bg-bg-cell"
                  >
                    <RotateCcw size={16} /> {preview.tapped ? 'Untap' : 'Tap'}
                  </button>
                )}
                {onReturnToHand && (
                  <button
                    onClick={() => act(() => onReturnToHand(preview.instanceId!))}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-font-primary active:bg-bg-cell"
                  >
                    <Hand size={16} /> Return to Hand
                  </button>
                )}
                {onReturnToCommandZone && isCommanderCard?.(preview.card) && (
                  <button
                    onClick={() => act(() => onReturnToCommandZone(preview.instanceId!))}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-bg-yellow active:bg-bg-yellow/20"
                  >
                    <Crown size={16} /> Return to Command Zone
                  </button>
                )}
                {onSendToGraveyard && (
                  <button
                    onClick={() => act(() => onSendToGraveyard(preview.instanceId!))}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-bg-red active:bg-bg-red/20"
                  >
                    <Trash2 size={16} /> Send to Graveyard
                  </button>
                )}
                {onExile && (
                  <button
                    onClick={() => act(() => onExile(preview.instanceId!))}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-font-secondary active:bg-bg-cell"
                  >
                    <Ban size={16} /> Exile
                  </button>
                )}
              </>
            )}

            {canShowHandActions && (
              <>
                {onPlayCard && (
                  <button
                    onClick={() => act(() => onPlayCard(preview.instanceId!))}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-font-accent active:bg-bg-accent/20"
                  >
                    <Play size={16} /> Play
                  </button>
                )}
                {onDiscardFromHand && (
                  <button
                    onClick={() => act(() => onDiscardFromHand(preview.instanceId!))}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-bg-red active:bg-bg-red/20"
                  >
                    <Trash2 size={16} /> Discard
                  </button>
                )}
                {onExileFromHand && (
                  <button
                    onClick={() => act(() => onExileFromHand(preview.instanceId!))}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-font-secondary active:bg-bg-cell"
                  >
                    <Ban size={16} /> Exile
                  </button>
                )}
              </>
            )}

            {canShowCommandZoneActions && onPlayFromCommandZone && (
              <button
                onClick={() => act(() => onPlayFromCommandZone(preview.instanceId!))}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-font-accent active:bg-bg-accent/20"
              >
                <Play size={16} /> Cast Commander
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
