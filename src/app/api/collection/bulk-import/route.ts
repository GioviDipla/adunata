import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseCsv, type CollectionImportRow } from '@/lib/collection/csvParsers'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

const nameKey = (s: string) => s.trim().toLowerCase()
const pairKey = (name: string, setCode: string) =>
  `${nameKey(name)}|${setCode.trim().toLowerCase()}`

/**
 * Bulk import a user's card collection from a CSV body.
 *
 * Accepts the raw CSV text in the request body (content-type `text/csv`
 * or `application/octet-stream`) and:
 *   1. Parses via `parseCsv` — flavor sniffed from the header row.
 *   2. Resolves each row's name → `cards.id`, mirroring the deck
 *      bulk-import pattern:
 *        - Rows with a `set_code` go through `lookup_cards_by_name_and_set`
 *          (pins the correct printing, optionally with collector_number).
 *        - Remaining rows fall back to `lookup_cards_by_names`.
 *   3. Upserts into `user_cards`, merging on
 *      (user, card, foil, language, condition) by bumping quantity.
 *
 * Rows that can't be resolved to an existing `cards` row are counted in
 * `skipped` — no Scryfall fallback here (keeps the import synchronous and
 * avoids slamming Scryfall with a 2000-row collection; users surface
 * skipped rows for remediation in a follow-up).
 */
export async function POST(req: Request) {
  const text = await req.text()
  if (!text.trim()) {
    return NextResponse.json({ error: 'empty csv' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { flavor, rows } = parseCsv(text)
  if (rows.length === 0) {
    return NextResponse.json({ error: 'no valid rows' }, { status: 400 })
  }

  // Use the admin client for RPC calls — the existing deck bulk-import
  // uses admin for the same lookups, and the RPCs are granted to
  // service_role. Mutations to `user_cards` go through the user-scoped
  // client so RLS applies.
  const admin = createAdminClient()

  // --- 1. Set-pinned lookup for rows that carried a set code.
  const setPinned = rows.filter((r) => (r.set_code ?? '').trim() !== '')
  const setPairs = setPinned.map((r) => ({
    name: r.name.trim(),
    set_code: r.set_code!.trim(),
    collector_number: r.collector_number?.trim() || undefined,
  }))

  const cardByNameAndSet = new Map<string, CardRow>()
  if (setPairs.length > 0) {
    const uniquePairs = Array.from(
      new Map(
        setPairs.map((p) => [pairKey(p.name, p.set_code), p]),
      ).values(),
    )
    const { data: setCards, error: setErr } = await admin.rpc(
      'lookup_cards_by_name_and_set',
      { pairs: uniquePairs },
    )
    if (setErr) {
      return NextResponse.json({ error: setErr.message }, { status: 500 })
    }
    for (const c of (setCards ?? []) as CardRow[]) {
      if (c.set_code) {
        cardByNameAndSet.set(pairKey(c.name, c.set_code), c)
        if (c.flavor_name) {
          cardByNameAndSet.set(pairKey(c.flavor_name, c.set_code), c)
        }
      }
    }
  }

  // --- 2. Name-only fallback for anything not set-matched.
  const unmatchedNames = Array.from(
    new Set(
      rows
        .filter((r) => {
          if (!r.set_code) return true
          return !cardByNameAndSet.has(pairKey(r.name, r.set_code))
        })
        .map((r) => r.name.trim()),
    ),
  )

  const cardByLowerName = new Map<string, CardRow>()
  if (unmatchedNames.length > 0) {
    const { data: localCards, error: rpcErr } = await admin.rpc(
      'lookup_cards_by_names',
      { card_names: unmatchedNames },
    )
    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message }, { status: 500 })
    }
    for (const c of (localCards ?? []) as CardRow[]) {
      cardByLowerName.set(nameKey(c.name), c)
      if (c.flavor_name) cardByLowerName.set(nameKey(c.flavor_name), c)
    }
  }

  const resolve = (row: CollectionImportRow): CardRow | null => {
    if (row.set_code) {
      const hit = cardByNameAndSet.get(pairKey(row.name, row.set_code))
      if (hit) return hit
    }
    return cardByLowerName.get(nameKey(row.name)) ?? null
  }

  // --- 3. Batch upsert into `user_cards`, merging on
  // (user, card, foil, language, condition).
  const resolved: Array<{ row: CollectionImportRow; card: CardRow }> = []
  let skipped = 0
  for (const r of rows) {
    const card = resolve(r)
    if (!card) { skipped++; continue }
    resolved.push({ row: r, card })
  }

  // Batch-check existing rows in a single query
  const allCardIds = resolved.map((r) => r.card.id)
  const existingMap = new Map<string, { id: string; quantity: number }>()
  if (allCardIds.length > 0) {
    const { data: existingRows } = await supabase
      .from('user_cards')
      .select('id, card_id, quantity, foil, language, condition')
      .eq('user_id', user.id)
      .in('card_id', allCardIds)
    for (const ex of existingRows ?? []) {
      const key = `${ex.card_id}|${ex.foil}|${ex.language}|${ex.condition}`
      existingMap.set(key, { id: ex.id, quantity: ex.quantity })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toInsert: Array<any> = []
  const toUpdate: Array<{ id: string; quantity: number }> = []

  for (const { row, card } of resolved) {
    const key = `${card.id}|${row.foil}|${row.language}|${row.condition}`
    const existing = existingMap.get(key)
    if (existing) {
      toUpdate.push({ id: existing.id, quantity: existing.quantity + row.quantity })
    } else {
      toInsert.push({
        user_id: user.id,
        card_id: card.id,
        quantity: row.quantity,
        foil: row.foil,
        language: row.language,
        condition: row.condition,
      })
    }
  }

  // Batch insert
  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from('user_cards').insert(toInsert)
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
  }

  // Batch update quantities via RPC
  if (toUpdate.length > 0) {
    const adminForUpdate = createAdminClient()
    const { error: upErr } = await adminForUpdate.rpc(
      'batch_update_user_cards_quantity',
      { p_updates: toUpdate },
    )
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 })
    }
  }

  const inserted = toInsert.length + toUpdate.length

  revalidatePath('/collection')
  return NextResponse.json({
    flavor,
    inserted,
    skipped,
    total: rows.length,
  })
}
