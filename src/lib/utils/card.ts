export const TYPE_ORDER = [
  'Creatures',
  'Planeswalkers',
  'Instants',
  'Sorceries',
  'Enchantments',
  'Artifacts',
  'Battles',
  'Lands',
  'Other',
] as const

export function getCardTypeCategory(typeLine: string): string {
  const t = typeLine.toLowerCase()
  if (t.includes('creature')) return 'Creatures'
  if (t.includes('planeswalker')) return 'Planeswalkers'
  if (t.includes('instant')) return 'Instants'
  if (t.includes('sorcery')) return 'Sorceries'
  if (t.includes('enchantment')) return 'Enchantments'
  if (t.includes('artifact')) return 'Artifacts'
  if (t.includes('battle')) return 'Battles'
  if (t.includes('land')) return 'Lands'
  return 'Other'
}

export function getCardZone(typeLine: string): 'lands' | 'creatures' | 'other' {
  const t = typeLine.toLowerCase()
  if (t.includes('land')) return 'lands'
  if (t.includes('creature')) return 'creatures'
  return 'other'
}
