import type { LogEntry, CardMap } from '@/lib/game/types'

export interface CreatureStat {
  name: string
  instanceId: string
  playerId: string
  power: number
  toughness: number
}

export interface CardTypeBreakdown {
  creature: number
  instant: number
  sorcery: number
  enchantment: number
  artifact: number
  planeswalker: number
  land: number
  other: number
}

export interface PlayerStats {
  playerId: string
  cardsPlayed: number
  cardsByType: CardTypeBreakdown
  mostPlayedCard: { name: string; count: number } | null
  cardsDrawn: number
  lifeLost: number
  lifeGained: number
  maxLifeReached: number
  minLifeReached: number
  biggestLifeSwing: number
  totalDamageDealt: number
  totalDamageTaken: number
  attacksDeclared: number
  blocksDeclared: number
  mulligans: number
  actions: number
  creaturesPlayed: CreatureStat[]
}

export interface GameStats {
  turns: number
  totalActions: number
  winnerId: string | null
  duration: string | null
  players: PlayerStats[]
  // Global superlatives
  strongestByPower: CreatureStat | null
  strongestByToughness: CreatureStat | null
  largestCreature: CreatureStat | null
  mostTapped: { name: string; instanceId: string; times: number } | null
  mostAttacking: { name: string; instanceId: string; times: number } | null
  mostBlocking: { name: string; instanceId: string; times: number } | null
  biggestHit: { playerId: string; amount: number; cardName?: string } | null
  deadliestCreature: { name: string; instanceId: string; kills: number } | null
  cardsByType: CardTypeBreakdown
  mostPlayedCardGlobal: { name: string; count: number; playerId: string } | null
  firstBlood: { playerId: string; cardName?: string } | null
  // Card counts per player
  cardsOnBoardFinal: Record<string, number>
}

function classifyType(typeLine: string | undefined): keyof CardTypeBreakdown {
  if (!typeLine) return 'other'
  const t = typeLine.toLowerCase()
  if (t.includes('creature')) return 'creature'
  if (t.includes('instant')) return 'instant'
  if (t.includes('sorcery')) return 'sorcery'
  if (t.includes('enchantment')) return 'enchantment'
  if (t.includes('artifact')) return 'artifact'
  if (t.includes('planeswalker')) return 'planeswalker'
  if (t.includes('land')) return 'land'
  return 'other'
}

function emptyTypeBreakdown(): CardTypeBreakdown {
  return { creature: 0, instant: 0, sorcery: 0, enchantment: 0, artifact: 0, planeswalker: 0, land: 0, other: 0 }
}

function addType(bt: CardTypeBreakdown, typeLine: string | undefined): CardTypeBreakdown {
  const key = classifyType(typeLine)
  return { ...bt, [key]: bt[key] + 1 }
}

