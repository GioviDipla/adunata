'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X, Loader2, Clock } from 'lucide-react'

interface LobbySummary {
  id: string
  name: string | null
  lobby_code: string
  status: string
  format: string
  host_user_id: string
  created_at: string
}

interface ActiveLobbiesListProps {
  lobbies: LobbySummary[]
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

export default function ActiveLobbiesList({ lobbies }: ActiveLobbiesListProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [closing, setClosing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleClose(lobbyId: string) {
    setClosing(lobbyId)
    setError(null)
    try {
      const res = await fetch(`/api/lobbies/${lobbyId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to close lobby' }))
        setError(data.error ?? 'Failed to close lobby')
        return
      }
      setConfirming(null)
      startTransition(() => router.refresh())
    } finally {
      setClosing(null)
    }
  }

  return (
    <div className="mb-6">
      <h2 className="mb-3 text-sm font-semibold text-font-secondary">Active Games</h2>
      {lobbies.length === 0 ? (
        <p className="text-sm text-font-muted">No active games</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lobbies.map((lobby) => {
            const href = lobby.status === 'playing' ? `/play/${lobby.id}/game` : `/play/${lobby.id}`
            const isClosing = closing === lobby.id
            const isConfirming = confirming === lobby.id
            const displayName = lobby.name || `Game ${lobby.lobby_code}`

            return (
              <div
                key={lobby.id}
                className="group relative flex flex-col gap-3 rounded-xl border border-border bg-bg-card p-4 transition-colors hover:border-border-light hover:bg-bg-hover"
              >
                {/* Main clickable area */}
                <Link href={href} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        lobby.status === 'playing'
                          ? 'shrink-0 rounded-full bg-bg-green/20 px-2 py-0.5 text-[11px] font-semibold text-bg-green'
                          : 'shrink-0 rounded-full bg-bg-yellow/20 px-2 py-0.5 text-[11px] font-semibold text-bg-yellow'
                      }
                    >
                      {lobby.status === 'playing' ? 'In Game' : 'Waiting'}
                    </span>
                    <span className="text-xs text-font-muted">{lobby.format}</span>
                  </div>
                  <p className="text-sm font-medium text-font-primary line-clamp-2">
                    {displayName}
                  </p>
                  <div className="mt-auto flex items-center gap-3 text-xs text-font-muted">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {timeAgo(lobby.created_at)}
                    </span>
                  </div>
                </Link>

                {/* Action buttons — top-right */}
                {isConfirming ? (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    <button
                      onClick={() => handleClose(lobby.id)}
                      disabled={isClosing || isPending}
                      className="rounded-md bg-bg-red px-2 py-1 text-[10px] font-bold text-font-white active:bg-bg-red/80 disabled:opacity-40"
                    >
                      {isClosing ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        'Close'
                      )}
                    </button>
                    <button
                      onClick={() => setConfirming(null)}
                      disabled={isClosing}
                      className="rounded-md bg-bg-cell px-2 py-1 text-[10px] font-bold text-font-secondary active:bg-bg-hover disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      setConfirming(lobby.id)
                    }}
                    className="absolute top-3 right-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-font-muted transition-all hover:bg-bg-red/10 hover:text-bg-red sm:opacity-0 sm:group-hover:opacity-100"
                    title="Close lobby"
                    aria-label="Close lobby"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-bg-red">{error}</p>
      )}
    </div>
  )
}
