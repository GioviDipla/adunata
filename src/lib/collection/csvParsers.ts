import Papa from 'papaparse'

export interface CollectionImportRow {
  name: string
  quantity: number
  set_code?: string | null
  collector_number?: string | null
  foil: boolean
  language: string
  condition: 'M' | 'NM' | 'LP' | 'MP' | 'HP' | 'D'
}

export type CollectionImportFlavor =
  | 'deckbox'
  | 'moxfield'
  | 'manabox'
  | 'generic'

/**
 * Sniff the CSV flavor by header fingerprinting. Conservative: only claim
 * a specific flavor when distinctive columns line up; default to 'generic'
 * so the fallback path (name + quantity) still recovers data from random
 * exports.
 */
export function detectFlavor(headers: string[]): CollectionImportFlavor {
  const set = new Set(headers.map((h) => h.toLowerCase().trim()))
  if (set.has('edition') && set.has('card number')) return 'deckbox'
  if (set.has('scryfall id') || set.has('purchase price currency')) return 'manabox'
  if (set.has('tradelist count') && set.has('name')) return 'moxfield'
  return 'generic'
}

function toCondition(raw: string | undefined): CollectionImportRow['condition'] {
  const v = (raw ?? '').toUpperCase().replace(/\s+/g, '').trim()
  if (v.startsWith('MI') || v === 'M') return 'M'
  if (v.startsWith('NM') || v.includes('NEAR')) return 'NM'
  if (v.startsWith('LP') || v.includes('LIGHT')) return 'LP'
  if (v.startsWith('MP') || v.includes('MODERATE') || v.includes('PLAYED')) return 'MP'
  if (v.startsWith('HP') || v.includes('HEAVY')) return 'HP'
  if (v.startsWith('D') || v.includes('DAMAGE') || v.includes('POOR')) return 'D'
  return 'NM'
}

function toFoil(raw: string | undefined): boolean {
  const v = (raw ?? '').toLowerCase().trim()
  return (
    v === 'foil' ||
    v === 'yes' ||
    v === 'true' ||
    v === '1' ||
    v === 'etched'
  )
}

function toInt(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * Parse a CSV collection export into a flat list of rows the bulk-import
 * route can resolve to card_ids. Returns `{ flavor, rows }` where `rows`
 * drops any entry missing a name or quantity — malformed rows are
 * silently discarded rather than aborting the whole import.
 */
export function parseCsv(text: string): {
  flavor: CollectionImportFlavor
  rows: CollectionImportRow[]
} {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })
  const headers = parsed.meta.fields ?? []
  const flavor = detectFlavor(headers)
  const rows: CollectionImportRow[] = []

  for (const r of parsed.data) {
    let name = ''
    let qty = 0
    let setCode: string | null = null
    let cn: string | null = null
    let foil = false
    let lang = 'en'
    let cond: CollectionImportRow['condition'] = 'NM'

    if (flavor === 'deckbox') {
      name = r['Name'] ?? ''
      qty = toInt(r['Count'])
      setCode = (r['Edition'] ?? '').trim() || null
      cn = (r['Card Number'] ?? '').trim() || null
      foil = toFoil(r['Foil'])
      lang = (r['Language'] ?? 'en').toLowerCase() || 'en'
      cond = toCondition(r['Condition'])
    } else if (flavor === 'moxfield') {
      name = r['Name'] ?? ''
      qty = toInt(r['Count']) || toInt(r['TradelistCount'])
      setCode = (r['Edition'] ?? r['Set'] ?? '').trim() || null
      cn = (r['CollectorNumber'] ?? r['Card Number'] ?? '').trim() || null
      foil = toFoil(r['Foil'])
      lang = (r['Language'] ?? 'en').toLowerCase() || 'en'
      cond = toCondition(r['Condition'])
    } else if (flavor === 'manabox') {
      name = r['Name'] ?? ''
      qty = toInt(r['Quantity'])
      setCode = (r['Set code'] ?? r['Set'] ?? '').toLowerCase().trim() || null
      cn = (r['Collector number'] ?? '').trim() || null
      foil = toFoil(r['Foil'])
      lang = (r['Language'] ?? 'en').toLowerCase() || 'en'
      cond = toCondition(r['Condition'])
    } else {
      name = r['Name'] ?? r['name'] ?? ''
      qty = toInt(r['Quantity'] ?? r['Count'] ?? r['count'] ?? r['quantity'])
    }

    if (name && qty > 0) {
      rows.push({
        name: name.trim(),
        quantity: qty,
        set_code: setCode,
        collector_number: cn,
        foil,
        language: lang,
        condition: cond,
      })
    }
  }

  return { flavor, rows }
}
