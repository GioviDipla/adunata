export interface SectionPreset {
  name: string
  color: string
}

export const COMMANDER_PRESET: SectionPreset[] = [
  { name: 'Commander', color: '#f59e0b' },
  { name: 'Ramp', color: '#22c55e' },
  { name: 'Card Draw', color: '#3b82f6' },
  { name: 'Removal', color: '#ef4444' },
  { name: 'Tutors', color: '#a855f7' },
  { name: 'Wincons', color: '#eab308' },
  { name: 'Protection', color: '#06b6d4' },
  { name: 'Utility', color: '#64748b' },
  { name: 'Lands', color: '#78716c' },
]

export const PRESETS = { commander: COMMANDER_PRESET } as const
export type PresetKey = keyof typeof PRESETS
