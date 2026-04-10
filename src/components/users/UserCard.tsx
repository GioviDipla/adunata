'use client'

import Link from 'next/link'
import { Layers } from 'lucide-react'

interface UserCardProps {
  username: string
  displayName: string
  bio?: string | null
  publicDeckCount: number
}

function initialColor(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) >>> 0
  }
  const hue = hash % 360
  return `hsl(${hue}, 60%, 45%)`
}

function initialsOf(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
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
