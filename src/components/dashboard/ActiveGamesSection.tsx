'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X, Loader2, Clock } from 'lucide-react'

interface GameLobbySummary {
  id: string
  name: string | null
  format: string
  status: string
  host_user_id: string
  created_at: string
}

interface ActiveGamesSectionProps {
  games: GameLobbySummary[]
  myRoles: Map<string, boolean>
}

const STATUS_LABELS: Record<string, string> = {
  waiting: 'Waiting',
  playing: 'In progress',
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

export default function ActiveGamesSection({ games, myRoles }: ActiveGamesSectionProps) {
  const router = useRouter()
  const [closing, setClosing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  async function handleClose(lobbyId: string) {
    setClosing(lobbyId)
    try {
      const res = await fetch(`/api/lobbies/${lobbyId}`, { method: 'DELETE' })
      if (res.ok) {
        setConfirming(null)
        router.refresh()
      }
    } finally {
      setClosing(null)
    }
  }

  function getActionLabel(status: string, isHost: boolean): string {
    if (status === 'playing') return 'Termina'
    if (isHost) return 'Elimina'
    return 'Lascia'
  }

  function getActionTitle(status: string, isHost: boolean): string {
    if (status === 'playing') return 'Termina la partita'
    if (isHost) return 'Elimina lobby'
    return 'Lascia lobby'
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {games.map((game) => {
        const isHost = myRoles.get(game.id) ?? false
        const isClosing = closing === game.id
        const isConfirming = confirming === game.id
        const href =
          game.status === 'playing'
            ? `/play/${game.id}/game`
            : `/play/${game.id}`

        return (
          <div
            key={game.id}
            className="group relative flex flex-col gap-3 rounded-xl border border-border bg-bg-card p-4 transition-colors hover:border-border-light hover:bg-bg-hover"
          >
            {/* Main clickable area */}
            <Link href={href} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={
                    game.status === 'playing'
                      ? 'shrink-0 rounded-full bg-bg-green/20 px-2 py-0.5 text-[11px] font-semibold text-bg-green'
                      : 'shrink-0 rounded-full bg-bg-yellow/20 px-2 py-0.5 text-[11px] font-semibold text-bg-yellow'
                  }
                >
                  {STATUS_LABELS[game.status] || game.status}
                </span>
                <span className="text-xs text-font-muted">{game.format}</span>
              </div>
              <p className="text-sm font-medium text-font-primary line-clamp-2">
                {game.name || 'Unnamed lobby'}
              </p>
              <div className="mt-auto flex items-center gap-3 text-xs text-font-muted">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {timeAgo(game.created_at)}
                </span>
              </div>
            </Link>

            {/* Action button — top-right */}
            {isConfirming ? (
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                <button
                  onClick={() => handleClose(game.id)}
                  disabled={isClosing}
                  className="rounded-md bg-bg-red px-2 py-1 text-[10px] font-bold text-font-white active:bg-bg-red/80 disabled:opacity-40"
                >
                  {isClosing ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    getActionLabel(game.status, isHost)
                  )}
                </button>
                <button
                  onClick={() => setConfirming(null)}
                  disabled={isClosing}
                  className="rounded-md bg-bg-cell px-2 py-1 text-[10px] font-bold text-font-secondary active:bg-bg-hover disabled:opacity-40"
                >
                  Annulla
                </button>
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  setConfirming(game.id)
                }}
                className="absolute top-3 right-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-font-muted transition-all hover:bg-bg-red/10 hover:text-bg-red sm:opacity-0 sm:group-hover:opacity-100"
                title={getActionTitle(game.status, isHost)}
                aria-label={getActionTitle(game.status, isHost)}
              >
                <X size={16} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
