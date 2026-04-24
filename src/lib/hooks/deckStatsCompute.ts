import { getCardTypeCategory } from '@/lib/utils/card'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

/**
 * Minimal shape the stats computation needs from a deck entry.
 * Kept local (instead of importing from DeckContent) to avoid a
 * component -> hook -> component cycle.
 */
export interface DeckCardEntry {
  card: CardRow
  quantity: number
  board: string
}

export const STATS_COLORS = ['W', 'U', 'B', 'R', 'G', 'C'] as const
export const CMC_BUCKETS = ['0', '1', '2', '3', '4', '5', '6', '7+'] as const

export type StatsColor = (typeof STATS_COLORS)[number]
export type WubrgColor = Exclude<StatsColor, 'C'>

export interface DeckStatsResult {
  totalMain: number
  totalSideboard: number
  avgCMC: number
  totalManaValue: number
  landCount: number
  costPips: Record<string, number>
  totalCostPips: number
  productionCounts: Record<string, number>
  totalProduction: number
  manaCurve: Record<string, number>
  cmcByColor: Record<string, Record<string, number>>
  maxCurve: number
  perColorCurve: Record<string, Record<string, number>>
  colorCounts: Record<string, number>
  totalColoredCards: number
  typeCounts: Record<string, number>
  totalValueEur: number
  totalValueUsd: number
  /** Count of cards that contribute mana — lands + rocks/dorks (by quantity). */
  manaSourceCount: number
  /** How many copies produce each WUBRG color (lands + rocks + dorks). */
  colorSourceCount: Record<WubrgColor, number>
  /** Cards grouped by rarity, desc by count. */
  rarityBreakdown: Array<{ rarity: string; count: number }>
  /** Top 10 sets by copies. */
  setBreakdown: Array<{ code: string; name: string | null; count: number }>
  /** Top 10 most expensive cards (main + sideboard). */
  topExpensive: Array<{
    cardId: number
    name: string
    priceEur: number
    priceUsd: number
    quantity: number
  }>
}

/** Count mana pips in a mana_cost string like "{2}{W}{U}{U}" */
function countManaPips(manaCost: string | null): Record<string, number> {
  if (!manaCost) return {}
  const pips: Record<string, number> = {}
  const symbols = manaCost.match(/\{([^}]+)\}/g) || []
  for (const sym of symbols) {
    const s = sym.replace(/[{}]/g, '')
    if (['W', 'U', 'B', 'R', 'G'].includes(s)) {
      pips[s] = (pips[s] || 0) + 1
    }
  }
  return pips
}

function isLandType(typeLine: string | null): boolean {
  return (typeLine ?? '').toLowerCase().includes('land')
}

function isRockOrDork(card: CardRow): boolean {
  const pm = (card.produced_mana as string[] | null) ?? []
  if (pm.length === 0) return false
  const tl = (card.type_line ?? '').toLowerCase()
  return (tl.includes('artifact') || tl.includes('creature')) && !tl.includes('land')
}

