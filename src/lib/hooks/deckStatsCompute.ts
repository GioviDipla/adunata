import { getCardTypeCategory } from '@/lib/utils/card'
import { categorize, type CategoryName } from '@/lib/deck/categorize'
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
  /** Composite mana base health score 0-100 with breakdown of contributors. */
  manaBaseHealth: {
    score: number
    breakdown: Array<{ label: string; value: number; max: number }>
  }
  /** Per-color pip demand vs source share gap (Karsten-ish). */
  colorGap: Record<WubrgColor, { pipDemand: number; sourceShare: number; gap: number }>
  /** Card counts per heuristic function category (qty-weighted). */
  functions: Record<
    'Commander' | 'Lands' | 'Ramp' | 'Tutors' | 'Card Draw' | 'Removal' | 'Protection' | 'Utility',
    number
  >
  /** Quantity-weighted CMC distribution by speed bucket (non-land). */
  speedTier: {
    early: number
    mid: number
    late: number
    total: number
    label: string
  }
  /** Tribal detection: top creature subtype + breakdown. */
  tribal: {
    topType: string | null
    topCount: number
    isTribal: boolean
    topByType: Array<{ type: string; count: number }>
  }
  /** Top keyword counts (qty-weighted, sorted desc). */
  keywords: Array<{ keyword: string; count: number }>
  /** Cards whose color_identity exceeds the commander's (Commander format only). */
  identityViolations: Array<{ name: string; offending: string[] }>
  /** Deterministic power-level estimate 1-10 + bracket label. */
  powerLevel: {
    score: number
    bracket: 'Casual' | 'Focused' | 'Optimized' | 'cEDH'
  }
}

