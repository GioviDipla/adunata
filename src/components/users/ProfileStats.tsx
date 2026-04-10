'use client'

import Image from 'next/image'
import { Layers, Swords, Crown, Star } from 'lucide-react'

interface ProfileStatsProps {
  publicDeckCount: number
  totalDeckCount: number
  favoriteFormat: string | null
  colorFrequencies: Record<string, number>
  latestCommander: { id: string; name: string; image_small: string | null; image_normal: string | null } | null
  mostUsedCard: { id: string; name: string; image_small: string | null } | null
  uniqueCardsCount: number
  isSelf: boolean
}

const COLOR_LABELS: Record<string, { symbol: string; bg: string }> = {
  W: { symbol: 'W', bg: '#fffbd5' },
  U: { symbol: 'U', bg: '#0e68ab' },
  B: { symbol: 'B', bg: '#150b00' },
  R: { symbol: 'R', bg: '#d3202a' },
  G: { symbol: 'G', bg: '#00733e' },
}

export default function ProfileStats({
  publicDeckCount,
  totalDeckCount,
  favoriteFormat,
  colorFrequencies,
  latestCommander,
  mostUsedCard,
  uniqueCardsCount,
  isSelf,
}: ProfileStatsProps) {
  const sortedColors = Object.entries(colorFrequencies)
    .filter(([, cnt]) => cnt > 0)
    .sort(([, a], [, b]) => b - a)

  const hasStats = publicDeckCount > 0 || (isSelf && totalDeckCount > 0)

  // Self-view on a profile with zero public decks: even if the RPC returned
  // commander/most-used-card/colors derived from private decks, we suppress
  // the tiles that could leak identifiable cards. This keeps the "public
  // profile" preview honest — it shows what visitors would actually see.
  const hidePrivateDerivedTiles = isSelf && publicDeckCount === 0

  if (!hasStats) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-bg-card p-8 text-center">
        <p className="text-sm text-font-muted">
          {isSelf ? 'No decks yet. Create one to see your stats.' : 'No public decks yet.'}
        </p>
      </div>
    )
  }

  if (hidePrivateDerivedTiles) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-border bg-bg-surface p-4">
          <div className="flex items-center gap-2 text-xs text-font-muted">
            <Layers className="h-3.5 w-3.5" /> Public decks
          </div>
          <p className="mt-2 text-2xl font-bold text-font-primary">0</p>
          {totalDeckCount > 0 && (
            <p className="text-[11px] text-font-muted">
              {totalDeckCount} private (only you can see)
            </p>
          )}
        </div>
        <div className="rounded-xl border border-dashed border-border bg-bg-card p-6 text-center">
          <p className="text-sm text-font-muted">
            Toggle a deck to public to populate the rest of your public profile.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-border bg-bg-surface p-4">
        <div className="flex items-center gap-2 text-xs text-font-muted">
          <Layers className="h-3.5 w-3.5" /> Public decks
        </div>
        <p className="mt-2 text-2xl font-bold text-font-primary">{publicDeckCount}</p>
        {isSelf && totalDeckCount > publicDeckCount && (
          <p className="text-[11px] text-font-muted">
            {totalDeckCount - publicDeckCount} private (only you can see)
          </p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-bg-surface p-4">
        <div className="flex items-center gap-2 text-xs text-font-muted">
          <Swords className="h-3.5 w-3.5" /> Favorite format
        </div>
        <p className="mt-2 text-lg font-bold capitalize text-font-primary">
          {favoriteFormat ?? '—'}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-bg-surface p-4 sm:col-span-1">
        <div className="flex items-center gap-2 text-xs text-font-muted">
          <Star className="h-3.5 w-3.5" /> Colors
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {sortedColors.length > 0 ? (
            sortedColors.map(([letter, cnt]) => {
              const meta = COLOR_LABELS[letter]
              if (!meta) return null
              return (
                <div
                  key={letter}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{
                    backgroundColor: meta.bg,
                    color: letter === 'W' ? '#000' : '#fff',
                  }}
                  title={`${letter}: ${cnt} deck${cnt === 1 ? '' : 's'}`}
                >
                  {meta.symbol}
                </div>
              )
            })
          ) : (
            <span className="text-sm text-font-muted">—</span>
          )}
        </div>
      </div>

      {latestCommander && (
        <div className="rounded-xl border border-border bg-bg-surface p-4 sm:col-span-2">
          <div className="flex items-center gap-2 text-xs text-font-muted">
            <Crown className="h-3.5 w-3.5" /> Latest commander
          </div>
          <div className="mt-2 flex items-center gap-3">
            {latestCommander.image_small && (
              <Image
                src={latestCommander.image_small}
                alt={latestCommander.name}
                width={48}
                height={67}
                className="rounded"
                unoptimized
              />
            )}
            <p className="text-sm font-semibold text-font-primary">
              {latestCommander.name}
            </p>
          </div>
        </div>
      )}

      {mostUsedCard && (
        <div className="rounded-xl border border-border bg-bg-surface p-4">
          <div className="flex items-center gap-2 text-xs text-font-muted">
            <Star className="h-3.5 w-3.5" /> Most-used card
          </div>
          <div className="mt-2 flex items-center gap-2">
            {mostUsedCard.image_small && (
              <Image
                src={mostUsedCard.image_small}
                alt={mostUsedCard.name}
                width={32}
                height={45}
                className="rounded"
                unoptimized
              />
            )}
            <p className="text-xs font-semibold text-font-primary">
              {mostUsedCard.name}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-bg-surface p-4">
        <div className="flex items-center gap-2 text-xs text-font-muted">
          <Layers className="h-3.5 w-3.5" /> Unique cards
        </div>
        <p className="mt-2 text-2xl font-bold text-font-primary">{uniqueCardsCount}</p>
      </div>
    </div>
  )
}
