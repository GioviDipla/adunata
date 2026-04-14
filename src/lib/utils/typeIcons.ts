import {
  Swords, Sparkles, Zap, Flame, Shield, Box, Mountain, HelpCircle,
  type LucideIcon,
} from 'lucide-react'

/** Map from card type category (as returned by getCardTypeCategory) to a Lucide icon */
export const TYPE_ICONS: Record<string, LucideIcon> = {
  Creatures: Swords,
  Planeswalkers: Sparkles,
  Instants: Zap,
  Sorceries: Flame,
  Enchantments: Shield,
  Artifacts: Box,
  Lands: Mountain,
  Battles: HelpCircle,
  Other: HelpCircle,
}
