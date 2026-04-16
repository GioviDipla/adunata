import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { searchCardByName, mapScryfallCard } from '@/lib/scryfall'
import { CARD_DETAIL_COLUMNS } from '@/lib/supabase/columns'

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get('name')

  if (!name || name.trim().length === 0) {
    return NextResponse.json(
      { error: 'Missing required query parameter: name' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  try {
    // ── Check local database first ──────────────────────────────────────
    const { data: existingCards, error: dbError } = await supabase
      .from('cards')
      .select(CARD_DETAIL_COLUMNS)
      .ilike('name', name.trim())
      .limit(1)

    if (dbError) {
      console.error('Database lookup error:', dbError.message)
      // Fall through to Scryfall lookup
    }

    if (existingCards && existingCards.length > 0) {
      return NextResponse.json({ source: 'database', card: existingCards[0] })
    }

    // ── Fetch from Scryfall ─────────────────────────────────────────────
    const scryfallCard = await searchCardByName(name.trim())

    if (!scryfallCard) {
      return NextResponse.json(
        { error: `Card not found: ${name}` },
        { status: 404 }
      )
    }

    // ── Insert into local database ──────────────────────────────────────
    const mapped = mapScryfallCard(scryfallCard)

    const { data: inserted, error: insertError } = await supabase
      .from('cards')
      .upsert(mapped, { onConflict: 'scryfall_id' })
      .select(CARD_DETAIL_COLUMNS)
      .single()

    if (insertError) {
      console.error('Insert error:', insertError.message)
      // Return the mapped data even if DB insert fails
      return NextResponse.json({ source: 'scryfall', card: mapped })
    }

    return NextResponse.json({ source: 'scryfall', card: inserted })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Card lookup failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
