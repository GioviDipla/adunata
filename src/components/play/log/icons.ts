// src/components/play/log/icons.ts
import type { GameActionType } from '@/lib/game/types'

export const ICON: Partial<Record<GameActionType, string>> = {
  tap: '⊕',
  untap: '⊖',
  draw: '🃏',
  discard: '🗑',
  play_card: '▶',
  move_zone: '→',
  add_counter: '＋',
  remove_counter: '－',
  set_counter: '＝',
  set_pt: 'P/T',
  life_change: '♥',
  create_token: '✨',
  declare_attackers: '⚔',
  declare_blockers: '🛡',
  combat_damage: '✦',
  resolve_combat_damage: '✦',
  copy_card: '⎘',
  take_control: '⇄',
  shuffle_library: '🔀',
  shuffle_into_library: '🔀',
  concede: '🏳',
  chat_message: '💬',
  pass_priority: '·',
}

/** Banner glyph fallback when `LogRowStyle.icon` is not set. */
export const BANNER_ICON_DEFAULT = '•'
