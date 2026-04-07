'use client'

import { RotateCcw, Trash2, Ban, Hand } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

export interface BattlefieldCard {
  instanceId: string
  card: CardRow
  tapped: boolean
}

interface BattlefieldZoneProps {
  title: string
  cards: BattlefieldCard[]
  onTapToggle: (instanceId: string) => void
  onSendToGraveyard: (instanceId: string) => void
  onExile: (instanceId: string) => void
  onReturnToHand: (instanceId: string) => void
}

export default function BattlefieldZone({
  title,
  cards,
  onTapToggle,
  onSendToGraveyard,
  onExile,
  onReturnToHand,
}: BattlefieldZoneProps) {
  const [contextMenu, setContextMenu] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [contextMenu])

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] font-semibold tracking-wider text-font-muted">
        {title} ({cards.length})
      </span>
      <div className="flex flex-wrap gap-1.5">
        {cards.map((bc) => (
          <div key={bc.instanceId} className="relative">
            <button
              onClick={() => onTapToggle(bc.instanceId)}
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu(bc.instanceId)
              }}
              className={`relative overflow-hidden rounded-lg border transition-transform ${
                bc.tapped
                  ? 'rotate-90 border-font-muted'
                  : 'border-border hover:border-bg-accent'
              }`}
              style={{ width: 68, height: 95 }}
              title={`${bc.card.name}${bc.tapped ? ' (tapped)' : ''} — right-click for options`}
            >
              {bc.card.image_small ? (
                <img
                  src={bc.card.image_small}
                  alt={bc.card.name}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-bg-cell p-1">
                  <span className="text-[7px] font-medium text-font-secondary">
                    {bc.card.type_line.split('—')[0].trim()}
                  </span>
                  <span className="text-center text-[8px] font-semibold leading-tight text-font-primary">
                    {bc.card.name}
                  </span>
                  {bc.card.power && bc.card.toughness && (
                    <span className="text-[9px] font-bold text-font-primary">
                      {bc.card.power}/{bc.card.toughness}
                    </span>
                  )}
                </div>
              )}
            </button>

            {/* Context menu */}
            {contextMenu === bc.instanceId && (
              <div
                ref={menuRef}
                className="absolute left-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-bg-surface shadow-xl"
              >
                <button
                  onClick={() => {
                    onTapToggle(bc.instanceId)
                    setContextMenu(null)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-font-primary hover:bg-bg-hover"
                >
                  <RotateCcw size={12} />
                  {bc.tapped ? 'Untap' : 'Tap'}
                </button>
                <button
                  onClick={() => {
                    onReturnToHand(bc.instanceId)
                    setContextMenu(null)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-font-primary hover:bg-bg-hover"
                >
                  <Hand size={12} />
                  Return to Hand
                </button>
                <button
                  onClick={() => {
                    onSendToGraveyard(bc.instanceId)
                    setContextMenu(null)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-font-primary hover:bg-bg-hover"
                >
                  <Trash2 size={12} />
                  Send to Graveyard
                </button>
                <button
                  onClick={() => {
                    onExile(bc.instanceId)
                    setContextMenu(null)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-font-primary hover:bg-bg-hover"
                >
                  <Ban size={12} />
                  Exile
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Empty slot */}
        {cards.length === 0 && (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-border bg-bg-card"
               style={{ width: 68, height: 95 }}>
            <span className="text-[9px] text-font-muted">Empty</span>
          </div>
        )}
      </div>
    </div>
  )
}
