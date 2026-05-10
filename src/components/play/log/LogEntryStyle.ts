import type { LogEntry } from '@/lib/game/types'

export interface LogRowStyle {
  /** A banner-style row used for turn/phase/stage boundaries. */
  banner?: {
    label: string
    tone: 'neutral' | 'combat' | 'pregame' | 'end' | 'draw'
  }
  /** Regular row text color (overridden when banner is set). */
  textClass: string
  /** Optional glyph rendered before the timestamp. */
  glyph?: string
  /** Banner icon — falls back to glyph then BANNER_ICON_DEFAULT at render time. */
  icon?: string
}

const TONE_CLASSES: Record<NonNullable<LogRowStyle['banner']>['tone'], string> = {
  neutral: 'border-border/40 bg-bg-cell/60 text-font-secondary',
  combat: 'border-bg-red/30 bg-bg-red/10 text-bg-red',
  pregame: 'border-bg-accent/30 bg-bg-accent/10 text-font-accent',
  end: 'border-bg-orange/30 bg-bg-orange/10 text-bg-orange',
  draw: 'border-border/40 bg-bg-cell/60 text-font-secondary',
}

export function toneClasses(tone: NonNullable<LogRowStyle['banner']>['tone']): string {
  return TONE_CLASSES[tone]
}

/**
 * Map a log entry to presentation metadata. Pure function — no dependency on
 * React — so both the in-game GameLog and the GameHistoryView can share it.
 */
export function styleForEntry(entry: LogEntry, myUserId: string): LogRowStyle {
  const isMine = entry.playerId === myUserId

  switch (entry.action) {
    case 'game_start':
      return {
        banner: { label: 'Game started', tone: 'pregame' },
        textClass: '',
        glyph: '✦',
        icon: '✦',
      }
    case 'keep_hand':
      return {
        banner: { label: 'Hand kept', tone: 'pregame' },
        textClass: '',
        glyph: '✓',
        icon: '✓',
      }
    case 'mulligan':
      return {
        banner: { label: 'Mulligan', tone: 'pregame' },
        textClass: '',
        glyph: '↻',
        icon: '↻',
      }
    case 'bottom_cards':
      return {
        banner: { label: 'Cards bottomed', tone: 'pregame' },
        textClass: '',
        glyph: '↓',
        icon: '↓',
      }
    case 'confirm_untap':
      return {
        banner: { label: 'Untap step', tone: 'neutral' },
        textClass: '',
        glyph: '◷',
        icon: '◷',
      }
    case 'declare_attackers':
      return {
        banner: { label: 'Attackers declared', tone: 'combat' },
        textClass: '',
        glyph: '⚔',
        icon: '⚔',
      }
    case 'declare_blockers':
      return {
        banner: { label: 'Blockers declared', tone: 'combat' },
        textClass: '',
        glyph: '🛡',
        icon: '🛡',
      }
    case 'combat_damage':
    case 'resolve_combat_damage':
      return {
        banner: { label: 'Combat damage', tone: 'combat' },
        textClass: '',
        glyph: '✦',
        icon: '✦',
      }
    case 'concede':
      return {
        banner: { label: 'Concede', tone: 'end' },
        textClass: '',
        glyph: '🏳',
        icon: '🏳',
      }
    case 'chat_message':
      return {
        textClass: 'italic text-yellow-400',
        glyph: '💬',
      }
  }

  return {
    textClass: isMine ? 'text-font-accent' : 'text-font-primary',
  }
}
