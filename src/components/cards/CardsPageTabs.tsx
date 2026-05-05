'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Library, Search } from 'lucide-react'
import CardBrowser from './CardBrowser'
import CollectionView, {
  type CollectionItem,
} from '@/components/collection/CollectionView'
import type { Database } from '@/types/supabase'

type Card = Database['public']['Tables']['cards']['Row']
type SetInfo = { set_code: string; set_name: string; latest_release: string }
type DeckSummary = { id: string; name: string; format: string }

interface Props {
  initialCards: Card[]
  sets: SetInfo[]
  userDecks: DeckSummary[]
  initialLikedIds: string[]
  /** Authenticated viewer — only when present can the Collection tab render. */
  authed: boolean
  collection?: { initialItems: CollectionItem[]; total: number }
}

export default function CardsPageTabs({
  initialCards,
  sets,
  userDecks,
  initialLikedIds,
  authed,
  collection,
}: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const requested = params.get('tab')
  // Only allow the collection tab when the viewer is authenticated AND
  // we successfully fetched their collection on the server. Otherwise we
  // silently fall back to Browse.
  const tab: 'browse' | 'collection' =
    requested === 'collection' && authed && collection ? 'collection' : 'browse'

  const setTab = (next: 'browse' | 'collection') => {
    const sp = new URLSearchParams(Array.from(params.entries()))
    if (next === 'collection') sp.set('tab', 'collection')
    else sp.delete('tab')
    const qs = sp.toString()
    router.replace(qs ? `/cards?${qs}` : '/cards', { scroll: false })
  }

  return (
    <div className="space-y-4">
      <div
        className="inline-flex items-center gap-1 rounded-lg bg-bg-cell p-1"
        role="tablist"
        aria-label="Cards page tabs"
      >
        <button
          role="tab"
          aria-selected={tab === 'browse'}
          onClick={() => setTab('browse')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'browse'
              ? 'bg-bg-surface text-font-primary shadow-sm'
              : 'text-font-muted hover:text-font-primary'
          }`}
        >
          <Search className="h-4 w-4" />
          Browse
        </button>
        {authed && (
          <button
            role="tab"
            aria-selected={tab === 'collection'}
            onClick={() => setTab('collection')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'collection'
                ? 'bg-bg-surface text-font-primary shadow-sm'
                : 'text-font-muted hover:text-font-primary'
            }`}
          >
            <Library className="h-4 w-4" />
            My Collection
          </button>
        )}
      </div>

      {tab === 'browse' ? (
        <CardBrowser
          initialCards={initialCards}
          sets={sets}
          userDecks={userDecks}
          initialLikedIds={initialLikedIds}
        />
      ) : collection ? (
        <CollectionView
          initialItems={collection.initialItems}
          total={collection.total}
          sets={sets}
        />
      ) : null}
    </div>
  )
}
