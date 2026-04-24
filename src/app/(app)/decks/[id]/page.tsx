import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import { CARD_DECK_COLUMNS, DECK_DETAIL_COLUMNS } from '@/lib/supabase/columns'
import DeckEditor from '@/components/deck/DeckEditor'
import DeckView from '@/components/deck/DeckView'
import type { Database } from '@/types/supabase'
import type { SectionRow } from '@/types/deck'

type CardRow = Database['public']['Tables']['cards']['Row']

interface DeckCardFromDB {
  id: string
  card_id: number
  quantity: number
  board: string
  is_foil: boolean
  section_id: string | null
  tags: string[] | null
  position_in_section: number | null
  created_at: string
  card: CardRow
}

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://adunata.studiob35.com'

/**
 * OG metadata for public decks so share links render with deck name,
 * author, format and cover art when pasted in WhatsApp / iMessage /
 * Discord / etc. Private decks (and the anon scraper landing on any
 * deck that doesn't exist) get the generic site metadata so existence
 * isn't leaked.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()

  const { data: deck } = await supabase
    .from('decks')
    .select('id, name, format, visibility, card_count, user_id, cover_card_id')
    .eq('id', id)
    .single()

  if (!deck || deck.visibility !== 'public') return {}

  const [{ data: owner }, coverResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', deck.user_id)
      .single(),
    deck.cover_card_id
      ? supabase
          .from('cards')
          .select('image_art_crop, image_normal')
          .eq('id', deck.cover_card_id)
          .single()
      : Promise.resolve({ data: null }),
  ])

  // Prefer the landscape art crop (roughly 626x457) for link previews —
  // WhatsApp shows landscape, the full card image would be letterboxed.
  const image =
    coverResult.data?.image_art_crop ??
    coverResult.data?.image_normal ??
    undefined

  const authorBit = owner?.display_name
    ? `by ${owner.display_name} · `
    : ''
  const description = `${authorBit}${deck.format} · ${deck.card_count ?? 0} cards`
  const url = `${SITE_ORIGIN}/decks/${deck.id}`

  return {
    title: deck.name,
    description,
    openGraph: {
      title: deck.name,
      description,
      url,
      siteName: 'Adunata',
      type: 'article',
      images: image ? [{ url: image, alt: deck.name }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: deck.name,
      description,
      images: image ? [image] : undefined,
    },
    alternates: { canonical: url },
  }
}

export default async function DeckDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getAuthenticatedUser()
  const supabase = await createClient()

  const [{ data: deck, error: deckError }, { data: deckCards }, { data: deckSections }] =
    await Promise.all([
      supabase.from('decks').select(DECK_DETAIL_COLUMNS).eq('id', id).single(),
      supabase
        .from('deck_cards')
        .select(
          `id, card_id, quantity, board, is_foil, section_id, tags, position_in_section, created_at, card:cards!card_id(${CARD_DECK_COLUMNS})`,
        )
        .eq('deck_id', id),
      supabase
        .from('deck_sections')
        .select('id, name, position, color, is_collapsed')
        .eq('deck_id', id)
        .order('position', { ascending: true }),
    ])

  if (deckError || !deck) notFound()

  const sections: SectionRow[] = (deckSections ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    position: s.position,
    color: s.color,
    is_collapsed: s.is_collapsed ?? false,
  }))

  const isOwner = !!user && deck.user_id === user.id
  const visibility = (deck.visibility as 'private' | 'public') ?? 'private'

  // Private decks are owner-only. Route anon visitors through login so
  // they can come back after auth; hide existence from other logged-in
  // users with a plain 404.
  if (!isOwner && visibility !== 'public') {
    if (!user) redirect(`/login?next=/decks/${id}`)
    notFound()
  }

  const formattedCards = ((deckCards ?? []) as unknown as DeckCardFromDB[])
    .filter((dc) => dc.card != null)
    .map((dc) => ({
      id: dc.id,
      card: dc.card,
      quantity: dc.quantity,
      board: dc.board,
      isFoil: !!dc.is_foil,
      section_id: dc.section_id ?? null,
      tags: dc.tags ?? [],
      position_in_section: dc.position_in_section ?? null,
    }))

  if (isOwner) {
    return (
      <DeckEditor
        deck={deck}
        initialCards={formattedCards}
        initialSections={sections}
      />
    )
  }

  // Visitor path (anon or non-owner authenticated): fetch the owner's
  // profile for the "by @username" pill.
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('username, display_name')
    .eq('id', deck.user_id)
    .single()

  if (!ownerProfile) notFound()

  return (
    <DeckView
      deck={deck}
      cards={formattedCards}
      sections={sections}
      ownerUsername={ownerProfile.username}
      ownerDisplayName={ownerProfile.display_name}
      viewerId={user?.id ?? null}
    />
  )
}
