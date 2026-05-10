import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const [, , filePath, version] = process.argv
if (!filePath || !version) {
  console.error('Usage: node scripts/ingest-mtg-rules.mjs <path-to-rules.txt> <version>')
  console.error('Example: node scripts/ingest-mtg-rules.mjs data/private/MagicCompRules.txt "2026-05"')
  process.exit(1)
}

const text = readFileSync(filePath, 'utf-8')

const RULE_LINE_RE = /^(\d{3}(?:\.\d+[a-z]?)?)\.\s+(.+)$/

function deriveRuleKeywords(ruleNumber, text) {
  const kws = new Set()
  const lower = text.toLowerCase()
  if (/triggered ability/i.test(lower)) kws.add('triggered_ability')
  if (/enters the battlefield/i.test(lower)) kws.add('etb_trigger')
  if (/replacement effect/i.test(lower)) kws.add('replacement_effect')
  if (/counter/i.test(lower)) kws.add('counter_placement')
  if (/token/i.test(lower)) kws.add('token_creation')
  if (/copy/i.test(lower)) kws.add('copy_effect')
  if (/target/i.test(lower)) kws.add('targeting')
  if (/zone/i.test(lower) || /exile/i.test(lower) || /graveyard/i.test(lower)) kws.add('zone_change')
  return Array.from(kws).sort()
}

let currentParent = null
let currentSection = null
const rules = []

for (const line of text.split('\n')) {
  const match = line.trim().match(RULE_LINE_RE)
  if (match) {
    const [, ruleNum, ruleText] = match
    const parent = ruleNum.substring(0, 3)

    if (!ruleNum.includes('.')) {
      currentSection = ruleText
      currentParent = ruleNum
    }

    rules.push({
      rule_number: ruleNum,
      parent_rule_number: parent === ruleNum ? null : parent,
      section_title: ruleNum.includes('.') ? currentSection : ruleText,
      text: ruleText,
      source_version: version,
      keywords: deriveRuleKeywords(ruleNum, ruleText),
    })
  }
}

console.log(`Parsed ${rules.length} rules from ${filePath}`)

const batchSize = 100
let inserted = 0
let updated = 0

for (let i = 0; i < rules.length; i += batchSize) {
  const batch = rules.slice(i, i + batchSize)
  const { data, error } = await supabase
    .from('mtg_rules')
    .upsert(batch, { onConflict: 'rule_number, source_version' })

  if (error) {
    console.error(`Batch ${i}-${i + batchSize} failed:`, error.message)
  } else {
    inserted += batch.length
  }

  if ((i / batchSize) % 10 === 0) {
    console.log(`Progress: ${i}/${rules.length}`)
  }
}

console.log(`Done. ${inserted} rules inserted/updated.`)
