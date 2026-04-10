'use client'

import Link from 'next/link'
import { Layers } from 'lucide-react'
import { initialColor, initialsOf } from '@/lib/utils/user'

interface UserCardProps {
  username: string
  displayName: string
  bio?: string | null
  publicDeckCount: number
}

export default function UserCard({
  username,
  displayName,
  bio,
  publicDeckCount,
}: UserCardProps) {
  return (
    <Link
      href={`/u/${username}`}
      className="flex items-start gap-3 rounded-xl border border-border bg-bg-surface p-4 transition-colors hover:border-border-light hover:bg-bg-hover"
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-font-white"
        style={{ backgroundColor: initialColor(username) }}
      >
        {initialsOf(displayName)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-font-primary">
          {displayName}
        </p>
        <p className="truncate text-xs text-font-muted">@{username}</p>
        {bio && (
          <p className="mt-1 line-clamp-2 text-xs text-font-secondary">{bio}</p>
        )}
        <div className="mt-2 flex items-center gap-1 text-[11px] text-font-muted">
          <Layers className="h-3 w-3" />
          {publicDeckCount} public deck{publicDeckCount === 1 ? '' : 's'}
        </div>
      </div>
    </Link>
  )
}
