import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  lookupCardsByIdentifiers,
  mapScryfallCard,
  searchCardByExactName,
} from '@/lib/scryfall'
import { CARD_DECK_COLUMNS } from '@/lib/supabase/columns'
import { bulkLimiter, enforceLimit, getClientId } from '@/lib/rate-limit'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface ImportEntry {
  name: string
  quantity: number
  board: string
  /** Set code from Moxfield-style `(STA)` — pins the lookup to that printing. */
  setCode?: string | null
  /** True when the source line carried `*F*`, `*E*`, or trailing ` F`/` E`. */
  isFoil?: boolean
}

interface ImportedCard {
  name: string
  card: CardRow
  quantity: number
  board: string
  isFoil: boolean
}

interface ImportFailure {
  name: string
  reason: string
}

const nameKey = (s: string) => s.trim().toLowerCase()
const pairKey = (name: string, setCode: string) =>
  `${nameKey(name)}|${setCode.trim().toLowerCase()}`

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

  // --- 1. Set-specific lookup FIRST so a paste like "Lightning Bolt (STA)"
  // pins to the STA printing even if other printings also live in our table.
  const setPairs = entries
    .filter((e) => e.setCode && e.setCode.trim() !== '')
    .map((e) => ({ name: e.name.trim(), set_code: e.setCode!.trim() }))

  const cardByNameAndSet = new Map<string, CardRow>()
  if (setPairs.length > 0) {
    // Dedupe — the RPC returns DISTINCT ON anyway, but a tight input helps.
    const uniquePairs = Array.from(
      new Map(
        setPairs.map((p) => [pairKey(p.name, p.set_code), p]),
      ).values(),
    )
    const { data: setCards, error: setRpcError } = await admin.rpc(
      'lookup_cards_by_name_and_set',
      { pairs: uniquePairs },
    )
    if (setRpcError) {
      return NextResponse.json({ error: setRpcError.message }, { status: 500 })
    }
    for (const c of (setCards ?? []) as CardRow[]) {
      if (c.set_code) {
        cardByNameAndSet.set(pairKey(c.name, c.set_code), c)
        // Index UB reprints under the flavor name too so a paste of
        // "Paradise Chocobo (FIC)" resolves via the in-memory map
        // populated from the local `cards` row whose canonical name
        // is "Birds of Paradise".
        if (c.flavor_name) {
          cardByNameAndSet.set(pairKey(c.flavor_name, c.set_code), c)
        }
      }
    }
  }

  // --- 2. Name-only fallback for any entry not already set-matched.
  const unmatchedNames = Array.from(
    new Set(
      entries
        .filter((e) => {
          if (!e.setCode) return true
          return !cardByNameAndSet.has(pairKey(e.name, e.setCode))
        })
        .map((e) => e.name.trim()),
    ),
  )

  const cardByLowerName = new Map<string, CardRow>()
  if (unmatchedNames.length > 0) {
    const { data: localCards, error: rpcError } = await admin.rpc(
      'lookup_cards_by_names',
      { card_names: unmatchedNames },
    )
    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }
    for (const c of (localCards ?? []) as CardRow[]) {
      cardByLowerName.set(nameKey(c.name), c)
      if (c.flavor_name) cardByLowerName.set(nameKey(c.flavor_name), c)
    }
  }

  // --- 3. Scryfall fallback for anything still missing. Pass `set` when the
  // entry had one so we land on the right printing.
  const resolve = (entry: ImportEntry): CardRow | null => {
    if (entry.setCode) {
      const hit = cardByNameAndSet.get(pairKey(entry.name, entry.setCode))
      if (hit) return hit
    }
    return cardByLowerName.get(nameKey(entry.name)) ?? null
  }

  const upsertFound = async (
    found: Awaited<ReturnType<typeof lookupCardsByIdentifiers>>['found'],
  ) => {
    const toUpsert = found.map(mapScryfallCard)
    if (toUpsert.length === 0) return
    const { data: upserted, error: upsertErr } = await admin
      .from('cards')
      .upsert(toUpsert, { onConflict: 'scryfall_id' })
      .select(CARD_DECK_COLUMNS)
    if (upsertErr) {
      // Don't fail the whole import — log so the server tail shows the
      // mapping / schema mismatch, and let the affected entries fall
      // into the `failures` bucket at the final resolve step.
      console.error('[bulk-import] card upsert failed', upsertErr)
      return
    }
    for (const c of (upserted ?? []) as CardRow[]) {
      if (c.set_code) {
        cardByNameAndSet.set(pairKey(c.name, c.set_code), c)
        if (c.flavor_name) {
          cardByNameAndSet.set(pairKey(c.flavor_name, c.set_code), c)
        }
      }
      if (!cardByLowerName.has(nameKey(c.name))) {
        cardByLowerName.set(nameKey(c.name), c)
      }
      if (c.flavor_name && !cardByLowerName.has(nameKey(c.flavor_name))) {
        cardByLowerName.set(nameKey(c.flavor_name), c)
      }
    }
  }

  // First pass: ask Scryfall with `(name, set)` so we get the exact
  // printing when the user pinned one.
  const scryfallNeeded = entries.filter((e) => !resolve(e))
  if (scryfallNeeded.length > 0) {
    const seen = new Set<string>()
    const identifiers: { name: string; set?: string }[] = []
    for (const e of scryfallNeeded) {
      const key = e.setCode ? pairKey(e.name, e.setCode) : nameKey(e.name)
      if (seen.has(key)) continue
      seen.add(key)
      identifiers.push({ name: e.name.trim(), set: e.setCode ?? undefined })
    }

    const { found } = await lookupCardsByIdentifiers(identifiers)
    await upsertFound(found)
  }

  // Second pass: anything still unresolved — either the `(name, set)`
  // lookup missed (set code wrong, printing not on Scryfall, surge-foil
  // variant quirks) or the entry had no set to begin with. Retry with
  // name only so we at least land on some printing rather than 404'ing
  // the user. If Scryfall finds a different printing we prefer exact
  // first, so any previously-populated set-specific hit still wins.
  const stillNeeded = entries.filter((e) => !resolve(e))
  if (stillNeeded.length > 0) {
    const seen = new Set<string>()
    const identifiers: { name: string }[] = []
    for (const e of stillNeeded) {
      const k = nameKey(e.name)
      if (seen.has(k)) continue
      seen.add(k)
      identifiers.push({ name: e.name.trim() })
    }
    const { found } = await lookupCardsByIdentifiers(identifiers)
    await upsertFound(found)
  }

  // Third pass: Universes Beyond flavor names. /cards/collection (the
  // batch endpoint used above) matches the canonical `name` only, so
  // reprints like "Paradise Chocobo" → Birds of Paradise (FIC 483) and
  // "Balin's Tomb" → Ancient Tomb (LTC 357) come back as not_found.
  // /cards/named?exact= matches `flavor_name` too. Serial + rate-limited,
  // but only runs for the handful of entries no batch pass caught.
  const flavorNeeded = entries.filter((e) => !resolve(e))
  if (flavorNeeded.length > 0) {
    const seenKeys = new Set<string>()
    for (const e of flavorNeeded) {
      const k = e.setCode ? pairKey(e.name, e.setCode) : nameKey(e.name)
      if (seenKeys.has(k)) continue
      seenKeys.add(k)

      const card = await searchCardByExactName(e.name.trim(), e.setCode ?? undefined)
        .catch((err) => {
          console.error('[bulk-import] exact-name lookup failed', e.name, err)
          return null
        })
      if (!card) continue

      const [mapped] = [mapScryfallCard(card)]
      const { data: upserted, error } = await admin
        .from('cards')
        .upsert([mapped], { onConflict: 'scryfall_id' })
        .select(CARD_DECK_COLUMNS)
      if (error || !upserted?.[0]) {
        if (error) console.error('[bulk-import] flavor-name upsert failed', error)
        continue
      }
      const row = upserted[0] as CardRow

      // Index the row by BOTH the entry's (flavor) name and the
      // canonical name, so later entries in this same import that
      // reference either form also resolve. Without this, a deck that
      // mixes "Paradise Chocobo" and "Birds of Paradise" would only
      // resolve the line we looked up.
      cardByLowerName.set(nameKey(e.name), row)
      if (!cardByLowerName.has(nameKey(row.name))) {
        cardByLowerName.set(nameKey(row.name), row)
      }
      if (e.setCode) {
        cardByNameAndSet.set(pairKey(e.name, e.setCode), row)
      }
      if (row.set_code) {
        cardByNameAndSet.set(pairKey(row.name, row.set_code), row)
      }
    }
  }

  // --- 4. Resolve each entry → card, merge quantities per (cardId, board, foil).
  const imported: ImportedCard[] = []
  const failures: ImportFailure[] = []

  const mergedEntries = new Map<
    string,
    { card: CardRow; quantity: number; board: string; isFoil: boolean }
  >()

  for (const entry of entries) {
    const card = resolve(entry)
    if (!card) {
      failures.push({ name: entry.name, reason: 'Card not found' })
      continue
    }
    const isFoil = !!entry.isFoil
    // Foil and non-foil of the same printing are distinct rows — a player
    // may legitimately run both in the same deck.
    const key = `${card.id}::${entry.board}::${isFoil ? 'foil' : 'reg'}`
    const existing = mergedEntries.get(key)
    if (existing) {
      existing.quantity += entry.quantity
    } else {
      mergedEntries.set(key, {
        card,
        quantity: entry.quantity,
        board: entry.board,
        isFoil,
      })
    }
  }

  // --- 5. Batch upsert into deck_cards -------------------------------------
  // Merge against existing rows on (card_id, board, is_foil) so a second
  // import of "2 Sol Ring *F*" on top of an existing foil row adds up rather
  // than creating a duplicate row.
  const cardIds = Array.from(mergedEntries.values()).map((e) => e.card.id)

  if (cardIds.length > 0) {
    const { data: existingDeckCards } = await supabase
      .from('deck_cards')
      .select('id, card_id, board, quantity, is_foil')
      .eq('deck_id', deckId)
      .in('card_id', cardIds)

    const existingByKey = new Map<string, { id: string; quantity: number }>()
    for (const row of existingDeckCards ?? []) {
      const k = `${row.card_id}::${row.board}::${row.is_foil ? 'foil' : 'reg'}`
      existingByKey.set(k, { id: row.id, quantity: row.quantity })
    }

    const rowsToInsert: {
      deck_id: string
      card_id: number
      board: string
      quantity: number
      is_foil: boolean
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
          is_foil: merged.isFoil,
        })
      }
      imported.push({
        name: merged.card.name,
        card: merged.card,
        quantity: merged.quantity,
        board: merged.board,
        isFoil: merged.isFoil,
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

    revalidatePath(`/decks/${deckId}`)
    revalidatePath('/decks')
  }

  return NextResponse.json({
    imported: imported.map((i) => ({
      card: i.card,
      quantity: i.quantity,
      board: i.board,
      is_foil: i.isFoil,
    })),
    failures,
  })
}
