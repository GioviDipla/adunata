type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export interface CardImageSourceCard {
  id: string
  scryfall_id: string | null
  image_normal: string | null
  card_faces: JsonValue
}

export interface ResolvedCardImageSource {
  cardId: string
  scryfallId: string
  faceIndex: number
  faceName: 'front' | 'back'
  sourceUrl: string
}

function getFaceImageUri(face: unknown, key: 'png' | 'large' | 'normal'): string | null {
  if (!face || typeof face !== 'object' || Array.isArray(face)) return null
  const imageUris = (face as { image_uris?: unknown }).image_uris
  if (!imageUris || typeof imageUris !== 'object' || Array.isArray(imageUris)) return null
  const value = (imageUris as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function derivedScryfallUrl(scryfallId: string, faceName: 'front' | 'back', size: 'png' | 'large'): string | null {
  if (scryfallId.length < 2) return null
  const ext = size === 'png' ? 'png' : 'jpg'
  return `https://cards.scryfall.io/${size}/${faceName}/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.${ext}`
}

function firstString(values: Array<string | null | undefined>): string | null {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0) ?? null
}

export function resolveCardImageSources(card: CardImageSourceCard): ResolvedCardImageSource[] {
  const scryfallId = card.scryfall_id ?? ''
  const faces = Array.isArray(card.card_faces) ? card.card_faces : []

  if (faces.length > 0) {
    return faces
      .map((face, index) => {
        const faceName = index === 0 ? 'front' as const : 'back' as const
        const sourceUrl = firstString([
          getFaceImageUri(face, 'png'),
          getFaceImageUri(face, 'large'),
          getFaceImageUri(face, 'normal'),
          index === 0 ? derivedScryfallUrl(scryfallId, faceName, 'png') : null,
          index === 0 ? derivedScryfallUrl(scryfallId, faceName, 'large') : null,
          index === 0 ? card.image_normal : null,
        ])
        if (!sourceUrl) return null
        return {
          cardId: card.id,
          scryfallId,
          faceIndex: index,
          faceName,
          sourceUrl,
        }
      })
      .filter((source): source is ResolvedCardImageSource => source != null)
  }

  const sourceUrl = firstString([
    derivedScryfallUrl(scryfallId, 'front', 'png'),
    derivedScryfallUrl(scryfallId, 'front', 'large'),
    card.image_normal,
  ])
  if (!sourceUrl) return []

  return [{
    cardId: card.id,
    scryfallId,
    faceIndex: 0,
    faceName: 'front',
    sourceUrl,
  }]
}
