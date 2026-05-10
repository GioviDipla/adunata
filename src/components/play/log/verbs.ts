import type { GameActionType } from '@/lib/game/types'

export type Zone =
  | 'hand' | 'battlefield' | 'graveyard' | 'exile'
  | 'library' | 'command' | 'commandZone' | 'stack'

const ZONE_LABEL: Record<string, string> = {
  hand: 'hand',
  battlefield: 'battlefield',
  graveyard: 'graveyard',
  exile: 'exile',
  library: 'library',
  command: 'command zone',
  commandZone: 'command zone',
  stack: 'the stack',
}

function label(z: string): string {
  return ZONE_LABEL[z] ?? z
}

/** Map a (from,to) pair to a player-facing verb phrase. Pure function. */
export function moveZoneVerb(card: string, from: string, to: string): string {
  const f = from === 'commandZone' ? 'command' : from
  const t = to === 'commandZone' ? 'command' : to
  const key = `${f}>${t}`

  switch (key) {
    case 'hand>battlefield':       return `casts ${card} from hand`
    case 'hand>graveyard':         return `discards ${card}`
    case 'hand>exile':             return `exiles ${card} from hand`
    case 'hand>library':           return `puts ${card} from hand into library`
    case 'hand>command':           return `sends ${card} to command zone`

    case 'battlefield>hand':       return `returns ${card} to hand`
    case 'battlefield>graveyard':  return `sends ${card} to graveyard`
    case 'battlefield>exile':      return `exiles ${card}`
    case 'battlefield>library':    return `puts ${card} on top of library`
    case 'battlefield>command':    return `returns ${card} to command zone`

    case 'graveyard>hand':         return `returns ${card} from graveyard to hand`
    case 'graveyard>battlefield':  return `returns ${card} from graveyard to battlefield`
    case 'graveyard>exile':        return `exiles ${card} from graveyard`
    case 'graveyard>library':      return `shuffles ${card} into library`

    case 'exile>hand':             return `returns ${card} from exile to hand`
    case 'exile>battlefield':      return `returns ${card} from exile to battlefield`
    case 'exile>graveyard':        return `moves ${card} from exile to graveyard`

    case 'library>hand':           return `draws ${card}`
    case 'library>battlefield':    return `puts ${card} from library onto battlefield`
    case 'library>graveyard':      return `mills ${card}`
    case 'library>exile':          return `exiles ${card} from library top`

    case 'command>battlefield':    return `casts ${card} from command zone`
    case 'command>graveyard':      return `sends ${card} to graveyard`
    case 'command>exile':          return `exiles ${card}`

    default: return `moves ${card} from ${label(f)} to ${label(t)}`
  }
}

export interface VerbInput {
  action: GameActionType
  actorName: string
  data: Record<string, unknown> | null
}

/** Compose the player-facing sentence for a non-banner action row.
 *  Falls back to `entry.text` (passed by the caller) if data is incomplete. */
export function actionVerbText(input: VerbInput, fallbackText: string): string {
  const { action, actorName, data } = input
  const card = (data?.cardName as string | undefined) ?? null

  switch (action) {
    case 'tap':
      return card ? `${actorName} taps ${card}` : fallbackText
    case 'untap':
      return card ? `${actorName} untaps ${card}` : fallbackText
    case 'draw': {
      const n = (data?.count as number | undefined) ?? 1
      return `${actorName} draws ${n === 1 ? 'a card' : `${n} cards`}`
    }
    case 'discard':
      return card ? `${actorName} discards ${card} from hand` : fallbackText
    case 'play_card':
      return card ? `${actorName} casts ${card} from hand` : fallbackText
    case 'move_zone': {
      if (!card || !data?.from || !data?.to) return fallbackText
      return `${actorName} ${moveZoneVerb(card, data.from as string, data.to as string)}`
    }
    case 'add_counter': {
      const n = (data?.amount as number | undefined) ?? 1
      const k = (data?.counterName as string | undefined) ?? 'counter'
      return card ? `${actorName} puts ${n} ${k} counter${n > 1 ? 's' : ''} on ${card}` : fallbackText
    }
    case 'remove_counter': {
      const n = (data?.amount as number | undefined) ?? 1
      const k = (data?.counterName as string | undefined) ?? 'counter'
      return card ? `${actorName} removes ${n} ${k} counter${n > 1 ? 's' : ''} from ${card}` : fallbackText
    }
    case 'set_counter': {
      const v = (data?.value as number | undefined) ?? 0
      const k = (data?.counterName as string | undefined) ?? 'counter'
      return card ? `${actorName} sets ${k} counters on ${card} to ${v}` : fallbackText
    }
    case 'set_pt': {
      const p = (data?.powerMod as number | undefined) ?? 0
      const t = (data?.toughnessMod as number | undefined) ?? 0
      const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
      return card ? `${actorName} sets ${card} P/T mod to ${sign(p)}/${sign(t)}` : fallbackText
    }
    case 'life_change': {
      const targetName = (data?.targetName as string | undefined) ?? 'opponent'
      const amount = (data?.amount as number | undefined) ?? 0
      const dir = amount >= 0 ? 'gains' : 'loses'
      return `${targetName} ${dir} ${Math.abs(amount)} life`
    }
    case 'create_token': {
      const name = (data?.tokenName as string | undefined) ?? 'token'
      const n = (data?.quantity as number | undefined) ?? 1
      return `${actorName} creates ${n} ${name} token${n > 1 ? 's' : ''}`
    }
    case 'shuffle_library':
      return `${actorName} shuffles their library`
    case 'shuffle_into_library':
      return card ? `${actorName} shuffles ${card} into library` : fallbackText
    case 'copy_card':
      return card ? `${actorName} copies ${card}` : fallbackText
    case 'take_control':
      return card ? `${actorName} takes control of ${card}` : fallbackText
    case 'pass_priority':
      return `${actorName} passes priority`
    default:
      return fallbackText
  }
}