export interface DeckStatsOptions {
  /** decks.format value, e.g. "commander", "standard". Lowercased internally. */
  format?: string
  /** Commander color identity — only set for Commander decks. */
  commanderIdentity?: string[]
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

export function computeDeckStats(
  cards: DeckCardEntry[],
  opts: DeckStatsOptions = {},
): DeckStatsResult {
  const format = (opts.format ?? '').toLowerCase()
  const isCommanderFormat = format === 'commander' || format === 'edh'
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

  // --- Mana Base Health Score (0-100) ---
  // Composite of:
  //   1. land delta vs format target,
  //   2. color source coverage vs pip demand (Karsten-ish),
  //   3. avg CMC penalty if curve too tall.
  const landTarget = isCommanderFormat ? 36 : format === 'standard' ? 24 : 24
  const landDeltaPenalty = Math.min(Math.abs(landCount - landTarget) * 4, 50)
  const landScore = Math.max(0, 100 - landDeltaPenalty)

  let coverageScore = 100
  const wubrg: WubrgColor[] = ['W', 'U', 'B', 'R', 'G']
  const totalColoredSources =
    colorSourceCount.W + colorSourceCount.U + colorSourceCount.B + colorSourceCount.R + colorSourceCount.G
  for (const c of wubrg) {
    const pips = costPips[c] ?? 0
    if (pips <= 0) continue
    const pipShare = totalCostPips > 0 ? pips / totalCostPips : 0
    const srcShare = totalColoredSources > 0 ? colorSourceCount[c] / totalColoredSources : 0
    // Penalize undersupply: shortfall in source share vs pip share.
    const shortfall = Math.max(0, pipShare - srcShare)
    coverageScore -= shortfall * 200
  }
  coverageScore = Math.max(0, Math.min(100, coverageScore))

  let curveScore = 100
  if (avgCMC > 3.5) curveScore -= (avgCMC - 3.5) * 25
  curveScore = Math.max(0, Math.min(100, curveScore))

  // Weighted: lands 0.4, coverage 0.4, curve 0.2.
  const manaBaseHealthScore = Math.round(
    landScore * 0.4 + coverageScore * 0.4 + curveScore * 0.2,
  )
  const manaBaseHealth = {
    score: manaBaseHealthScore,
    breakdown: [
      { label: `Lands vs target (${landTarget})`, value: Math.round(landScore), max: 100 },
      { label: 'Color source coverage', value: Math.round(coverageScore), max: 100 },
      { label: 'Curve fit', value: Math.round(curveScore), max: 100 },
    ],
  }

  // --- Color Gap (per-color pip demand vs source share) ---
  const colorGap: Record<WubrgColor, { pipDemand: number; sourceShare: number; gap: number }> = {
    W: { pipDemand: 0, sourceShare: 0, gap: 0 },
    U: { pipDemand: 0, sourceShare: 0, gap: 0 },
    B: { pipDemand: 0, sourceShare: 0, gap: 0 },
    R: { pipDemand: 0, sourceShare: 0, gap: 0 },
    G: { pipDemand: 0, sourceShare: 0, gap: 0 },
  }
  for (const c of wubrg) {
    const pipDemand = totalCostPips > 0 ? (costPips[c] ?? 0) / totalCostPips : 0
    const sourceShare = totalColoredSources > 0 ? colorSourceCount[c] / totalColoredSources : 0
    colorGap[c] = { pipDemand, sourceShare, gap: sourceShare - pipDemand }
  }

  // --- Function density ---
  const functions: DeckStatsResult['functions'] = {
    Commander: 0,
    Lands: 0,
    Ramp: 0,
    Tutors: 0,
    'Card Draw': 0,
    Removal: 0,
    Protection: 0,
    Utility: 0,
  }
  mainCards.forEach(({ card, quantity, board }) => {
    const cat: CategoryName | null = categorize(
      {
        type_line: card.type_line,
        oracle_text: card.oracle_text,
        produced_mana: card.produced_mana as string[] | null,
        keywords: card.keywords as string[] | null,
      },
      board,
    )
    if (cat) functions[cat] += quantity
  })

  // --- Speed tier (early / mid / late) ---
  let early = 0
  let mid = 0
  let late = 0
  nonLandCards.forEach(({ card, quantity }) => {
    if (card.cmc <= 2) early += quantity
    else if (card.cmc <= 4) mid += quantity
    else late += quantity
  })
  const speedTotal = early + mid + late
  let speedLabel = 'Mid-range'
  if (speedTotal > 0) {
    const ratios = { early: early / speedTotal, mid: mid / speedTotal, late: late / speedTotal }
    if (ratios.early >= ratios.mid && ratios.early >= ratios.late) speedLabel = 'Aggro tilt'
    else if (ratios.late >= ratios.mid && ratios.late >= ratios.early) speedLabel = 'Big mana'
    else speedLabel = 'Mid-range'
  }
  const speedTier = { early, mid, late, total: speedTotal, label: speedLabel }

  // --- Tribal & keyword concentration ---
  const subtypeCounts = new Map<string, number>()
  let creatureTotal = 0
  mainCards.forEach(({ card, quantity }) => {
    const tl = card.type_line ?? ''
    if (!tl.toLowerCase().includes('creature')) return
    creatureTotal += quantity
    const dashIdx = tl.indexOf('—')
    if (dashIdx < 0) return
    const subtypes = tl
      .slice(dashIdx + 1)
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    for (const sub of subtypes) {
      subtypeCounts.set(sub, (subtypeCounts.get(sub) ?? 0) + quantity)
    }
  })
  const topByType = Array.from(subtypeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
  const topEntry = topByType[0] ?? null
  const tribalThresholdAbs = 8
  const tribalThresholdRatio = creatureTotal > 0 ? topEntry && topEntry.count / creatureTotal >= 0.25 : false
  const isTribal =
    !!topEntry &&
    (topEntry.count >= tribalThresholdAbs || tribalThresholdRatio)
  const tribal = {
    topType: topEntry ? topEntry.type : null,
    topCount: topEntry ? topEntry.count : 0,
    isTribal: !!isTribal,
    topByType,
  }

  const keywordMap = new Map<string, number>()
  mainCards.forEach(({ card, quantity }) => {
    const kws = (card.keywords as string[] | null) ?? []
    for (const k of kws) {
      keywordMap.set(k, (keywordMap.get(k) ?? 0) + quantity)
    }
  })
  const keywords = Array.from(keywordMap.entries())
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // --- Color identity violations (Commander format only) ---
  const identityViolations: Array<{ name: string; offending: string[] }> = []
  if (isCommanderFormat && opts.commanderIdentity && opts.commanderIdentity.length >= 0) {
    const allowed = new Set(opts.commanderIdentity)
    const seen = new Set<string>()
    mainCards.forEach(({ card, board }) => {
      if (board === 'commander') return
      const ci = (card.color_identity as string[] | null) ?? []
      const offending = ci.filter((c) => !allowed.has(c))
      if (offending.length > 0 && !seen.has(card.name)) {
        seen.add(card.name)
        identityViolations.push({ name: card.name, offending })
      }
    })
  }

  // --- Power level estimate (1-10) ---
  // Source: IMPLEMENTATIONS.md "P1 — Power level estimator deterministico".
  // Spec calls for 5 weighted dimensions (combo / speed / tutor / interaction
  // / consistency). We do NOT have a combo DB yet, so combo is dropped from
  // the weighted sum and remaining weights are renormalized.
  // Weights (renormalized): speed 0.286, tutor 0.286, interaction 0.214, consistency 0.214.
  const totalMainQty = totalMain || 1
  const tutorCount = functions.Tutors
  const rampCount = functions.Ramp
  const drawCount = functions['Card Draw']
  const removalCount = functions.Removal
  const protectionCount = functions.Protection
  const interactionCount = removalCount + protectionCount

  // Fast mana ≈ ramp at CMC <= 2.
  let fastManaCount = 0
  mainCards.forEach(({ card, quantity, board }) => {
    if (board === 'commander') return
    const tl = (card.type_line ?? '').toLowerCase()
    if (tl.includes('land')) return
    if (card.cmc > 2) return
    const cat = categorize(
      {
        type_line: card.type_line,
        oracle_text: card.oracle_text,
        produced_mana: card.produced_mana as string[] | null,
        keywords: card.keywords as string[] | null,
      },
      board,
    )
    if (cat === 'Ramp') fastManaCount += quantity
  })

  // 0-10 sub-scores.
  const speedScore = Math.min(10, fastManaCount * 1.2 + (avgCMC <= 2.8 ? 2 : avgCMC <= 3.2 ? 1 : 0))
  const tutorScore = Math.min(10, tutorCount * 1.5)
  // Interaction normalized vs deck size; ~10% interaction = mid-tier.
  const interactionScore = Math.min(10, (interactionCount / totalMainQty) * 60)
  // Consistency: card draw + ramp density.
  const consistencyScore = Math.min(10, ((drawCount + rampCount) / totalMainQty) * 50)
  const comboScore = 0 // No combo DB

  const weightedRaw =
    speedScore * 0.286 +
    tutorScore * 0.286 +
    interactionScore * 0.214 +
    consistencyScore * 0.214 +
    comboScore * 0
  // Spec scale 0-10 — clamp 1-10 for UX.
  const powerScore = Math.max(1, Math.min(10, Math.round(weightedRaw * 10) / 10))
  let bracket: 'Casual' | 'Focused' | 'Optimized' | 'cEDH'
  if (powerScore < 4) bracket = 'Casual'
  else if (powerScore < 7) bracket = 'Focused'
  else if (powerScore < 9) bracket = 'Optimized'
  else bracket = 'cEDH'
  const powerLevel = { score: powerScore, bracket }

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
    manaBaseHealth,
    colorGap,
    functions,
    speedTier,
    tribal,
    keywords,
    identityViolations,
    powerLevel,
  }
}
