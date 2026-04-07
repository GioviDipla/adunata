import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, Upload, Clock, Layers } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

export default async function DecksPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: decks } = await supabase
    .from('decks')
    .select(`
      *,
      cover_card:cards!cover_card_id(id, name, image_small, image_normal, image_art_crop),
      deck_cards(quantity)
    `)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  const decksWithCount = (decks ?? []).map((deck) => ({
    ...deck,
    card_count: (deck.deck_cards as { quantity: number }[])?.reduce(
      (sum: number, dc: { quantity: number }) => sum + dc.quantity,
      0
    ) ?? 0,
  }))

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold text-font-primary">My Decks</h1>
        <div className="flex gap-3">
          <Link
            href="/decks/import"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-surface px-4 py-2 text-sm font-medium text-font-primary transition-colors hover:bg-bg-hover"
          >
            <Upload className="h-4 w-4" />
            Import Deck
          </Link>
          <Link
            href="/decks/new"
            className="inline-flex items-center gap-2 rounded-lg bg-bg-accent px-4 py-2 text-sm font-medium text-font-primary transition-colors hover:bg-bg-accent/80"
          >
            <Plus className="h-4 w-4" />
            Create Deck
          </Link>
        </div>
      </div>

      {/* Deck grid or empty state */}
      {decksWithCount.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border-light border-dashed bg-bg-surface px-8 py-16">
          <Layers className="mb-4 h-12 w-12 text-font-muted" />
          <h2 className="mb-2 text-lg font-semibold text-font-primary">
            No decks yet
          </h2>
          <p className="mb-6 max-w-sm text-center text-sm text-font-secondary">
            Create your first deck or import one from MTGO, Moxfield, or Archidekt.
          </p>
          <div className="flex gap-3">
            <Link
              href="/decks/import"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-surface px-4 py-2 text-sm font-medium text-font-primary transition-colors hover:bg-bg-hover"
            >
              <Upload className="h-4 w-4" />
              Import Deck
            </Link>
            <Link
              href="/decks/new"
              className="inline-flex items-center gap-2 rounded-lg bg-bg-accent px-4 py-2 text-sm font-medium text-font-primary transition-colors hover:bg-bg-accent/80"
            >
              <Plus className="h-4 w-4" />
              Create Deck
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {decksWithCount.map((deck) => {
            const coverCard = deck.cover_card as {
              id: number
              name: string
              image_small: string | null
              image_normal: string | null
              image_art_crop: string | null
            } | null

            return (
              <Link
                key={deck.id}
                href={`/decks/${deck.id}`}
                className="group overflow-hidden rounded-xl border border-border bg-bg-surface transition-all hover:border-border-light hover:shadow-lg"
              >
                {/* Cover image */}
                <div className="relative aspect-[5/3] w-full overflow-hidden bg-bg-cell">
                  {coverCard?.image_art_crop ? (
                    <img
                      src={coverCard.image_art_crop}
                      alt={coverCard.name}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : coverCard?.image_normal ? (
                    <img
                      src={coverCard.image_normal}
                      alt={coverCard.name}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Layers className="h-10 w-10 text-font-muted" />
                    </div>
                  )}
                  {/* Format badge */}
                  <span className="absolute right-2 top-2 rounded-full bg-bg-dark/70 px-2.5 py-0.5 text-xs font-medium text-font-primary backdrop-blur-sm">
                    {deck.format}
                  </span>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="mb-1 truncate text-base font-semibold text-font-primary group-hover:text-font-accent">
                    {deck.name}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-font-muted">
                    <span className="flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5" />
                      {deck.card_count} cards
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(deck.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
