/// <reference lib="webworker" />

export interface SimCard {
  cmc: number
  is_land: boolean
  is_rock: boolean
}

export interface SimInput {
  mainDeck: SimCard[]
  commanderCmc: number | null
  iterations: number
  seed?: number
}

export interface SimResult {
  keepRate: number
  screwRate: number
  floodRate: number
  turnToCommanderP50: number | null
  turnToCommanderP90: number | null
  samples: number
  /** % of non-land non-rock cards castable on or before their CMC turn. */
  castableOnCurve: number
  /** Average mana available (lands + rocks) at end of turn 5. */
  avgManaSpentByT5: number
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Mulligan (London): if hand has <2 or >5 lands we mulligan (up to 3 times).
function londonMulligan(
  deck: SimCard[],
  rng: () => number,
): { hand: SimCard[]; library: SimCard[]; mull: number } | null {
  for (let mull = 0; mull <= 3; mull++) {
    const shuffled = shuffle(deck, rng)
    const hand = shuffled.slice(0, 7)
    const lands = hand.filter((c) => c.is_land).length
    if (lands >= 2 && lands <= 5) return { hand, library: shuffled.slice(7), mull }
    if (mull === 3) return { hand, library: shuffled.slice(7), mull }
  }
  return null
}

interface RunOnceResult {
  keep: boolean
  tt: number | null
  /** Number of non-land non-rock cards drawn-by-cmc-turn that were castable. */
  castableHits: number
  /** Number of non-land non-rock cards considered (drawn by their cmc turn). */
  castableConsidered: number
  /** Total mana available (lands + rocks) at end of turn 5. */
  manaAtT5: number
}

function runOnce(input: SimInput, rng: () => number): RunOnceResult {
  const res = londonMulligan(input.mainDeck, rng)
  if (!res) {
    return { keep: false, tt: null, castableHits: 0, castableConsidered: 0, manaAtT5: 0 }
  }
  const { hand, library, mull } = res
  const keep = mull === 0
  let landsInPlay = 0
  let rocksInPlay = 0
  const currentHand = hand.slice()
  const currentLib = library.slice()
  let castCommanderTurn: number | null = null
  let castableHits = 0
  let castableConsidered = 0
  let manaAtT5 = 0
  // Track non-land non-rock cards seen this game so we don't double-count.
  // Each card object is unique (flat-mapped from quantity), reference dedupe.
  const checked = new Set<SimCard>()
  for (let turn = 1; turn <= 10; turn++) {
    if (turn > 1) {
      const drawn = currentLib.shift()
      if (drawn) currentHand.push(drawn)
    }
    // Play a land if any
    const landIdx = currentHand.findIndex((c) => c.is_land)
    if (landIdx >= 0) {
      currentHand.splice(landIdx, 1)
      landsInPlay++
    }
    // Cast rocks greedily
    let played = true
    while (played) {
      played = false
      const rockIdx = currentHand.findIndex(
        (c) => c.is_rock && c.cmc <= landsInPlay + rocksInPlay,
      )
      if (rockIdx >= 0) {
        currentHand.splice(rockIdx, 1)
        rocksInPlay++
        played = true
      }
    }
    const manaPool = landsInPlay + rocksInPlay
    // Castability check: any non-land non-rock spell whose cmc == turn
    // (drawn already by virtue of being in hand) — could it be cast this turn?
    for (const c of currentHand) {
      if (c.is_land || c.is_rock) continue
      if (checked.has(c)) continue
      if (c.cmc <= turn) {
        // Card was castable on its CMC turn (already past).
        checked.add(c)
        castableConsidered++
        if (c.cmc <= manaPool) castableHits++
      }
    }
    if (turn === 5) manaAtT5 = manaPool
    // Commander castable?
    if (
      castCommanderTurn === null &&
      input.commanderCmc != null &&
      manaPool >= input.commanderCmc
    ) {
      castCommanderTurn = turn
    }
  }
  return { keep, tt: castCommanderTurn, castableHits, castableConsidered, manaAtT5 }
}

;(self as unknown as DedicatedWorkerGlobalScope).onmessage = (
  ev: MessageEvent<SimInput>,
) => {
  const input = ev.data
  const seed = input.seed ?? 0xc0ffee
  let state = seed | 0
  const rng = () => {
    state = (state * 1664525 + 1013904223) | 0
    return (state >>> 0) / 0xffffffff
  }

  let keepCount = 0
  let screwCount = 0
  let floodCount = 0
  const castTurns: number[] = []
  let castableHitsSum = 0
  let castableConsideredSum = 0
  let manaAtT5Sum = 0

  for (let i = 0; i < input.iterations; i++) {
    // Starting hand probe
    const shuffled = shuffle(input.mainDeck, rng)
    const hand = shuffled.slice(0, 7)
    const lands7 = hand.filter((c) => c.is_land).length
    if (lands7 >= 2 && lands7 <= 5) keepCount++

    // Full sim for cast turn
    const r = runOnce(input, rng)
    if (r.tt != null) castTurns.push(r.tt)
    castableHitsSum += r.castableHits
    castableConsideredSum += r.castableConsidered
    manaAtT5Sum += r.manaAtT5

    // Screw: after T3 draws, still <2 lands in play.
    // Flood: after T7 draws, >7 lands (in play + hand).
    const lib = shuffled.slice(7)
    let handLands = lands7
    let lands = 0
    for (let t = 1; t <= 3; t++) {
      if (t > 1) {
        const d = lib.shift()
        if (d?.is_land) handLands++
      }
      if (handLands > 0) {
        handLands--
        lands++
      }
    }
    if (lands < 2) screwCount++

    let landsT7 = lands
    let inHand = handLands
    for (let t = 4; t <= 7; t++) {
      const d = lib.shift()
      if (d?.is_land) inHand++
      if (inHand > 0) {
        inHand--
        landsT7++
      }
    }
    if (landsT7 + inHand > 7) floodCount++
  }

  castTurns.sort((a, b) => a - b)
  const p = (pct: number): number | null =>
    castTurns.length === 0
      ? null
      : castTurns[Math.min(castTurns.length - 1, Math.floor(pct * castTurns.length))]

  const result: SimResult = {
    keepRate: input.iterations > 0 ? keepCount / input.iterations : 0,
    screwRate: input.iterations > 0 ? screwCount / input.iterations : 0,
    floodRate: input.iterations > 0 ? floodCount / input.iterations : 0,
    turnToCommanderP50: p(0.5),
    turnToCommanderP90: p(0.9),
    samples: input.iterations,
    castableOnCurve:
      castableConsideredSum > 0 ? castableHitsSum / castableConsideredSum : 0,
    avgManaSpentByT5: input.iterations > 0 ? manaAtT5Sum / input.iterations : 0,
  }
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(result)
}
