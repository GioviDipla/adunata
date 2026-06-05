import process from 'node:process'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })
dotenv.config()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing Supabase env')

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function parseArgs(argv) {
  const args = new Map()
  for (const arg of argv) {
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, value] = arg.slice(2).split(/=(.*)/s)
      args.set(key, value)
    } else if (arg.startsWith('--')) {
      args.set(arg.slice(2), true)
    }
  }
  return {
    limit: Number(args.get('limit') ?? 25),
    offset: Number(args.get('offset') ?? 0),
    profile: String(args.get('profile') ?? 'hd-2x'),
    q: args.get('q') ? String(args.get('q')) : null,
    setCode: args.get('set') ? String(args.get('set')).toLowerCase() : null,
    collectorNumber: args.get('collector-number') ? String(args.get('collector-number')) : null,
    cardId: args.get('card-id') ? String(args.get('card-id')) : null,
    scryfallId: args.get('scryfall-id') ? String(args.get('scryfall-id')) : null,
    type: args.get('type') ? String(args.get('type')) : null,
    upscaled: args.get('upscaled') ? String(args.get('upscaled')) : null,
    fromDecks: args.get('from-decks') === true,
    includeBasicLands: args.get('include-basic-lands') === true,
    dryRun: args.get('dry-run') === true,
  }
}

function getFaceImageUri(face, key) {
  if (!face || typeof face !== 'object' || Array.isArray(face)) return null
  const imageUris = face.image_uris
  if (!imageUris || typeof imageUris !== 'object' || Array.isArray(imageUris)) return null
  const value = imageUris[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function derivedScryfallUrl(scryfallId, faceName, size) {
  if (!scryfallId || scryfallId.length < 2) return null
  const ext = size === 'png' ? 'png' : 'jpg'
  return `https://cards.scryfall.io/${size}/${faceName}/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.${ext}`
}

function firstString(values) {
  return values.find((value) => typeof value === 'string' && value.length > 0) ?? null
}

function resolveCardImageSources(card) {
  const scryfallId = card.scryfall_id ?? ''
  const faces = Array.isArray(card.card_faces) ? card.card_faces : []

  if (faces.length > 0) {
    return faces
      .map((face, index) => {
        const faceName = index === 0 ? 'front' : 'back'
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
      .filter(Boolean)
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

function buildCardImageStoragePath({ scryfallId, faceName, profile }) {
  if (!scryfallId || scryfallId.length < 2) throw new Error('scryfall_id is required to build card image storage path')
  const scaleSuffix = profile === 'hd-2x' ? '2x' : profile
  return `scryfall/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}/${faceName}@${scaleSuffix}.png`
}

async function selectCardsFromDecks(options) {
  const FETCH_PAGE = 1000
  const allCardIds = []
  let rangeStart = 0
  while (true) {
    const { data: chunk, error: idError } = await supabase
      .from('deck_cards')
      .select('card_id')
      .range(rangeStart, rangeStart + FETCH_PAGE - 1)
      .limit(FETCH_PAGE)
    if (idError) throw idError
    if (!chunk || chunk.length === 0) break
    allCardIds.push(...chunk.map(r => r.card_id))
    if (chunk.length < FETCH_PAGE) break
    rangeStart += FETCH_PAGE
  }

  const distinctIds = [...new Set(allCardIds)]
  if (distinctIds.length === 0) return []

  const IN_CHUNK = 300
  const upscaledIds = new Set()
  for (let i = 0; i < distinctIds.length; i += IN_CHUNK) {
    const chunk = distinctIds.slice(i, i + IN_CHUNK)
    const { data: chunkData, error: chunkError } = await supabase
      .from('card_image_assets')
      .select('card_id')
      .eq('target_profile', options.profile)
      .eq('status', 'ready')
      .not('storage_path', 'is', null)
      .in('card_id', chunk)
    if (chunkError) throw chunkError
    for (const r of (chunkData ?? [])) upscaledIds.add(r.card_id)
  }

  const missingIds = distinctIds.filter(id => !upscaledIds.has(id))
  if (missingIds.length === 0) return []

  const paginated = missingIds.slice(options.offset, options.offset + options.limit)
  if (paginated.length === 0) return []

  const cards = []
  for (let i = 0; i < paginated.length; i += IN_CHUNK) {
    const chunk = paginated.slice(i, i + IN_CHUNK)
    const { data: chunkData, error } = await supabase
      .from('cards')
      .select('id,scryfall_id,name,type_line,set_code,collector_number,image_normal,card_faces')
      .in('id', chunk)
      .order('name', { ascending: true })
    if (error) throw error
    cards.push(...(chunkData ?? []))
  }
  cards.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  return cards
}

async function selectCards(options) {
  let query = supabase
    .from('cards')
    .select('id,scryfall_id,name,type_line,set_code,collector_number,image_normal,card_faces')
    .order('name', { ascending: true })
    .range(options.offset, options.offset + options.limit - 1)

  if (options.cardId) query = query.eq('id', options.cardId)
  if (options.scryfallId) query = query.eq('scryfall_id', options.scryfallId)
  if (options.setCode) query = query.eq('set_code', options.setCode)
  if (options.collectorNumber) query = query.eq('collector_number', options.collectorNumber)
  if (options.q) query = query.ilike('name', `%${options.q}%`)
  if (options.type) query = query.ilike('type_line', `%${options.type}%`)
  if (options.upscaled === 'false') query = query.eq('has_upscaled_2x', false)
  if (!options.includeBasicLands) query = query.not('type_line', 'ilike', '%Basic Land%')

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

function assetsForCards(cards, options) {
  const rows = []
  for (const card of cards) {
    for (const source of resolveCardImageSources(card)) {
      rows.push({
        card_id: source.cardId,
        scryfall_id: source.scryfallId,
        face_index: source.faceIndex,
        source_url: source.sourceUrl,
        storage_path: buildCardImageStoragePath({
          scryfallId: source.scryfallId,
          faceName: source.faceName,
          profile: options.profile,
        }),
        target_profile: options.profile,
        model: process.env.REALESRGAN_MODEL ?? 'realesr-animevideov3',
        scale: 2,
        target_dpi: 600,
        status: 'queued',
      })
    }
  }
  return rows
}

const options = parseArgs(process.argv.slice(2))
if (options.profile !== 'hd-2x') throw new Error(`Unsupported profile: ${options.profile}`)

const cards = options.fromDecks ? await selectCardsFromDecks(options) : await selectCards(options)
const rows = assetsForCards(cards, options)

if (options.dryRun) {
  for (const row of rows) {
    console.log(JSON.stringify(row))
  }
  console.log(`cards=${cards.length} assets=${rows.length} from_decks=${options.fromDecks}`)
  process.exit(0)
}

if (rows.length === 0) {
  console.log('cards=0 assets=0 inserted=0')
  process.exit(0)
}

const { error } = await supabase
  .from('card_image_assets')
  .upsert(rows, {
    onConflict: 'card_id,face_index,target_profile',
    ignoreDuplicates: true,
  })

if (error) throw error
console.log(`cards=${cards.length} assets=${rows.length} queued=${rows.length} from_decks=${options.fromDecks}`)
