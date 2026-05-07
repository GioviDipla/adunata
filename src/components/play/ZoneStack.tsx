'use client'

import type * as React from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Archive, Ban, Layers } from 'lucide-react'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

export type ZoneKind = 'graveyard' | 'exile' | 'library'

interface ZoneStackProps {
  kind: ZoneKind
  count: number
  topCard?: CardRow | null
  /** Drop target id; `undefined` disables drop. */
  dropId?: string
  /** Zone string used by the engine (e.g. 'graveyard', 'exile', 'libraryTop'). */
  dropTo?: string
  onTap: () => void
}

const META: Record<ZoneKind, { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; ring: string; tint: string }> = {
  graveyard: { label: 'GRAVE', icon: Archive,  ring: 'border-zinc-500/50',  tint: 'text-zinc-300' },
  exile:     { label: 'EXILE', icon: Ban,      ring: 'border-red-500/50',   tint: 'text-red-300' },
  library:   { label: 'LIB',   icon: Layers,   ring: 'border-blue-500/50',  tint: 'text-blue-300' },
}

export default function ZoneStack({ kind, count, topCard, dropId, dropTo, onTap }: ZoneStackProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: dropId ?? `zone-${kind}-noop`,
    data: dropTo ? { to: dropTo } : undefined,
    disabled: !dropId,
  })
  const meta = META[kind]
  const Icon = meta.icon
  // Library top stays hidden (face-down). Graveyard/exile show the top card.
  const showTop = kind !== 'library' && topCard?.image_small

  return (
    <button
      ref={dropId ? setNodeRef : undefined}
      onClick={onTap}
      aria-label={`${meta.label} (${count})`}
      className={`relative flex shrink-0 flex-col items-center justify-end overflow-hidden rounded-md border bg-bg-card transition-all active:brightness-110 ${meta.ring} ${
        isOver ? 'ring-2 ring-bg-accent ring-offset-1 ring-offset-bg-surface scale-105' : ''
      }`}
      style={{ width: 56, height: 78 }}
    >
      {showTop ? (
        <img
          src={topCard!.image_small!}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <Icon size={28} className={`absolute inset-0 m-auto opacity-50 ${meta.tint}`} />
      )}
      <span className="relative z-10 w-full bg-bg-dark/75 px-1 py-0.5 text-center text-[9px] font-bold tracking-wider text-font-white">
        {meta.label} · {count}
      </span>
    </button>
  )
}
