import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const SCRYFALL_BULK = 'https://api.scryfall.com/bulk-data'

function deriveRulingKeywords(text) {
  const kws = new Set()
  const lower = text.toLowerCase()
  if (/triggered ability/i.test(lower)) kws.add('triggered_ability')
  if (/enters the battlefield/i.test(lower)) kws.add('etb_trigger')
  if (/counter/i.test(lower)) kws.add('counter_placement')
  if (/token/i.test(lower)) kws.add('token_creation')
  if (/target/i.test(lower)) kws.add('targeting')
  if (/zone|exile|graveyard/i.test(lower)) kws.add('zone_change')
  if (/replacement/i.test(lower)) kws.add('replacement_effect')
  if (/copy/i.test(lower)) kws.add('copy_effect')
  return Array.from(kws).sort()
}

async function main() {
  console.log('Fetching Scryfall bulk data index...')
  const indexRes = await fetch(SCRYFALL_BULK)
  const { data: entries } = await indexRes.json()

  const rulingsEntry = entries.find((e) => e.type === 'rulings')
  if (!rulingsEntry) {
    console.error('Rulings bulk not found in Scryfall index')
    process.exit(1)
  }

  console.log(`Downloading rulings from ${rulingsEntry.download_uri}`)
  const rulingsRes = await fetch(rulingsEntry.download_uri)
  const rulings = await rulingsRes.json()

  console.log(`Downloaded ${rulings.length} ruling records`)

  const { data: cards } = await supabase
    .from('cards')
    .select('id, scryfall_id')

  const cardIdByOracleId = new Map()
  for (const card of cards) {
    if (card.scryfall_id) {
      cardIdByOracleId.set(card.scryfall_id, card.id)
    }
  }

  let inserted = 0
  let skipped = 0

  const rows = []
  for (const ruling of rulings) {
    const cardId = cardIdByOracleId.get(ruling.oracle_id)
    if (!cardId) {
      skipped++
      continue
    }

    if (!ruling.comment) continue

    rows.push({
      card_id: cardId,
      scryfall_oracle_id: ruling.oracle_id,
      ruling_date: ruling.published_at ?? null,
      text: ruling.comment,
      source: ruling.source ?? 'scryfall',
      keywords: deriveRulingKeywords(ruling.comment),
    })
  }

  const batchSize = 100
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase
      .from('card_rulings')
      .upsert(batch, { onConflict: 'card_id, ruling_date, text' })

    if (!error) {
      inserted += batch.length
    }

    if ((i / batchSize) % 10 === 0) {
      console.log(`Progress: ${i}/${rows.length}`)
    }
  }

  console.log(`Done. ${inserted} rulings inserted. ${skipped} oracle_ids skipped (card not in DB).`)
}

main().catch(console.error)
