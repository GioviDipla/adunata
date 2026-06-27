import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, Upload, Layers } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import PublicDeckBrowser, {
  type PublicDeck,
} from '@/components/decks/PublicDeckBrowser'

export default async function DecksPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // Last 10 modified decks (all visibilities) — the browser handles "load
  // more" pagination and the same filter set as Public Decks from here.
  const { data, error } = await supabase.rpc('search_my_decks', {
    p_name: '',
    p_commander: '',
    p_colors: '',
    p_color_identity: '',
    p_cards: '',
    p_card_mode: 'and',
    p_format: '',
    p_sort: 'updated',
    p_limit: 10,
    p_offset: 0,
  })

  if (error) console.error('my decks initial fetch failed:', error.message)

  const initialDecks = (data ?? []) as unknown as PublicDeck[]

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

      {initialDecks.length === 0 ? (
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
        <PublicDeckBrowser
          initialDecks={initialDecks}
          endpoint="/api/decks/mine/search"
          hideCreator
          emptyText="Nessun mazzo corrisponde a questi filtri."
        />
      )}
    </div>
  )
}
