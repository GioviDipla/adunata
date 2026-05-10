// src/components/play/log/severity.ts
import type { GameActionType } from '@/lib/game/types'

export type Severity = 'minor' | 'normal' | 'major'

/** Severity per action — drives font size + colour at render time.
 *  Adding a new GameActionType MUST add an entry here; the unit test
 *  in tests/play/displayRows.test.ts enforces total coverage. */
export const SEVERITY: Record<GameActionType, Severity> = {
  pass_priority: 'minor',
  tap: 'minor',
  untap: 'minor',
  toggle_auto_pass: 'minor',

  confirm_untap: 'normal',
  draw: 'normal',
  discard: 'normal',
  add_counter: 'normal',
  remove_counter: 'normal',
  set_counter: 'normal',
  set_pt: 'normal',
  shuffle_library: 'normal',
  shuffle_into_library: 'normal',
  move_zone: 'normal',
  bottom_cards: 'normal',
  chat_message: 'normal',
  phase_change: 'normal',

  // Informational / passive — render as 'normal'
  library_view: 'normal',
  peak: 'normal',
  reveal_top: 'normal',
  resolve_revealed: 'normal',
  mill: 'normal',
  draw_x: 'normal',

  play_card: 'major',
  create_token: 'major',
  life_change: 'major',
  declare_attackers: 'major',
  declare_blockers: 'major',
  combat_damage: 'major',
  resolve_combat_damage: 'major',
  copy_card: 'major',
  take_control: 'major',
  concede: 'major',
  mulligan: 'major',
  keep_hand: 'major',
  game_start: 'major',
  commander_choice: 'major',
}