export function computeDeckStats(cards: DeckCardEntry[]): DeckStatsResult {
  const mainCards = cards.filter((c) => c.board === 'main' || c.board === 'commander')
  const sideboardCards = cards.filter((c) => c.board === 'sideboard')
  const allDeckCards = [...mainCards, ...sideboardCards]

  const totalMain = mainCards.reduce((s, c) => s + c.quantity, 0)
  const totalSideboard = sideboardCards.reduce((s, c) => s + c.quantity, 0)

  const nonLandCards = mainCards.filter((c) => !isLandType(c.card.type_line))
  const totalCMC = nonLandCards.reduce((s, c) => s + c.card.cmc * c.quantity, 0)
  const totalNonLandCount = nonLandCards.reduce((s, c) => s + c.quantity, 0)
  const avgCMC = totalNonLandCount > 0 ? totalCMC / totalNonLandCount : 0
  const totalManaValue = mainCards.reduce((s, c) => s + c.card.cmc * c.quantity, 0)

  // --- Mana Cost pips per color ---
  const costPips: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 }
  let totalCostPips = 0
  nonLandCards.forEach(({ card, quantity }) => {
    const pips = countManaPips(card.mana_cost)
    for (const [color, count] of Object.entries(pips)) {
      costPips[color] = (costPips[color] || 0) + count * quantity
      totalCostPips += count * quantity
    }
  })

  // --- Mana Production per color ---
  const productionCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
  let totalProduction = 0
  mainCards.forEach(({ card, quantity }) => {
    const pm = card.produced_mana as string[] | null
    if (pm && pm.length > 0) {
      for (const color of pm) {
        if (color in productionCounts) {
          productionCounts[color] += quantity
          totalProduction += quantity
        } else if (color === 'C' || !['W', 'U', 'B', 'R', 'G'].includes(color)) {
          productionCounts['C'] += quantity
          totalProduction += quantity
        }
      }
    }
  })

  // --- Mana curve ---
  const manaCurve: Record<string, number> = {}
  const cmcByColor: Record<string, Record<string, number>> = {}
  for (const b of CMC_BUCKETS) {
    manaCurve[b] = 0
    cmcByColor[b] = {}
  }
  nonLandCards.forEach(({ card, quantity }) => {
    const bucket = card.cmc >= 7 ? '7+' : String(Math.floor(card.cmc))
    manaCurve[bucket] += quantity
    const colors = card.colors && card.colors.length > 0 ? card.colors : ['C']
    for (const color of colors) {
      cmcByColor[bucket][color] = (cmcByColor[bucket][color] || 0) + quantity
    }
  })
  const maxCurve = Math.max(...Object.values(manaCurve), 1)

  // --- Mana curve per-color histogram ---
  const perColorCurve: Record<string, Record<string, number>> = {}
  for (const color of STATS_COLORS) {
    perColorCurve[color] = {}
    for (const b of CMC_BUCKETS) perColorCurve[color][b] = 0
  }
  nonLandCards.forEach(({ card, quantity }) => {
    const bucket = card.cmc >= 7 ? '7+' : String(Math.floor(card.cmc))
    const colors = card.colors && card.colors.length > 0 ? card.colors : ['C']
    for (const color of colors) {
      if (color in perColorCurve) {
        perColorCurve[color][bucket] += quantity
      }
    }
  })

  // --- Color distribution (card count) ---
  const colorCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
  mainCards.forEach(({ card, quantity }) => {
    if (card.colors && card.colors.length > 0) {
      card.colors.forEach((c) => {
        if (c in colorCounts) colorCounts[c] += quantity
      })
    } else if (!isLandType(card.type_line)) {
      colorCounts['C'] += quantity
    }
  })
  const totalColoredCards = Object.values(colorCounts).reduce((a, b) => a + b, 0) || 1

  // --- Type distribution ---
  const typeCounts: Record<string, number> = {}
  mainCards.forEach(({ card, quantity }) => {
    const cat = getCardTypeCategory(card.type_line)
    typeCounts[cat] = (typeCounts[cat] || 0) + quantity
  })
  const landCount = typeCounts['Lands'] || 0

  // --- Prices ---
  const totalValueEur = allDeckCards.reduce(
    (s, c) => s + (c.card.prices_eur || 0) * c.quantity,
    0,
  )
  const totalValueUsd = allDeckCards.reduce(
    (s, c) => s + (c.card.prices_usd || 0) * c.quantity,
    0,
  )

  // --- Mana sources (lands + rocks + dorks by quantity) ---
  let manaSourceCount = 0
  const colorSourceCount: Record<WubrgColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 }
  mainCards.forEach(({ card, quantity }) => {
    const land = isLandType(card.type_line)
    const rockDork = isRockOrDork(card)
    if (land || rockDork) {
      manaSourceCount += quantity
      const pm = (card.produced_mana as string[] | null) ?? []
      for (const color of pm) {
        if (color === 'W' || color === 'U' || color === 'B' || color === 'R' || color === 'G') {
          colorSourceCount[color] += quantity
        }
      }
    }
  })

  // --- Rarity breakdown (main + sideboard, sorted desc) ---
  const rarityMap = new Map<string, number>()
  allDeckCards.forEach(({ card, quantity }) => {
    const r = card.rarity ?? 'unknown'
    rarityMap.set(r, (rarityMap.get(r) ?? 0) + quantity)
  })
  const rarityBreakdown = Array.from(rarityMap.entries())
    .filter(([, count]) => count > 0)
    .map(([rarity, count]) => ({ rarity, count }))
    .sort((a, b) => b.count - a.count)

  // --- Top 10 sets by count ---
  const setMap = new Map<string, { code: string; name: string | null; count: number }>()
  allDeckCards.forEach(({ card, quantity }) => {
    const code = card.set_code ?? 'unknown'
    const existing = setMap.get(code)
    if (existing) existing.count += quantity
    else setMap.set(code, { code, name: card.set_name ?? null, count: quantity })
  })
  const setBreakdown = Array.from(setMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // --- Top 10 most expensive cards (by max(eur, usd) * qty) ---
  const topExpensive = allDeckCards
    .map(({ card, quantity }) => {
      const priceEur = card.prices_eur ?? 0
      const priceUsd = card.prices_usd ?? 0
      return {
        cardId: card.id,
        name: card.name,
        priceEur,
        priceUsd,
        quantity,
        _sortKey: Math.max(priceEur, priceUsd),
      }
    })
    .filter((e) => e._sortKey > 0)
    .sort((a, b) => b._sortKey - a._sortKey)
    .slice(0, 10)
    .map(({ cardId, name, priceEur, priceUsd, quantity }) => ({
      cardId,
      name,
      priceEur,
      priceUsd,
      quantity,
    }))

  return {
    totalMain,
    totalSideboard,
    avgCMC,
    totalManaValue,
    landCount,
    costPips,
    totalCostPips,
    productionCounts,
    totalProduction,
    manaCurve,
    cmcByColor,
    maxCurve,
    perColorCurve,
    colorCounts,
    totalColoredCards,
    typeCounts,
    totalValueEur,
    totalValueUsd,
    manaSourceCount,
    colorSourceCount,
    rarityBreakdown,
    setBreakdown,
    topExpensive,
  }
}
