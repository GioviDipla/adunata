import type { Database } from '@/types/supabase'
import CardItem from './CardItem'

type Card = Database['public']['Tables']['cards']['Row']

interface CardGridProps {
  cards: Card[]
  likedIds?: Set<string>
  onSelectCard: (card: Card) => void
  onContextAction?: (card: Card, x: number, y: number) => void
}

export default function CardGrid({ cards, likedIds, onSelectCard, onContextAction }: CardGridProps) {
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4 opacity-40">&#x1F0CF;</div>
        <p className="text-font-secondary text-lg">No cards found</p>
        <p className="text-font-muted text-sm mt-1">
          Try adjusting your search or filters
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
      {cards.map((card) => (
        <CardItem
          key={card.id}
          card={card}
          liked={likedIds?.has(String(card.id))}
          onSelect={onSelectCard}
          onContextAction={onContextAction}
        />
      ))}
    </div>
  )
}
