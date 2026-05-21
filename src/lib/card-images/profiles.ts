export interface CardImageProfile {
  name: 'hd-2x'
  model: string
  scale: number
  targetDpi: number
  outputMimeType: 'image/png'
}

export const CARD_IMAGE_PROFILES: Record<CardImageProfile['name'], CardImageProfile> = {
  'hd-2x': {
    name: 'hd-2x',
    model: 'realesr-animevideov3',
    scale: 2,
    targetDpi: 600,
    outputMimeType: 'image/png',
  },
}

export function getCardImageProfile(name = 'hd-2x'): CardImageProfile {
  const profile = CARD_IMAGE_PROFILES[name as CardImageProfile['name']]
  if (!profile) throw new Error(`Unsupported card image profile: ${name}`)
  return profile
}
