'use client'

import { Heart, Layers, Archive, Ban, Crown } from 'lucide-react'
import type { PlayerState, CardMap, BattlefieldCardState } from '@/lib/game/types'

function OpponentCard({ card, cardMap }: { card: BattlefieldCardState; cardMap: CardMap }) {
  const data = cardMap[card.instanceId] ?? cardMap[String(card.cardId)]
  return (
    <div
      className={`overflow-hidden rounded border transition-transform ${
        card.tapped ? 'rotate-90 border-font-muted' : 'border-border'
      } ${card.attacking ? 'ring-1 ring-bg-red' : ''} ${card.highlighted === 'red' ? 'ring-2 ring-bg-red' : ''}`}
      style={{ width: 48, height: 67 }}
      title={data?.name ?? 'Unknown'}
    >
      {data?.imageSmall ? (
        <img src={data.imageSmall} alt={data.name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-bg-cell p-0.5">
          <span className="text-center text-[6px] text-font-muted">{data?.name ?? '?'}</span>
        </div>
      )}
    </div>
  )
}

export default function OpponentField({ state, cardMap }: { state: PlayerState; cardMap: CardMap }) {
  const creatures = state.battlefield.filter((c) => {
    const d = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
    return d?.typeLine?.toLowerCase().includes('creature')
  })
  const lands = state.battlefield.filter((c) => {
    const d = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
    return d?.typeLine?.toLowerCase().includes('land')
  })
  const other = state.battlefield.filter((c) => {
    const d = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
    return d && !d.typeLine?.toLowerCase().includes('creature') && !d.typeLine?.toLowerCase().includes('land')
  })

  return (
    <div className="border-b border-border bg-bg-surface/50 px-3 py-2">
      {/* Stats row */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-wider text-font-muted">OPPONENT</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Heart size={10} className="text-bg-red" />
            <span className="text-xs font-bold text-font-primary">{state.life}</span>
          </div>
          <div className="flex items-center gap-1 text-font-muted">
            <Layers size={10} /><span className="text-[10px]">{state.libraryCount}</span>
          </div>
          <div className="flex items-center gap-1 text-font-muted">
            <span className="text-[10px]">Hand: {state.handCount}</span>
          </div>
          <div className="flex items-center gap-1 text-font-muted">
            <Archive size={10} /><span className="text-[10px]">{state.graveyard.length}</span>
          </div>
          <div className="flex items-center gap-1 text-font-muted">
            <Ban size={10} /><span className="text-[10px]">{state.exile.length}</span>
          </div>
        </div>
      </div>

      {/* Command zone */}
      {state.commandZone.length > 0 && (
        <div className="mb-1 flex items-center gap-1">
          <Crown size={9} className="text-yellow-500" />
          {state.commandZone.map((c) => {
            const d = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
            return <span key={c.instanceId} className="text-[9px] text-yellow-500">{d?.name ?? '?'}</span>
          })}
        </div>
      )}

      {/* Battlefield -- compact */}
      <div className="flex flex-wrap gap-1">
        {[...creatures, ...other, ...lands].map((c) => (
          <OpponentCard key={c.instanceId} card={c} cardMap={cardMap} />
        ))}
        {state.battlefield.length === 0 && (
          <span className="py-2 text-[9px] text-font-muted">No permanents</span>
        )}
      </div>
    </div>
  )
}
