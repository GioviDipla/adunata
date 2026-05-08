import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

console.log('Fetching Scryfall bulk data index...')
const idxRes = await fetch('https://api.scryfall.com/bulk-data')
const { data: entries } = await idxRes.json()
const oracleEntry = entries.find(e => e.type === 'oracle_cards')
if (!oracleEntry) { console.error('oracle_cards not found'); process.exit(1) }

console.log(`Downloading oracle_cards from ${oracleEntry.download_uri}...`)
const res = await fetch(oracleEntry.download_uri)
const cards = await res.json()
console.log(`Downloaded ${cards.length} cards`)

let updated = 0
const batchSize = 500
for (let i = 0; i < cards.length; i += batchSize) {
  const batch = cards.slice(i, i + batchSize)
  const updates = batch
    .filter(c => c.oracle_id)
    .map(c => ({ scryfall_id: c.id, oracle_id: c.oracle_id }))

  for (const u of updates) {
    const { error } = await supabase
      .from('cards')
      .update({ oracle_id: u.oracle_id })
      .eq('scryfall_id', u.scryfall_id)
    if (!error) updated++
  }

  if ((i / batchSize) % 20 === 0) console.log(`Progress: ${i}/${cards.length} — updated ${updated}`)
}
console.log(`Done. Updated ${updated} cards with oracle_id.`)
