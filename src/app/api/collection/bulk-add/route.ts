import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

interface BulkItem {
  card_id: string | number
  quantity: number
  foil?: boolean
  language?: string
  condition?: string
}

interface NormalizedItem {
  card_id: string | number
  quantity: number
  foil: boolean
  language: string
  condition: Condition
  key: string
}

const VALID_CONDITIONS = ['M', 'NM', 'LP', 'MP', 'HP', 'D'] as const
type Condition = typeof VALID_CONDITIONS[number]

function buildKey(card_id: string | number, foil: boolean, language: string, condition: string) {
  return `${String(card_id)}|${foil ? 1 : 0}|${language}|${condition}`
}

/**
 * Add a hand-picked subset of cards to the caller's collection.
 *
 * Body: `{ items: [{ card_id, quantity, foil?, language?, condition? }, ...] }`.
 * Merges on (user, card, foil, language, condition) by bumping quantity.
 *
 * Performance: the previous version did one SELECT + one UPDATE/INSERT
 * per row in serial. For a 100-card deck that's 200 round-trips. We now
 * (1) SELECT every potentially-existing row in a single query, (2) batch
 * a single multi-row INSERT for the new rows, (3) parallelise the
 * arithmetic UPDATEs for the rows we have to bump. Total round-trips:
 * 1 SELECT + 1 INSERT + N parallel UPDATEs (capped concurrency).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const rawItems = Array.isArray(body.items) ? (body.items as BulkItem[]) : []
  if (rawItems.length === 0) {
    return NextResponse.json({ error: 'no items' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // ---- 1. Normalise + deduplicate by composite key. Two rows in the
  // payload that target the same bucket get summed before we hit the DB.
  const buckets = new Map<string, NormalizedItem>()
  let skipped = 0
  for (const raw of rawItems) {
    const cardId = raw.card_id
    const qty = Number(raw.quantity ?? 1)
    if (cardId == null || !Number.isFinite(qty) || qty < 1) {
      skipped++
      continue
    }
    const foil = !!raw.foil
    const language = typeof raw.language === 'string' && raw.language.length <= 5
      ? raw.language
      : 'en'
    const conditionRaw = typeof raw.condition === 'string' ? raw.condition : 'NM'
    const condition: Condition = (VALID_CONDITIONS as readonly string[]).includes(conditionRaw)
      ? (conditionRaw as Condition)
      : 'NM'
    const key = buildKey(cardId, foil, language, condition)
    const existing = buckets.get(key)
    if (existing) {
      existing.quantity += qty
    } else {
      buckets.set(key, { card_id: cardId, quantity: qty, foil, language, condition, key })
    }
  }

  if (buckets.size === 0) {
    return NextResponse.json({ inserted: 0, skipped, total: rawItems.length })
  }

  // ---- 2. Single SELECT for every (card_id) the payload covers. We
  // overfetch (all foil/language/condition combos for those cards) but
  // it's still one round-trip and the row count stays small.
  const cardIds = Array.from(new Set(Array.from(buckets.values()).map((b) => b.card_id)))
  const { data: existingRows, error: selErr } = await supabase
    .from('user_cards')
    .select('id, card_id, quantity, foil, language, condition')
    .eq('user_id', user.id)
    .in('card_id', cardIds as never[])
  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 })
  }

  type ExistingRow = { id: string; card_id: string | number; quantity: number; foil: boolean; language: string; condition: string | null }
  const existingByKey = new Map<string, ExistingRow>()
  for (const row of (existingRows ?? []) as ExistingRow[]) {
    const k = buildKey(row.card_id, row.foil, row.language, row.condition ?? 'NM')
    existingByKey.set(k, row)
  }

  // ---- 3. Split into "needs update" vs "needs insert".
  const toUpdate: { id: string; quantity: number }[] = []
  const toInsert: {
    user_id: string
    card_id: string | number
    quantity: number
    foil: boolean
    language: string
    condition: Condition
  }[] = []
  for (const b of buckets.values()) {
    const hit = existingByKey.get(b.key)
    if (hit) {
      toUpdate.push({ id: hit.id, quantity: hit.quantity + b.quantity })
    } else {
      toInsert.push({
        user_id: user.id,
        card_id: b.card_id,
        quantity: b.quantity,
        foil: b.foil,
        language: b.language,
        condition: b.condition,
      })
    }
  }

  // ---- 4a. Bulk INSERT new rows in one round-trip.
  if (toInsert.length > 0) {
    const { error: insErr } = await supabase
      .from('user_cards')
      .insert(toInsert as never)
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
  }

  // ---- 4b. UPDATEs in parallel chunks. PostgREST doesn't accept a
  // multi-row UPDATE with per-row values, so we fan out — but bounded
  // concurrency keeps us off the rate limiter.
  const CONCURRENCY = 16
  for (let i = 0; i < toUpdate.length; i += CONCURRENCY) {
    const slice = toUpdate.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      slice.map((u) =>
        supabase
          .from('user_cards')
          .update({ quantity: u.quantity })
          .eq('id', u.id)
          .eq('user_id', user.id),
      ),
    )
    for (const r of results) {
      if (r.error) {
        return NextResponse.json({ error: r.error.message }, { status: 500 })
      }
    }
  }

  revalidatePath('/collection')
  revalidatePath('/cards')
  return NextResponse.json({
    inserted: toInsert.length + toUpdate.length,
    skipped,
    total: rawItems.length,
    new_rows: toInsert.length,
    merged_rows: toUpdate.length,
  })
}