export function computeGameStats(
  log: LogEntry[],
  cardMap: CardMap,
  playerIds: string[],
  winnerId: string | null,
  startedAt: string | null,
  finishedAt: string,
): GameStats {
  // ---- Per-player accumulators ----
  const pInit = () => ({
    cardsPlayed: 0,
    cardsByType: emptyTypeBreakdown(),
    mostPlayedCard: null as { name: string; count: number } | null,
    cardsPlayedByName: new Map<string, number>(),
    cardsDrawn: 0,
    lifeLost: 0,
    lifeGained: 0,
    maxLifeReached: 20,
    minLifeReached: 20,
    biggestLifeSwing: 0,
    totalDamageDealt: 0,
    totalDamageTaken: 0,
    attacksDeclared: 0,
    blocksDeclared: 0,
    mulligans: 0,
    actions: 0,
    creaturesPlayed: [] as CreatureStat[],
    life: 20,
  })

  const acc: Record<string, ReturnType<typeof pInit>> = {}
  for (const pid of playerIds) acc[pid] = pInit()

  // ---- Global accumulators ----
  const tapCounts = new Map<string, { name: string; instanceId: string; playerId: string; times: number }>()
  const attackCounts = new Map<string, { name: string; instanceId: string; playerId: string; times: number }>()
  const blockCounts = new Map<string, { name: string; instanceId: string; playerId: string; times: number }>()
  const damageDealtByCreature = new Map<string, { name: string; instanceId: string; playerId: string; damage: number; kills: number }>()
  let biggestHit: GameStats['biggestHit'] = null
  let firstBlood: GameStats['firstBlood'] = null
  let firstLifeChangeFound = false

  const globalCardsPlayed = new Map<string, { name: string; count: number; playerId: string }>()
  let globalTypeCount = emptyTypeBreakdown()
  let turns = 0

  // ---- Iterate log ----
  for (const entry of log) {
    const pid = entry.playerId ?? ''
    const p = acc[pid]
    if (p) p.actions++

    const data = (entry.data ?? {}) as Record<string, unknown>

    switch (entry.action) {
      case 'play_card': {
        const instanceId = data.instanceId as string | undefined
        if (!instanceId) break
        const card = cardMap[instanceId]
        if (!card) break

        const cardType = card.typeLine
        if (p) {
          p.cardsPlayed++
          p.cardsByType = addType(p.cardsByType, cardType)
          p.cardsPlayedByName.set(card.name, (p.cardsPlayedByName.get(card.name) ?? 0) + 1)

          // Creature stats
          if (cardType?.toLowerCase().includes('creature')) {
            const power = parseInt(card.power ?? '0', 10) || 0
            const toughness = parseInt(card.toughness ?? '0', 10) || 0
            p.creaturesPlayed.push({ name: card.name, instanceId, playerId: pid, power, toughness })
          }
        }

        globalTypeCount = addType(globalTypeCount, cardType)
        const prev = globalCardsPlayed.get(card.name)
        if (prev) prev.count++
        else globalCardsPlayed.set(card.name, { name: card.name, count: 1, playerId: pid })
        break
      }

      case 'draw': {
        if (p) p.cardsDrawn++
        break
      }

      case 'draw_x': {
        const count = (data.count as number) ?? 1
        if (p) p.cardsDrawn += count
        break
      }

      case 'life_change': {
        const amount = (data.amount as number) ?? 0
        const targetPid = (data.targetPlayerId as string) ?? pid
        const tp = acc[targetPid]
        if (tp) {
          tp.life += amount
          if (amount < 0) {
            tp.lifeLost += Math.abs(amount)
            tp.totalDamageTaken += Math.abs(amount)
            tp.biggestLifeSwing = Math.max(tp.biggestLifeSwing, Math.abs(amount))
            tp.minLifeReached = Math.min(tp.minLifeReached, tp.life)

            if (!firstLifeChangeFound) {
              firstBlood = { playerId: pid, cardName: data.cardName as string | undefined }
              firstLifeChangeFound = true
            }

            if (Math.abs(amount) > (biggestHit?.amount ?? 0)) {
              biggestHit = {
                playerId: pid,
                amount: Math.abs(amount),
                cardName: data.cardName as string | undefined,
              }
            }
          } else {
            tp.lifeGained += amount
            tp.maxLifeReached = Math.max(tp.maxLifeReached, tp.life)
          }
        }
        break
      }

      case 'declare_attackers': {
        if (p) p.attacksDeclared++
        const attackerIds = (data.attackerIds as string[]) ?? []
        const targetPlayerId = (data.targetPlayerId as string) ?? ''
        for (const aid of attackerIds) {
          const card = cardMap[aid]
          const prev2 = attackCounts.get(aid)
          if (prev2) prev2.times++
          else attackCounts.set(aid, { name: card?.name ?? 'Unknown', instanceId: aid, playerId: pid, times: 1 })
        }
        break
      }

      case 'declare_blockers': {
        if (p) p.blocksDeclared++
        const blockerAssignments = (data.blockerAssignments as { blockerId: string; attackerId: string }[]) ?? []
        for (const ba of blockerAssignments) {
          const card = cardMap[ba.blockerId]
          const prev2 = blockCounts.get(ba.blockerId)
          if (prev2) prev2.times++
          else blockCounts.set(ba.blockerId, { name: card?.name ?? 'Unknown', instanceId: ba.blockerId, playerId: pid, times: 1 })
        }
        break
      }

      case 'combat_damage':
      case 'resolve_combat_damage': {
        const damageToPlayer = (data.damageToPlayer as number) ?? 0
        const creaturesDamaged = (data.creaturesDamaged as { instanceId: string; damage: number; destroyed: boolean }[]) ?? []
        if (p) p.totalDamageDealt += damageToPlayer
        for (const cd of creaturesDamaged) {
          const card = cardMap[cd.instanceId]
          const prev2 = damageDealtByCreature.get(cd.instanceId) || {
            name: card?.name ?? 'Unknown',
            instanceId: cd.instanceId,
            playerId: pid,
            damage: 0,
            kills: 0,
          }
          prev2.damage += cd.damage
          if (cd.destroyed) prev2.kills++
          damageDealtByCreature.set(cd.instanceId, prev2)
        }
        break
      }

      case 'tap': {
        const instanceId = data.instanceId as string | undefined
        if (!instanceId) break
        const prev2 = tapCounts.get(instanceId)
        if (prev2) prev2.times++
        else {
          const card = cardMap[instanceId]
          tapCounts.set(instanceId, { name: card?.name ?? 'Unknown', instanceId, playerId: pid, times: 1 })
        }
        break
      }

      case 'mulligan': {
        if (p) p.mulligans++
        break
      }

      case 'game_start':
        turns = 0
        break

      case 'phase_change': {
        const newPhase = data.phase as string
        if (newPhase === 'untap') turns++
        break
      }
    }
  }

  // ---- Compute derived stats ----
  const playerStats: PlayerStats[] = playerIds.map((pid) => {
    const a = acc[pid]
    let mostPlayedCard: PlayerStats['mostPlayedCard'] = null
    let maxCount = 0
    for (const [name, count] of a.cardsPlayedByName) {
      if (count > maxCount) {
        maxCount = count
        mostPlayedCard = { name, count }
      }
    }
    return {
      playerId: pid,
      cardsPlayed: a.cardsPlayed,
      cardsByType: a.cardsByType,
      mostPlayedCard,
      cardsDrawn: a.cardsDrawn,
      lifeLost: a.lifeLost,
      lifeGained: a.lifeGained,
      maxLifeReached: a.maxLifeReached,
      minLifeReached: a.minLifeReached,
      biggestLifeSwing: a.biggestLifeSwing,
      totalDamageDealt: a.totalDamageDealt,
      totalDamageTaken: a.totalDamageTaken,
      attacksDeclared: a.attacksDeclared,
      blocksDeclared: a.blocksDeclared,
      mulligans: a.mulligans,
      actions: a.actions,
      creaturesPlayed: a.creaturesPlayed,
    }
  })

  // ---- Global superlatives ----
  const allCreatures = playerStats.flatMap((ps) => ps.creaturesPlayed)

  const strongestByPower: CreatureStat | null =
    allCreatures.length > 0
      ? allCreatures.reduce((best, c) => (c.power > best.power ? c : best))
      : null

  const strongestByToughness: CreatureStat | null =
    allCreatures.length > 0
      ? allCreatures.reduce((best, c) => (c.toughness > best.toughness ? c : best))
      : null

  const largestCreature: CreatureStat | null =
    allCreatures.length > 0
      ? allCreatures.reduce((best, c) => (c.power + c.toughness > best.power + best.toughness ? c : best))
      : null

  const mostTapped = [...tapCounts.values()].sort((a, b) => b.times - a.times)[0] ?? null

  const mostAttacking = [...attackCounts.values()].sort((a, b) => b.times - a.times)[0] ?? null

  const mostBlocking = [...blockCounts.values()].sort((a, b) => b.times - a.times)[0] ?? null

  const deadliestArr = [...damageDealtByCreature.values()].sort((a, b) => b.kills - a.kills)
  const deadliestCreature = deadliestArr.length > 0 && deadliestArr[0].kills > 0 ? deadliestArr[0] : null

  const mostPlayedArr = [...globalCardsPlayed.values()].sort((a, b) => b.count - a.count)
  const mostPlayedCardGlobal = mostPlayedArr.length > 0 ? mostPlayedArr[0] : null

  // Duration
  let duration: string | null = null
  if (startedAt && finishedAt) {
    const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
    const mins = Math.floor(ms / 60000)
    const secs = Math.floor((ms % 60000) / 1000)
    duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  }

  return {
    turns,
    totalActions: log.length,
    winnerId,
    duration,
    players: playerStats,
    strongestByPower,
    strongestByToughness,
    largestCreature,
    mostTapped,
    mostAttacking,
    mostBlocking,
    biggestHit,
    deadliestCreature,
    cardsByType: globalTypeCount,
    mostPlayedCardGlobal,
    firstBlood,
    cardsOnBoardFinal: {},
  }
}
