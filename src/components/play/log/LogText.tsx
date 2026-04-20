'use client'

import { useMemo, type ReactNode } from 'react'
import type { CardMap } from '@/lib/game/types'
import type { Database } from '@/types/supabase'
import CardChip from './CardChip'

type CardRow = Database['public']['Tables']['cards']['Row']

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toCardRow(cardId: number, data: CardMap[string]): CardRow {
  return {
    id: cardId,
    scryfall_id: '',
    name: data.name,
    name_it: null,
    mana_cost: data.manaCost ?? null,
    cmc: 0,
    type_line: data.typeLine,
    oracle_text: data.oracleText ?? null,
    colors: null,
    color_identity: [],
    rarity: '',
    set_code: '',
    set_name: '',
    collector_number: '',
    image_small: data.imageSmall ?? null,
    image_normal: data.imageNormal ?? null,
    image_art_crop: null,
    prices_usd: null,
    prices_usd_foil: null,
    prices_eur: null,
    prices_eur_foil: null,
    released_at: null,
    legalities: null,
    power: data.power ?? null,
    toughness: data.toughness ?? null,
    keywords: null,
    produced_mana: null,
    layout: null,
    card_faces: null,
    search_vector: null,
    last_price_update: null,
    created_at: '',
    updated_at: '',
  }
}

/**
 * Splits a log entry's plain-text sentence into a React node tree, wrapping
 * matched player names in bold and matched card names in an interactive
 * CardChip (dashed underline + hover/long-press preview).
 */
export default function LogText({
  text,
  cardMap,
  playerNames,
  onCardPreview,
}: {
  text: string
  cardMap: CardMap
  playerNames: Record<string, string>
  onCardPreview: (card: CardRow) => void
}) {
  const { regex, cardsByName, playerNameSet } = useMemo(() => {
    const cardsByName = new Map<string, { cardId: number; data: CardMap[string] }>()
    for (const data of Object.values(cardMap)) {
      if (!cardsByName.has(data.name)) {
        cardsByName.set(data.name, { cardId: data.cardId, data })
      }
    }

    const playerNameSet = new Set(Object.values(playerNames).filter(Boolean))

    // Longest names first so "Foo Bar" matches before "Foo".
    const allNames = [
      ...[...cardsByName.keys()],
      ...[...playerNameSet],
    ].sort((a, b) => b.length - a.length)

    if (allNames.length === 0) {
      return { regex: null, cardsByName, playerNameSet }
    }

    const pattern = `(${allNames.map(escapeRegex).join('|')})`
    return { regex: new RegExp(pattern, 'g'), cardsByName, playerNameSet }
  }, [cardMap, playerNames])

  if (!regex) return <>{text}</>

  const parts = text.split(regex)
  const rendered: ReactNode[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (i % 2 === 0) {
      if (part) rendered.push(<span key={i}>{part}</span>)
      continue
    }
    // Odd indices are matched captures.
    const card = cardsByName.get(part)
    if (card) {
      rendered.push(
        <CardChip
          key={i}
          name={part}
          imageNormal={card.data.imageNormal ?? card.data.imageSmall}
          onPreview={() => onCardPreview(toCardRow(card.cardId, card.data))}
        />,
      )
      continue
    }
    if (playerNameSet.has(part)) {
      rendered.push(
        <span key={i} className="font-semibold text-font-primary">
          {part}
        </span>,
      )
      continue
    }
    rendered.push(<span key={i}>{part}</span>)
  }

  return <>{rendered}</>
}
