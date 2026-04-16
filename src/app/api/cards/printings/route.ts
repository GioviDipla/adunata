import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { searchCards, mapScryfallCard } from '@/lib/scryfall'
import { CARD_GRID_COLUMNS } from '@/lib/supabase/columns'

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get('name')

  if (!name || name.trim().length === 0) {
    return NextResponse.json({ printings: [] })
  }

  try {
    // Search Scryfall for all printings using exact name match
    const result = await searchCards(`!"${name.trim()}" unique:prints`)

    if (result.data.length === 0) {
      return NextResponse.json({ printings: [] })
    }

    // Upsert all printings into local DB
    const supabase = createAdminClient()
    const mapped = result.data.map(mapScryfallCard)

    // Return grid-shaped rows; CardDetail lazy-hydrates full on open/switch.
    const { data: upserted } = await supabase
      .from('cards')
      .upsert(mapped, { onConflict: 'scryfall_id' })
      .select(`${CARD_GRID_COLUMNS}, collector_number, set_name`)

    return NextResponse.json({
      printings: upserted ?? mapped,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Printings fetch failed:', message)
    return NextResponse.json({ printings: [] })
  }
}
