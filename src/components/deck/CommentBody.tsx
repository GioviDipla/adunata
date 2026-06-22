import Link from 'next/link'
import { MENTION_RE, USER_MENTION_RE } from '@/lib/mentions'

interface CommentBodyProps {
  body: string
}

interface TextSegment {
  start: number
  end: number
  type: 'card' | 'user'
  name: string
  cardId?: string
  username?: string
}

export default function CommentBody({ body }: CommentBodyProps) {
  // Collect all mentions (cards and users)
  const segments: TextSegment[] = []

  for (const m of body.matchAll(MENTION_RE)) {
    segments.push({
      start: m.index,
      end: m.index + m[0].length,
      type: 'card',
      name: m[1],
      cardId: m[2],
    })
  }

  for (const m of body.matchAll(USER_MENTION_RE)) {
    // m[0] includes the preceding whitespace char, account for it
    const usernameStart = m.index + m[0].indexOf('@')
    segments.push({
      start: usernameStart,
      end: usernameStart + m[1].length + 1, // +1 for @
      type: 'user',
      name: m[1],
      username: m[1],
    })
  }

  // Sort by position
  segments.sort((a, b) => a.start - b.start)

  // Build parts
  const parts: React.ReactNode[] = []
  let lastIndex = 0

  for (const seg of segments) {
    if (seg.start < lastIndex) continue // skip overlapping (already covered)
    if (seg.start > lastIndex) {
      parts.push(body.slice(lastIndex, seg.start))
    }
    if (seg.type === 'card') {
      parts.push(
        <Link
          key={`card-${seg.start}-${seg.cardId}`}
          href={`/cards/${seg.cardId}`}
          className="inline-flex items-center rounded bg-bg-accent/15 px-1.5 py-0.5 text-xs font-medium text-font-accent hover:bg-bg-accent/25 transition-colors"
        >
          @{seg.name}
        </Link>,
      )
    } else {
      parts.push(
        <Link
          key={`user-${seg.start}-${seg.username}`}
          href={`/u/${seg.username}`}
          className="inline-flex items-center rounded bg-bg-accent/15 px-1.5 py-0.5 text-xs font-medium text-font-accent hover:bg-bg-accent/25 transition-colors"
        >
          @{seg.username}
        </Link>,
      )
    }
    lastIndex = seg.end
  }

  if (lastIndex < body.length) {
    parts.push(body.slice(lastIndex))
  }

  return (
    <p className="whitespace-pre-wrap break-words text-sm text-font-primary">
      {parts.length > 0 ? parts : body}
    </p>
  )
}
