export interface CardImageStoragePathOptions {
  scryfallId: string
  faceName: 'front' | 'back'
  profile: 'hd-2x'
}

export function buildCardImageStoragePath(options: CardImageStoragePathOptions): string {
  const id = options.scryfallId
  if (!id || id.length < 2) throw new Error('scryfall_id is required to build card image storage path')

  const scaleSuffix = options.profile === 'hd-2x' ? '2x' : options.profile
  return `scryfall/${id[0]}/${id[1]}/${id}/${options.faceName}@${scaleSuffix}.png`
}
