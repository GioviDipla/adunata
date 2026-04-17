import Link from 'next/link'
import { MENTION_RE } from '@/lib/mentions'

interface CommentBodyProps {
  body: string
}

export default function CommentBody({ body }: CommentBodyProps) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  const re = new RegExp(MENTION_RE.source, 'g')

  while ((match = re.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(body.slice(lastIndex, match.index))
    }
    const [, name, cardId] = match
    parts.push(
      <Link
        key={`${match.index}-${cardId}`}
        href={`/cards/${cardId}`}
        className="inline-flex items-center rounded bg-bg-accent/15 px-1.5 py-0.5 text-xs font-medium text-font-accent hover:bg-bg-accent/25 transition-colors"
      >
        @{name}
      </Link>,
    )
    lastIndex = match.index + match[0].length
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
