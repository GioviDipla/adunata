import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { lookupCardsByNames, mapScryfallCard } from '@/lib/scryfall'
import { CARD_DECK_COLUMNS } from '@/lib/supabase/columns'
import { bulkLimiter, enforceLimit, getClientId } from '@/lib/rate-limit'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface ImportEntry {
  name: string
  quantity: number
  board: string
}

interface ImportedCard {
  name: string
  card: CardRow
  quantity: number
  board: string
}

interface ImportFailure {
  name: string
  reason: string
}

/**
 * Bulk import cards into a deck from a parsed text list.
 *
 * Accepts `{ entries: [{ name, quantity, board }, ...] }` and:
 *   1. Batch-lookups all names in a single RPC call (case-insensitive).
 *   2. Falls back to Scryfall in parallel for any unmatched names.
 *   3. Batch-inserts/updates deck_cards, merging quantities for duplicates.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deckId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limited = await enforceLimit(bulkLimiter, getClientId(request, user.id))
  if (limited) return limited

  // Verify deck ownership
  const { data: deck } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .eq('user_id', user.id)
    .single()

  if (!deck) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
  }

  const body = await request.json() as { entries?: ImportEntry[] }
  const entries = Array.isArray(body.entries) ? body.entries : []

  if (entries.length === 0) {
    return NextResponse.json({ error: 'No entries provided' }, { status: 400 })
  }

  const admin = createAdminClient()

  // --- 1. Batch local lookup via RPC (single round-trip) -------------------
  const uniqueNames = Array.from(new Set(entries.map((e) => e.name.trim())))

  const { data: localCards, error: rpcError } = await admin.rpc(
    'lookup_cards_by_names',
    { card_names: uniqueNames },
  )

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  // Build case-insensitive name → card lookup
  const cardByLowerName = new Map<string, CardRow>()
  for (const c of (localCards ?? []) as CardRow[]) {
    cardByLowerName.set(c.name.toLowerCase(), c)
  }

  // --- 2. For any unmatched names, fetch from Scryfall in parallel ---------
  const missing = uniqueNames.filter(
    (n) => !cardByLowerName.has(n.toLowerCase()),
  )

  if (missing.length > 0) {
    // Batch lookup via Scryfall /cards/collection (up to 75 per request)
    const { found } = await lookupCardsByNames(missing)

    const toUpsert = found.map(mapScryfallCard)

    if (toUpsert.length > 0) {
      const { data: upserted } = await admin
        .from('cards')
        .upsert(toUpsert, { onConflict: 'scryfall_id' })
        .select(CARD_DECK_COLUMNS)

      for (const c of (upserted ?? []) as CardRow[]) {
        cardByLowerName.set(c.name.toLowerCase(), c)
      }
    }
  }

  // --- 3. Resolve each entry → card, merge quantities ----------------------
  const imported: ImportedCard[] = []
  const failures: ImportFailure[] = []

  // Merge quantities for duplicate (cardId, board) keys
  const mergedEntries = new Map<string, { card: CardRow; quantity: number; board: string }>()

  for (const entry of entries) {
    const card = cardByLowerName.get(entry.name.trim().toLowerCase())
    if (!card) {
      failures.push({ name: entry.name, reason: 'Card not found' })
      continue
    }
    const key = `${card.id}::${entry.board}`
    const existing = mergedEntries.get(key)
    if (existing) {
      existing.quantity += entry.quantity
    } else {
      mergedEntries.set(key, { card, quantity: entry.quantity, board: entry.board })
    }
  }

  // --- 4. Batch upsert into deck_cards -------------------------------------
  // Fetch existing deck_cards for all (card_id, board) pairs so we can merge.
  const cardIds = Array.from(mergedEntries.values()).map((e) => e.card.id)

  if (cardIds.length > 0) {
    const { data: existingDeckCards } = await supabase
      .from('deck_cards')
      .select('id, card_id, board, quantity')
      .eq('deck_id', deckId)
      .in('card_id', cardIds)

    const existingByKey = new Map<string, { id: string; quantity: number }>()
    for (const row of existingDeckCards ?? []) {
      existingByKey.set(`${row.card_id}::${row.board}`, {
        id: row.id,
        quantity: row.quantity,
      })
    }

    const rowsToInsert: {
      deck_id: string
      card_id: number
      board: string
      quantity: number
    }[] = []
    const updates: { id: string; quantity: number }[] = []

    for (const [key, merged] of mergedEntries) {
      const existing = existingByKey.get(key)
      if (existing) {
        updates.push({ id: existing.id, quantity: existing.quantity + merged.quantity })
      } else {
        rowsToInsert.push({
          deck_id: deckId,
          card_id: merged.card.id,
          board: merged.board,
          quantity: merged.quantity,
        })
      }
      imported.push({
        name: merged.card.name,
        card: merged.card,
        quantity: merged.quantity,
        board: merged.board,
      })
    }

    if (rowsToInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from('deck_cards')
        .insert(rowsToInsert)
      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 })
      }
    }

    // Updates must be one-by-one (Supabase has no batch update by id)
    for (const u of updates) {
      const { error: updateErr } = await supabase
        .from('deck_cards')
        .update({ quantity: u.quantity })
        .eq('id', u.id)
      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
      }
    }

    // Bump deck timestamp once
    await supabase
      .from('decks')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', deckId)
  }

  return NextResponse.json({
    imported: imported.map((i) => ({
      card: i.card,
      quantity: i.quantity,
      board: i.board,
    })),
    failures,
  })
}
