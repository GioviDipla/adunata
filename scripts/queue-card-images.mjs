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

const cards = await selectCards(options)
const rows = assetsForCards(cards, options)

if (options.dryRun) {
  for (const row of rows) {
    console.log(JSON.stringify(row))
  }
  console.log(`cards=${cards.length} assets=${rows.length}`)
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
console.log(`cards=${cards.length} assets=${rows.length} queued=${rows.length}`)
